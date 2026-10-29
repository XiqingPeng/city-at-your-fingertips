const clamp = value => Math.max(0, Math.min(1, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Maps short stretches of movement to incremental changes. A return stroke with
// an open hand does not undo a lift. Pinch while moving down to lower buildings.
export function createGestureMapper() {
  let previous = null, history = [], waveUntil = 0, zoomSpread = null, zoomLatched = false;
  return {
    reset() { previous = null; history = []; waveUntil = 0; zoomSpread = null; zoomLatched = false; },
    update(hands, timestamp, values) {
      if (!hands.length) { this.reset(); return { gesture: '等待手进入画面' }; }
      const centers = hands.map(h => h[9]);
      const x = centers.reduce((s, p) => s + p.x, 0) / centers.length;
      const y = centers.reduce((s, p) => s + p.y, 0) / centers.length;
      const hand = hands[0];
      const palm = Math.max(distance(hand[0], hand[9]), 0.02);
      const pinch = distance(hand[4], hand[8]) / palm < 0.45;
      const bothPinch = hands.length === 2 && hands.every(h => distance(h[4], h[8]) / Math.max(distance(h[0], h[9]), 0.02) < (zoomLatched ? 0.85 : 0.65));
      zoomLatched = bothPinch;
      const spread = centers.length === 2 ? distance(centers[0], centers[1]) : 0;
      const result = { gesture: pinch ? '捏合：向下移动降低建筑' : '张手：向上推动建筑生长' };
      const horizontalSpread = centers.length === 2 ? Math.abs(centers[0].x - centers[1].x) : 0;
      if (!previous || previous.count !== hands.length || timestamp - previous.time > 300 || timestamp <= previous.time) {
        history = []; waveUntil = 0;
        zoomSpread = bothPinch ? spread : null;
        previous = { x, y, time: timestamp, count: hands.length, spread, horizontalSpread, bothPinch };
        return result;
      }
      const dt = Math.min((timestamp - previous.time) / 1000, .1);
      if (bothPinch) {
        history = []; waveUntil = 0;
        if (!previous.bothPinch || zoomSpread === null) zoomSpread = spread;
        else {
          const filtered = zoomSpread + (spread - zoomSpread) * (1 - Math.exp(-dt * 14));
          const delta = filtered - zoomSpread;
          if (Math.abs(delta) > .0004) result.zoomDelta = Math.max(-.08, Math.min(.08, delta * 1.7));
          zoomSpread = filtered;
        }
        result.gesture = '双手捏合：拉开放大，靠近缩小';
        previous = { x, y, time: timestamp, count: hands.length, spread, horizontalSpread, bothPinch };
        return result;
      }
      if (previous.bothPinch) { history = []; zoomSpread = null; }
      history.push({ x, y, horizontalSpread, time: timestamp });
      history = history.filter(p => timestamp - p.time <= 650);
      if (history.length > 2) {
        const first = history[0];
        const dx = x - first.x, dy = y - first.y;
        // Density only changes after a deliberate horizontal opening or closing;
        // vertical lifting and detection resumption do not reset it.
        if (hands.length === 2 && Math.abs(horizontalSpread - first.horizontalSpread) > .035 && Math.abs(horizontalSpread - first.horizontalSpread) > Math.abs(dy) * 1.2) {
          result.density = clamp(values.density - (horizontalSpread - previous.horizontalSpread) * 1.5);
          result.gesture = '双手开合：调整密度';
        }
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
      previous = { x, y, time: timestamp, count: hands.length, spread, horizontalSpread, bothPinch };
      return result;
    }
  };
}
