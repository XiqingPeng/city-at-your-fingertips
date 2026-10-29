const clamp = value => Math.max(0, Math.min(1, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Maps short stretches of movement to incremental changes. A return stroke with
// an open hand does not undo a lift. Pinch while moving down to lower buildings.
export function createGestureMapper() {
  let previous = null, history = [], waveUntil = 0;
  return {
    reset() { previous = null; history = []; waveUntil = 0; },
    update(hands, timestamp, values) {
      if (!hands.length) { this.reset(); return { gesture: '等待手进入画面' }; }
      const centers = hands.map(h => h[9]);
      const x = centers.reduce((s, p) => s + p.x, 0) / centers.length;
      const y = centers.reduce((s, p) => s + p.y, 0) / centers.length;
      const hand = hands[0];
      const palm = Math.max(distance(hand[0], hand[9]), 0.02);
      const pinch = distance(hand[4], hand[8]) / palm < 0.45;
      const bothPinch = hands.length === 2 && hands.every(h => distance(h[4], h[8]) / Math.max(distance(h[0], h[9]), 0.02) < 0.45);
      const spread = centers.length === 2 ? distance(centers[0], centers[1]) : 0;
      const result = { gesture: pinch ? '捏合：向下移动降低建筑' : '张手：向上推动建筑生长' };
      if (centers.length === 2 && !bothPinch) {
        result.density = clamp(1 - (spread - 0.12) / 0.55);
      }
      if (!previous || previous.count !== hands.length || timestamp - previous.time > 300 || timestamp <= previous.time) {
        history = []; waveUntil = 0;
        previous = { x, y, time: timestamp, count: hands.length, spread, bothPinch };
        return result;
      }
      const dt = Math.min((timestamp - previous.time) / 1000, .1);
      if (bothPinch) {
        history = []; waveUntil = 0;
        if (previous.bothPinch) {
          const delta = spread - previous.spread;
          if (Math.abs(delta) > .002) result.zoomDelta = Math.max(-.06, Math.min(.06, delta));
        }
        result.gesture = '双手捏合：拉开放大，靠近缩小';
        previous = { x, y, time: timestamp, count: hands.length, spread, bothPinch };
        return result;
      }
      if (previous.bothPinch) history = [];
      history.push({ x, y, time: timestamp });
      history = history.filter(p => timestamp - p.time <= 650);
      if (history.length > 2) {
        const first = history[0];
        const dx = x - first.x, dy = y - first.y;
        // A short displacement establishes intent; integrate at a steady rate
        // until the movement stops. Ignore return strokes for open-hand lifts.
        if (!pinch && dy < -0.025 && Math.abs(dy) > Math.abs(dx) * .7) {
          result.height = clamp(values.height + dt * .23);
          result.gesture = '向上生长';
        } else if (pinch && dy > .025 && Math.abs(dy) > Math.abs(dx) * .7) {
          result.height = clamp(values.height - dt * .23);
          result.gesture = '降低建筑';
        }
        if (!pinch && Math.abs(dx) > .035 && Math.abs(dx) > Math.abs(dy) * 1.1) waveUntil = timestamp + 350;
        if (!pinch && timestamp < waveUntil) {
          result.forest = clamp(values.forest + dt * .22);
          result.gesture = '挥手：森林生长';
        }
        // Hold a pinch without movement to restore the city.
        if (pinch && Math.abs(dx) < .025 && Math.abs(dy) < .025 && timestamp - first.time > 400) {
          result.forest = clamp(values.forest - dt * .18);
          result.gesture = '保持捏合：城市恢复';
        }
      }
      previous = { x, y, time: timestamp, count: hands.length, spread, bothPinch };
      return result;
    }
  };
}
