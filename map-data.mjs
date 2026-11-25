export const MAP_WIDTH = 40;
export const BASE_WIDTH = 42;
export const OSM_LICENSE = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const TOWER_NAMES = /^(tokyo tower|東京タワー|东京塔|东方明珠((广播)?电视塔)?|東方明珠((廣播)?電視塔)?|oriental pearl( radio( and| &)? (tv|television))? tower|eiffel tower|tour eiffel|埃菲尔铁塔|cn tower|tour cn)$/i;

export const PRESETS = Object.freeze({
  Tokyo: Object.freeze({ name: 'Tokyo', neighborhood: 'Shiba Park', latitude: 35.6586, longitude: 139.7454, km: 2, file: 'tokyo.json' }),
  Shanghai: Object.freeze({ name: 'Shanghai', neighborhood: 'Lujiazui', latitude: 31.238, longitude: 121.5006, km: 2, file: 'shanghai.json' }),
  Singapore: Object.freeze({ name: 'Singapore', neighborhood: 'Marina Bay', latitude: 1.2833, longitude: 103.855, km: 2, file: 'singapore.json' }),
  Paris: Object.freeze({ name: 'Paris', neighborhood: 'Eiffel Tower', latitude: 48.85837, longitude: 2.29448, km: 2, file: 'paris.json' }),
  'New York': Object.freeze({ name: 'New York', neighborhood: 'Flatiron District', latitude: 40.74104, longitude: -73.9897, km: 2, file: 'new-york.json' }),
  Venice: Object.freeze({ name: 'Venice', neighborhood: 'Rialto Bridge', latitude: 45.43793, longitude: 12.33599, km: 2, file: 'venice.json' })
});

const DEGREES = 180 / Math.PI;
const SCENE_HALF = MAP_WIDTH / 2;
const WORLD_BOUNDS = [-SCENE_HALF, -SCENE_HALF, SCENE_HALF, SCENE_HALF];
const LIVE_LIMITS = { buildings: 1800, buildingPoints: 42000, roads: 5000, waterPoints: 8000, landmarks: 36 };
export const PRESET_LIMITS = { buildings: 1300, buildingPoints: 23000, roads: 3500, waterPoints: 5000, landmarks: 24 };
const OVERPASS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

export class MapDataError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MapDataError';
    this.code = code;
  }
}

export function wrapLongitude(longitude) {
  if (longitude >= -180 && longitude < 180) return longitude;
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function makeArea(place, km) {
  const { latitude, longitude } = place;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 85 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new MapDataError('coordinates', 'Enter latitude from −85 to 85 and longitude from −180 to 180.');
  }
  if (!Number.isFinite(km) || km < .5 || km > 4) {
    throw new MapDataError('coordinates', 'Choose an area size from 0.5 to 4 km.');
  }
  const center = { ...place, longitude: wrapLongitude(longitude) };
  const halfLat = km / 2 / 111.32;
  const halfLon = halfLat / Math.cos(latitude / DEGREES);
  const bounds = [latitude - halfLat, center.longitude - halfLon, latitude + halfLat, center.longitude + halfLon];
  const [south, west, north, east] = bounds;
  const queryBounds = west < -180
    ? [[south, west + 360, north, 180], [south, -180, north, east]]
    : east > 180
      ? [[south, west, north, 180], [south, -180, north, east - 360]]
      : [bounds];
  const project = ([lon, lat]) => [
    wrapLongitude(lon - center.longitude) / halfLon * SCENE_HALF,
    (lat - latitude) / halfLat * SCENE_HALF
  ];
  return { place: center, km, bounds, queryBounds, project, key: [latitude, center.longitude, km].join(',') };
}

export function withDeadline(signal, timeoutMs, task) {
  const controller = new AbortController();
  const signalError = () => signal?.reason || new DOMException('Cancelled', 'AbortError');
  if (signal?.aborted) return Promise.reject(signalError());
  let rejectPending;
  const interrupted = new Promise((_, reject) => { rejectPending = reject; });
  function abort(reason) {
    controller.abort(reason);
    rejectPending(reason);
  }
  const cancel = () => abort(signalError());
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => abort(new MapDataError('timeout', 'The map request timed out. Try again or choose a smaller area.')), timeoutMs);
  const work = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return task(controller.signal);
  });
  return Promise.race([work, interrupted]).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (!controller.signal.aborted) controller.abort();
  });
}

export async function readBytes(response, limit) {
  if (!response.ok) throw new MapDataError('http', 'Map service returned HTTP ' + response.status + '.');
  if (Number(response.headers.get('content-length')) > limit) {
    throw new MapDataError('large', 'This area returned too much map data. Try a smaller square.');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        reader.cancel().catch(() => {});
        throw new MapDataError('large', 'This area returned too much map data. Try a smaller square.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJSON(response, limit) {
  const bytes = await readBytes(response, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MapDataError('invalid', 'The map service returned unreadable data.');
  }
}

const finitePoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
const samePoint = (a, b) => Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8;

function signedArea(ring) {
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i], [nextX, nextY] = ring[(i + 1) % ring.length];
    twiceArea += x * nextY - nextX * y;
  }
  return twiceArea / 2;
}

function containsPoint(ring, point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[i], ring[j]];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

// Bounds are minX, minY, maxX, maxY, in the same coordinates as the points.
export function clipRing(points, [left, bottom, right, top]) {
  let ring = points;
  for (const [axis, bound, side] of [[0, left, -1], [1, bottom, -1], [0, right, 1], [1, top, 1]]) {
    if (!ring.length) return ring;
    const input = ring;
    ring = [];
    let previous = input.at(-1);
    let previousInside = side * (previous[axis] - bound) <= 0;
    for (const point of input) {
      const inside = side * (point[axis] - bound) <= 0;
      if (inside !== previousInside) {
        const other = 1 - axis;
        const t = (bound - previous[axis]) / (point[axis] - previous[axis]);
        const edge = [];
        edge[axis] = bound;
        edge[other] = previous[other] + t * (point[other] - previous[other]);
        ring.push(edge);
      }
      if (inside) ring.push(point);
      previous = point;
      previousInside = inside;
    }
  }
  return ring.filter((point, index) => !samePoint(point, ring[(index + ring.length - 1) % ring.length]));
}

export function clipSegment(a, b, [left, bottom, right, top]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let start = 0, end = 1;
  for (const [delta, distance] of [[-dx, a[0] - left], [dx, right - a[0]], [-dy, a[1] - bottom], [dy, top - a[1]]]) {
    if (delta === 0) {
      if (distance < 0) return null;
    } else if (delta < 0) {
      start = Math.max(start, distance / delta);
    } else {
      end = Math.min(end, distance / delta);
    }
  }
  if (end <= start) return null;
  return [[a[0] + start * dx, a[1] + start * dy], [a[0] + end * dx, a[1] + end * dy]];
}

function clipFootprint(rings, tileBounds) {
  const outer = clipRing(rings[0], WORLD_BOUNDS);
  if (outer.length < 3 || Math.abs(signedArea(outer)) < .00001) return [];
  // Holes that touch the crop edge cannot be passed as interior rings to the triangulator.
  const holes = rings.slice(1).filter(ring => ring.length >= 3 &&
    ring.every(([x, y]) => x > -SCENE_HALF && x < SCENE_HALF && y > -SCENE_HALF && y < SCENE_HALF &&
      (!tileBounds || (x > tileBounds[0] && x < tileBounds[2] && y > tileBounds[1] && y < tileBounds[3]))));
  return [outer, ...holes];
}

const pointFromOSM = ({ lon, lat }) => [lon, lat];
const pointsFromOSM = points => (points || []).map(pointFromOSM).filter(finitePoint);
const closed = ring => ring.length >= 4 && samePoint(ring[0], ring.at(-1));

function joinRings(parts) {
  const pending = parts.filter(part => part.length >= 2);
  const rings = [];
  while (pending.length) {
    let ring = pending.pop();
    while (!closed(ring)) {
      const end = ring.at(-1);
      const index = pending.findIndex(part => samePoint(part[0], end) || samePoint(part.at(-1), end));
      if (index < 0) break;
      let [next] = pending.splice(index, 1);
      if (!samePoint(next[0], end)) next = next.slice().reverse();
      ring = ring.concat(next.slice(1));
    }
    if (closed(ring)) rings.push(ring);
  }
  return rings;
}

function footprints(element) {
  if (element.type === 'way') {
    const ring = pointsFromOSM(element.geometry);
    return closed(ring) ? [[ring]] : [];
  }
  if (element.type !== 'relation') return [];
  const members = element.members || [];
  const outers = joinRings(members.filter(member => member.role === 'outer').map(member => pointsFromOSM(member.geometry)));
  const inners = joinRings(members.filter(member => member.role === 'inner').map(member => pointsFromOSM(member.geometry)));
  return outers.map(outer => [outer, ...inners.filter(inner => containsPoint(outer, inner[0]))]);
}

function heightMeters(tags) {
  const height = Number.parseFloat(tags.height);
  if (height > 0) {
    const meters = /ft|feet|'/i.test(tags.height) ? height * .3048 : height;
    return Math.max(3, Math.min(900, meters));
  }
  const levels = Number.parseFloat(tags['building:levels']);
  return levels > 0 ? Math.min(900, levels * 3.2) : null;
}

export const named = tags => tags['name:en'] || tags.name_en || tags.name || '';

export function osmFeatures(raw, endpoint) {
  if (!Array.isArray(raw?.elements) || raw.remark) {
    throw new MapDataError('invalid', 'The map service returned an incomplete response.');
  }
  const data = {
    buildings: [], roads: [], water: [], landmarks: [],
    source: { kind: 'overpass', endpoint, timestamp: raw.osm3s?.timestamp_osm_base, attribution: OSM_ATTRIBUTION, license: OSM_LICENSE }
  };
  const relationMembers = new Set(raw.elements.filter(e => e.type === 'relation' && e.tags?.building)
    .flatMap(e => (e.members || []).filter(member => member.role === 'outer').map(member => member.ref)));
  for (const element of raw.elements) {
    const tags = element.tags || {};
    const id = element.type + '/' + element.id;
    const name = named(tags);
    const isBuilding = tags.building && tags.building !== 'no' &&
      !(element.type === 'way' && relationMembers.has(element.id));
    const isWater = tags.natural === 'water';
    if (isBuilding || isWater) {
      for (const rings of footprints(element)) {
        if (isBuilding) data.buildings.push({ id, rings, height: heightMeters(tags), name });
        if (isWater) data.water.push({ id, rings });
      }
    }
    if (tags.highway && tags.tunnel !== 'yes' && tags.area !== 'yes') {
      const line = pointsFromOSM(element.geometry);
      if (line.length > 1) data.roads.push({ id, line, class: tags.highway });
    }
    if (name && (element.type === 'node' || tags.man_made === 'tower')) {
      const points = element.type === 'node' ? [pointFromOSM(element)] :
        pointsFromOSM(element.geometry || (element.members || []).flatMap(member => member.geometry || []));
      if (!points.length || !points.every(finitePoint)) continue;
      const longitude = points[0][0] + points.reduce((sum, point) => sum + wrapLongitude(point[0] - points[0][0]), 0) / points.length;
      const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      data.landmarks.push({ id, coordinates: [wrapLongitude(longitude), latitude], name, tower: tags.man_made === 'tower' });
    }
  }
  return data;
}

function worldTileBounds(tileBounds, area) {
  if (!tileBounds) return null;
  const bottomLeft = area.project(tileBounds.slice(0, 2));
  const topRight = area.project(tileBounds.slice(2));
  return [...bottomLeft, ...topRight];
}

function preparePolygon(entry, area) {
  if (!entry.rings?.length || entry.rings.some(ring => !ring.every(finitePoint))) return [];
  const tileBounds = worldTileBounds(entry.tileBounds, area);
  const rings = entry.rings.map(ring => {
    const projected = ring.map(area.project);
    return tileBounds ? clipRing(projected, tileBounds) : projected;
  });
  return clipFootprint(rings, tileBounds);
}

function buildingAreaOrder(a, b) {
  return b.area - a.area || a.id.localeCompare(b.id);
}

function pickBuildings(buildings, limits) {
  const cells = Array.from({ length: 256 }, () => []);
  const priority = buildings.filter(b => b.height > 60).sort((a, b) => b.height - a.height).slice(0, 40);
  const featured = new Set(priority);
  for (const building of buildings) {
    if (featured.has(building)) continue;
    const cell = coordinate => Math.min(15, Math.max(0, Math.floor((coordinate / MAP_WIDTH + .5) * 16)));
    cells[cell(building.anchor[1]) * 16 + cell(building.anchor[0])].push(building);
  }
  for (const cell of cells) cell.sort(buildingAreaOrder);
  const result = [];
  let pointCount = 0;
  function add(building) {
    const points = building.rings.reduce((sum, ring) => sum + ring.length, 0);
    if (result.length >= limits.buildings || pointCount + points > limits.buildingPoints) return;
    const { area, ...entry } = building;
    result.push(entry);
    pointCount += points;
  }
  priority.forEach(add);
  const layers = Math.max(...cells.map(cell => cell.length));
  for (let layer = 0; layer < layers && result.length < limits.buildings; layer++) {
    for (const cell of cells) if (cell[layer]) add(cell[layer]);
  }
  return result;
}

const majorRoad = road => /^(motorway|trunk|primary|secondary|tertiary)/.test(road.class || '');

export function prepareArea(data, area, limits = LIVE_LIMITS) {
  const usable = [];
  for (const entry of data.buildings) {
    const rings = preparePolygon(entry, area);
    if (!rings.length) continue;
    const outer = rings[0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of outer) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const anchor = [(minX + maxX) / 2, (minY + maxY) / 2];
    usable.push({
      id: String(entry.id), rings, anchor, area: Math.abs(signedArea(outer)),
      height: entry.height, ...(entry.name ? { name: entry.name } : {}),
      ...(entry.minHeight > 0 ? { minHeight: entry.minHeight } : {})
    });
  }
  const buildings = pickBuildings(usable, limits);
  if (!buildings.length) throw new MapDataError('empty', 'No usable building footprints were found in this square. Move the pin or adjust the size.');
  const roads = [];
  const roadEntries = data.roads.slice().sort((a, b) => Number(majorRoad(b)) - Number(majorRoad(a)));
  for (const entry of roadEntries) {
    if (roads.length >= limits.roads) break;
    const line = entry.line.filter(finitePoint).map(area.project);
    const tileBounds = worldTileBounds(entry.tileBounds, area);
    const width = (majorRoad(entry) ? 10 : 5) * MAP_WIDTH / (area.km * 1000);
    for (let i = 1; i < line.length && roads.length < limits.roads; i++) {
      const segment = tileBounds ? clipSegment(line[i - 1], line[i], tileBounds) : [line[i - 1], line[i]];
      if (!segment) continue;
      const clipped = clipSegment(...segment, WORLD_BOUNDS);
      if (clipped && Math.hypot(clipped[0][0] - clipped[1][0], clipped[0][1] - clipped[1][1]) >= .007) {
        roads.push({ id: String(entry.id), line: clipped, width });
      }
    }
  }
  const water = [];
  let waterPoints = 0;
  for (const entry of data.water) {
    const rings = preparePolygon(entry, area);
    if (!rings.length) continue;
    const points = rings.reduce((sum, ring) => sum + ring.length, 0);
    if (waterPoints + points <= limits.waterPoints) {
      water.push({ id: String(entry.id), rings });
      waterPoints += points;
    }
  }
  const landmarks = [];
  const names = new Set();
  const candidates = data.landmarks.slice().sort((a, b) => Number(b.tower) - Number(a.tower) || (a.rank || 100) - (b.rank || 100));
  for (const entry of candidates) {
    if (landmarks.length >= limits.landmarks) break;
    if (!entry.name || !finitePoint(entry.coordinates) || names.has(entry.name)) continue;
    const point = area.project(entry.coordinates);
    if (point.some(coordinate => Math.abs(coordinate) > SCENE_HALF)) continue;
    landmarks.push({ id: String(entry.id), point, name: entry.name, ...(entry.tower ? { tower: true } : {}) });
    names.add(entry.name);
  }
  return { buildings, roads, water, landmarks, buildingCount: usable.length, source: data.source };
}

export async function loadPreset(city, signal, fetcher = fetch) {
  if (!Object.hasOwn(PRESETS, city)) throw new MapDataError('invalid', 'This featured neighborhood is unavailable.');
  const preset = PRESETS[city];
  const area = makeArea(preset, preset.km);
  const url = new URL('./map-data/' + preset.file, import.meta.url);
  const snapshot = await withDeadline(signal, 8000, async requestSignal =>
    readJSON(await fetcher(url, { signal: requestSignal }), 3_000_000));
  if (snapshot?.format !== 1 || snapshot.area?.latitude !== preset.latitude ||
      snapshot.area.longitude !== preset.longitude || snapshot.area.km !== preset.km ||
      !Array.isArray(snapshot.buildings) || !snapshot.buildings.length ||
      !Array.isArray(snapshot.roads) || !Array.isArray(snapshot.water) || !Array.isArray(snapshot.landmarks) ||
      snapshot.source?.license !== OSM_LICENSE || typeof snapshot.source.attribution !== 'string' || !snapshot.source.timestamp) {
    throw new MapDataError('invalid', 'This featured neighborhood data could not be verified.');
  }
  return { area, layout: snapshot };
}

function overpassQuery(area) {
  const clauses = area.queryBounds.map(bounds => {
    const box = '(' + bounds.map(n => n.toFixed(7)).join(',') + ')';
    return [
      'way["building"]', 'relation["building"]["type"="multipolygon"]',
      'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian|living_street)(_link)?$"]',
      'nwr["man_made"="tower"]["name"]', 'node["name"]["tourism"~"^(attraction|museum|viewpoint|artwork)$"]',
      'way["natural"="water"]'
    ].map(filter => filter + box + ';').join('');
  });
  return '[out:json][timeout:8];(' + clauses.join('') + ');out tags geom;';
}

export async function loadLiveArea(area, signal, {
  fetcher = fetch, onProgress = () => {}, vectorLoader
} = {}) {
  const [south, west, north, east] = area.bounds;
  const regional = south > 24 && north < 73 && west > -26 && east < 46
    ? 'https://ovp.dresel.systems/api/interpreter'
    : south > 10 && north < 75 && west > -170 && east < -45
      ? 'https://ovp.dresel.systems/api-na/interpreter' : null;
  const endpoints = regional ? [regional, OVERPASS[0]] : [OVERPASS[0], OVERPASS[1]];
  let bestError;
  const priorities = ['empty', 'large', 'timeout'];
  function remember(error) {
    signal?.throwIfAborted();
    if (!priorities.includes(error.code)) return;
    if (!bestError || priorities.indexOf(error.code) < priorities.indexOf(bestError.code)) bestError = error;
  }
  if (vectorLoader) {
    onProgress('Loading neighborhood map tiles…');
    try {
      return await withDeadline(signal, 7200, async requestSignal =>
        prepareArea(await vectorLoader(area, requestSignal, { fetcher }), area));
    } catch (error) {
      remember(error);
    }
  }
  const query = overpassQuery(area);
  for (const [index, endpoint] of endpoints.entries()) {
    signal?.throwIfAborted();
    onProgress('Requesting OpenStreetMap data (' + (index + 1) + '/' + endpoints.length + ')…');
    try {
      return await withDeadline(signal, 8000, async requestSignal => {
        const response = await fetcher(endpoint, {
          method: 'POST', body: new URLSearchParams({ data: query }), signal: requestSignal
        });
        return prepareArea(osmFeatures(await readJSON(response, 8_000_000), endpoint), area);
      });
    } catch (error) {
      remember(error);
    }
  }
  if (bestError) throw bestError;
  throw new MapDataError('unavailable', 'Map services did not return a usable neighborhood. Try again or choose a smaller area.');
}
