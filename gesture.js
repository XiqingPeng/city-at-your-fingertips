const clamp = value => Math.max(0, Math.min(1, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Maps short stretches of movement to incremental changes. A return stroke with
// an open hand does not undo a lift. Pinch while moving down to lower buildings.
export function createGestureMapper() {
  let previous = null, history = [], waveUntil = 0, zoomSpread = null, panX = null, panY = null;
  let activeCount = 0, candidateCount = 0, candidateSince = 0, pinched = false;
  return {
    reset() { previous = null; history = []; waveUntil = 0; zoomSpread = null; panX = null; panY = null; activeCount = 0; candidateCount = 0; candidateSince = 0; pinched = false; },
    update(hands, timestamp, values) {
      // Freeze output while the number of hands is uncertain; require a stable
      // mode before accepting new positions so dropped frames cannot jump camera.
      const count = Math.min(hands.length, 2);
      if (count !== candidateCount || timestamp < candidateSince) { candidateCount = count; candidateSince = timestamp; }
      if (count !== activeCount) {
        previous = null; history = []; waveUntil = 0;
        if (timestamp - candidateSince < 180) return { gesture: count ? '正在确认手势…' : '追踪暂时中断' };
        activeCount = count; previous = null; history = []; waveUntil = 0;
        zoomSpread = null; panX = null; panY = null; pinched = false;
      }
      if (!count) return { gesture: '等待手进入画面' };
      const centers = hands.map(h => h[9]);
      const x = centers.reduce((s, p) => s + p.x, 0) / centers.length;
      const y = centers.reduce((s, p) => s + p.y, 0) / centers.length;
      const hand = hands[0];
      const palm = Math.max(distance(hand[0], hand[9]), 0.02);
      const pinchRatio = distance(hand[4], hand[8]) / palm;
      pinched = pinchRatio < (pinched ? 0.65 : 0.42);
      const pinch = pinched;
      const twoHands = hands.length === 2;
      const spread = twoHands ? distance(centers[0], centers[1]) : 0;
      const result = { gesture: pinch ? '捏合：向下移动降低建筑' : '张手：向上推动建筑生长' };
      if (!previous || previous.count !== hands.length || timestamp - previous.time > 300 || timestamp <= previous.time) {
        history = []; waveUntil = 0;
        zoomSpread = twoHands ? spread : null;
        panX = twoHands ? x : null; panY = twoHands ? y : null;
        previous = { x, y, time: timestamp, count: hands.length };
        if (twoHands) result.gesture = '双手：开合缩放，一起移动平移';
        return result;
      }
      const dt = Math.min((timestamp - previous.time) / 1000, .1);
      if (twoHands) {
        history = []; waveUntil = 0;
        const alpha = 1 - Math.exp(-dt * 14);
        const filteredSpread = zoomSpread + (spread - zoomSpread) * alpha;
        const filteredX = panX + (x - panX) * alpha;
        const filteredY = panY + (y - panY) * alpha;
        const dz = filteredSpread - zoomSpread, dx = filteredX - panX, dy = filteredY - panY;
        if (Math.abs(dz) > .0004) result.zoomDelta = Math.max(-.08, Math.min(.08, dz * 1.7));
        if (Math.hypot(dx, dy) > .0006) result.panDelta = { x: dx, y: dy };
        zoomSpread = filteredSpread; panX = filteredX; panY = filteredY;
        result.gesture = '双手：开合缩放，一起移动平移';
        previous = { x, y, time: timestamp, count: hands.length };
        return result;
      }
      zoomSpread = null; panX = null; panY = null;
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
      previous = { x, y, time: timestamp, count: hands.length };
      return result;
    }
  };
}
