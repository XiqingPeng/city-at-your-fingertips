import { writeFile } from 'node:fs/promises';
import { makeArea, prepareArea, PRESETS, PRESET_LIMITS, TOWER_NAMES, withDeadline } from '../map-data.mjs';
import { makeDecoder, vectorFeatures } from '../map-tiles.mjs';

function addOrientalPearlTower(layout) {
  // OpenMapTiles encodes the tower's top antenna from OSM way 524270641.
  const antenna = layout.buildings.find(building => building.id.endsWith('/building/5242706412'));
  if (!antenna) return;
  const landmarks = layout.landmarks.filter(({ name }) =>
    !(TOWER_NAMES.test(name) && /oriental pearl|[东東]方明珠/i.test(name))
  );
  const tower = { id: antenna.id, point: antenna.anchor, name: 'Oriental Pearl Tower', tower: true };
  layout.landmarks = [tower, ...landmarks].slice(0, PRESET_LIMITS.landmarks);
}

const args = process.argv.slice(2);
const template = args[0]?.startsWith('https://') ? args.shift() : undefined;
const cities = args.length ? [...new Set(args)] : Object.keys(PRESETS);
for (const city of cities) {
  if (!Object.hasOwn(PRESETS, city)) throw new Error('Unknown preset city: ' + city);
}
const decoder = await makeDecoder();
const files = [];

for (const city of cities) {
  const preset = PRESETS[city];
  const area = makeArea(preset, preset.km);
  const data = await withDeadline(undefined, 30000, signal => vectorFeatures(area, signal, {
    decoder, template, userAgent: 'PixelCityStudio/1.0 (github.com/XiqingPeng/city-at-your-fingertips)'
  }));
  if (!data.source.timestamp) throw new Error('Use a dated tile release to create traceable preset data.');
  const layout = prepareArea(data, area, PRESET_LIMITS);
  if (city === 'Shanghai') addOrientalPearlTower(layout);
  const snapshot = {
    format: 1,
    area: { latitude: preset.latitude, longitude: preset.longitude, km: preset.km },
    ...layout,
    source: { ...layout.source, retrievedAt: new Date().toISOString() }
  };
  const json = JSON.stringify(snapshot, (key, value) => {
    // Coordinate array entries may be quantized without rounding the declared center.
    return /^\d+$/.test(key) && typeof value === 'number' ? Number(value.toFixed(4)) : value;
  });
  files.push([new URL('./' + preset.file, import.meta.url), json + '\n']);
  console.log(preset.name, 'tiles', data.source.urls.length, 'footprints', layout.buildings.length, '/', layout.buildingCount,
    'road segments', layout.roads.length, 'water polygons', layout.water.length, 'landmarks', layout.landmarks.length);
}
for (const [file, contents] of files) await writeFile(file, contents);
