// sportgen (AI sport inventor) API. Flask injects the deployed URL via <meta name="sportgen-api">; local default below.
export const SPORTGEN_API_URL = (typeof document !== 'undefined' && document.querySelector('meta[name="sportgen-api"]')?.content) || 'http://localhost:8011';

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
