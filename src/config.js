// sportgen (AI sport inventor) API, a separate Render web service (see render.yaml: stillwatch-ai / sportgen/).
// Priority: <meta name="sportgen-api"> baked in by scripts/build_static.py from SPORTGEN_API_URL -> the production
// service URL -> localhost only when the page itself is served from localhost.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const PRODUCTION_SPORTGEN_API_URL = 'https://sportpau.onrender.com';
export const SPORTGEN_API_URL = (() => {
  if (typeof document === 'undefined') return PRODUCTION_SPORTGEN_API_URL;
  const meta = document.querySelector('meta[name="sportgen-api"]')?.content?.trim();
  if (meta) return meta.replace(/\/$/, '');
  return LOCAL_HOSTS.has(location.hostname) ? 'http://127.0.0.1:8011' : PRODUCTION_SPORTGEN_API_URL;
})();

export const INFERENCE_INTERVAL_MS = 33;
export const MOTION_FRAME_SIZE = { width: 320, height: 180 };
export const MOTION_SAMPLE_STEP = 16;

export const MEDIAPIPE_VERSION = '0.10.32';
export const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
export const VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const MODEL_URLS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};
