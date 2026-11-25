import * as THREE from 'three';
import { BASE_WIDTH, MAP_WIDTH } from './map-data.mjs';

const GRID = 24;
const TILE = 256;

function pixelAt(latitude, longitude, size) {
  const rad = Math.max(-85.05, Math.min(85.05, latitude)) * Math.PI / 180;
  const x = ((longitude + 180) / 360 * size % size + size) % size;
  const y = (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * size;
  return [x, y];
}

export async function getElevation(area, signal) {
  const [south, west, north, east] = area.bounds;
  const { latitude, longitude } = area.place;
  const zoom = Math.min(13, Math.floor(Math.log2(3 * 40075 * Math.cos(latitude * Math.PI / 180) / area.km)));
  const size = 2 ** zoom * TILE;
  const margin = BASE_WIDTH / MAP_WIDTH;
  const halfLat = (north - south) / 2 * margin;
  const halfLon = (east - west) / 2 * margin;
  const samples = [], tileKeys = new Set();
  for (let y = 0; y <= GRID; y++) {
    for (let x = 0; x <= GRID; x++) {
      const lat = latitude + halfLat * (1 - 2 * y / GRID);
      const lon = longitude + halfLon * (2 * x / GRID - 1);
      const [px, py] = pixelAt(lat, lon, size);
      const key = Math.floor(px / TILE) + '/' + Math.floor(py / TILE);
      tileKeys.add(key);
      samples.push({ key, x: Math.floor(px % TILE), y: Math.floor(py % TILE) });
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tiles = new Map();
  await Promise.all([...tileKeys].map(async key => {
    const response = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + zoom + '/' + key + '.png', { signal });
    if (!response.ok) throw new Error('Terrain tile ' + response.status);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      signal.throwIfAborted();
      ctx.drawImage(bitmap, 0, 0);
      tiles.set(key, ctx.getImageData(0, 0, TILE, TILE).data);
    } finally {
      bitmap.close();
    }
  }));

  const elevations = samples.map(point => {
    const data = tiles.get(point.key), index = (point.y * TILE + point.x) * 4;
    return data[index] * 256 + data[index + 1] + data[index + 2] / 256 - 32768;
  });
  const min = Math.min(...elevations), max = Math.max(...elevations);
  const heights = elevations.map(height => (height - min) * MAP_WIDTH / (area.km * 1000));
  function sample(x, z) {
    const gx = THREE.MathUtils.clamp((x / BASE_WIDTH + .5) * GRID, 0, GRID);
    const gy = THREE.MathUtils.clamp((z / BASE_WIDTH + .5) * GRID, 0, GRID);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(GRID, x0 + 1), y1 = Math.min(GRID, y0 + 1);
    const at = (a, b) => heights[b * (GRID + 1) + a];
    const low = THREE.MathUtils.lerp(at(x0, y0), at(x1, y0), gx - x0);
    const high = THREE.MathUtils.lerp(at(x0, y1), at(x1, y1), gx - x0);
    return THREE.MathUtils.lerp(low, high, gy - y0);
  }
  return { heights, sample, min, max };
}

export function terrainMesh(data, color) {
  const vertices = [], indices = [], N = GRID + 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) vertices.push((x / GRID - .5) * BASE_WIDTH, data.heights[y * N + x], (y / GRID - .5) * BASE_WIDTH);
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const a = y * N + x, b = a + 1, c = a + N, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const border = [];
  for (let x = 0; x < N; x++) border.push(x);
  for (let y = 1; y < N; y++) border.push(y * N + GRID);
  for (let x = GRID - 1; x >= 0; x--) border.push(GRID * N + x);
  for (let y = GRID - 1; y > 0; y--) border.push(y * N);
  for (const i of border) vertices.push(vertices[i * 3], -.6, vertices[i * 3 + 2]);
  const offset = N * N;
  for (let i = 0; i < border.length; i++) {
    const j = (i + 1) % border.length;
    indices.push(border[i], border[j], offset + i, border[j], offset + j, offset + i);
  }
  const center = vertices.length / 3;
  vertices.push(0, -.6, 0);
  for (let i = 0; i < border.length; i++) indices.push(center, offset + i, offset + (i + 1) % border.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  mesh.userData.colorRole = 'ground';
  mesh.receiveShadow = true;
  return mesh;
}
