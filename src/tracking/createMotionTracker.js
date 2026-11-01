import { CameraSource } from '../camera-source.js';
import { VisionPipeline } from '../vision-pipeline.js';
import { HandEnrollment } from '../hand-enrollment.js';
import { OverlayRenderer } from '../overlay-renderer.js';
import { MotionMeter } from '../motion-meter.js';
import { MovementCounter } from '../movement-counter.js';
import { SportTracker } from '../sport-tracker.js';
import { INFERENCE_INTERVAL_MS } from '../config.js';

// Integration boundary: UI supplies elements and receives low-frequency status updates.
// Detection, enrollment, drawing, motion measurement, and counting use the team's modules.
export function createMotionTracker({ video, canvas, stage, onStatus, onError }, dependencies = {}) {
  const Camera = dependencies.CameraSource || CameraSource;
  const Vision = dependencies.VisionPipeline || VisionPipeline;
  const Enrollment = dependencies.HandEnrollment || HandEnrollment;
  const Renderer = dependencies.OverlayRenderer || OverlayRenderer;
  const Meter = dependencies.MotionMeter || MotionMeter;
  const Counter = dependencies.MovementCounter || MovementCounter;
  const Sport = dependencies.SportTracker || SportTracker;
  const selector = document.createElement('select');
  const renderer = new Renderer(video, canvas);
  const enrollment = new Enrollment();
  const motion = new Meter();
  const counter = new Counter();
  const sport = new Sport();
  let session = null;
  let frame = 0;
  let mirrored = true;
  let paused = false;
  let threshold = 32;
  let disposed = false;
  let lastInference = 0;
  let lastVideoTime = -1;
  let lastPublish = 0;
  let startedAt = 0;
  let results = { pose: null, hands: null, face: null };
  let sample = { level: 0, peak: 0, history: [] };

  function publish() {
    onStatus?.({
      phase: !session ? 'off' : !session.ready ? 'loading' : enrollment.calibrating ? 'setup' : paused ? 'paused' : 'tracking',
      instruction: enrollment.calibrating ? enrollment.statusMessage : '',
      paused,
      canPause: !enrollment.calibrating,
      metrics: { ...sample, counts: { ...counter.counts }, sport: sport.metrics, sportExplanation: sport.explanation, duration: Date.now() - startedAt },
    });
  }

  function resize() {
    renderer.resize(stage);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  function stop() {
    const previous = session;
    session = null;
    cancelAnimationFrame(frame);
    frame = 0;
    if (previous) {
      previous.camera.stop();
      video.srcObject = null;
      // initialize() may still be creating models; its own continuation closes them.
      if (previous.ready) previous.vision.close();
    }
    paused = false;
    enrollment.reset();
    counter.resetGesture();
    renderer.clear();
  }

  function loop(current) {
    if (session !== current || !current.ready) return;
    try {
      if (video.readyState >= 2) {
        const now = performance.now();
        if (!paused) {
          if (now - lastInference >= INFERENCE_INTERVAL_MS && video.currentTime !== lastVideoTime) {
            lastInference = now;
            lastVideoTime = video.currentTime;
            results = current.vision.detect(video, now);
            if (enrollment.calibrating) {
              enrollment.observe(results.hands, now);
              if (enrollment.autoReady(now) && enrollment.confirm()) counter.resetGesture();
            } else {
              const hands = enrollment.visibleHands(results.hands, results.pose);
              const aspect = video.videoWidth / video.videoHeight;
              counter.sample(results.pose, hands, now, aspect);
              sport.sample(results.pose, now, aspect);
            }
          }
          sample = motion.sample(video, threshold);
        }
        renderer.render({
          poseResult: results.pose,
          faceResult: results.face,
          handOverlays: enrollment.visibleHands(results.hands, results.pose),
          selectedSides: enrollment.selectedSides,
          mirrored,
        });
        if (now - lastPublish >= 250) {
          lastPublish = now;
          publish();
        }
      }
      frame = requestAnimationFrame(() => loop(current));
    } catch (error) {
      stop();
      onError?.(error);
    }
  }

  async function start() {
    if (disposed) return false;
    stop();
    const sourceVideo = document.createElement('video');
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    const current = { camera: new Camera(sourceVideo, selector), vision: new Vision(), ready: false };
    session = current;
    onStatus?.({ phase: 'loading', instruction: 'Opening camera…' });
    try {
      await current.camera.start();
      if (session !== current) {
        current.camera.stop();
        return false;
      }
      video.srcObject = sourceVideo.srcObject;
      await video.play();
      if (session !== current) return false;
      // Draw the preview while models download, without passing frames through React.
      resize();
      renderer.render({ poseResult: null, faceResult: null, handOverlays: [], selectedSides: [], mirrored });
      onStatus?.({ phase: 'loading', instruction: 'Loading tracking models…' });
      await current.vision.initialize();
      if (session !== current) {
        current.vision.close();
        return false;
      }
      current.ready = true;
      lastInference = lastPublish = 0;
      lastVideoTime = -1;
      results = { pose: null, hands: null, face: null };
      motion.reset();
      counter.reset();
      sport.reset();
      enrollment.begin();
      startedAt = Date.now();
      publish();
      loop(current);
      return true;
    } catch (error) {
      current.vision.close();
      // A superseded attempt must never stop the newer camera session.
      if (session === current) {
        stop();
        throw error;
      }
      return false;
    }
  }

  function visibilityChanged() {
    if (document.hidden) motion.resetPreviousFrame?.();
  }
  document.addEventListener('visibilitychange', visibilityChanged);

  return {
    start,
    stop,
    mirror(value) {
      mirrored = value;
      canvas.style.transform = value ? 'scaleX(-1)' : 'none';
    },
    pause() {
      if (!session?.ready || enrollment.calibrating) return;
      paused = !paused;
      counter.resetGesture();
      publish();
    },
    setThreshold(value) { threshold = value; },
    setSport(value) { sport.setSport(value); publish(); },
    setStance(value) { sport.setStance(value); publish(); },
    setHandCount(value) {
      enrollment.expectedHands = Number(value) === 1 ? 1 : 2;
      if (session?.ready) {
        enrollment.begin();
        counter.resetGesture();
        publish();
      }
    },
    async snapshot() {
      if (!session?.ready || video.readyState < 2) throw new Error('Wait for tracking to finish loading before saving.');
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      const context = output.getContext('2d');
      if (mirrored) {
        context.translate(output.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(canvas, 0, 0);
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not save this frame. Please try again.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stillwatch-${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    dispose() {
      disposed = true;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
}
