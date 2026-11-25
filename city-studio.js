import * as THREE from 'three';
import { MapDataError, PRESETS, loadLiveArea, loadPreset, makeArea, withDeadline, wrapLongitude } from './map-data.mjs';
import { vectorFeatures } from './map-tiles.mjs';
import { createMapModel, disposeMapModel, highlightLandmark, setMapElevation, setMapHeight } from './map-scene.js';
import { getElevation } from './terrain.js';

const palettes = {
  harvest: { ground: '#d5ad38', road: '#f4d46e', water: '#4a8298', building: ['#eec052', '#d88132', '#f3d988', '#b95b29', '#efad42', '#d7a648', '#f1c668'], green: ['#526f25', '#779329', '#315d34', '#a1aa32', '#8f9826', '#537b39'] },
  garden: { ground: '#b0bd70', road: '#e2cf94', water: '#5d9792', building: ['#e9c48f', '#cf9470', '#f0dda9', '#bba47c', '#ddad83', '#c4b98b', '#ebce9b'], green: ['#4e764c', '#779d61', '#345e47', '#9db76b', '#739457', '#547e5b'] },
  twilight: { ground: '#918778', road: '#dfb58d', water: '#596d9e', building: ['#d99576', '#b36e65', '#e6bc91', '#967487', '#d58d80', '#a599a2', '#e5b590'], green: ['#52677a', '#78838a', '#405a69', '#9ba29b', '#7b8d82', '#5d7880'] }
};
const MAP_HARVEST = {
  ground: '#aeb275', road: '#f0e2bf', water: '#448692',
  building: ['#e6bc8e', '#bd795f', '#adc1a8', '#e9dcc2', '#c49776', '#83aaa4', '#ceb996']
};
const mapColors = name => name === 'harvest' ? MAP_HARVEST : palettes[name];
const WALL_COLORS = ['e6c9a7', 'c7b7a1', 'e2d5bf', 'b2c2af', 'dba995', 'aebec0', 'd9c3a3'];
const TREE_COLORS = ['6b9c78', '83a985', '548467', 'a1b989', 'b0a76a', '779b6d'];
const $ = selector => document.querySelector(selector);

function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyVisibleModel(source) {
  const root = new THREE.Group();
  const copiedGeometry = new Set();
  const materials = new Map();
  source.updateWorldMatrix(true, true);
  source.traverseVisible(object => {
    if (!object.isMesh) return;
    const original = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!materials.has(original)) materials.set(original, new THREE.MeshBasicMaterial({ color: original.color }));
    const geometry = object.userData.terrainMutable ? object.geometry.clone() : object.geometry;
    if (geometry !== object.geometry) copiedGeometry.add(geometry);
    const mesh = new THREE.Mesh(geometry, materials.get(original));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(object.matrixWorld);
    root.add(mesh);
  });
  return {
    root,
    dispose() {
      copiedGeometry.forEach(geometry => geometry.dispose());
      materials.forEach(item => item.dispose());
      root.clear();
    }
  };
}

function creditImage(source, credit) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const font = Math.max(10, Math.round(canvas.width / 100));
  const padding = Math.round(font * .65);
  const line = credit + ' · openstreetmap.org/copyright';
  ctx.font = font + 'px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const maxWidth = Math.max(1, canvas.width - 2 * padding);
  const width = Math.min(maxWidth, ctx.measureText(line).width) + 2 * padding;
  ctx.fillStyle = 'rgba(22, 20, 24, .8)';
  ctx.fillRect(canvas.width - width, canvas.height - font - 2 * padding, width, font + 2 * padding);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line, canvas.width - width + padding, canvas.height - padding - font / 2, maxWidth);
  return canvas;
}

export function setupStudio({ scene, renderer, camera, controls, procedural, realRoot, ground, roadMat, current, dayNight, onSceneChange }) {
  const status = $('#map-status');
  const statusFooter = status.closest('.panel-status');
  const progressBar = $('#map-progress');
  const presets = Object.entries(PRESETS);
  const areaEditor = $('#area-editor');
  const latitudeField = $('#latitude');
  const longitudeField = $('#longitude');
  const areaField = $('#area');
  const selectionPreview = $('#selection-preview');
  const selectionMap = $('#selection-map');
  const terrainField = $('#terrain');
  const landmarkField = $('#landmark');
  const originals = new Map();
  const presetCache = new Map(), liveCache = new Map();
  const initial = { position: camera.position.clone(), target: controls.target.clone() };
  let palette = 'harvest', topView = false, statusVersion = 0;
  let selected = null, map = null, marker = null, rectangle = null;
  let model = null, mapJob = null, terrainJob = null;
  let terrainPreference = 'flat';

  procedural.traverse(object => {
    const material = object.material;
    if (material?.color && !originals.has(material)) originals.set(material, material.color.getHexString());
  });

  function setStatus(message) {
    status.textContent = message;
    statusFooter.hidden = !message && progressBar.hidden;
    return ++statusVersion;
  }

  function setBusy(busy) {
    progressBar.hidden = !busy;
    statusFooter.hidden = !busy && !status.textContent;
    $('#cancel-load').hidden = !busy;
  }

  function applyPalette(name) {
    palette = name;
    const colors = palettes[name];
    ground.material.color.set(colors.ground);
    roadMat.color.set(colors.road);
    for (const [material, original] of originals) {
      const wall = WALL_COLORS.indexOf(original);
      const tree = TREE_COLORS.indexOf(original);
      if (wall >= 0) material.color.set(colors.building[wall]);
      if (tree >= 0) material.color.set(colors.green[tree]);
    }
    const mapPalette = mapColors(name);
    realRoot.traverse(object => {
      const { colorRole, colorIndex } = object.userData;
      if (!colorRole) return;
      object.material.color.set(colorRole === 'building' ? mapPalette.building[colorIndex] : mapPalette[colorRole]);
    });
    document.querySelectorAll('[data-palette]').forEach(button => {
      const active = button.dataset.palette === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setMode(isReal) {
    procedural.visible = !isReal;
    realRoot.visible = isReal;
    terrainField.disabled = !isReal;
    for (const id of ['density', 'forest']) {
      const slider = $('#' + id);
      slider.disabled = isReal;
      slider.parentElement.style.opacity = isReal ? '.45' : '1';
    }
    $('#mode-hint').textContent = isReal
      ? 'Adjust the height of the buildings in this map area.'
      : 'Adjust the height, building density and tree cover.';
    $('#scene-kind').textContent = isReal ? 'OPENSTREETMAP' : 'GENERATED';
    const sceneAttribution = $('#scene-attribution');
    if (sceneAttribution) sceneAttribution.hidden = !isReal;
    const tileAttribution = $('#tile-attribution');
    if (tileAttribution) tileAttribution.hidden = !isReal || model?.layout.source.kind !== 'vector';
  }

  function resetView() {
    topView = false;
    $('#toggle-view span').textContent = 'Top view';
    controls.target.copy(initial.target);
    camera.position.copy(initial.position);
    camera.up.set(0, 1, 0);
    controls.update();
  }

  function cancelMapLoad() {
    if (!mapJob) return;
    const previous = mapJob;
    mapJob = null;
    previous.controller.abort();
    setBusy(false);
    if (previous.source === 'manual') setStatus('Map loading cancelled.');
  }

  function beginMapJob(source) {
    cancelMapLoad();
    const next = { source, controller: new AbortController() };
    mapJob = next;
    setBusy(source === 'manual');
    return next;
  }

  function finishMapJob(job) {
    if (mapJob !== job) return;
    mapJob = null;
    setBusy(false);
  }

  function cancelTerrain() {
    terrainJob?.abort();
    terrainJob = null;
  }

  async function applyTerrain() {
    const currentModel = model;
    if (!currentModel) return;
    cancelTerrain();
    if (terrainField.value === 'flat') {
      setMapElevation(currentModel, null, mapColors(palette).ground);
      if (!mapJob) setStatus('Flat base selected.');
      return;
    }
    const job = new AbortController();
    terrainJob = job;
    const version = mapJob ? -1 : setStatus('Loading relative elevation…');
    const writeStatus = message => {
      if (version === statusVersion && !mapJob) setStatus(message);
    };
    try {
      const data = currentModel.elevationData ||
        await withDeadline(job.signal, 8500, signal => getElevation(currentModel.area, signal));
      if (model !== currentModel || terrainJob !== job) return;
      setMapElevation(currentModel, data, mapColors(palette).ground);
      currentModel.elevationData = data;
      writeStatus('Elevation range: ' + Math.round(data.max - data.min) + ' m. Data from AWS Terrain Tiles / Mapzen.');
    } catch (error) {
      if (model !== currentModel || terrainJob !== job) return;
      terrainField.value = terrainPreference = 'flat';
      setMapElevation(currentModel, null, mapColors(palette).ground);
      writeStatus('Elevation is unavailable for this area. Showing the flat base.');
    } finally {
      if (terrainJob === job) terrainJob = null;
    }
  }

  function refreshMap() {
    const Leaflet = window.L;
    if (!areaEditor.open || !Leaflet) return;
    selectionPreview.hidden = false;
    if (!selectionMap.clientWidth) return;
    const [south, west, north, east] = makeArea(selected, Number(areaField.value)).bounds;
    const center = [selected.latitude, selected.longitude];
    if (!map) {
      map = Leaflet.map(selectionMap, { scrollWheelZoom: false });
      Leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map);
      marker = Leaflet.marker(center, {
        draggable: true, icon: Leaflet.divIcon({ className: 'pixel-pin', iconSize: [18, 18], iconAnchor: [9, 9] })
      }).addTo(map);
      function movePin(point) {
        const latitude = Math.max(-85, Math.min(85, point.lat));
        const longitude = wrapLongitude(point.lng);
        cancelMapLoad();
        setSelection(coordinatePlace(latitude, longitude));
        setStatus('Load the square around the new pin.');
      }
      marker.on('dragend', () => movePin(marker.getLatLng()));
      map.on('click', event => movePin(event.latlng));
      rectangle = Leaflet.rectangle([[south, west], [north, east]], {
        color: '#dd7324', weight: 3, fillOpacity: .08, interactive: false
      }).addTo(map);
    } else {
      marker.setLatLng(center);
      rectangle.setBounds([[south, west], [north, east]]);
    }
    map.invalidateSize({ pan: false });
    map.fitBounds(rectangle.getBounds(), { padding: [12, 12], maxZoom: 16, animate: false });
  }

  function setSelection(place) {
    selected = makeArea(place, Number(areaField.value)).place;
    latitudeField.value = String(selected.latitude);
    longitudeField.value = String(selected.longitude);
    refreshMap();
  }

  function coordinatePlace(latitude, longitude) {
    if (selected?.latitude === latitude && selected.longitude === longitude) return selected;
    return { latitude, longitude, name: latitude.toFixed(4) + ', ' + longitude.toFixed(4) };
  }

  function inputArea() {
    const lat = latitudeField.value.trim(), lon = longitudeField.value.trim();
    const latitude = lat ? Number(lat) : NaN, longitude = lon ? Number(lon) : NaN;
    const area = makeArea({ latitude, longitude }, Number(areaField.value));
    return { ...area, place: coordinatePlace(area.place.latitude, area.place.longitude) };
  }

  function clearModel() {
    cancelTerrain();
    if (model) {
      realRoot.remove(model.root);
      disposeMapModel(model.root);
      model = null;
    }
  }

  function setLandmarkOptions() {
    landmarkField.replaceChildren(new Option('None', ''));
    for (const item of model?.landmarks || []) landmarkField.add(new Option(item.name, item.id));
    $('#landmark-row').hidden = !model?.landmarks.length;
  }

  function showGenerated({ source = 'manual' } = {}) {
    cancelMapLoad();
    clearModel();
    setLandmarkOptions();
    terrainField.value = 'flat';
    setMode(false);
    if (source === 'manual') {
      setStatus('');
      resetView();
    }
    onSceneChange?.({ kind: 'generated', source });
  }

  async function showMap({ area, city, source = 'manual', beforeCommit }) {
    const job = beginMapJob(source);
    const signal = job.controller.signal;
    const progress = message => {
      if (mapJob === job && source === 'manual') setStatus(message);
    };
    let staged, change;
    try {
      let layout;
      if (city) {
        progress('Loading the featured neighborhood…');
        const snapshot = presetCache.get(city) || await loadPreset(city, signal);
        signal.throwIfAborted();
        presetCache.set(city, snapshot);
        ({ area, layout } = snapshot);
      } else {
        const cached = liveCache.get(area.key);
        if (cached && Date.now() - cached.time < 300000) {
          layout = cached.layout;
        } else {
          layout = await loadLiveArea(area, signal, { onProgress: progress, vectorLoader: vectorFeatures });
          signal.throwIfAborted();
          liveCache.delete(area.key);
          liveCache.set(area.key, { layout, time: Date.now() });
          if (liveCache.size > 2) liveCache.delete(liveCache.keys().next().value);
        }
      }
      progress('Building the 3D neighborhood…');
      staged = await createMapModel(layout, area, mapColors(palette), signal);
      if (mapJob !== job) return false;
      beforeCommit?.();
      if (mapJob !== job) return false;
      clearModel();
      model = staged;
      staged = null;
      realRoot.add(model.root);
      setMapHeight(model, .25 + current.height * 1.7);
      setLandmarkOptions();
      setMode(true);
      applyPalette(palette);
      terrainField.value = source === 'tour' ? 'flat' : terrainPreference;
      resetView();
      const place = area.place;
      const name = place.neighborhood ? place.name + ' · ' + place.neighborhood : place.name;
      if (source === 'manual') setStatus('');
      finishMapJob(job);
      if (terrainField.value === 'terrain') applyTerrain();
      change = { kind: 'map', source, name, place, km: area.km };
    } catch (error) {
      if (mapJob === job && !signal.aborted) {
        progress(error instanceof MapDataError ? error.message : 'The map could not be loaded. Try again or adjust the square.');
        console.warn('Map load did not complete:', error);
      }
      return false;
    } finally {
      if (staged) disposeMapModel(staged.root);
      finishMapJob(job);
    }
    if (change) onSceneChange?.(change);
    return Boolean(change);
  }

  document.querySelectorAll('[data-palette]').forEach(button =>
    button.addEventListener('click', () => applyPalette(button.dataset.palette)));
  const timeButtons = document.querySelectorAll('[data-time]');
  timeButtons.forEach(button => button.addEventListener('click', () => {
    dayNight.set(button.dataset.time);
    document.body.dataset.time = button.dataset.time;
    for (const item of timeButtons) {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    }
  }));
  terrainField.addEventListener('change', () => {
    terrainPreference = terrainField.value;
    applyTerrain();
  });
  landmarkField.addEventListener('change', () => {
    if (model) highlightLandmark(model, landmarkField.value);
  });
  $('#reset-view').addEventListener('click', resetView);
  $('#toggle-view').addEventListener('click', () => {
    topView = !topView;
    controls.target.set(0, 0, 0);
    camera.position.set(topView ? .01 : 37, topView ? 72 : 37, topView ? .01 : 51);
    controls.update();
    $('#toggle-view span').textContent = topView ? '3D view' : 'Top view';
  });
  $('#imaginary').addEventListener('click', () => showGenerated());
  $('#cancel-load').addEventListener('click', cancelMapLoad);
  const cityOptions = $('#city-options');
  for (const [index, [city, preset]] of presets.entries()) {
    const name = document.createElement('strong');
    name.id = 'city-name-' + index;
    name.textContent = preset.name;
    const neighborhood = document.createElement('span');
    neighborhood.id = 'city-neighborhood-' + index;
    neighborhood.textContent = preset.neighborhood;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-labelledby', name.id);
    button.setAttribute('aria-describedby', neighborhood.id);
    button.append(name, neighborhood);
    button.addEventListener('click', () => {
      areaEditor.open = false;
      areaField.value = String(preset.km);
      setSelection(preset);
      showMap({ city });
    });
    cityOptions.append(button);
  }
  areaField.addEventListener('change', () => {
    cancelMapLoad();
    refreshMap();
    if (selected) setStatus('Load the selected square to apply its new size.');
  });
  for (const field of [latitudeField, longitudeField]) {
    field.addEventListener('input', () => {
      if (mapJob) {
        cancelMapLoad();
        setStatus('Load the square after adjusting its coordinates.');
      }
    });
    field.addEventListener('change', () => {
      if (!latitudeField.value || !longitudeField.value) return;
      try {
        setSelection(inputArea().place);
        setStatus('Load the square around the selected coordinates.');
      } catch (error) {
        setStatus(error.message);
      }
    });
  }
  $('#load-area').addEventListener('click', () => {
    try {
      const area = inputArea();
      const { latitude, longitude } = area.place;
      const featured = presets.find(([, preset]) =>
        preset.latitude === latitude && preset.longitude === longitude && preset.km === area.km);
      setSelection(area.place);
      showMap({ area, city: featured?.[0] });
    } catch (error) {
      cancelMapLoad();
      setStatus(error.message);
    }
  });

  new ResizeObserver(() => {
    if (areaEditor.open && map && selectionMap.clientWidth) map.invalidateSize({ pan: false });
  }).observe(selectionMap);
  areaEditor.addEventListener('toggle', refreshMap);
  window.addEventListener('leaflet-ready', refreshMap);

  const attribution = () => model ? model.layout.source.attribution + ' · openstreetmap.org/copyright' : '';
  $('#snapshot').addEventListener('click', () => {
    renderer.render(scene, camera);
    const image = model ? creditImage(renderer.domElement, model.layout.source.attribution) : renderer.domElement;
    image.toBlob(blob => {
      if (blob) download(blob, 'pixel-city.png');
      else setStatus('Could not save the image. Try again.');
    }, 'image/png');
  });
  $('#export').addEventListener('click', async () => {
    const credit = model && (model.layout.source.kind === 'vector'
      ? 'OSM contributors; openstreetmap.org/copyright; OpenMapTiles; OpenFreeMap'
      : '(c) OpenStreetMap contributors; openstreetmap.org/copyright');
    const copy = copyVisibleModel(model?.root || procedural);
    const version = setStatus('Preparing STL…');
    try {
      const { STLExporter } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/exporters/STLExporter.js');
      copy.root.rotation.x = Math.PI / 2;
      copy.root.updateMatrixWorld(true);
      const data = new STLExporter().parse(copy.root, { binary: true });
      if (credit) new Uint8Array(data.buffer, data.byteOffset, 80).set(new TextEncoder().encode(credit));
      download(new Blob([data], { type: 'model/stl' }), 'pixel-city.stl');
      if (version === statusVersion) setStatus('STL exported. Inspect geometry in your slicer before printing.');
    } catch (error) {
      if (version === statusVersion) setStatus('STL export failed. Try again.');
    } finally {
      copy.dispose();
    }
  });
  $('#export-3mf').addEventListener('click', async () => {
    const credit = attribution();
    const copy = copyVisibleModel(model?.root || procedural);
    const button = $('#export-3mf');
    button.disabled = true;
    const version = setStatus('Preparing color 3MF…');
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const { make3MF } = await import('./export-3mf.js');
      const result = await make3MF(copy.root, { attribution: credit });
      download(result.blob, 'pixel-city-color.3mf');
      if (version === statusVersion) setStatus('3MF exported at 160 mm with ' + result.colors + ' material colors.');
    } catch (error) {
      if (version === statusVersion) setStatus('3MF export failed. ' + error.message);
    } finally {
      copy.dispose();
      button.disabled = false;
    }
  });

  const [, firstPreset] = presets[0];
  areaField.value = String(firstPreset.km);
  setSelection(firstPreset);
  applyPalette('harvest');
  setMode(false);
  return {
    update() { if (model) setMapHeight(model, .25 + current.height * 1.7); },
    isReal: () => Boolean(model),
    showGenerated,
    showTourMap: (city, { beforeCommit } = {}) => showMap({ city, source: 'tour', beforeCommit }),
    cancelMapLoad,
    refreshMap
  };
}
