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

function simulate({ height = .45, ...defaults } = {}) {
  const mapper = createGestureMapper();
  let time = 0;
  function advance(result, elapsed = 40) {
    time += elapsed;
    const reply = mapper.update(result, time, height);
    if (reply.height !== undefined) height = reply.height;
    return reply;
  }
  return {
    step(y, options = {}, elapsed = 40) { return advance(frame(y, { ...defaults, ...options }), elapsed); },
    advance,
    reset: mapper.reset,
    get height() { return height; }
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
    [twoHands, 35, 'ambiguous'],
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
