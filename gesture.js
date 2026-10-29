// State is deliberately separate from rendering so a learned temporal model can
// later replace this mapping without changing the scene or camera pipeline.
const clamp = value => Math.max(0, Math.min(1, value));
export function createGestureMapper() {
  let previous = null, energy = 0;
  return {
    reset() { previous = null; energy = 0; },
    update(hands, timestamp, forest) {
      if (!hands.length) { previous = null; energy = 0; return {}; }
      const centers = hands.map(hand => hand[9]);
      const y = centers.reduce((sum, point) => sum + point.y, 0) / centers.length;
      const result = { height: clamp((0.8 - y) / 0.6) };
      if (centers.length === 2) {
        const distance = Math.hypot(centers[0].x - centers[1].x, centers[0].y - centers[1].y);
        result.density = clamp(1 - (distance - 0.12) / 0.55);
      }
      // Average positions when both hands are present to avoid a false wave
      // when MediaPipe changes their ordering between frames.
      const x = centers.reduce((sum, point) => sum + point.x, 0) / centers.length;
      if (previous && previous.count === centers.length) {
        const dt = (timestamp - previous.timestamp) / 1000;
        if (dt > 0 && dt < 0.25) {
          const speed = Math.min(Math.abs(x - previous.x) / dt, 3);
          energy += (speed - energy) * (1 - Math.exp(-dt * 8));
          if (energy > 0.45) result.forest = clamp(forest + dt * 0.11);
        } else energy = 0;
      } else energy = 0;
      previous = { x, timestamp, count: centers.length };
      return result;
    }
  };
}
