import { writeFile } from 'node:fs/promises';
import { makeArea, prepareArea, PRESETS, PRESET_LIMITS, withDeadline } from '../map-data.mjs';
import { makeDecoder, vectorFeatures } from '../map-tiles.mjs';

const [template] = process.argv.slice(2);
const decoder = await makeDecoder();
const files = [];

for (const preset of Object.values(PRESETS)) {
  const area = makeArea(preset, preset.km);
  const data = await withDeadline(undefined, 30000, signal => vectorFeatures(area, signal, {
    decoder, template, userAgent: 'PixelCityStudio/1.0 (github.com/XiqingPeng/city-at-your-fingertips)'
  }));
  if (!data.source.timestamp) throw new Error('Use a dated tile release to create traceable preset data.');
  const layout = prepareArea(data, area, PRESET_LIMITS);
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
