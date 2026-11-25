import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { setupStudio } from './city-studio.js';
import { setupDisplay } from './display.js';
import { setupHandControls } from './hand-control.js';
import { makeDayNight } from './sky.js';
import { createTourScenes, TOUR_STOPS } from './tour-scenes.js';
import { createTourClock } from './tour.js';

const stage = document.querySelector('#scene');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
camera.position.set(37, 37, 51);
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(0.8);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.minDistance = 12;
controls.maxDistance = 105;
controls.maxPolarAngle = Math.PI / 2.1;
controls.update();

const hemisphere = new THREE.HemisphereLight(0xf7fff5, 0x728e79, 2);
const sun = new THREE.DirectionalLight(0xfff7dd, 2.2);
sun.position.set(-8, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -33, right: 33, top: 33, bottom: -33, far: 85 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.00035;
scene.add(hemisphere, sun);

const neighborhoods = createTourScenes();
const procedural = neighborhoods.root;
const realRoot = new THREE.Group();
realRoot.visible = false;
scene.add(procedural, realRoot);
const dayNight = makeDayNight({ scene, hemisphere, sun, procedural, stage });

function resize() {
  const width = stage.clientWidth, height = stage.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  // Preserve both the skyline and the width of the board on portrait screens.
  const halfAngle = Math.max(Math.tan(THREE.MathUtils.degToRad(20)), Math.tan(THREE.MathUtils.degToRad(25)) / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfAngle));
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  dayNight.resize();
}
resize();
new ResizeObserver(resize).observe(stage);

// Keep one still frame of the outgoing neighborhood while the new one fades in.
const still = document.createElement('canvas');
still.className = 'transition-canvas';
still.setAttribute('aria-hidden', 'true');
stage.append(still);
const stillContext = still.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let dissolve;
function beginDissolve() {
  dissolve?.cancel();
  if (reducedMotion.matches || !stillContext) return;
  const view = renderer.domElement;
  still.width = view.width;
  still.height = view.height;
  stillContext.drawImage(view, 0, 0);
  dissolve = still.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 2200, easing: 'ease-in-out' });
}
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) dissolve?.cancel(); });

const target = {};
const sliders = {};
function setTarget(key, value) {
  target[key] = THREE.MathUtils.clamp(value, 0, 1);
  const percent = String(Math.round(target[key] * 100));
  const { input, output } = sliders[key];
  if (input.value !== percent) input.value = percent;
  if (output.textContent !== percent + '%') output.textContent = percent + '%';
}
for (const key of ['height', 'density', 'forest']) {
  const input = document.getElementById(key);
  sliders[key] = { input, output: document.getElementById(key + '-value') };
  const update = () => setTarget(key, Number(input.value) / 100);
  input.addEventListener('input', update);
  update();
}
const current = { ...target };

// Alternate imagined neighborhoods and actual map footprints. The saved map stops
// use the same geometry path as Explore and need no public map request to play.
const realStops = [
  { city: 'Tokyo', name: 'Tokyo · Shiba Park', description: 'Tokyo Tower rises above the tight street blocks around Shiba Park.' },
  { city: 'Shanghai', name: 'Shanghai · Lujiazui', description: 'Tall towers cluster along the curving streets of Lujiazui.' },
  { city: 'Singapore', name: 'Singapore · Marina Bay', description: 'Waterfront buildings trace the broad opening of Marina Bay.' }
];
const stops = TOUR_STOPS.flatMap((stop, index) => [{ ...stop, generated: index }, realStops[index]]);
let stopIndex = 0;
let manualMap = null;
let userPaused = false;
let panel = null;
let lastPanelActivity = 0;
const PANEL_IDLE_MS = 120_000;
let pendingTourMap = null;
let closingAfterSelection = false;

const display = setupDisplay({ onPanelChange, onTourToggle });
const studio = setupStudio({
  scene, renderer, camera, controls, procedural, realRoot,
  ground: neighborhoods.ground, roadMat: neighborhoods.roadMat,
  target, current, dayNight, onSceneChange
});
const tour = createTourClock(advance);
function renderLabel() {
  const stop = manualMap || stops[stopIndex];
  display.setTour({ name: stop.name, description: stop.description, running: !userPaused && !panel, kind: manualMap ? 'map' : 'tour' });
}
function cancelTourRequest() {
  if (pendingTourMap !== null) {
    pendingTourMap = null;
    studio.cancelMapLoad();
  }
}
function hold(reason, active) {
  if (active) cancelTourRequest();
  tour.hold(reason, active);
}
function showGenerated(index) {
  beginDissolve();
  stopIndex = index;
  neighborhoods.select(stops[index].generated);
  if (studio.isReal()) studio.showGenerated({ source: 'tour' });
  renderLabel();
}
async function advance() {
  if (manualMap) {
    const matching = stops.findIndex(stop => stop.city && stop.city === manualMap.city);
    const previous = matching >= 0 ? matching : stopIndex;
    const next = stops[previous].city ? (previous + 1) % stops.length : previous;
    manualMap = null;
    showGenerated(next);
    return;
  }
  const index = (stopIndex + 1) % stops.length;
  const next = stops[index];
  if (!next.city) { showGenerated(index); return; }

  const request = {};
  pendingTourMap = request;
  let shown = false;
  try {
    shown = await studio.showTourMap(next.city, { beforeCommit: beginDissolve });
  } catch (error) {
    console.error('Could not display the saved city.', error);
  }
  if (pendingTourMap !== request) return;
  pendingTourMap = null;
  if (shown) {
    stopIndex = index;
    renderLabel();
  } else {
    // A missing sample must not leave an unattended exhibit stuck on a loader.
    showGenerated((index + 1) % stops.length);
  }
}
function onPanelChange(nextPanel) {
  const leftMapTools = panel === 'map' && nextPanel !== 'map';
  panel = nextPanel;
  lastPanelActivity = performance.now();
  hold('panel', Boolean(panel));
  if (leftMapTools && !closingAfterSelection) studio.cancelMapLoad();
  if (panel === 'map') requestAnimationFrame(() => studio.refreshMap());
  renderLabel();
}
function closeAfterSelection() {
  closingAfterSelection = true;
  try { display.closePanels(); } finally { closingAfterSelection = false; }
}
function onSceneChange(change) {
  if (change.source === 'tour') return;
  if (change.kind === 'map') {
    const city = change.place?.name || change.name;
    manualMap = {
      city,
      name: change.name || city || 'Selected neighborhood',
      description: 'Buildings and streets from your ' + change.km + ' km OpenStreetMap selection.'
    };
  } else {
    manualMap = null;
    const index = stops[stopIndex].city ? (stopIndex + 1) % stops.length : stopIndex;
    stopIndex = index;
    neighborhoods.select(stops[index].generated);
    userPaused = false;
    tour.hold('pause', false);
  }
  closeAfterSelection();
  renderLabel();
}
function onTourToggle() {
  userPaused = panel ? false : !userPaused;
  hold('pause', userPaused);
  display.closePanels();
  renderLabel();
}
renderLabel();

// A visitor can walk away with a drawer open. Return to the exhibit once it is idle.
function notePanelActivity() { if (panel) lastPanelActivity = performance.now(); }
for (const event of ['pointerdown', 'keydown', 'input', 'scroll']) {
  document.addEventListener(event, notePanelActivity, { capture: true, passive: true });
}
controls.addEventListener('start', () => hold('orbit', true));
controls.addEventListener('end', () => hold('orbit', false));
const onVisibility = () => { notePanelActivity(); hold('hidden', document.hidden); };
document.addEventListener('visibilitychange', onVisibility);
onVisibility();

let lastHands = null;
const trackHands = setupHandControls({
  camera, controls, target,
  setTarget(key, value) { if (!sliders[key].input.disabled) setTarget(key, value); },
  onHands(now) {
    if (lastHands === null) hold('hands', true);
    lastHands = now;
    if (panel === 'hands') lastPanelActivity = now;
  }
});
let previousFrame = null;
function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) { previousFrame = null; return; }
  const dt = previousFrame === null ? 0 : Math.min((now - previousFrame) / 1000, 0.1);
  previousFrame = now;
  trackHands(now);
  if (panel && !userPaused && now - lastPanelActivity > PANEL_IDLE_MS) display.closePanels();
  if (lastHands !== null && now - lastHands > 3000) {
    lastHands = null;
    hold('hands', false);
  }
  for (const key of Object.keys(target)) current[key] = THREE.MathUtils.damp(current[key], target[key], 2.2, dt);
  if (procedural.visible) neighborhoods.update(current, dt);
  studio.update();
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
