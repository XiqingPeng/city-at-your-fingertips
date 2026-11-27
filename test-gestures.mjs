import assert from 'node:assert/strict';
import test from 'node:test';
import { createGestureMapper } from './gesture.js';

const openHand = [
  [0, .10, 0], [-.04, .07, 0], [-.06, .05, 0], [-.08, .03, 0], [-.10, .01, 0],
  [-.05, 0, 0], [-.052, -.04, 0], [-.053, -.07, 0], [-.055, -.10, 0],
  [0, 0, 0], [0, -.052, 0], [0, -.082, 0], [0, -.116, 0],
  [.038, .004, 0], [.041, -.038, 0], [.044, -.066, 0], [.045, -.090, 0],
  [.071, .013, 0], [.081, -.021, 0], [.085, -.043, 0], [.089, -.066, 0]
];

function flexedHand(extended = []) {
  const hand = openHand.map(point => point.slice());
  for (const base of [5, 9, 13, 17]) {
    if (extended.includes(base)) continue;
    const [x, y] = hand[base];
    hand[base + 1] = [x, y - .03, .01];
    hand[base + 2] = [x, y - .03, .04];
    hand[base + 3] = [x, y, .045];
  }
  return hand;
}

function frame(y, {
  x = .5, pose = 'Open_Palm', score = .95, side = 'Right', sideScore = .98,
  hand = openHand, scale = 1, roll = 0, turn = 0, useWorld = false
} = {}) {
  const oriented = hand.map(([tx, ty, tz]) => {
    const across = tx * Math.cos(turn) + tz * Math.sin(turn);
    const depth = -tx * Math.sin(turn) + tz * Math.cos(turn);
    return [across * Math.cos(roll) - ty * Math.sin(roll), across * Math.sin(roll) + ty * Math.cos(roll), depth];
  });
  const worldLandmarks = useWorld ? [oriented.map(([x, y, z]) => ({ x, y, z }))] : [];
  return {
    landmarks: [oriented.map(([dx, dy, z]) => ({
      x: x + dx * scale, y: y + dy * scale, z: useWorld ? 0 : z * scale
    }))],
    worldLandmarks,
    gestures: [[{ categoryName: pose, score }]],
    handedness: [[{ categoryName: side, score: sideScore }]]
  };
}

function simulate({ height = .45, forest = .15, ...defaults } = {}) {
  const mapper = createGestureMapper();
  let time = 0;
  function advance(result, elapsed = 40) {
    time += elapsed;
    const reply = mapper.update(result, time, height, forest);
    if (reply.height !== undefined) height = reply.height;
    if (reply.forest !== undefined) forest = reply.forest;
    return reply;
  }
  return {
    step(y, options = {}, elapsed = 40) { return advance(frame(y, { ...defaults, ...options }), elapsed); },
    advance,
    reset: mapper.reset,
    get height() { return height; },
    get forest() { return forest; }
  };
}

function hold(driver, y, frames = 4) {
  return Array.from({ length: frames }, () => driver.step(y));
}

function move(driver, from, to, frames = 8, elapsed = 35) {
  return Array.from({ length: frames }, (_, i) => driver.step(from + (to - from) * (i + 1) / frames, {}, elapsed));
}

function freezes(events) {
  assert.ok(events.every(event => event.height === undefined));
}

function near(actual, expected, tolerance = .01) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${actual} within ${tolerance} of ${expected}`);
}

test('either hand can raise the skyline with a continuous flat-palm stroke', () => {
  for (const side of ['Left', 'Right']) {
    const hand = simulate({ side });
    assert.ok(hold(hand, .66).every(event => event.state === 'ready'));
    const lifted = move(hand, .66, .54);
    assert.equal(lifted.at(-1).state, 'lifting');
    near(hand.height, .55);
  }
});

test('short downward returns preserve height and repeated lifts accumulate', () => {
  const hand = simulate();
  hold(hand, .66);
  for (let stroke = 1; stroke <= 3; stroke++) {
    const lift = move(hand, .66, .54);
    assert.equal(lift.at(-1).state, 'lifting');
    near(hand.height, .45 + stroke * .102);
    const atTop = hand.height;
    freezes(hold(hand, .54, 5));
    const returning = move(hand, .54, .66);
    assert.ok(returning.every(event => event.state === 'lifting'));
    freezes(returning);
    assert.equal(hand.height, atTop);
  }
});

test('repeated palm lifts accumulate with a short rebound and no pause between lifts', () => {
  for (const interval of [30, 45, 65]) {
    const hand = simulate();
    let bottom = .66;
    hold(hand, bottom);
    for (let i = 0; i < 6; i++) {
      const before = hand.height;
      const top = bottom - .020;
      onlyChanges(move(hand, bottom, top, 4, interval), 'height');
      assert.ok(hand.height > before + .006, `lift ${i + 1} should raise the buildings`);
      const raised = hand.height;
      bottom = top + .013;
      onlyChanges(move(hand, top, bottom, 3, interval));
      assert.equal(hand.height, raised);
    }
    assert.ok(hand.height >= .49);
    const raised = hand.height;
    freezes(hold(hand, bottom, 15));
    move(hand, bottom, bottom + .10);
    assert.ok(hand.height < raised - .07);
  }
});

test('palm lifts already in progress replace an entry baseline set mid-rebound', () => {
  const hand = simulate();
  // The first detected wrist position can be off while tracking settles.
  for (const y of [.514, .477, .462, .460, .465, .468, .478, .480]) {
    freezes([hand.step(y, {}, 33)]);
  }
  let recognized = 0;
  for (let i = 0; i < 5; i++) {
    const before = hand.height;
    onlyChanges(move(hand, .480, .460, 3, 33), 'height');
    freezes(move(hand, .460, .480, 4, 33));
    if (hand.height > before) recognized++;
  }
  assert.ok(recognized >= 4);
  assert.ok(hand.height > .48);
});

test('stationary landmark drift after a short rebound still allows a downward press', () => {
  const hand = simulate();
  hold(hand, .66);
  move(hand, .66, .64);
  freezes(move(hand, .64, .66, 4));
  const raised = hand.height;
  const pause = Array.from({ length: 21 }, (_, i) => hand.step(.66 + .003 * (i + 1) / 21, {}, 33));
  freezes(pause);
  assert.equal(pause.at(-1).state, 'ready');
  move(hand, .663, .76);
  const lowered = hand.height;
  assert.ok(lowered < raised - .06);
  freezes(move(hand, .76, .663));
  assert.equal(hand.height, lowered);
});

test('an isolated upward jump during a small lift does not count as extra travel', () => {
  const hand = simulate();
  hold(hand, .66);
  move(hand, .66, .636, 4);
  const raised = hand.height;
  assert.ok(raised > .45);
  freezes([hand.step(.58), hand.step(.636)]);
  near(hand.height, raised, .0001);
  freezes(move(hand, .636, .66, 4));
  move(hand, .66, .64, 4);
  assert.ok(hand.height > raised);
});

test('brief uncertain palm frames keep the stroke while sustained loss requires a new baseline', () => {
  const hand = simulate();
  hold(hand, .66);
  for (let i = 0; i < 4; i++) {
    const before = hand.height;
    hand.step(.654);
    freezes([hand.step(.647, { pose: 'None', hand: flexedHand() })]);
    hand.step(.643);
    hand.step(.640);
    assert.ok(hand.height > before + .006);
    freezes(move(hand, .64, .66, 4));
  }
  const raised = hand.height;
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(hand.step(.65, { pose: 'None', hand: flexedHand() }), { state: 'rest' });
  }
  freezes(move(hand, .65, .54, 5));
  assert.equal(hand.height, raised);
});

test('repeated small diagonal pulses neither lift buildings nor grow the forest', () => {
  const hand = simulate();
  hold(hand, .66);
  for (let i = 0; i < 6; i++) {
    onlyChanges(movePalm(hand, [.5, .66], [.514, .642], 4));
    onlyChanges(movePalm(hand, [.514, .642], [.5, .66], 3));
  }
});

test('about half a second of stillness permits pressing and short upward returns preserve it', () => {
  const hand = simulate();
  hold(hand, .66);
  move(hand, .66, .54);
  const shortPause = hold(hand, .54, 9);
  assert.equal(shortPause.at(-1).state, 'lifting');
  freezes(shortPause);
  assert.equal(hold(hand, .54, 5).at(-1).state, 'ready');
  const peak = hand.height;

  for (let stroke = 1; stroke <= 3; stroke++) {
    const press = move(hand, .54, .66);
    assert.equal(press.at(-1).state, 'lowering');
    near(hand.height, peak - stroke * .102);
    const atBottom = hand.height;
    freezes(move(hand, .66, .54));
    assert.equal(hand.height, atBottom);
  }
  assert.equal(hold(hand, .54, 14).at(-1).state, 'ready');
  const before = hand.height;
  move(hand, .54, .42);
  near(hand.height - before, .102);
});

test('static hands and small tracking jitter never keep pumping the skyline', () => {
  const hand = simulate();
  hold(hand, .66);
  move(hand, .66, .54);
  const height = hand.height;
  for (let i = 0; i < 45; i++) {
    const jitter = (i % 2 ? -.004 : .003);
    const result = hand.step(.54 + jitter, { x: .5 + jitter / 2 });
    assert.equal(result.height, undefined);
    assert.equal(hand.height, height);
  }
  assert.equal(hand.step(.54).state, 'ready');
});

test('entry movement, sideways sweeps and shallow diagonal motion do not select a direction', () => {
  const hand = simulate();
  hand.step(.86);
  freezes(move(hand, .86, .66));
  hold(hand, .66);
  for (let i = 1; i <= 9; i++) {
    const result = hand.step(.66 - i * .009, { x: .5 - i * .024 });
    assert.deepEqual(result, { state: 'ready' });
  }
  assert.equal(hand.height, .45);
  freezes(move(hand, .579, .579));
  const raised = move(hand, .579, .459).at(-1);
  assert.equal(raised.state, 'lifting');
  near(hand.height, .55);
});

test('lateral landmark jitter preserves a lift and an actual sideways sweep adds no height', () => {
  const hand = simulate();
  hold(hand, .66);
  for (let i = 1; i <= 10; i++) {
    hand.step(.66 - i * .012, { x: .5 + (i % 2 ? .007 : -.005) });
  }
  near(hand.height, .55);
  const height = hand.height;
  for (let i = 1; i <= 9; i++) {
    assert.equal(hand.step(.54 - i * .005, { x: .495 + i * .023 }).height, undefined);
  }
  assert.equal(hand.height, height);
});

test('the geometry accepts sideways and oblique open palms at multiple scales', () => {
  const splayed = openHand.map(point => point.slice());
  splayed[18] = [.098, -.004, 0];
  splayed[19] = [.122, -.019, 0];
  splayed[20] = [.143, -.034, 0];
  for (const geometry of [
    { roll: Math.PI / 2, scale: .65 },
    { roll: -Math.PI / 2, turn: Math.PI / 3 },
    { turn: Math.PI / 2, roll: .2, useWorld: true },
    { hand: splayed, roll: Math.PI / 2 },
    { pose: 'Open_Palm', score: .60 }
  ]) {
    const hand = simulate({ pose: 'None', ...geometry });
    assert.ok(hold(hand, .61).every(reply => reply.state === 'ready'));
    move(hand, .61, .49);
    near(hand.height, .55);
  }
});

test('a relaxed fingertip still allows a flat palm while a curled fingertip does not', () => {
  const relaxed = openHand.map(point => point.slice());
  relaxed[8] = [-.075, -.093, 0];
  const accepted = simulate({ hand: relaxed, pose: 'None', roll: Math.PI / 3 });
  assert.ok(hold(accepted, .61).every(event => event.state === 'ready'));
  move(accepted, .61, .49);
  near(accepted.height, .55);

  const hooked = relaxed.map(point => point.slice());
  hooked[8] = [-.079, -.074, 0];
  const rejected = simulate({ hand: hooked, pose: 'None', roll: Math.PI / 3 });
  assert.ok(hold(rejected, .61).every(event => event.state === 'rest'));
});

test('strong open-palm recognition is sufficient and incompatible labels or finger shapes stay at rest', () => {
  const decisive = simulate({ hand: flexedHand(), pose: 'Open_Palm' });
  assert.ok(hold(decisive, .61).every(event => event.state === 'ready'));
  move(decisive, .61, .49);
  near(decisive.height, .55);

  for (const options of [
    { pose: 'Closed_Fist', score: .88 },
    { pose: 'Pointing_Up', score: .88 },
    { pose: 'Victory', score: .88 },
    { pose: 'None', hand: flexedHand() },
    { pose: 'None', hand: flexedHand([5, 9]) },
    { pose: 'Open_Palm', score: .59, hand: flexedHand([5]) },
    { pose: 'None', hand: flexedHand([5, 9, 13]), roll: Math.PI / 2 }
  ]) {
    const rejected = simulate(options);
    const events = [...hold(rejected, .61), ...move(rejected, .61, .49)];
    assert.ok(events.every(event => event.state === 'rest'));
    freezes(events);
    assert.equal(rejected.height, .45);
  }
});

test('loss, a second hand, a switch, a jump or a frame gap freeze and require a fresh settled track', () => {
  const twoHands = frame(.54);
  twoHands.landmarks.push(frame(.42, { x: .3 }).landmarks[0]);
  const damaged = frame(.54);
  damaged.landmarks[0][9].x = NaN;
  for (const [result, elapsed, state] of [
    [{ landmarks: [] }, 35, 'idle'],
    [twoHands, 35, 'two-hands'],
    [frame(.54, { side: 'Left' }), 35, 'ready'],
    [frame(.43), 35, 'ready'],
    [frame(.52, { scale: .5 }), 35, 'ready'],
    [frame(.52), 300, 'ready'],
    [frame(.52), 0, 'ready'],
    [damaged, 35, 'idle'],
    [frame(.52, { pose: 'Closed_Fist' }), 35, 'rest']
  ]) {
    const hand = simulate();
    hold(hand, .66);
    move(hand, .66, .54);
    const original = hand.height;
    assert.deepEqual(hand.advance(result, elapsed), { state });
    assert.deepEqual(hand.step(.47), { state: 'ready' });
    assert.equal(hand.height, original);
    hand.reset();
    assert.deepEqual(hand.step(.4), { state: 'ready' });
  }
});

test('slow cameras still measure each stroke, while a long gap starts a fresh track', () => {
  const hand = simulate();
  hand.step(.66, {}, 335);
  hand.step(.66, {}, 390);
  const ascending = [hand.step(.62, {}, 335), hand.step(.58, {}, 500), hand.step(.54, {}, 530)];
  assert.ok(ascending.every(event => event.state === 'lifting'));
  near(hand.height, .55);
  const height = hand.height;
  freezes(move(hand, .54, .66, 3, 335));
  assert.equal(hand.height, height);
  assert.deepEqual(hand.step(.55, {}, 701), { state: 'ready' });
  assert.deepEqual(hand.step(.51, {}, 320), { state: 'ready' });
  assert.equal(hand.height, height);
});

test('both directions stop exactly at the manual slider limits', () => {
  for (const [height, target, direction] of [[.96, .54, 1], [.04, .78, -1]]) {
    const hand = simulate({ height });
    hold(hand, .66);
    move(hand, .66, target);
    assert.equal(hand.height, direction > 0 ? 1 : 0);
    freezes(move(hand, target, .66));
  }
});

test('distance and angle changes around a stationary wrist do not move the skyline', () => {
  const hand = openHand.map(([x, y, z]) => [x, y - openHand[0][1], z]);
  for (const [property, from, to] of [['scale', .65, 1.25], ['roll', Math.PI / 2, Math.PI / 3]]) {
    const track = simulate({ hand, [property]: from });
    hold(track, .63);
    const sweep = (start, end) => Array.from({ length: 24 }, (_, i) =>
      track.step(.63, { [property]: start + (end - start) * (i + 1) / 24 }));
    freezes(sweep(from, to));
    freezes(Array.from({ length: 15 }, () => track.step(.63, { [property]: to })));
    freezes(sweep(to, from));
    assert.equal(track.height, .45);
  }
});

test('a single position spike neither starts a stroke nor rearms it after a lift', () => {
  for (const spike of [-.055, .055]) {
    const hand = simulate();
    hold(hand, .66);
    assert.deepEqual(hand.step(.66 + spike), { state: 'ready' });
    freezes(hold(hand, .66));
    assert.equal(hand.height, .45);
  }

  const hand = simulate();
  hold(hand, .66);
  move(hand, .66, .54);
  const raised = hand.height;
  freezes([hand.step(.605), hand.step(.54), ...hold(hand, .54, 3)]);
  assert.equal(hand.height, raised);
  freezes(move(hand, .54, .66));
  move(hand, .66, .54);
  near(hand.height - raised, .102);
});

test('small reversals near the top do not count as another lift', () => {
  const hand = simulate();
  hold(hand, .66);
  move(hand, .66, .54);
  const raised = hand.height;
  for (let sway = 0; sway < 2; sway++) {
    freezes(move(hand, .54, .575, 4));
    freezes(move(hand, .575, .54, 4));
  }
  assert.equal(hand.height, raised);

  freezes(move(hand, .54, .60));
  move(hand, .60, .54);
  near(hand.height - raised, .042);
});

test('slow lifts and presses respond while their slow returns preserve height', () => {
  for (const jitter of [0, .0015]) {
    const hand = simulate();
    const slowMove = (from, to) => Array.from({ length: 188 }, (_, i) =>
      hand.step(from + (to - from) * (i + 1) / 188 + (i % 2 ? jitter : -jitter)));
    hold(hand, .66);
    const lifted = slowMove(.66, .54);
    assert.equal(lifted.at(-1).state, 'lifting');
    near(hand.height - .45, .102);

    const raised = hand.height;
    const returning = slowMove(.54, .66);
    freezes(returning);
    assert.ok(returning.every(event => event.state === 'lifting'));
    freezes(hold(hand, .66, 15));
    assert.equal(hand.step(.66).state, 'ready');

    const pressed = slowMove(.66, .78);
    assert.equal(pressed.at(-1).state, 'lowering');
    near(raised - hand.height, .102);
    freezes(slowMove(.78, .66));
  }
});

test('about half a second of small uneven jitter still lets the hand reverse direction', () => {
  const traces = [
    [.003, .003, .002, .001, -.003, -.003, -.002, -.001],
    [.003, .003, .003, .003, -.003, -.003, -.003, -.003]
  ];
  for (const jitter of traces) {
    for (let offset = 0; offset < jitter.length; offset++) {
      const hand = simulate();
      hold(hand, .66);
      move(hand, .66, .54);
      const raised = hand.height;
      const paused = Array.from({ length: 13 }, (_, i) =>
        hand.step(.54 + jitter[(i + offset) % jitter.length], {}, i === 12 ? 20 : 40));
      freezes(paused);
      assert.equal(paused.at(-2).state, 'lifting');
      assert.equal(paused.at(-1).state, 'ready');
      assert.equal(move(hand, .54, .66).at(-1).state, 'lowering');
      near(raised - hand.height, .102);
    }
  }
});


function pairedFrame([[x1, y1], [x2, y2]], secondOptions = {}) {
  const first = frame(y1, { x: x1, side: 'Left' });
  const second = frame(y2, { x: x2, side: 'Right', ...secondOptions });
  return Object.fromEntries(Object.keys(first).map(key => [key, [first[key][0], second[key][0]]]));
}

function holdPair(driver, position) {
  return Array.from({ length: 4 }, () => driver.advance(pairedFrame(position)));
}

function movePair(driver, from, to, { frames = 10, elapsed = 40, reorder = false } = {}) {
  return Array.from({ length: frames }, (_, i) => {
    const fraction = (i + 1) / frames;
    const positions = from.map(([x, y], index) => [
      x + fraction * (to[index][0] - x), y + fraction * (to[index][1] - y)
    ]);
    const result = pairedFrame(positions);
    if (reorder && i % 2 === 0) {
      for (const tracks of Object.values(result)) tracks.reverse();
    }
    return driver.advance(result, elapsed);
  });
}

function movePalm(driver, [x, y], [endX, endY], frames = 6, elapsed = 40) {
  return Array.from({ length: frames }, (_, i) => {
    const fraction = (i + 1) / frames;
    return driver.step(y + fraction * (endY - y), { x: x + fraction * (endX - x) }, elapsed);
  });
}

function onlyChanges(events, key) {
  for (const name of ['height', 'forest', 'zoomDelta', 'panDelta']) {
    if (name === key) continue;
    assert.ok(events.every(event => event[name] === undefined), 'unexpected change to ' + name);
  }
}

test('moderate open-palm recognition and straight image fingers recover a distorted world hand', () => {
  for (const [pose, state] of [['Open_Palm', 'ready'], ['None', 'rest'], ['Closed_Fist', 'rest']]) {
    const hand = frame(.61, { pose, score: pose === 'Open_Palm' ? .60 : .9, useWorld: true });
    hand.worldLandmarks[0][6].z = .1;
    assert.deepEqual(simulate().advance(hand), { state });
  }
});

test('opposed open palms zoom in and out without panning despite unequal travel and reordered detections', () => {
  const hand = simulate();
  const close = [[.35, .61], [.65, .61]];
  const wide = [[.23, .61], [.72, .61]];
  onlyChanges(holdPair(hand, close));
  for (const [start, end, sign] of [[close, wide, 1], [wide, close, -1]]) {
    const events = movePair(hand, start, end, { reorder: true });
    onlyChanges(events, 'zoomDelta');
    const zoom = events.filter(event => event.zoomDelta !== undefined);
    assert.ok(zoom.length > 1 && zoom.every(event => event.state === 'zooming'));
    near(zoom.reduce((sum, event) => sum + event.zoomDelta, 0), sign * .19 * 1.7, .03);
  }
});

test('two hands moving together pan on both axes without coupling to their changing spread', () => {
  const hand = simulate();
  const start = [[.25, .62], [.63, .59]];
  const end = [[.37, .51], [.78, .49]];
  holdPair(hand, start);
  const events = movePair(hand, start, end);
  onlyChanges(events, 'panDelta');
  const pan = events.filter(event => event.panDelta);
  assert.ok(pan.length > 1 && pan.every(event => event.state === 'panning'));
  near(pan.reduce((sum, event) => sum + event.panDelta.x, 0), .135);
  near(pan.reduce((sum, event) => sum + event.panDelta.y, 0), -.105);
});

test('a lagging hand and a rotating pair do not cause zoom', () => {
  const hand = simulate();
  const start = [[.30, .60], [.66, .60]];
  const oneMoved = [[.36, .60], [.66, .60]];
  holdPair(hand, start);
  onlyChanges(movePair(hand, start, oneMoved));
  const panned = movePair(hand, oneMoved, [[.47, .60], [.80, .60]]);
  onlyChanges(panned, 'panDelta');
  assert.ok(panned.some(event => event.panDelta?.x > 0));

  const rotating = simulate();
  holdPair(rotating, start);
  for (let i = 1; i <= 16; i++) {
    const angle = i * Math.PI / 32;
    const x = .18 * Math.cos(angle), y = .24 * Math.sin(angle);
    onlyChanges([rotating.advance(pairedFrame([[.48 - x, .60 - y], [.48 + x, .60 + y]]))]);
  }
});

test('pair entry, frame gaps, closed palms and leaving the frame discard motion references', () => {
  const hand = simulate();
  const start = [[.3, .64], [.7, .64]];
  const end = [[.2, .64], [.8, .64]];
  hold(hand, .66);
  move(hand, .66, .54);
  assert.deepEqual(hand.advance(pairedFrame(start)), { state: 'two-hands' });
  assert.deepEqual(hand.advance(pairedFrame(end)), { state: 'two-hands' });
  holdPair(hand, end);
  assert.deepEqual(hand.advance(pairedFrame(start), 700), { state: 'two-hands' });
  holdPair(hand, start);
  assert.deepEqual(hand.advance(pairedFrame(end, { pose: 'Closed_Fist' })), { state: 'ambiguous' });
  onlyChanges(holdPair(hand, end));

  const raised = hand.height;
  const entering = [hand.step(.65), ...move(hand, .65, .49, 8)];
  onlyChanges(entering);
  hold(hand, .49);
  move(hand, .49, .61);
  near(raised - hand.height, .102);
});

test('either lateral wave with a little vertical drift grows the forest without moving buildings or camera', () => {
  for (const sign of [-1, 1]) {
    const hand = simulate();
    hold(hand, .61);
    const start = [.5, .61];
    const outside = [.5 + sign * .14, .654];
    onlyChanges(movePalm(hand, start, outside, 8));
    const returning = movePalm(hand, outside, start, 8);
    onlyChanges(returning, 'forest');
    assert.equal(returning.filter(event => event.state === 'waving').length, 1);
    near(hand.forest, .225, .0001);
    assert.equal(hand.height, .45);
  }
});

test('completed waves are throttled, stop during stillness and clamp at full forest', () => {
  const hand = simulate({ forest: .88 });
  const start = [.5, .61], right = [.62, .61];
  const wave = () => [...movePalm(hand, start, right, 4), ...movePalm(hand, right, start, 4)];
  hold(hand, .61);
  assert.equal(wave().filter(event => event.forest !== undefined).length, 1);
  near(hand.forest, .955, .0001);
  onlyChanges(wave());
  onlyChanges(hold(hand, .61, 18));
  assert.equal(wave().filter(event => event.forest !== undefined).length, 1);
  assert.equal(hand.forest, 1);
  onlyChanges(hold(hand, .61, 18));
  onlyChanges(wave());
});

test('diagonals, isolated tracking spikes, slow returns and partial waves across loss do not grow trees', () => {
  const start = [.5, .65];
  const right = [.62, .65];
  const diagonal = simulate();
  hold(diagonal, .65);
  const highRight = [.62, .49];
  onlyChanges(movePalm(diagonal, start, highRight, 14));
  onlyChanges(movePalm(diagonal, highRight, start, 14));

  const spike = simulate();
  hold(spike, .65);
  onlyChanges([spike.step(.65, { x: .57 }), spike.step(.65), ...hold(spike, .65)]);

  const slow = simulate();
  hold(slow, .65);
  onlyChanges(movePalm(slow, start, right, 26));
  onlyChanges(movePalm(slow, right, start, 26));

  const interrupted = simulate();
  hold(interrupted, .65);
  onlyChanges(movePalm(interrupted, start, right));
  interrupted.advance({ landmarks: [] });
  onlyChanges(Array.from({ length: 4 }, () => interrupted.step(.65, { x: right[0] })));
  onlyChanges(movePalm(interrupted, right, start));
});
