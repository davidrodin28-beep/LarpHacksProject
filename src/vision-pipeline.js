import { MODEL_URLS, VISION_BUNDLE_URL, VISION_WASM_URL } from './config.js';

export class VisionPipeline {
  constructor() {
    this.pose = null;
    this.hands = null;
    this.face = null;
    this.initializing = null;
    this.lastHandsAt = -Infinity;
    this.lastFaceAt = -Infinity;
    this.cachedHands = null;
    this.cachedFace = null;
  }

  get ready() {
    return Boolean(this.pose && this.hands && this.face);
  }

  async initialize() {
    if (this.ready) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.#createTrackers();
    try {
      await this.initializing;
    } catch (error) {
      this.close();
      throw error;
    } finally {
      this.initializing = null;
    }
  }

  async #createTrackers() {
    const Vision = await import(VISION_BUNDLE_URL);
    const files = await Vision.FilesetResolver.forVisionTasks(VISION_WASM_URL);
    this.pose = await Vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URLS.pose },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.hands = await Vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URLS.hands },
      runningMode: 'VIDEO',
      numHands: 4,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    this.face = await Vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URLS.face },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  detect(video, timestamp) {
    if (!this.ready) throw new Error('Vision models are not initialized.');
    const pose = this.pose.detectForVideo(video, timestamp);
    if (timestamp - this.lastHandsAt >= 33) {
      this.cachedHands = this.hands.detectForVideo(video, timestamp);
      this.lastHandsAt = timestamp;
    }
    if (timestamp - this.lastFaceAt >= 150) {
      this.cachedFace = this.face.detectForVideo(video, timestamp);
      this.lastFaceAt = timestamp;
    }
    return { pose, hands: this.cachedHands, face: this.cachedFace };
  }

  close() {
    this.pose?.close();
    this.hands?.close();
    this.face?.close();
    this.pose = this.hands = this.face = null;
  }
}
