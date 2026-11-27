const { before, after, beforeEach, afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const site = new URL(process.env.PIXEL_CITY_URL || 'http://localhost:8000/');
const places = [
  { city: 'Tokyo', neighborhood: 'Shiba Park', file: 'tokyo.json' },
  { city: 'Shanghai', neighborhood: 'Lujiazui', file: 'shanghai.json' },
  { city: 'Singapore', neighborhood: 'Marina Bay', file: 'singapore.json' },
  { city: 'Paris', neighborhood: 'Eiffel Tower', file: 'paris.json' },
  { city: 'New York', neighborhood: 'Flatiron District', file: 'new-york.json' },
  { city: 'Venice', neighborhood: 'Rialto Bridge', file: 'venice.json' }
];
let browser, page, outsideRequests, errors;

before(async () => {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); });

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 720, height: 500 } });
  outsideRequests = [];
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== site.origin) outsideRequests.push(request.url());
  });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === site.origin) return route.continue();
    return route.abort('internetdisconnected');
  });
});
afterEach(async () => {
  await page?.close();
  assert.deepEqual(errors, []);
});

async function openExhibit() {
  await page.goto(site.href);
  await page.locator('.transition-canvas').waitFor({ state: 'attached' });
}

async function openMap() {
  await page.getByRole('button', { name: 'Explore map', exact: true }).click();
  return page.getByRole('complementary', { name: 'Explore map' });
}

async function checkSavedNeighborhood({ city, neighborhood }) {
  await page.locator('#map-panel').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: city + ' · ' + neighborhood, exact: true }).waitFor();
  assert.ok(await page.locator('#scene-attribution').isVisible());
}

async function checkMapStatusCleared(panel) {
  assert.ok(await panel.isVisible());
  assert.equal(await panel.locator('#map-status').textContent(), '');
  assert.equal(await panel.locator('.panel-status').boundingBox(), null);
}

test('all six places can be picked without search or any external request', async () => {
  await openExhibit();
  await page.getByRole('button', { name: 'Pause tour' }).click();
  const panel = await openMap();
  const options = panel.getByRole('group', { name: 'Pick a city' });
  const cityButton = city => options.getByRole('button', { name: city, exact: true });
  assert.equal(await panel.getByRole('searchbox', { includeHidden: true }).count(), 0);
  assert.equal(await panel.getByRole('button', { name: 'Search', exact: true, includeHidden: true }).count(), 0);
  assert.equal(await options.getByRole('button').count(), places.length);
  assert.ok(await panel.getByText('Adjust map area', { exact: true }).isVisible());
  assert.ok(await panel.getByRole('button', { name: 'Load selected area', includeHidden: true }).isHidden());

  for (const { city, neighborhood } of places) {
    const button = cityButton(city);
    assert.ok(await button.getByText(neighborhood, { exact: true }).isVisible());
    await page.keyboard.press('Tab');
    assert.ok(await button.evaluate(element => document.activeElement === element), city + ' receives keyboard focus');
  }

  const keyboardChoice = places.at(-1);
  for (const place of [keyboardChoice, ...places.slice(0, -1)]) {
    const byKeyboard = place === keyboardChoice;
    const url = new URL('map-data/' + place.file, site);
    const [response] = await Promise.all([
      page.waitForResponse(reply => reply.url() === url.href),
      byKeyboard ? page.keyboard.press('Enter') : cityButton(place.city).click()
    ]);
    assert.ok(response.ok(), place.city + ' has a local map extract');
    await checkSavedNeighborhood(place);
    await openMap();
    await checkMapStatusCleared(panel);
  }
  assert.deepEqual(outsideRequests, []);
});

test('the one-click 8 km Shanghai overview works with external services blocked', async () => {
  const overview = { city: 'Shanghai', neighborhood: 'Huangpu River' };
  await openExhibit();
  await page.getByRole('button', { name: 'Pause tour' }).click();
  const panel = await openMap();
  const snapshot = new URL('map-data/shanghai-8km.json', site);
  const [response] = await Promise.all([
    page.waitForResponse(reply => reply.url() === snapshot.href),
    panel.getByRole('button', { name: 'Shanghai · 8 × 8 km', exact: true }).click()
  ]);
  assert.ok(response.ok());
  await checkSavedNeighborhood(overview);
  assert.match(await page.locator('#scene-description').innerText(), /8 × 8 km OpenStreetMap/);
  assert.deepEqual(outsideRequests, []);

  await openMap();
  await panel.getByText('Adjust map area', { exact: true }).click();
  assert.equal(await panel.getByRole('combobox', { name: 'Area size' }).inputValue(), '8');
  await panel.getByRole('button', { name: 'Load selected area' }).click();
  await checkSavedNeighborhood(overview);
  assert.ok(outsideRequests.every(url => !url.includes('openfreemap.org') && !url.includes('interpreter')));
});

test('bundled map footprints receive color roofs at both map widths', async () => {
  await openExhibit();
  const maps = await page.evaluate(async () => {
    const { loadPreset, OVERVIEW_KEY } = await import('./map-data.mjs');
    const { createMapModel, disposeMapModel } = await import('./map-scene.js');
    const palette = {
      building: ['#efdbb8'], roof: ['#cd7455'], ground: '#96a181', road: '#ead1aa', water: '#34879d'
    };
    const result = [];
    for (const city of ['Tokyo', OVERVIEW_KEY]) {
      const signal = new AbortController().signal;
      const { layout, area } = await loadPreset(city, signal);
      const model = await createMapModel(layout, area, palette, signal);
      const roofs = model.batches.filter(batch => batch.role === 'roof');
      result.push({
        km: area.km,
        buildingCount: model.buildingCount,
        expectedBuildings: layout.buildings.length,
        roofVertices: roofs.reduce((sum, { mesh }) => sum + mesh.geometry.attributes.position.count, 0)
      });
      disposeMapModel(model.root);
    }
    return result;
  });
  assert.deepEqual(maps.map(map => map.km), [2, 8]);
  for (const map of maps) {
    assert.equal(map.buildingCount, map.expectedBuildings);
    assert.ok(map.roofVertices > 0, map.km + ' km sample has colored roofs');
  }
});

test('the area editor reloads each exact saved square with external services blocked', async () => {
  await openExhibit();
  await page.getByRole('button', { name: 'Pause tour' }).click();
  for (const place of places) {
    const panel = await openMap();
    await panel.getByRole('button', { name: place.city, exact: true }).click();
    await checkSavedNeighborhood(place);

    await openMap();
    const load = panel.getByRole('button', { name: 'Load selected area', includeHidden: true });
    assert.ok(await load.isHidden());
    await panel.getByText('Adjust map area', { exact: true }).click();
    await load.click();
    await checkSavedNeighborhood(place);
    await openMap();
    await checkMapStatusCleared(panel);
    await page.keyboard.press('Escape');
  }
});

test('manual coordinates and size reach the custom area loader', async () => {
  const latitude = 35.66, longitude = 139.75;
  const offset = .001;
  const geometry = [
    [latitude - offset, longitude - offset], [latitude - offset, longitude + offset],
    [latitude + offset, longitude + offset], [latitude + offset, longitude - offset],
    [latitude - offset, longitude - offset]
  ].map(([lat, lon]) => ({ lat, lon }));
  let query, release;
  const allowResponse = new Promise(resolve => { release = resolve; });
  await page.route('**/api/interpreter', async route => {
    query = new URLSearchParams(route.request().postData()).get('data');
    await allowResponse;
    return route.fulfill({ json: { elements: [{ type: 'way', id: 1, tags: { building: 'yes' }, geometry }] } });
  });
  await openExhibit();
  await page.getByRole('button', { name: 'Pause tour' }).click();
  const panel = await openMap();
  await panel.getByText('Adjust map area', { exact: true }).click();
  await panel.getByRole('spinbutton', { name: 'Latitude' }).fill(String(latitude));
  await panel.getByRole('spinbutton', { name: 'Longitude' }).fill(String(longitude));
  await panel.getByRole('combobox', { name: 'Area size' }).selectOption('1');
  await panel.getByRole('button', { name: 'Load selected area' }).click();
  try {
    await panel.getByRole('progressbar', { name: 'Loading map data' }).waitFor();
  } finally {
    release();
  }
  await page.getByRole('heading', { name: '35.6600, 139.7500', exact: true }).waitFor();
  assert.match(await page.locator('#scene-description').innerText(), /from your 1 × 1 km OpenStreetMap selection/);
  const latRadius = .5 / 111.32;
  const lonRadius = latRadius / Math.cos(latitude * Math.PI / 180);
  const bounds = [latitude - latRadius, longitude - lonRadius, latitude + latRadius, longitude + lonRadius];
  assert.ok(query?.includes('(' + bounds.map(value => value.toFixed(7)).join(',') + ')'), 'The request uses the entered 1 km square');
  await openMap();
  await checkMapStatusCleared(panel);
});

test('canceling while permission is pending releases a late camera stream', async () => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.grantTestCamera = () => {
        const stream = document.createElement('canvas').captureStream(1);
        window.testCameraTrack = stream.getVideoTracks()[0];
        resolve(stream);
      };
    });
  });
  await openExhibit();
  await page.getByRole('button', { name: 'Hand controls' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.getByRole('button', { name: 'Cancel start' }).click();
  await page.evaluate(() => window.grantTestCamera());
  await page.waitForFunction(() => window.testCameraTrack.readyState === 'ended');
  assert.equal(await page.locator('#video').evaluate(video => video.srcObject), null);
  assert.ok(await page.getByRole('button', { name: 'Start camera' }).isEnabled());
  assert.deepEqual(outsideRequests, []);
});

async function mockHandRecognizer() {
  await page.addInitScript(() => {
    const openPalm = [
      [0, .10], [-.04, .07], [-.06, .05], [-.08, .03], [-.10, .01],
      [-.05, 0], [-.052, -.04], [-.053, -.07], [-.055, -.10],
      [0, 0], [0, -.052], [0, -.082], [0, -.116],
      [.038, .004], [.041, -.038], [.044, -.066], [.045, -.090],
      [.071, .013], [.081, -.021], [.085, -.043], [.089, -.066]
    ];
    const fist = [
      [0, .10], [-.04, .07], [-.06, .04], [-.047, .013], [-.026, .021],
      [-.05, 0], [-.052, -.030], [-.053, -.008], [-.055, .024],
      [0, 0], [0, -.034], [0, -.008], [0, .026],
      [.038, .004], [.041, -.025], [.044, -.002], [.045, .031],
      [.071, .013], [.073, -.012], [.075, .007], [.078, .040]
    ];
    const readHeight = () => Number(document.querySelector('#height').value);
    const testInput = {
      track: null,
      motion: null,
      heights: [],
      result: { landmarks: [], gestures: [], handedness: [] },
      read(time) {
        const motion = testInput.motion;
        if (!motion) return testInput.result;
        testInput.heights.push(readHeight());
        motion.started ??= time;
        const amount = Math.min(1, (time - motion.started) / motion.duration);
        const y = motion.from + (motion.to - motion.from) * amount;
        const x = motion.xFrom + (motion.xTo - motion.xFrom) * amount;
        const spread = motion.spreadFrom + (motion.spreadTo - motion.spreadFrom) * amount;
        const centers = motion.count === 2 ? [x - spread / 2, x + spread / 2] : motion.count ? [x] : [];
        const pose = motion.gesture === 'Closed_Fist' ? fist : openPalm;
        const offsets = pose.map(([dx, dy]) =>
          motion.sideways ? { x: -dy, y: dx * .6, z: dx * .8 } : { x: dx, y: dy, z: 0 });
        testInput.result = {
          landmarks: centers.map(x => offsets.map(offset => ({ x: x + offset.x, y: y + offset.y, z: offset.z }))),
          worldLandmarks: centers.map(() => offsets),
          gestures: centers.map(() => [{ categoryName: motion.gesture, score: .99 }]),
          handedness: centers.map((_, index) => [{ categoryName: index ? 'Left' : 'Right', score: .99 }])
        };
        if (amount === 1) testInput.motion = null;
        return testInput.result;
      }
    };
    window.handTrackingTest = testInput;
    navigator.mediaDevices.getUserMedia = async () => {
      const source = document.createElement('canvas');
      source.width = 320;
      source.height = 240;
      const ctx = source.getContext('2d');
      const stream = source.captureStream(30);
      testInput.track = stream.getVideoTracks()[0];
      let frame = 0;
      const ticker = setInterval(() => {
        if (testInput.track.readyState === 'ended') {
          clearInterval(ticker);
          return;
        }
        ctx.fillStyle = frame++ % 2 ? '#eee' : '#fff';
        ctx.fillRect(0, 0, source.width, source.height);
      }, 33);
      return stream;
    };
  });
  await page.route(/\/vendor\/three\/OrbitControls\.js$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: [
      "import { OrbitControls as ActualControls } from './OrbitControls.js?observe-view';",
      "export class OrbitControls extends ActualControls {",
      "  constructor(camera, element) {",
      "    super(camera, element);",
      "    window.handTrackingTest.view = () => ({",
      "      position: camera.position.toArray(),",
      "      target: this.target.toArray(),",
      "      distance: camera.position.distanceTo(this.target)",
      "    });",
      "  }",
      "}"
    ].join('\n')
  }));
  const headers = { 'access-control-allow-origin': '*' };
  await page.route(/\/@mediapipe\/tasks-vision@[^/]+\/\+esm$/, route => route.fulfill({
    contentType: 'application/javascript',
    headers,
    body: `
      export const FilesetResolver = { async forVisionTasks() { return {}; } };
      export const GestureRecognizer = {
        async createFromOptions(_files, options) {
          if (options.runningMode !== 'VIDEO' || options.numHands !== 2) throw new Error('Expected two-hand video recognition');
          return { recognizeForVideo(_video, time) { return window.handTrackingTest.read(time); }, close() {} };
        }
      };
    `
  }));
  await page.route('**/gesture_recognizer.task', route => route.fulfill({
    contentType: 'application/octet-stream',
    headers,
    body: Buffer.alloc(8_373_440)
  }));

  return async (from, to, {
    gesture = 'Open_Palm', sideways = false, count = 1, duration = 290,
    xFrom = .5, xTo = xFrom, spreadFrom = .34, spreadTo = spreadFrom
  } = {}) => {
    const path = { from, to, gesture, sideways, count, duration, xFrom, xTo, spreadFrom, spreadTo };
    await page.evaluate(motion => {
      const input = window.handTrackingTest;
      input.heights = [];
      input.motion = motion;
    }, path);
    await page.waitForFunction(() => !window.handTrackingTest.motion, undefined, { timeout: 8_000 });
    return page.evaluate(() => [...window.handTrackingTest.heights, Number(document.querySelector('#height').value)]);
  };
}

async function startTestCamera() {
  await page.getByRole('button', { name: 'Hand controls' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.getByRole('button', { name: 'Stop camera' }).waitFor();
  await page.getByRole('button', { name: 'Close hand controls' }).click();
}

const readView = () => page.evaluate(() => window.handTrackingTest.view());
const vectorDistance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
function keepsView(before, after) {
  assert.ok(vectorDistance(before.position, after.position) < 1e-5, 'The camera position holds');
  assert.ok(vectorDistance(before.target, after.target) < 1e-5, 'The camera target holds');
}
function showHint(state) {
  return page.locator('#hand-hint[data-state="' + state + '"]').waitFor({ timeout: 8_000 });
}

for (const place of [null, places[0]]) {
  const scene = place ? place.city + ' · ' + place.neighborhood : 'Canal Quarter';
  test('height, camera and forest gestures stay isolated in ' + scene, async () => {
    const feed = await mockHandRecognizer();
    const palm = place ? { gesture: 'None', sideways: true } : { gesture: 'Open_Palm' };
    const move = (from, to, options) => feed(from, to, { ...palm, ...options });
    const height = async () => Number(await page.locator('#height').inputValue());
    const forestSlider = page.locator('#forest');
    const forest = async () => Number(await forestSlider.inputValue());
    const keepsHeight = (samples, expected, message) => {
      assert.deepEqual(new Set(samples), new Set([expected]), message);
    };
    const start = .68, lifted = .54, pressed = .82;

    await openExhibit();
    await page.getByRole('button', { name: 'Pause tour' }).click();
    if (place) {
      const panel = await openMap();
      await panel.getByRole('button', { name: place.city, exact: true }).click();
      await checkSavedNeighborhood(place);
    }
    await page.getByRole('heading', { name: scene, exact: true }).waitFor();
    const hint = page.locator('#hand-hint');
    assert.ok(await hint.isHidden());
    await startTestCamera();
    await showHint('idle');
    const initialView = await readView();
    const initialForest = await forest();
    let level = await height();
    keepsHeight(await move(start, start), level, 'A still open hand leaves the height fixed');
    await showHint('ready');

    for (const stroke of [1, 2]) {
      await Promise.all([move(start, lifted), showHint('lifting')]);
      const raised = await height();
      assert.ok(raised > level + 3, 'Lift ' + stroke + ' raises the buildings from the same starting position');
      keepsHeight(await move(lifted, start, { duration: 230 }), raised, 'Quick downward return ' + stroke + ' preserves height');
      level = raised;
    }

    keepsHeight(await move(start, start, { duration: 850 }), level, 'The pause before reversing does not move the buildings');
    await Promise.all([move(start, pressed), showHint('lowering')]);
    const lowered = await height();
    assert.ok(lowered < level - 3, 'After pausing, a downward press lowers the buildings');
    keepsHeight(await move(pressed, start, { duration: 230 }), lowered, 'A quick upward return after pressing preserves height');
    keepsHeight(await move(start, start, { duration: 850 }), lowered, 'No height drifts when the hand stops moving');

    await Promise.all([move(start, lifted), showHint('lifting')]);
    const beforeLoss = await height();
    keepsHeight(await move(lifted, start, { count: 0 }), beforeLoss, 'Losing the tracked hand during a lift preserves height');
    await showHint('idle');
    keepsHeight(await move(start, lifted, { gesture: 'Closed_Fist', sideways: false }), beforeLoss, 'A closed fist preserves height');
    await showHint('rest');
    keepsView(initialView, await readView());
    assert.equal(await forest(), initialForest, 'Height strokes preserve forest cover');

    const twoHands = (from, to, options) => feed(from, to, { count: 2, ...options });
    keepsHeight(await twoHands(start, start), beforeLoss, 'Showing two hands preserves height');
    await showHint('two-hands');
    keepsView(initialView, await readView());

    const [zoomHeights] = await Promise.all([
      twoHands(start, start, { spreadTo: .56 }), showHint('zooming')
    ]);
    keepsHeight(zoomHeights, beforeLoss, 'Zooming preserves height');
    const zoomed = await readView();
    assert.ok(zoomed.distance < initialView.distance - 2, 'Spreading the hands zooms in');
    assert.ok(vectorDistance(zoomed.target, initialView.target) < 1e-5, 'Zooming preserves the camera target');

    await twoHands(start, start, { spreadFrom: .56, duration: 240 });
    const [unzoomHeights] = await Promise.all([
      twoHands(start, start, { spreadFrom: .56, spreadTo: .34 }), showHint('zooming')
    ]);
    keepsHeight(unzoomHeights, beforeLoss, 'Zooming out preserves height');
    const unzoomed = await readView();
    assert.ok(unzoomed.distance > zoomed.distance + 2, 'Bringing the hands together zooms out');
    assert.ok(vectorDistance(unzoomed.target, zoomed.target) < 1e-5, 'Zooming out preserves the camera target');

    await twoHands(start, start, { duration: 320 });
    const [panHeights] = await Promise.all([
      twoHands(start, start, { xTo: .62 }), showHint('panning')
    ]);
    keepsHeight(panHeights, beforeLoss, 'Panning preserves height');
    const panned = await readView();
    assert.ok(vectorDistance(panned.target, unzoomed.target) > 2, 'Moving both hands sideways pans the view');
    assert.ok(Math.abs(panned.distance - unzoomed.distance) < 1e-5, 'Panning preserves zoom');
    assert.equal(await forest(), initialForest, 'Camera gestures preserve forest cover');

    await feed(start, start, { count: 0, duration: 160 });
    await showHint('idle');
    keepsView(panned, await readView());
    await twoHands(.48, .48, { xFrom: .39, spreadFrom: .30 });
    await showHint('two-hands');
    keepsView(panned, await readView());

    const sweep = (xFrom, xTo) => feed(start, start, { xFrom, xTo, duration: 200 });
    await feed(start, start);
    await showHint('ready');
    keepsHeight(await sweep(.50, .62), beforeLoss, 'The first half of a wave preserves height');
    assert.equal(await forest(), initialForest, 'A one-way sweep preserves forest cover');
    const [waveHeights] = await Promise.all([
      sweep(.62, .50),
      showHint(place ? 'forest-unavailable' : 'waving')
    ]);
    keepsHeight(waveHeights, beforeLoss, 'Waving preserves height');
    keepsView(panned, await readView());
    if (place) {
      assert.ok(await forestSlider.isDisabled());
      assert.equal(await forest(), initialForest, 'Waving preserves tree cover in a real map');
    } else {
      assert.ok(await forest() > initialForest, 'A wave adds forest cover to an imagined neighborhood');

      await openMap();
      await forestSlider.fill('100');
      await page.getByRole('button', { name: 'Close map tools' }).click();
      await feed(start, start, { duration: 740 });
      await sweep(.50, .62);
      await Promise.all([sweep(.62, .50), showHint('forest-full')]);
      assert.equal(await forest(), 100);

      const panel = await openMap();
      await panel.getByRole('button', { name: places[0].city, exact: true }).click();
      await checkSavedNeighborhood(places[0]);
      await feed(start, start);
      await sweep(.50, .62);
      await Promise.all([sweep(.62, .50), showHint('forest-unavailable')]);
      assert.equal(await forest(), 100);
    }

    await page.getByRole('button', { name: 'Hand controls' }).click();
    await page.getByRole('button', { name: 'Stop camera' }).click();
    await hint.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.handTrackingTest.track.readyState === 'ended');
  });
}

test('camera gestures hold the tour and give the next stop a fresh view', async () => {
  const feed = await mockHandRecognizer();
  await page.route(/\/tour\.js$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: [
      "import { createTourClock as actualClock } from './tour.js?observe-timer';",
      "export function createTourClock(advance) {",
      "  let pending = null, nextId = 0;",
      "  window.tourTest = {",
      "    timer: () => pending && { id: pending.id, delay: pending.delay },",
      "    async advance() {",
      "      const { callback } = pending;",
      "      pending = null;",
      "      await callback();",
      "    }",
      "  };",
      "  return actualClock(advance, {",
      "    setTimer(callback, delay) {",
      "      pending = { id: ++nextId, callback, delay };",
      "      return pending.id;",
      "    },",
      "    clearTimer(id) { if (pending?.id === id) pending = null; }",
      "  });",
      "}"
    ].join('\n')
  }));
  const timer = () => page.evaluate(() => window.tourTest.timer());

  await openExhibit();
  await startTestCamera();
  const before = await readView();
  const scheduled = await timer();
  assert.equal(scheduled.delay, 30_000);

  await feed(.58, .58, { count: 2 });
  await showHint('two-hands');
  assert.deepEqual(await timer(), scheduled);
  await Promise.all([feed(.58, .58, { count: 2, spreadTo: .58 }), showHint('zooming')]);
  const zoomed = await readView();
  assert.ok(zoomed.distance < before.distance - 2);
  assert.equal(await timer(), null, 'Camera motion holds the tour');

  await feed(.58, .58, { count: 0, duration: 150 });
  await showHint('idle');
  await page.waitForFunction(() => window.tourTest.timer() !== null, undefined, { timeout: 8_000 });
  const restarted = await timer();
  assert.equal(restarted.delay, 30_000);
  assert.ok(restarted.id > scheduled.id, 'Tracking loss gives the current stop a new interval');
  await page.evaluate(() => window.tourTest.advance());
  await checkSavedNeighborhood(places[0]);
  const mapView = await readView();
  assert.ok(mapView.distance > zoomed.distance + 2, 'The new stop starts at its own view');
  assert.deepEqual(mapView.target, before.target);
  await feed(.50, .50, { count: 2, xFrom: .40, spreadFrom: .27 });
  await showHint('two-hands');
  keepsView(mapView, await readView());
});

test('a keyboard user can leave map tools on a short landscape screen', async () => {
  await page.setViewportSize({ width: 375, height: 290 });
  await openExhibit();
  await page.locator('#map-toggle').click();
  await page.keyboard.press('Shift+Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    const { left, top, width, height } = element.getBoundingClientRect();
    return { id: element.id, visible: element.contains(document.elementFromPoint(left + width / 2, top + height / 2)) };
  });
  assert.deepEqual(focused, { id: 'map-toggle', visible: true });
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#map-panel').isHidden());
});

test('startup without WebGL gives an actionable message', async () => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...options) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...options);
    };
  });
  await page.goto(site.href);
  const notice = page.getByRole('dialog');
  await notice.waitFor();
  assert.match(await notice.innerText(), /WebGL 2/);
  await page.keyboard.press('Escape');
  assert.ok(await notice.getByRole('button', { name: 'Reload exhibit' }).isVisible());
});

test('a failed module download can be retried from the page', async () => {
  await page.route('**/vendor/three/three.module.min.js', route => route.abort(), { times: 1 });
  await page.goto(site.href);
  const reload = page.getByRole('button', { name: 'Reload exhibit' });
  await reload.click();
  await page.locator('.transition-canvas').waitFor({ state: 'attached' });
  assert.ok(await page.getByRole('dialog').isHidden());
});

test('restoring a lost graphics context gives the current stop a fresh interval', async () => {
  await openExhibit();
  await page.locator('#scene canvas').first().evaluate(canvas => {
    window.testGraphics = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.testGraphics.loseContext();
  });
  await page.getByRole('dialog').waitFor();
  // Use the real clock: restoring a GPU context and loading a map run on browser event loops.
  await new Promise(resolve => setTimeout(resolve, 31_000));
  assert.equal(await page.locator('#scene-name').innerText(), 'Canal Quarter');
  const restoredAt = Date.now();
  await page.evaluate(() => window.testGraphics.restoreContext());
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#scene-name').innerText(), 'Canal Quarter');
  await page.getByRole('heading', { name: /Tokyo/ }).waitFor({ timeout: 45_000 });
  assert.ok(Date.now() - restoredAt >= 29_500, 'Resuming should give the current stop a full interval');
});

test('the hand tutorial includes its artwork and a printable guide before camera access', async () => {
  await openExhibit();
  await page.getByRole('button', { name: 'Hand controls', exact: true }).click();
  const help = page.getByRole('complementary', { name: 'Hand controls' });
  await help.getByRole('button', { name: 'Start camera' }).waitFor();
  for (const name of ['Change building height', 'Zoom and pan', 'Grow the forest']) {
    assert.ok(await help.getByRole('heading', { name, exact: true }).isVisible());
  }
  assert.match(await help.innerText(), /add trees in imagined neighborhoods/);
  const sprites = await help.locator('#gesture-demo image').all();
  assert.equal(sprites.length, 2);
  for (const image of sprites) {
    const url = new URL(await image.getAttribute('href'), site);
    const response = await page.request.get(url.href);
    assert.equal(url.origin, site.origin);
    assert.ok(response.ok());
    assert.equal((await response.body()).subarray(1, 4).toString(), 'PNG');
  }
  const guide = help.getByRole('link', { name: /A4 gesture guide/ });
  const [download] = await Promise.all([page.waitForEvent('download'), guide.click()]);
  assert.equal(download.suggestedFilename(), 'gesture-guide-a4.pdf');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(outsideRequests, []);
});
