import { MapDataError, OSM_ATTRIBUTION, OSM_LICENSE, TOWER_NAMES, named, readBytes } from './map-data.mjs';

export const TILEJSON = 'https://tiles.openfreemap.org/planet';
const TILE_ZOOM = 14;
const SIZE = 2 ** TILE_ZOOM;
const TO_RAD = Math.PI / 180;
const MAX_TILES = 20;
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'pedestrian']);
const LANDMARK_TYPES = new Set(['attraction', 'museum', 'viewpoint', 'artwork', 'tower', 'observation_tower', 'theme_park', 'monument', 'memorial', 'stadium', 'castle', 'park', 'lighthouse', 'aquarium']);
const NAMED_TOWER_TYPES = new Set(['tower', 'observation_tower', 'attraction', 'monument']);
const PRIORITY_NAMES = /^(marina bay sands|merlion|merlion park|shanghai tower|shanghai world financial center|the helix bridge)$/i;

const tileX = longitude => (longitude + 180) / 360 * SIZE;
const tileY = latitude => (1 - Math.asinh(Math.tan(latitude * TO_RAD)) / Math.PI) / 2 * SIZE;
const tileLon = x => x / SIZE * 360 - 180;
const tileLat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / SIZE))) / TO_RAD;

export function tilesForArea(area) {
  const [south, west, north, east] = area.bounds;
  const minX = Math.floor(tileX(west)), maxX = Math.ceil(tileX(east)) - 1;
  const minY = Math.floor(tileY(north)), maxY = Math.ceil(tileY(south)) - 1;
  if ((maxX - minX + 1) * (maxY - minY + 1) > MAX_TILES) {
    throw new MapDataError('large', 'This square spans too many detailed map tiles. Try a smaller square.');
  }
  const result = [];
  for (let y = minY; y <= maxY; y++) {
    for (let column = minX; column <= maxX; column++) {
      const x = (column + SIZE) % SIZE;
      result.push({ x, y, z: TILE_ZOOM, bounds: [tileLon(x), tileLat(y + 1), tileLon(x + 1), tileLat(y)] });
    }
  }
  return result;
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
    const geometry = feature.toGeoJSON(x, y, z).geometry;
    const id = [z, x, y, layerName, feature.id || feature.properties.id || i].join('/');
    apply(geometry, feature.properties, id, bounds);
  }
}

function polygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function appendTile(data, tile, coordinates) {
  eachFeature(tile, 'building', coordinates, (geometry, properties, id, tileBounds) => {
    if (properties.hide_3d === true || properties.hide_3d === 1) return;
    const rawHeight = Number(properties.render_height);
    const height = rawHeight > 0 ? Math.min(900, rawHeight) : null;
    const minHeight = Number(properties.render_min_height) || 0;
    for (const rings of polygons(geometry)) {
      data.buildings.push({ id, rings, tileBounds, height, minHeight, name: named(properties) });
    }
  });
  eachFeature(tile, 'transportation', coordinates, (geometry, properties, id, tileBounds) => {
    if (properties.brunnel === 'tunnel' ||
        !ROAD_CLASSES.has(properties.class) && !(properties.class === 'path' && properties.brunnel === 'bridge')) return;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] :
      geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    for (const line of lines) data.roads.push({ id, line, tileBounds, class: properties.class });
  });
  eachFeature(tile, 'water', coordinates, (geometry, properties, id, tileBounds) => {
    for (const rings of polygons(geometry)) data.water.push({ id, rings, tileBounds });
  });
  eachFeature(tile, 'poi', coordinates, (geometry, properties, id) => {
    const name = named(properties);
    if (!name || geometry.type !== 'Point') return;
    const types = [properties.class, properties.subclass];
    const kind = properties.subclass || properties.class;
    const tower = /^(observation_)?tower$/.test(kind) ||
      (TOWER_NAMES.test(name) && NAMED_TOWER_TYPES.has(kind));
    const priority = tower || PRIORITY_NAMES.test(name);
    if (!priority && !types.some(type => LANDMARK_TYPES.has(type))) return;
    data.landmarks.push({
      id, coordinates: geometry.coordinates, name, tower, rank: priority ? .1 : Number(properties.rank)
    });
  });
}

export async function vectorFeatures(area, signal, { fetcher = fetch, decoder, template, userAgent } = {}) {
  const tiles = tilesForArea(area);
  const headers = userAgent ? { 'User-Agent': userAgent } : undefined;
  const [decode, tileTemplate] = await Promise.all([
    decoder || makeDecoder(),
    template || (async () => {
      const response = await fetcher(TILEJSON, { signal, headers });
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
  let next = 0, totalBytes = 0;
  const decodedTiles = [];
  async function downloadTiles() {
    while (next < tiles.length) {
      const index = next++;
      signal?.throwIfAborted();
      const response = await fetcher(urls[index], { signal, headers });
      const bytes = await readBytes(response, 2_000_000);
      totalBytes += bytes.byteLength;
      if (totalBytes > 12_000_000) throw new MapDataError('large', 'This square contains too much map data. Try a smaller square.');
      signal?.throwIfAborted();
      decodedTiles[index] = decode(bytes);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, tiles.length) }, downloadTiles));
  for (const [i, tile] of decodedTiles.entries()) appendTile(data, tile, tiles[i]);
  return data;
}
