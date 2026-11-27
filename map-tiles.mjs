import { MapDataError, OSM_ATTRIBUTION, OSM_LICENSE, TOWER_NAMES, named, readBytes } from './map-data.mjs';

export const TILEJSON = 'https://tiles.openfreemap.org/planet';
const DETAIL_ZOOM = 14;
const OVERVIEW_ZOOM = 13;
const TO_RAD = Math.PI / 180;
const MAX_TILES = 20;
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'pedestrian']);
const LANDMARK_TYPES = new Set(['attraction', 'museum', 'viewpoint', 'artwork', 'tower', 'observation_tower', 'theme_park', 'monument', 'memorial', 'stadium', 'castle', 'park', 'lighthouse', 'aquarium']);
const NAMED_TOWER_TYPES = new Set(['tower', 'observation_tower', 'attraction', 'monument']);
const PRIORITY_NAMES = /^(marina bay sands|merlion|merlion park|shanghai tower|shanghai world financial center|the helix bridge)$/i;

export function tilesForArea(area, tileLimit = MAX_TILES) {
  const [south, west, north, east] = area.bounds;
  // Both zooms contain real building footprints. Use one zoom to cover the whole square.
  for (const z of [DETAIL_ZOOM, OVERVIEW_ZOOM]) {
    const size = 2 ** z;
    const tileX = longitude => (longitude + 180) / 360 * size;
    const tileY = latitude => (1 - Math.asinh(Math.tan(latitude * TO_RAD)) / Math.PI) / 2 * size;
    const tileLon = x => x / size * 360 - 180;
    const tileLat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) / TO_RAD;
    const minX = Math.floor(tileX(west)), maxX = Math.ceil(tileX(east)) - 1;
    const minY = Math.floor(tileY(north)), maxY = Math.ceil(tileY(south)) - 1;
    if ((maxX - minX + 1) * (maxY - minY + 1) > tileLimit) continue;
    const result = [];
    for (let y = minY; y <= maxY; y++) {
      for (let column = minX; column <= maxX; column++) {
        const x = (column + size) % size;
        result.push({ x, y, z, bounds: [tileLon(x), tileLat(y + 1), tileLon(x + 1), tileLat(y)] });
      }
    }
    return result;
  }
  throw new MapDataError('large', 'This square spans too many building tiles here. Choose a smaller area.');
}

export async function makeDecoder(vectorTileModule, pbfModule) {
  if (vectorTileModule && pbfModule) {
    const [{ VectorTile }, { default: Pbf }] = await Promise.all([import(vectorTileModule), import(pbfModule)]);
    return bytes => new VectorTile(new Pbf(bytes));
  }
  const { VectorTile, Pbf } = await import('./vendor/map/decoder.mjs');
  return bytes => new VectorTile(new Pbf(bytes));
}

function eachFeature(tile, layerName, coordinates, apply) {
  const layer = tile.layers[layerName];
  if (!layer) return;
  const { x, y, z, bounds } = coordinates;
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const id = [z, x, y, layerName, feature.id || feature.properties.id || i].join('/');
    const geometry = () => feature.toGeoJSON(x, y, z).geometry;
    apply(feature.properties, geometry, id, bounds);
  }
}

function polygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function appendTile(data, tile, coordinates) {
  eachFeature(tile, 'building', coordinates, (properties, geometry, id, tileBounds) => {
    if (properties.hide_3d === true || properties.hide_3d === 1) return;
    const rawHeight = Number(properties.render_height);
    const height = rawHeight > 0 ? Math.min(900, rawHeight) : null;
    const minHeight = Number(properties.render_min_height) || 0;
    for (const [index, rings] of polygons(geometry()).entries()) {
      // Overview tiles group many footprints in a single heightless feature.
      const footprintId = coordinates.z === OVERVIEW_ZOOM ? id + '/' + index : id;
      data.buildings.push({ id: footprintId, rings, tileBounds, height, minHeight, name: named(properties) });
    }
  });
  eachFeature(tile, 'transportation', coordinates, (properties, geometry, id, tileBounds) => {
    if (properties.brunnel === 'tunnel' ||
        !ROAD_CLASSES.has(properties.class) && !(properties.class === 'path' && properties.brunnel === 'bridge')) return;
    const shape = geometry();
    const lines = shape.type === 'LineString' ? [shape.coordinates] :
      shape.type === 'MultiLineString' ? shape.coordinates : [];
    for (const line of lines) data.roads.push({ id, line, tileBounds, class: properties.class });
  });
  eachFeature(tile, 'water', coordinates, (_properties, geometry, id, tileBounds) => {
    for (const rings of polygons(geometry())) data.water.push({ id, rings, tileBounds });
  });
  eachFeature(tile, 'poi', coordinates, (properties, geometry, id) => {
    const name = named(properties);
    if (!name) return;
    const types = [properties.class, properties.subclass];
    const kind = properties.subclass || properties.class;
    const tower = /^(observation_)?tower$/.test(kind) ||
      (TOWER_NAMES.test(name) && NAMED_TOWER_TYPES.has(kind));
    const priority = tower || PRIORITY_NAMES.test(name);
    if (!priority && !types.some(type => LANDMARK_TYPES.has(type))) return;
    const point = geometry();
    if (point.type !== 'Point') return;
    data.landmarks.push({
      id, coordinates: point.coordinates, name, tower, rank: priority ? .1 : Number(properties.rank)
    });
  });
}

export async function vectorFeatures(area, signal, {
  fetcher = fetch, decoder, template, userAgent, tileLimit, onProgress = () => {}
} = {}) {
  const tiles = tilesForArea(area, tileLimit);
  signal?.throwIfAborted();
  const tileJob = new AbortController();
  const requestSignal = signal ? AbortSignal.any([signal, tileJob.signal]) : tileJob.signal;
  const headers = userAgent ? { 'User-Agent': userAgent } : undefined;
  const [decode, tileTemplate] = await Promise.all([
    decoder || makeDecoder(),
    template || (async () => {
      const response = await fetcher(TILEJSON, { signal: requestSignal, headers });
      const bytes = await readBytes(response, 80_000);
      return JSON.parse(new TextDecoder().decode(bytes)).tiles?.[0];
    })()
  ]);
  if (typeof tileTemplate !== 'string' || !tileTemplate.startsWith('https://tiles.openfreemap.org/') ||
      !['{z}', '{x}', '{y}'].every(field => tileTemplate.includes(field))) {
    throw new MapDataError('invalid', 'The map tile catalog returned an unexpected address.');
  }
  const release = tileTemplate.match(/\/(\d{4})(\d{2})(\d{2})_/);
  const urls = tiles.map(({ z, x, y }) => tileTemplate
    .replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
  const data = {
    buildings: [], roads: [], water: [], landmarks: [],
    source: {
      kind: 'vector', endpoint: TILEJSON, template: tileTemplate, urls, timestamp: release?.slice(1).join('-'),
      attribution: 'OpenFreeMap · © OpenMapTiles · ' + OSM_ATTRIBUTION, license: OSM_LICENSE
    }
  };
  let next = 0, completed = 0, totalBytes = 0;
  const decodedTiles = [];
  async function downloadTiles() {
    while (next < tiles.length) {
      const index = next++;
      requestSignal.throwIfAborted();
      const response = await fetcher(urls[index], { signal: requestSignal, headers });
      const bytes = await readBytes(response, 2_000_000);
      totalBytes += bytes.byteLength;
      if (totalBytes > 12_000_000) throw new MapDataError('large', 'This square contains too much map data. Try a smaller square.');
      requestSignal.throwIfAborted();
      decodedTiles[index] = decode(bytes);
      onProgress('Loading map tiles (' + ++completed + '/' + tiles.length + ')…');
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, tiles.length) }, downloadTiles));
    let sliceStarted = performance.now();
    for (const [index, tile] of decodedTiles.entries()) {
      if (performance.now() - sliceStarted >= 12) {
        await new Promise(resolve => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
      requestSignal.throwIfAborted();
      appendTile(data, tile, tiles[index]);
    }
    return data;
  } finally {
    tileJob.abort();
  }
}
