const { before, after, beforeEach, afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const site = new URL(process.env.PIXEL_CITY_URL || 'http://localhost:8000/');
let browser, page, outsideData, errors;

before(async () => {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); });

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 720, height: 500 } });
  outsideData = [];
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin === site.origin) return route.continue();
    if (['fetch', 'xhr'].includes(request.resourceType())) outsideData.push(request.url());
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

test('the three featured squares reload from local data', async () => {
  await openExhibit();
  for (const city of ['Tokyo', 'Shanghai', 'Singapore']) {
    await page.locator('#map-toggle').click();
    await page.getByRole('button', { name: city, exact: true }).click();
    await page.locator('#map-panel').waitFor({ state: 'hidden' });
    const title = await page.locator('#scene-name').innerText();
    assert.ok(title.includes(city));

    await page.locator('#map-toggle').click();
    await page.getByRole('button', { name: 'Load selected area' }).click();
    await page.locator('#map-panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#scene-name').innerText(), title);
    assert.match(await page.locator('#map-status').textContent(), /Saved map extract/);
  }
  assert.deepEqual(outsideData, []);
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
  assert.deepEqual(outsideData, []);
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
