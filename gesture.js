const FINGER_BASES = [5, 9, 13, 17];
const OTHER_POSES = new Set(['Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou']);

// Time in milliseconds and movement in fractions of the camera image.
const ENTRY_SETTLE = 90;
const DIRECTION_PAUSE = 500;
const MIN_GAP_LIMIT = 180;
const MAX_GAP_LIMIT = 625;
const STILL_VERTICAL = 0.011;
const PAUSE_VERTICAL_RANGE = 0.003;
const PAUSE_SPEED = 0.000004;
const SIDEWAYS_TRAVEL = 0.018;
const STROKE_START = 0.018;
const CONFIRM_INTERVAL = 120;
const RETURN_TRAVEL = 0.024;
const RETURN_FRACTION = 0.4;
const HEIGHT_STEP = 0.007;

const clamp = value => Math.max(0, Math.min(1, value));
const vector = (a, b) => [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
const length = direction => Math.hypot(...direction);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hasLandmarks = points => Array.isArray(points) && points.length === 21 &&
  points.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y) &&
    (point.z === undefined || Number.isFinite(point.z)));

function isExtended(hand, base, palmAxis, palmSize) {
  const first = vector(hand[base], hand[base + 1]);
  const second = vector(hand[base + 1], hand[base + 2]);
  const third = vector(hand[base + 2], hand[base + 3]);
  const a = length(first), b = length(second), c = length(third);
  if (Math.min(a, b, c) < 0.035 * palmSize) return false;
  const finger = vector(hand[base], hand[base + 3]);
  const reach = length(finger);
  const middleJoint = dot(first, second) / (a * b);
  const tipJoint = dot(second, third) / (b * c);
  const extension = reach / (a + b + c);
  // A relaxed fingertip can bend a little while the whole finger stays extended.
  const extendedTip = tipJoint >= 0.78 ||
    (middleJoint >= 0.94 && tipJoint >= 0.70 && extension >= 0.94);
  const pinky = base === 17;
  // The little finger can splay farther from the wrist-to-middle-finger axis.
  const alignment = pinky ? 0.52 : 0.60;
  return middleJoint >= 0.76 && extendedTip && extension >= 0.91 &&
    dot(finger, palmAxis) >= alignment * reach * palmSize &&
    reach >= (pinky ? 0.42 : 0.51) * palmSize && reach <= 1.7 * palmSize;
}

function isOpenPalm(result, imageLandmarks) {
  const pose = result.gestures?.[0]?.[0];
  if (pose?.categoryName === 'Open_Palm' && pose.score >= 0.75) return true;
  if ((pose?.categoryName === 'Closed_Fist' && pose.score >= 0.65) ||
      (OTHER_POSES.has(pose?.categoryName) && pose.score >= 0.75)) return false;

  // World landmarks let the same joint-angle test work at any palm rotation.
  const worldLandmarks = result.worldLandmarks?.[0];
  const hand = hasLandmarks(worldLandmarks) ? worldLandmarks : imageLandmarks;
  const axis = vector(hand[0], hand[9]);
  const size = length(axis);
  const width = length(vector(hand[5], hand[17]));
  return size > 0 && width >= 0.25 * size && width <= 1.7 * size &&
    FINGER_BASES.every(base => isExtended(hand, base, axis, size));
}

function palmSample(hand, handedness, time) {
  // The knuckles move around the wrist as a palm turns or changes apparent size.
  const wrist = hand[0];
  return {
    x: wrist.x,
    y: wrist.y,
    scale: length(vector(wrist, hand[9])),
    side: handedness?.score >= 0.8 ? handedness.categoryName : null,
    time
  };
}

function isDiscontinuous(previous, palm, frameInterval) {
  const gap = palm.time - previous.time;
  const expected = frameInterval ?? gap;
  // Preserve slow camera tracks while detecting missing samples on faster ones.
  const gapLimit = Math.min(MAX_GAP_LIMIT, Math.max(MIN_GAP_LIMIT, 2.5 * expected));
  const scaleRatio = palm.scale / previous.scale;
  return gap <= 0 || gap > gapLimit ||
    (previous.side && palm.side && previous.side !== palm.side) ||
    distance(previous, palm) > Math.min(0.22, 0.04 + 0.0012 * gap) ||
    (previous.scale > 0 && palm.scale > 0 && (scaleRatio < 0.7 || scaleRatio > 1.43));
}

function isSideways(from, to) {
  const across = Math.abs(from.x - to.x);
  return across >= SIDEWAYS_TRAVEL && Math.abs(from.y - to.y) < 1.25 * across;
}

function keepsMoving(samples) {
  if (samples.length < 5) return false;
  let previousY = (samples[0].y + samples[1].y) / 2;
  let min = previousY, max = previousY;
  let path = 0, moving = 0;
  // Sustained travel covers most of the window with room for one reversal.
  // Average adjacent wrist positions before measuring it.
  for (let i = 2; i < samples.length; i++) {
    const y = (samples[i - 1].y + samples[i].y) / 2;
    const step = Math.abs(y - previousY);
    path += step;
    if (step >= PAUSE_SPEED * (samples[i].time - samples[i - 1].time)) moving++;
    min = Math.min(min, y);
    max = Math.max(max, y);
    previousY = y;
  }
  const range = max - min;
  return range >= PAUSE_VERTICAL_RANGE &&
    path <= 2 * range + Number.EPSILON && moving * 2 > samples.length - 2;
}

export function createGestureMapper() {
  const recent = [];
  let lastPalm = null;
  let frameInterval = null;
  let still = null;
  let origin = null;
  let lastAdvance = null;
  let direction = 0;
  let peak = 0;
  let credited = 0;

  function beginStroke(palm) {
    origin = palm;
    lastAdvance = palm;
    peak = 0;
    credited = 0;
  }

  function reset() {
    recent.length = 0;
    lastPalm = null;
    frameInterval = null;
    still = null;
    direction = 0;
    beginStroke(null);
  }

  function update(result, now, currentHeight) {
    const hands = result?.landmarks || [];
    if (hands.length !== 1 || !hasLandmarks(hands[0]) ||
        !Number.isFinite(now) || !Number.isFinite(currentHeight)) {
      reset();
      return { state: hands.length > 1 ? 'ambiguous' : 'idle' };
    }
    if (!isOpenPalm(result, hands[0])) {
      reset();
      return { state: 'rest' };
    }

    const palm = palmSample(hands[0], result.handedness?.[0]?.[0], now);
    if (palm.x < 0 || palm.x > 1 || palm.y < 0 || palm.y > 1) {
      reset();
      return { state: 'idle' };
    }
    const previous = lastPalm;
    if (!previous || isDiscontinuous(previous, palm, frameInterval)) {
      reset();
      lastPalm = still = palm;
      return { state: 'ready' };
    }
    palm.side ??= previous.side;
    const elapsed = now - previous.time;
    frameInterval = frameInterval === null ? elapsed : 0.75 * frameInterval + 0.25 * elapsed;
    lastPalm = palm;
    recent.push(palm);
    while (now - recent[0].time > DIRECTION_PAUSE) recent.shift();

    if (Math.abs(still.y - palm.y) > STILL_VERTICAL ||
        Math.abs(still.x - palm.x) > SIDEWAYS_TRAVEL) still = palm;
    const quietFor = now - still.time;
    if (!origin) {
      // Let a hand entering the frame settle before measuring a stroke.
      if (quietFor >= ENTRY_SETTLE) beginStroke(palm);
      return { state: 'ready' };
    }
    // Rearm once per pause. A slow stroke can make steady progress inside
    // the stillness band in either direction.
    if (direction && quietFor >= DIRECTION_PAUSE &&
        now - lastAdvance.time >= DIRECTION_PAUSE && !keepsMoving(recent)) {
      direction = 0;
      beginStroke(palm);
      return { state: 'ready' };
    }

    if (isSideways(lastAdvance, palm)) {
      beginStroke(palm);
      return { state: direction > 0 ? 'lifting' : direction < 0 ? 'lowering' : 'ready' };
    }

    const vertical = origin.y - palm.y;
    const strokeDirection = direction || Math.sign(vertical);
    const travel = strokeDirection * vertical;
    const previousTravel = strokeDirection * (origin.y - previous.y);
    // Nearby camera frames should agree on the start of a stroke.
    // Sparse tracks can travel a substantial distance between observations.
    const needsConfirmation = elapsed <= CONFIRM_INTERVAL;
    const confirmed = !needsConfirmation || previousTravel >= STROKE_START / 2;
    if (!direction) {
      if (travel < STROKE_START + HEIGHT_STEP || !confirmed) return { state: 'ready' };
      direction = strokeDirection;
      lastAdvance = palm;
    }

    const state = direction > 0 ? 'lifting' : 'lowering';
    const returnDistance = Math.max(RETURN_TRAVEL, peak * RETURN_FRACTION);
    if (travel < 0 || peak - travel >= returnDistance) {
      // A real return opens a fresh stroke. A brief retreat near the peak keeps
      // its credited progress so the rebound cannot add it a second time.
      if (peak === 0 || !needsConfirmation || peak - previousTravel >= returnDistance / 2) {
        beginStroke(palm);
      }
      return { state };
    }

    peak = Math.max(peak, travel);
    const progress = Math.max(0, travel - STROKE_START);
    const gain = progress - credited;
    if (gain < HEIGHT_STEP || (!credited && !confirmed)) return { state };
    credited = progress;
    lastAdvance = palm;
    const height = clamp(currentHeight + direction * gain);
    return height === currentHeight ? { state } : { state, height };
  }

  return { reset, update };
}
