import * as THREE from 'three';
import { compactParts } from './assets.js';
import { landmarkKind, makeLandmark } from './landmarks.js';
import { BASE_WIDTH, MAP_WIDTH, MapDataError, TOWER_NAMES } from './map-data.mjs';
import { terrainMesh } from './terrain.js';


function solid(rings, height) {
  function draw(path, ring) {
    path.moveTo(...ring[0]);
    for (const point of ring.slice(1)) path.lineTo(...point);
    path.closePath();
    return path;
  }
  const shape = draw(new THREE.Shape(), rings[0]);
  shape.holes = rings.slice(1).map(ring => draw(new THREE.Path(), ring));
  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
}

function material(color, emissive) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, emissive });
}

function setRole(mesh, role, colorIndex) {
  mesh.userData.colorRole = role;
  if (colorIndex !== undefined) mesh.userData.colorIndex = colorIndex;
}

function buildingColor(id, count) {
  let value = 0;
  for (const char of id) value = Math.imul(value, 31) + char.charCodeAt(0) | 0;
  return (value >>> 0) % count;
}

export function disposeMapModel(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const item of Array.isArray(object.material) ? object.material : [object.material]) materials.add(item);
  });
  geometries.forEach(item => item.dispose());
  materials.forEach(item => item.dispose());
  root.clear();
}

export async function createMapModel(layout, area, palette, signal) {
  const root = new THREE.Group();
  const parts = new THREE.Group();
  const meters = MAP_WIDTH / (area.km * 1000);
  const ownedGeometries = new Set();
  const buildingMaterials = palette.building.map(color => material(color, '#000000'));
  const roadMaterial = material(palette.road, '#000000');
  const waterMaterial = material(palette.water, '#000000');
  const roles = new Map(buildingMaterials.map((item, index) => [item, ['building', index]]));
  roles.set(roadMaterial, ['road']);
  roles.set(waterMaterial, ['water']);

  const batches = [];
  const landmarks = [];
  const namedBuildings = new Set(layout.buildings.filter(entry => entry.name)
    .sort((a, b) => (b.height || 0) - (a.height || 0)).slice(0, 30));
  const anchorsByMaterial = new Map();
  let sliceStarted = performance.now();
  async function yieldIfNeeded() {
    if (performance.now() - sliceStarted >= 12) {
      await new Promise(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
      sliceStarted = performance.now();
    }
  }
  function put(mesh, anchor, role, colorIndex) {
    if (!anchorsByMaterial.has(mesh.material)) anchorsByMaterial.set(mesh.material, []);
    anchorsByMaterial.get(mesh.material).push(anchor);
    setRole(mesh, role, colorIndex);
    parts.add(mesh);
  }

  try {
    signal.throwIfAborted();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_WIDTH, .6, BASE_WIDTH), material(palette.ground, '#000000')
    );
    base.position.y = -.3;
    base.receiveShadow = true;
    setRole(base, 'ground');
    root.add(base);
    let buildingCount = 0;
    for (const entry of layout.buildings) {
      await yieldIfNeeded();
      const colorIndex = buildingColor(entry.id, buildingMaterials.length);
      const height = Math.max(3, entry.height || 6.4);
      const min = Math.min(height - 1, entry.minHeight || 0);
      const geometry = solid(entry.rings, (height - min) * meters);
      if (geometry.attributes.position.count < 12) {
        geometry.dispose();
        continue;
      }
      const anchor = [entry.anchor[0], -entry.anchor[1]];
      const interactive = namedBuildings.has(entry);
      const mesh = new THREE.Mesh(geometry, interactive ? buildingMaterials[colorIndex].clone() : buildingMaterials[colorIndex]);
      mesh.position.y = min * meters;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (interactive) {
        setRole(mesh, 'building', colorIndex);
        root.add(mesh);
        landmarks.push({ id: 'building/' + buildingCount, name: entry.name, mesh });
        batches.push({ mesh, baseY: mesh.position.y, anchors: [anchor], role: 'building', individual: true });
      } else {
        ownedGeometries.add(geometry);
        put(mesh, anchor, 'building', colorIndex);
      }
      buildingCount++;
    }
    if (!buildingCount) throw new MapDataError('empty', 'No usable building footprints were found in this square.');

    const roadShape = new THREE.BoxGeometry(1, 1, 1);
    ownedGeometries.add(roadShape);
    for (const road of layout.roads) {
      await yieldIfNeeded();
      const [[x1, y1], [x2, y2]] = road.line;
      const dx = x2 - x1, dz = y1 - y2;
      const center = [(x1 + x2) / 2, -(y1 + y2) / 2];
      const mesh = new THREE.Mesh(roadShape, roadMaterial);
      mesh.position.set(center[0], .05, center[1]);
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.scale.set(Math.hypot(dx, dz), .034, road.width);
      put(mesh, center, 'road');
    }
    for (const entry of layout.water) {
      const geometry = solid(entry.rings, .056);
      ownedGeometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, waterMaterial);
      mesh.position.y = -.028;
      geometry.computeBoundingBox();
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      put(mesh, [center.x, center.z], 'water');
    }

    await yieldIfNeeded();
    signal.throwIfAborted();
    const compact = compactParts(parts);
    root.add(compact);
    for (const mesh of compact.children) {
      const [role, index] = roles.get(mesh.material);
      setRole(mesh, role, index);
      mesh.userData.terrainMutable = true;
      mesh.frustumCulled = false;
      batches.push({ mesh, anchors: anchorsByMaterial.get(mesh.material), role, baseY: 0 });
    }

    const renderedTowers = new Set();
    for (const entry of layout.landmarks) {
      const [x, north] = entry.point;
      const z = -north;
      const tags = { name: entry.name, man_made: entry.tower && TOWER_NAMES.test(entry.name) ? 'tower' : '' };
      const kind = landmarkKind(tags);
      const model = kind && !renderedTowers.has(kind) ? makeLandmark(tags, area.km) : null;
      if (model) renderedTowers.add(kind);
      const mesh = model || new THREE.Mesh(new THREE.BoxGeometry(.27, .65, .27), material('#f6ac42', '#000000'));
      const baseY = model ? 0 : .325;
      mesh.position.set(x, baseY, z);
      mesh.visible = Boolean(model);
      root.add(mesh);
      batches.push({ mesh, role: 'landmark', anchors: [[x, z]], baseY, individual: true });
      landmarks.push({
        id: 'poi/' + landmarks.length, name: entry.name + (model ? ' (stylized model)' : ''),
        mesh, marker: !model
      });
    }
    await yieldIfNeeded();
    signal.throwIfAborted();
    const model = {
      root, base, batches, buildingCount, layout, area, elevation: null, terrain: null, height: 1,
      landmarks: landmarks.sort((a, b) => Number(Boolean(b.mesh.userData.highlightMaterial)) - Number(Boolean(a.mesh.userData.highlightMaterial)))
    };
    return model;
  } catch (error) {
    disposeMapModel(root);
    [...buildingMaterials, roadMaterial, waterMaterial].forEach(item => item.dispose());
    throw error;
  } finally {
    ownedGeometries.forEach(geometry => geometry.dispose());
    parts.clear();
  }
}

function updateBatch(batch, elevation, height) {
  const { mesh, anchors, baseY, role } = batch;
  const multiplier = role === 'building' ? height : 1;
  if (batch.individual) {
    const [x, z] = anchors[0];
    mesh.position.y = baseY * multiplier + (elevation?.sample(x, z) ?? 0);
    mesh.scale.y = multiplier;
    return;
  }
  const positions = mesh.geometry.attributes.position;
  if (elevation) {
    if (!batch.flatY) batch.flatY = Float32Array.from({ length: positions.count }, (_, i) => positions.getY(i));
    let start = 0;
    for (const [index, end] of mesh.geometry.userData.solidVertexEnds.entries()) {
      const offset = elevation.sample(...anchors[index]);
      for (let i = start; i < end; i++) positions.setY(i, batch.flatY[i] * multiplier + offset);
      start = end;
    }
    mesh.scale.y = 1;
    positions.needsUpdate = true;
  } else {
    if (batch.flatY) {
      for (let i = 0; i < positions.count; i++) positions.setY(i, batch.flatY[i]);
      batch.flatY = null;
      positions.needsUpdate = true;
    }
    mesh.scale.y = multiplier;
  }
  mesh.updateMatrix();
}

export function setMapHeight(model, height) {
  if (Math.abs(model.height - height) < .0001) return;
  model.height = height;
  for (const batch of model.batches) {
    if (batch.role === 'building') updateBatch(batch, model.elevation, height);
  }
}

export function setMapElevation(model, data, groundColor) {
  if (model.elevation === data) return;
  const previous = model.terrain;
  if (previous) {
    model.root.remove(previous);
    previous.geometry.dispose();
    previous.material.dispose();
  }
  model.elevation = data;
  model.terrain = data && terrainMesh(data, groundColor);
  model.base.visible = !data;
  if (model.terrain) model.root.add(model.terrain);
  for (const batch of model.batches) updateBatch(batch, data, model.height);
}

export function highlightLandmark(model, id) {
  for (const item of model.landmarks) {
    const active = item.id === id;
    if (item.marker) item.mesh.visible = active;
    const mat = item.mesh.userData.highlightMaterial || item.mesh.material;
    if (mat?.emissive) {
      mat.emissive.set(active ? '#ff8a00' : '#000000');
      mat.emissiveIntensity = active ? .85 : 0;
    }
  }
}
