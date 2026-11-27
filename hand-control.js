import { createGestureMapper } from './gesture.js';

// Two official GCS addresses serve the same versioned model. Some venue
// networks can reach the bucket hostname while failing DNS for the shared host.
const modelPath = 'gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const modelUrls = [
  'https://mediapipe-models.storage.googleapis.com/' + modelPath,
  'https://storage.googleapis.com/mediapipe-models/' + modelPath
];

const cameraErrors = {
  NotAllowedError: 'Camera permission was declined. You can keep watching or use the sliders.',
  NotFoundError: 'No camera found. Connect one and try again, or use the sliders.',
  NotReadableError: 'Could not read the camera. Check the device or close other apps using it, then try again.'
};

async function downloadModel(signal) {
  let lastError;
  for (const url of modelUrls) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      if (!response.ok) throw new Error('Hand model HTTP ' + response.status);
      const model = new Uint8Array(await response.arrayBuffer());
      if (model.length !== 8_373_440) throw new Error('Incomplete hand model.');
      return model;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const hints = {
  idle: 'Show one or two open hands.',
  ready: 'Lift to grow. Press down to lower.',
  lifting: 'Lift again to grow. Pause to change direction.',
  lowering: 'Press again to lower. Pause to change direction.',
  rest: 'Open your hand and hold it flat.',
  ambiguous: 'Open both hands to move the view.',
  'two-hands': 'Spread or close to zoom. Move together to pan.',
  zooming: 'Zooming the view.',
  panning: 'Panning the view.',
  waving: 'Forest growing.',
  'forest-full': 'Forest is full.',
  'forest-unavailable': 'Forest cover can change in imagined neighborhoods.'
};

export function setupHandControls({ getHeight, getForest, applyGesture }) {
  const button = document.querySelector('#camera');
  const status = document.querySelector('#status');
  const video = document.querySelector('#video');
  const canvas = document.querySelector('#hands');
  const label = document.querySelector('#preview-label');
  const hint = document.querySelector('#hand-hint');
  const hintText = document.querySelector('#hand-hint-text');
  const ctx = canvas.getContext('2d');
  const mapper = createGestureMapper();
  let tracker = null;
  let stream = null;
  let lastVideo = -1;
  let session = null;
  let running = false;
  let feedbackIdle = null;
  let feedbackUntil = 0;

  function showHint(state) {
    if (!hint.hidden && hint.dataset.state === state) return;
    hint.dataset.state = state;
    hint.hidden = false;
    hintText.textContent = hints[state];
    status.textContent = hints[state];
  }

  function reset() {
    mapper.reset();
    feedbackIdle = null;
    if (running) showHint('idle');
  }

  function stop(message = 'Camera is off.') {
    session?.abort();
    session = null;
    running = false;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    reset();
    hint.hidden = true;
    lastVideo = -1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    label.style.display = '';
    button.textContent = 'Start camera';
    status.textContent = message;
  }

  async function handTracker(signal) {
    const { GestureRecognizer, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm');
    const [vision, bytes] = await Promise.all([
      FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'),
      downloadModel(signal)
    ]);
    signal.throwIfAborted();
    const options = {
      baseOptions: {
        modelAssetBuffer: bytes,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2
    };
    try {
      return await GestureRecognizer.createFromOptions(vision, options);
    } catch {
      signal.throwIfAborted();
      options.baseOptions.delegate = 'CPU';
      return GestureRecognizer.createFromOptions(vision, options);
    }
  }

  button.addEventListener('click', async () => {
    if (session) {
      stop(running ? 'Camera is off.' : 'Camera start canceled.');
      return;
    }
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      stop('Camera access is unavailable in this browser. You can use the sliders.');
      return;
    }
    const request = new AbortController();
    const { signal } = request;
    session = request;
    button.textContent = 'Cancel start';
    status.textContent = 'Waiting for camera access…';
    try {
      const acquired = await mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      // The browser permission request can still resolve after the page cancels it.
      if (signal.aborted) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream = acquired;
      const videoTrack = acquired.getVideoTracks()[0];
      const onCameraEnded = () => stop('Camera disconnected. Start it again or use the sliders.');
      if (!videoTrack || videoTrack.readyState === 'ended') {
        onCameraEnded();
        return;
      }
      videoTrack.addEventListener('ended', onCameraEnded, { once: true, signal });
      status.textContent = 'Starting hand tracking…';
      // On a restart the existing tracker can process the new local video.
      if (!tracker) {
        const ready = await handTracker(signal);
        if (signal.aborted) { ready.close(); return; }
        tracker = ready;
      }
      video.srcObject = stream;
      await video.play();
      if (signal.aborted) return;
      running = true;
      label.style.display = 'none';
      button.textContent = 'Stop camera';
      showHint('idle');
    } catch (error) {
      if (signal.aborted) return;
      stop(stream
        ? 'Could not start hand tracking. Check your connection and try again, or use the sliders.'
        : cameraErrors[error.name] ?? 'Could not access the camera. Try again or use the sliders.');
    }
  });
  window.addEventListener('pagehide', () => stop());

  function track(now) {
    if (!running || video.readyState < 2 || video.currentTime === lastVideo) return;
    lastVideo = video.currentTime;
    try {
      const result = tracker.recognizeForVideo(video, now);
      const hands = result.landmarks;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#c9f7cf';
      for (const hand of hands) for (const point of hand) {
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const mapped = mapper.update(result, now, getHeight(), getForest());
      const state = applyGesture(mapped, now) ?? mapped.state;
      // Camera steps and completed waves can report movement on a single frame.
      if (mapped.state === 'waving') {
        feedbackIdle = 'ready';
        feedbackUntil = now + 500;
      } else if (state === 'zooming' || state === 'panning') {
        feedbackIdle = 'two-hands';
        feedbackUntil = now + 250;
      } else if (state === feedbackIdle && now < feedbackUntil) {
        return;
      } else {
        feedbackIdle = null;
      }
      showHint(state);
    } catch (error) {
      console.error(error);
      stop('Tracking stopped. Start the camera again to retry.');
      const failed = tracker;
      tracker = null;
      failed?.close();
    }
  }
  return { reset, track };
}
