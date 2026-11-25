import assert from 'node:assert/strict';
import { createTourClock, STOP_DURATION_MS } from './tour.js';

const timers = new Map();
let sequence = 0;
let visits = 0;
let complete;
const tour = createTourClock(() => {
  visits++;
  return new Promise(resolve => { complete = resolve; });
}, {
  setTimer(fn, duration) {
    assert.equal(duration, STOP_DURATION_MS);
    timers.set(++sequence, fn);
    return sequence;
  },
  clearTimer(id) { timers.delete(id); }
});

function elapse() {
  assert.equal(timers.size, 1);
  const [id, callback] = timers.entries().next().value;
  timers.delete(id);
  return callback();
}

const pending = elapse();
assert.equal(visits, 1);
assert.equal(timers.size, 0);
tour.hold('panel', true);
tour.hold('hidden', true);
tour.hold('panel', false);
assert.equal(timers.size, 0);
tour.hold('hidden', false);
assert.equal(timers.size, 1);
complete();
await pending;
assert.equal(timers.size, 1);

const next = elapse();
tour.hold('pause', true);
complete();
await next;
assert.equal(timers.size, 0);
tour.hold('panel', true);
tour.hold('pause', false);
assert.equal(timers.size, 0);
tour.hold('panel', false);
tour.hold('panel', false);
assert.equal(timers.size, 1);
const normal = elapse();
complete();
await normal;
assert.equal(timers.size, 1);
assert.equal(visits, 3);
console.log('Tour clock passed: playback, overlapping holds, and cancellation during an async stop.');
