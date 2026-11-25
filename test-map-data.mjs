import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MAP_WIDTH, OSM_LICENSE, PRESETS, PRESET_LIMITS, MapDataError, clipSegment, loadLiveArea, loadPreset, makeArea,
  osmFeatures, prepareArea, withDeadline
} from './map-data.mjs';
import { tilesForArea, vectorFeatures } from './map-tiles.mjs';

const half = MAP_WIDTH / 2;
const area = makeArea({ name: 'Test square', latitude: 0, longitude: 0 }, 2);
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const rawRing = (min, max) => [
  { lon: min, lat: min }, { lon: max, lat: min }, { lon: max, lat: max }, { lon: min, lat: max }, { lon: min, lat: min }
];
const footprint = {
  type: 'way', id: 123, tags: { building: 'yes', height: '30 ft', name: 'Observed building' }, geometry: rawRing(-.002, .002)
};
const creek = { type: 'way', id: 222, tags: { natural: 'water' }, geometry: rawRing(-.006, -.004) };
const road = {
  type: 'way', id: 555, tags: { highway: 'primary' }, geometry: [{ lon: -.02, lat: 0 }, { lon: .02, lat: 0 }]
};

function approximate(number, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(number - expected) <= tolerance, number + ' differs from ' + expected);
}

function verifyPoint(point) {
  for (const coordinate of point) assert.ok(Number.isFinite(coordinate) && Math.abs(coordinate) <= half);
}

test('the area center, crop edges and physical scale follow the selected coordinates', () => {
  for (const km of [.5, 1, 2, 4]) {
    const region = makeArea({ latitude: 58.032, longitude: 17.238 }, km);
    const [south, west, north, east] = region.bounds;
    assert.deepEqual(region.project([17.238, 58.032]), [0, 0]);
    const [x, y] = region.project([west, north]);
    approximate(x, -half);
    approximate(y, half);
    approximate((north - south) * 111.32, km);
    approximate((east - west) * 111.32 * Math.cos(58.032 * Math.PI / 180), km);
  }
  assert.throws(() => makeArea({ latitude: NaN, longitude: 5 }, 2), { code: 'coordinates' });
  assert.throws(() => makeArea({ latitude: 20, longitude: 181 }, 2), { code: 'coordinates' });
  assert.throws(() => makeArea({ latitude: 20, longitude: 0 }, 8), { code: 'coordinates' });
});

test('the date-line crop uses both valid query ranges and adjacent Mercator tiles', () => {
  const region = makeArea({ latitude: -.001, longitude: 179.998 }, 2);
  assert.equal(region.queryBounds.length, 2);
  assert.equal(region.queryBounds[0][3], 180);
  assert.equal(region.queryBounds[1][1], -180);
  assert.ok(region.project([-179.999, -.001])[0] < half);
  assert.ok(region.project([-179.999, -.001])[0] > 0);
  const x = new Set(tilesForArea(region).map(tile => tile.x));
  assert.ok(x.has(0) && x.has(16383));
  const polar = makeArea({ latitude: 85, longitude: 0 }, 4);
  assert.throws(() => tilesForArea(polar), { code: 'large' });
});

test('clip keeps roads crossing the square with both endpoints outside', () => {
  assert.deepEqual(clipSegment([-30, 0], [30, 0], [-20, -20, 20, 20]), [[-20, 0], [20, 0]]);
  assert.equal(clipSegment([-30, 25], [30, 25], [-20, -20, 20, 20]), null);
  const data = osmFeatures({ elements: [footprint, creek, road] }, 'example');
  const layout = prepareArea(data, area);
  assert.equal(layout.buildingCount, 1);
  approximate(layout.buildings[0].height, 9.144);
  assert.equal(layout.water.length, 1);
  const [start, end] = layout.roads[0].line;
  approximate(start[0], -20);
  approximate(end[0], 20);
  assert.equal(start[1], 0);
  assert.equal(end[1], 0);
});

test('tile buffers are cropped to the tile core and the project square', () => {
  const rings = [[[-.003, -.002], [.003, -.002], [.003, .002], [-.003, .002], [-.003, -.002]]];
  const data = {
    buildings: [{ id: '1', rings, tileBounds: [-.01, -.01, 0, .01], height: 8 }],
    roads: [{ id: '2', line: [[-.005, .001], [.006, .001]], tileBounds: [-.01, -.01, 0, .01] }],
    water: [], landmarks: [], source: { kind: 'vector' }
  };
  const layout = prepareArea(data, area);
  assert.ok(layout.buildings[0].rings[0].every(point => point[0] <= 0));
  assert.equal(layout.roads[0].line[1][0], 0);
  const shifted = makeArea({ latitude: 34, longitude: -118 }, 2);
  assert.throws(() => prepareArea(data, shifted), { code: 'empty' });
});

test('OSM multipolygon rings preserve enclosed courtyards and avoid the duplicate outer way', () => {
  const outer = rawRing(-.003, .003);
  const inner = rawRing(-.001, .001);
  const elements = [
    { ...footprint, geometry: outer },
    { type: 'relation', id: 900, tags: { building: 'yes' }, members: [
      { ref: 123, role: 'outer', geometry: outer.slice(0, 3) },
      { ref: 124, role: 'outer', geometry: outer.slice(2).reverse() },
      { ref: 199, role: 'inner', geometry: inner }
    ]}
  ];
  const layout = prepareArea(osmFeatures({ elements }, 'example'), area);
  assert.equal(layout.buildingCount, 1);
  assert.equal(layout.buildings[0].rings.length, 2);
  assert.equal(layout.buildings[0].id, 'relation/900');
  assert.throws(() => osmFeatures({ remark: 'runtime error', elements: [footprint] }, 'example'), { code: 'invalid' });
});

test('a valid vector response succeeds without making Overpass requests', async () => {
  const vectorData = osmFeatures({ elements: [footprint, road] }, 'example');
  const layout = await loadLiveArea(area, new AbortController().signal, {
    vectorLoader: async requested => {
      assert.equal(requested.key, area.key);
      return vectorData;
    },
    fetcher: () => assert.fail('Overpass contacted despite usable vector data')
  });
  assert.equal(layout.buildings.length, 1);
});

test('unusable results retry the next source instead of committing empty or partial data', async () => {
  const attempted = [];
  const layout = await loadLiveArea(area, new AbortController().signal, {
    vectorLoader: async () => { throw new Error('tile service offline'); },
    fetcher: async (url, request) => {
      assert.equal(request.method, 'POST');
      assert.ok(request.body.get('data').includes(area.bounds.map(n => n.toFixed(7)).join(',')));
      attempted.push(url);
      return attempted.length === 1 ? json({ elements: [footprint], remark: 'query timed out' }) : json({ elements: [footprint, road] });
    }
  });
  assert.equal(attempted.length, 2);
  assert.equal(layout.source.endpoint, attempted[1]);
  assert.equal(layout.buildings.length, 1);
});

test('honest empty areas and service errors produce different errors', async () => {
  await assert.rejects(loadLiveArea(area, undefined, { fetcher: async () => json({ elements: [] }) }), { code: 'empty' });
  await assert.rejects(loadLiveArea(area, undefined, { fetcher: async () => new Response(null, { status: 504 }) }), { code: 'unavailable' });
  await assert.rejects(loadLiveArea(area, undefined, { fetcher: async () => new Response('html') }), { code: 'unavailable' });
});

test('deadlines reject stalled reads and signal cancellation even when a supplier ignores abort', async () => {
  let release, downstream;
  const pending = withDeadline(undefined, 5, signal => {
    downstream = signal;
    return new Promise(resolve => { release = resolve; });
  });
  await assert.rejects(pending, { code: 'timeout' });
  assert.equal(downstream.aborted, true);
  release('late result');
});

test('manual cancellation ignores a late response and never starts a fallback endpoint', async () => {
  const abort = new AbortController();
  let start, complete;
  const started = new Promise(resolve => { start = resolve; });
  let requests = 0;
  const pending = loadLiveArea(area, abort.signal, {
    fetcher: () => {
      requests++;
      start();
      return new Promise(resolve => { complete = resolve; });
    }
  });
  await started;
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  complete(json({ elements: [footprint] }));
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(requests, 1);
});

test('vector catalog accepts a new official release path and rejects unfamiliar hosts', async () => {
  const origin = 'https://tiles.openfreemap.org/';
  const template = origin + 'current/{z}/{x}/{y}.pbf';
  const requested = [];
  const data = await vectorFeatures(area, new AbortController().signal, {
    template,
    fetcher: async url => {
      requested.push(url);
      return new Response(new Uint8Array([0]));
    },
    decoder: () => ({ layers: {} })
  });
  assert.equal(requested.length, tilesForArea(area).length);
  assert.ok(requested.every(url => url.startsWith(origin + 'current/14/')));
  assert.equal(data.source.timestamp, undefined);
  await assert.rejects(vectorFeatures(area, undefined, {
    template: 'https://example.org/{z}/{x}/{y}.pbf',
    fetcher: () => assert.fail('Unexpected tile host contacted'),
    decoder: () => ({ layers: {} })
  }), { code: 'invalid' });
});

test('the six city choices load licensed local extracts for distinct neighborhoods', async () => {
  const expected = {
    Tokyo: { neighborhood: 'Shiba Park', landmark: /Tokyo Tower|東京タワー/ },
    Shanghai: { neighborhood: 'Lujiazui', landmark: /东方明珠|Oriental Pearl|Shanghai Tower/ },
    Singapore: { neighborhood: 'Marina Bay', landmark: /Marina Bay Sands|Merlion/ },
    Paris: { neighborhood: 'Eiffel Tower', landmark: /^(Eiffel Tower|Tour Eiffel)$/i },
    'New York': { neighborhood: 'Flatiron District', landmark: /^Flatiron Building$/ },
    Venice: { neighborhood: 'Rialto Bridge', landmark: /^Bridge of Sighs$/ }
  };
  assert.deepEqual(new Set(Object.keys(PRESETS)), new Set(Object.keys(expected)));
  const areas = new Set(), footprints = new Set();
  for (const [city, { neighborhood, landmark }] of Object.entries(expected)) {
    const { area: region, layout } = await loadPreset(city, undefined, async url => {
      assert.equal(url.href, new URL('./map-data/' + PRESETS[city].file, import.meta.url).href);
      return new Response(await readFile(url));
    });
    assert.equal(region.place.name, city);
    assert.equal(region.place.neighborhood, neighborhood);
    assert.equal(region.km, 2);
    assert.equal(layout.source.license, OSM_LICENSE);
    assert.match(layout.source.attribution, /OpenFreeMap.*OpenMapTiles.*OpenStreetMap/);
    assert.ok(layout.source.urls.length > 0 && layout.source.urls.every(url => url.startsWith('https://tiles.openfreemap.org/')));
    assert.ok(layout.buildings.length > 500 && layout.buildings.length <= PRESET_LIMITS.buildings, city + ' has usable footprints');
    assert.ok(layout.roads.length > 1000 && layout.roads.length <= PRESET_LIMITS.roads, city + ' has usable streets');
    if (city !== 'New York') assert.ok(layout.water.length > 0, city + ' includes mapped water');
    assert.ok(layout.landmarks.some(entry => landmark.test(entry.name)), city + ' includes its expected landmark');
    for (const feature of [...layout.buildings, ...layout.water]) for (const ring of feature.rings) ring.forEach(verifyPoint);
    for (const entry of layout.roads) entry.line.forEach(verifyPoint);
    areas.add(region.key);
    footprints.add(JSON.stringify(layout.buildings.slice(0, 10).map(building => building.rings)));
  }
  assert.equal(areas.size, Object.keys(expected).length);
  assert.equal(footprints.size, Object.keys(expected).length);
});

test('Shanghai places the Oriental Pearl Tower at its footprint', async () => {
  const { layout } = await loadPreset('Shanghai', undefined, async url => new Response(await readFile(url)));
  const towers = layout.landmarks.filter(entry => /^(Oriental Pearl Tower|东方明珠(?:广播电视塔)?)$/i.test(entry.name));
  assert.equal(towers.length, 1);
  const [tower] = towers;
  assert.equal(tower.name, 'Oriental Pearl Tower');
  assert.equal(tower.tower, true);
  assert.match(tower.id, /\/building\/5242706412$/);
  const footprint = layout.buildings.find(entry => entry.id === tower.id);
  assert.equal(footprint?.height, 468);
  assert.deepEqual(tower.point, footprint.anchor);
});

test('a preset for another square is rejected before scene construction', async () => {
  await assert.rejects(loadPreset('Tokyo', undefined, async () => new Response(
    await readFile(new URL('./map-data/shanghai.json', import.meta.url))
  )), error => error instanceof MapDataError && error.code === 'invalid');
});
