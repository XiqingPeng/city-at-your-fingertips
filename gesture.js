const FINGER_BASES = [5, 9, 13, 17];
const OTHER_POSES = new Set(['Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou']);

// Time in milliseconds and movement in fractions of the camera image.
const ENTRY_SETTLE = 90;
const DIRECTION_PAUSE = 500;
const MIN_GAP_LIMIT = 180;
const MAX_GAP_LIMIT = 625;
const STILL_VERTICAL = 0.011;
const PAUSE_VERTICAL_RANGE = 0.003;
const PAUSE_MOTION_RANGE = 0.010;
const PAUSE_SPEED = 0.000004;
const SIDEWAYS_TRAVEL = 0.018;
const STROKE_START = 0.018;
const CONFIRM_INTERVAL = 120;
const LIFT_START = 0.013;
const LIFT_RETURN = 0.009;
const LIFT_STEP = 0.0035;
const RETURN_TRAVEL = 0.024;
const RETURN_FRACTION = 0.4;
const HEIGHT_STEP = 0.007;
const PAIR_MIN_SPREAD = 0.06;
const PAIR_MOTION_WINDOW = 280;
const PAN_STEP = 0.009;
const ZOOM_STEP = 0.010;
const ZOOM_HAND_TRAVEL = 0.004;
const WAVE_TRAVEL = 0.06;
const WAVE_MAX_VERTICAL = 0.07;
const WAVE_VERTICAL_RATIO = 0.65;
const WAVE_WINDOW = 800;
const WAVE_MIN_LEG_TIME = 60;
const WAVE_COOLDOWN = 650;
const FOREST_STEP = 0.075;

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

function hasOpenPalmGeometry(hand) {
  const axis = vector(hand[0], hand[9]);
  const size = length(axis);
  const width = length(vector(hand[5], hand[17]));
  return size > 0 && width >= 0.25 * size && width <= 1.7 * size &&
    FINGER_BASES.every(base => isExtended(hand, base, axis, size));
}

function isIncompatiblePose(pose) {
  return (pose?.categoryName === 'Closed_Fist' && pose.score >= 0.65) ||
    (OTHER_POSES.has(pose?.categoryName) && pose.score >= 0.75);
}

function isOpenPalm(result, imageLandmarks, index) {
  const pose = result.gestures?.[index]?.[0];
  const agrees = pose?.categoryName === 'Open_Palm';
  if (agrees && pose.score >= 0.75) return true;
  if (isIncompatiblePose(pose)) return false;

  const worldLandmarks = result.worldLandmarks?.[index];
  if (!hasLandmarks(worldLandmarks)) return hasOpenPalmGeometry(imageLandmarks);
  if (hasOpenPalmGeometry(worldLandmarks)) return true;
  // World landmarks can distort a finger during sideways motion. A matching
  // classification and straight fingers in the image can corroborate the pose.
  return agrees && pose.score >= 0.55 && hasOpenPalmGeometry(imageLandmarks);
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

function inFrame(palm) {
  return palm.x >= 0 && palm.x <= 1 && palm.y >= 0 && palm.y <= 1;
}

function isSideways(from, to) {
  const across = Math.abs(from.x - to.x);
  // Equal distances in image pixels have different normalized x/y lengths.
  return across >= SIDEWAYS_TRAVEL && Math.abs(from.y - to.y) < 1.6 * across;
}

function matchHands(previous, palms, interval) {
  const [first, second] = previous;
  const [a, b] = palms;
  const natural = !isDiscontinuous(first, a, interval) && !isDiscontinuous(second, b, interval);
  const reversed = !isDiscontinuous(first, b, interval) && !isDiscontinuous(second, a, interval);
  if (!natural && !reversed) return null;
  if (!natural || (reversed && distance(first, b) + distance(second, a) <
                               distance(first, a) + distance(second, b))) return [b, a];
  return palms;
}

function pairMovement(origin, palms) {
  const [first, second] = origin;
  const [a, b] = palms;
  const ax = a.x - first.x, ay = a.y - first.y;
  const bx = b.x - second.x, by = b.y - second.y;
  const travelA = Math.hypot(ax, ay), travelB = Math.hypot(bx, by);
  const x = (ax + bx) / 2, y = (ay + by) / 2;
  const centerTravel = Math.hypot(x, y);
  const together = Math.min(travelA, travelB) >= 0.35 * Math.max(travelA, travelB) &&
    ax * bx + ay * by >= 0.5 * travelA * travelB;
  if (together) {
    return centerTravel >= PAN_STEP ? { state: 'panning', panDelta: { x, y } } : null;
  }

  // Both wrists must move in opposite directions along the line between
  // them. A lagging hand or rotation alone does not indicate a zoom.
  const baseline = distance(first, second);
  const spanX = (second.x - first.x) / baseline;
  const spanY = (second.y - first.y) / baseline;
  const radialA = ax * spanX + ay * spanY;
  const radialB = bx * spanX + by * spanY;
  if (radialA * radialB >= 0 ||
      Math.abs(radialA) < Math.max(ZOOM_HAND_TRAVEL, 0.7 * travelA) ||
      Math.abs(radialB) < Math.max(ZOOM_HAND_TRAVEL, 0.7 * travelB)) return null;

  const spread = distance(a, b) - baseline;
  if (Math.abs(spread) < ZOOM_STEP || Math.sign(spread) !== Math.sign(radialB - radialA)) return null;
  const zoomDelta = Math.max(-0.08, Math.min(0.08, 1.7 * spread));
  return { state: 'zooming', zoomDelta };
}

function entryLiftOrigin(samples) {
  // A palm already pumping at entry can establish its baseline on a return
  // followed by the start of another lift.
  if (samples.length < 4) return null;
  const bottom = samples.at(-2);
  const rising = samples.at(-1);
  const ascent = bottom.y - rising.y;
  if (rising.time - samples[0].time < ENTRY_SETTLE || ascent < LIFT_START / 6 ||
      ascent < 1.6 * Math.abs(rising.x - bottom.x)) return null;
  const returned = samples.slice(-6, -2).some(sample => {
    const descent = bottom.y - sample.y;
    return descent >= LIFT_RETURN && descent < 2 * STROKE_START &&
      descent > 1.6 * Math.abs(bottom.x - sample.x);
  });
  return returned ? bottom : null;
}

function keepsMoving(samples) {
  if (samples.length < 5) return false;
  let previousY = (samples[0].y + samples[1].y) / 2;
  let min = previousY, max = previousY;
  let rawMin = Math.min(samples[0].y, samples[1].y);
  let rawMax = Math.max(samples[0].y, samples[1].y);
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
    rawMin = Math.min(rawMin, samples[i].y);
    rawMax = Math.max(rawMax, samples[i].y);
    previousY = y;
  }
  const range = max - min;
  return rawMax - rawMin >= PAUSE_MOTION_RANGE ||
    (range >= PAUSE_VERTICAL_RANGE &&
     path <= 2 * range + Number.EPSILON && moving * 2 > samples.length - 2);
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
  let pair = null;
  let wave = null;
  let lastWave = -Infinity;

  function beginStroke(palm) {
    origin = palm;
    lastAdvance = palm;
    peak = 0;
    credited = 0;
  }

  function startWave(palm) {
    wave = {
      origin: palm,
      peak: palm,
      direction: 0,
      startedAt: palm.time,
      minY: palm.y,
      maxY: palm.y
    };
  }

  function resetSingle() {
    recent.length = 0;
    lastPalm = null;
    frameInterval = null;
    still = null;
    direction = 0;
    wave = null;
    beginStroke(null);
  }

  function reset() {
    resetSingle();
    pair = null;
    lastWave = -Infinity;
  }

  function completesWave(palm, previous) {
    wave.minY = Math.min(wave.minY, palm.y);
    wave.maxY = Math.max(wave.maxY, palm.y);
    const onCooldown = palm.time >= lastWave && palm.time - lastWave < WAVE_COOLDOWN;
    const vertical = wave.maxY - wave.minY;
    if (onCooldown || vertical > WAVE_MAX_VERTICAL ||
        (wave.direction && palm.time - wave.startedAt > WAVE_WINDOW)) {
      startWave(palm);
      return false;
    }

    const across = palm.x - wave.origin.x;
    if (!wave.direction) {
      if (Math.abs(across) < SIDEWAYS_TRAVEL) return false;
      if (Math.abs(palm.y - wave.origin.y) > Math.abs(across) * WAVE_VERTICAL_RATIO) {
        startWave(palm);
        return false;
      }
      wave.direction = Math.sign(across);
      wave.startedAt = previous.time;
    }

    const travel = wave.direction * across;
    const peak = wave.direction * (wave.peak.x - wave.origin.x);
    if (travel > peak) {
      wave.peak = palm;
      return false;
    }
    if (peak < WAVE_TRAVEL || wave.peak.time - wave.startedAt < WAVE_MIN_LEG_TIME) {
      if (travel < -SIDEWAYS_TRAVEL) startWave(palm);
      return false;
    }
    const back = peak - travel;
    if (back < WAVE_TRAVEL || palm.time - wave.peak.time < WAVE_MIN_LEG_TIME ||
        vertical > WAVE_VERTICAL_RATIO * Math.min(peak, back)) return false;
    lastWave = palm.time;
    startWave(palm);
    return true;
  }

  function updatePair(palms, now) {
    if (lastPalm) resetSingle();
    if (distance(palms[0], palms[1]) < PAIR_MIN_SPREAD) {
      pair = null;
      return { state: 'two-hands' };
    }
    const matched = pair && matchHands(pair.previous, palms, pair.interval);
    if (!matched) {
      pair = { previous: palms, origin: null, since: now, interval: null };
      return { state: 'two-hands' };
    }

    const elapsed = now - pair.previous[0].time;
    for (let i = 0; i < matched.length; i++) matched[i].side ??= pair.previous[i].side;
    pair.previous = matched;
    pair.interval = pair.interval === null ? elapsed : 0.75 * pair.interval + 0.25 * elapsed;
    if (now - pair.since < ENTRY_SETTLE) return { state: 'two-hands' };
    const motionWindow = Math.max(PAIR_MOTION_WINDOW, 2 * pair.interval);
    if (!pair.origin || now - pair.origin[0].time > motionWindow) {
      pair.origin = matched;
      return { state: 'two-hands' };
    }
    const movement = pairMovement(pair.origin, matched);
    if (movement) pair.origin = matched;
    return movement ?? { state: 'two-hands' };
  }

  function updateSingle(palm, now, currentHeight, currentForest) {
    const previous = lastPalm;
    if (!previous || isDiscontinuous(previous, palm, frameInterval)) {
      resetSingle();
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
    // Before the first committed stroke, a short turn can reveal a better
    // baseline if the hand was already moving when it entered the frame.
    const entryTurn = direction ? null : entryLiftOrigin(recent);
    if (!origin || (entryTurn && entryTurn.y > origin.y)) {
      const anchor = entryTurn ?? (quietFor >= ENTRY_SETTLE ? palm : null);
      if (anchor) {
        beginStroke(anchor);
        startWave(anchor);
      }
      return { state: 'ready' };
    }
    if (completesWave(palm, previous)) {
      beginStroke(palm);
      if (!Number.isFinite(currentForest)) return { state: 'waving' };
      const forest = clamp(currentForest + FOREST_STEP);
      return forest === currentForest ? { state: 'waving' } : { state: 'waving', forest };
    }
    // Rearm once per pause. A slow stroke can make steady progress inside
    // the stillness band in either direction.
    if (direction && quietFor >= DIRECTION_PAUSE && !keepsMoving(recent)) {
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
    const lifting = strokeDirection > 0;
    const travel = strokeDirection * vertical;
    const previousTravel = strokeDirection * (origin.y - previous.y);
    const needsConfirmation = elapsed <= CONFIRM_INTERVAL;
    const fullStroke = travel >= STROKE_START + HEIGHT_STEP;
    const small = lifting && travel < 2 * STROKE_START;
    // A sudden extra jump needs another sample, even during a lift.
    const earlier = recent.at(-3);
    const precedingRise = earlier ? earlier.y - previous.y : 0;
    const jump = lifting && needsConfirmation &&
      travel - previousTravel > Math.max(STROKE_START + HEIGHT_STEP, 2.5 * precedingRise);
    // Small upstrokes need two agreeing samples even on a slow camera.
    const confirmed = !jump && ((!needsConfirmation && fullStroke) ||
      previousTravel >= (small ? LIFT_START / 3 : STROKE_START / 2));
    // Short upward travel must be clearly vertical so a wave or a
    // diagonal still can't start a height change.
    const shortLift = lifting && travel >= LIFT_START &&
      travel >= 1.6 * Math.abs(palm.x - origin.x);
    if (!direction) {
      if ((!fullStroke && !shortLift) || !confirmed) return { state: 'ready' };
      direction = strokeDirection;
      lastAdvance = palm;
    }

    const state = direction > 0 ? 'lifting' : 'lowering';
    const returnDistance = Math.max(lifting ? LIFT_RETURN : RETURN_TRAVEL, peak * RETURN_FRACTION);
    const returned = peak - travel;
    const previousReturn = peak - previousTravel;
    // On a short return, the turn may fall between two camera frames.
    const recovering = lifting && peak < 2 * STROKE_START &&
      previousReturn >= returnDistance && returned >= returnDistance / 3;
    if (travel < 0 || returned >= returnDistance || recovering) {
      // Require evidence of the return in two nearby samples, then rebase
      // on whichever is closer to the bottom of the stroke.
      if (peak === 0 || !needsConfirmation || previousReturn >= returnDistance / 2) {
        beginStroke(recovering && previousTravel < travel ? previous : palm);
      }
      return { state };
    }

    if (lifting && !confirmed) return { state };
    // Small lifts still contribute before covering a full stroke.
    const progress = small ? travel * 0.5 : Math.max(0, travel - STROKE_START);
    const gain = progress - credited;
    peak = Math.max(peak, travel);
    if (gain < (small ? LIFT_STEP : HEIGHT_STEP) ||
        (!credited && (!confirmed || (!fullStroke && !shortLift)))) return { state };
    credited = progress;
    lastAdvance = palm;
    startWave(palm);
    const height = clamp(currentHeight + direction * gain);
    return height === currentHeight ? { state } : { state, height };
  }

  function update(result, now, currentHeight, currentForest) {
    const hands = result?.landmarks ?? [];
    if (hands.length === 2 && Number.isFinite(now) &&
        hands.every((hand, i) => hasLandmarks(hand) && isOpenPalm(result, hand, i))) {
      const palms = hands.map((hand, i) => palmSample(hand, result.handedness?.[i]?.[0], now));
      if (palms.every(inFrame)) return updatePair(palms, now);
    }

    pair = null;
    if (hands.length !== 1 || !hasLandmarks(hands[0]) ||
        !Number.isFinite(now) || !Number.isFinite(currentHeight)) {
      resetSingle();
      return { state: hands.length > 1 ? 'ambiguous' : 'idle' };
    }
    const palm = palmSample(hands[0], result.handedness?.[0]?.[0], now);
    if (!inFrame(palm)) {
      resetSingle();
      return { state: 'idle' };
    }
    if (!isOpenPalm(result, hands[0], 0)) {
      // A brief pose flicker can interrupt a flat palm at the top of a lift.
      // Keep its baseline without acting on the unconfirmed sample.
      if (!origin || now - lastPalm.time > CONFIRM_INTERVAL ||
          isIncompatiblePose(result.gestures?.[0]?.[0]) ||
          isDiscontinuous(lastPalm, palm, frameInterval)) resetSingle();
      return { state: 'rest' };
    }
    return updateSingle(palm, now, currentHeight, currentForest);
  }

  return { reset, update };
}
