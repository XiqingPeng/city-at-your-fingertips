import * as THREE from 'three';
import { createGestureMapper } from './gesture.js';

// Two official GCS addresses serve the same versioned model. Some venue
// networks can reach the bucket hostname while failing DNS for the shared host.
const modelPath = 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const modelUrls = [
  'https://mediapipe-models.storage.googleapis.com/' + modelPath,
  'https://storage.googleapis.com/mediapipe-models/' + modelPath
];

async function downloadModel(signal) {
  let lastError;
  for (const url of modelUrls) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      if (!response.ok) throw new Error('Hand model HTTP ' + response.status);
      const model = new Uint8Array(await response.arrayBuffer());
      if (model.length !== 7_819_105) throw new Error('Incomplete hand model.');
      return model;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function setupHandControls({ camera, controls, target, setTarget, onHands }) {
  const button = document.querySelector('#camera');
  const status = document.querySelector('#status');
  const video = document.querySelector('#video');
  const canvas = document.querySelector('#hands');
  const label = document.querySelector('#preview-label');
  const ctx = canvas.getContext('2d');
  const mapper = createGestureMapper();
  let tracker = null;
  let stream = null;
  let lastVideo = -1;
  let session = 0;
  let startup = null;

  function stop(message = 'Camera is off.') {
    session++;
    startup?.abort();
    startup = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    mapper.reset();
    lastVideo = -1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    label.style.display = '';
    button.textContent = 'Start camera';
    button.disabled = false;
    status.textContent = message;
  }

  async function handTracker(signal) {
    const { HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm');
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
      return await HandLandmarker.createFromOptions(vision, options);
    } catch {
      signal.throwIfAborted();
      options.baseOptions.delegate = 'CPU';
      return HandLandmarker.createFromOptions(vision, options);
    }
  }

  button.addEventListener('click', async () => {
    if (stream) { stop(); return; }
    const id = ++session;
    const request = new AbortController();
    startup = request;
    button.disabled = true;
    try {
      status.textContent = 'Waiting for camera access…';
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (id !== session) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      button.disabled = false;
      button.textContent = 'Cancel start';
      status.textContent = 'Starting hand tracking…';
      // On a restart the existing tracker can process the new local video.
      if (!tracker) {
        const ready = await handTracker(request.signal);
        if (id !== session) { ready.close(); return; }
        tracker = ready;
      }
      if (id !== session) return;
      video.srcObject = stream;
      await video.play();
      if (id !== session) return;
      mapper.reset();
      lastVideo = -1;
      label.style.display = 'none';
      button.textContent = 'Stop camera';
      status.textContent = 'Show your hands to the camera.';
    } catch (error) {
      if (id !== session) return;
      stop(error.name === 'NotAllowedError'
        ? 'Camera permission was declined. You can keep watching or use the sliders.'
        : 'Could not start hand tracking. Check camera access and your connection.');
    } finally {
      if (id === session) { startup = null; button.disabled = false; }
    }
  });
  window.addEventListener('pagehide', () => stop());

  const offset = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
  const next = new THREE.Vector3(), shift = new THREE.Vector3();

  function track(now) {
    if (!stream || !tracker || video.readyState < 2 || video.currentTime === lastVideo) return;
    lastVideo = video.currentTime;
    try {
      const hands = tracker.detectForVideo(video, now).landmarks;
      if (hands.length) onHands(now);
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
      const mapped = mapper.update(hands, now, target);
      if (status.textContent !== mapped.gesture) status.textContent = mapped.gesture;
      for (const key of ['height', 'forest', 'density']) if (key in mapped) setTarget(key, mapped[key]);
      if (mapped.zoomDelta !== undefined) {
        offset.copy(camera.position).sub(controls.target);
        const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(-mapped.zoomDelta * 1.8), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(distance));
      }
      if (mapped.panDelta) {
        const scale = camera.position.distanceTo(controls.target) * 1.2;
        right.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(mapped.panDelta.x * scale);
        up.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(mapped.panDelta.y * scale);
        shift.copy(right).add(up);
        next.copy(controls.target).add(shift);
        next.x = THREE.MathUtils.clamp(next.x, -25, 25);
        next.y = THREE.MathUtils.clamp(next.y, -10, 18);
        next.z = THREE.MathUtils.clamp(next.z, -25, 25);
        shift.copy(next).sub(controls.target);
        controls.target.add(shift);
        camera.position.add(shift);
      }
    } catch (error) {
      console.error(error);
      stop('Tracking stopped. Start the camera again to retry.');
    }
  }
  return track;
}
