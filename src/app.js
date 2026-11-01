import { CameraSource } from './camera-source.js';
import { HandEnrollment } from './hand-enrollment.js';
import { INFERENCE_INTERVAL_MS } from './config.js';
import { MovementCounter } from './movement-counter.js';
import { MotionMeter } from './motion-meter.js';
import { OverlayRenderer } from './overlay-renderer.js';
import { VisionPipeline } from './vision-pipeline.js';

const $ = (id) => document.getElementById(id);
const ui = {
  stage: $('stage'),
  video: $('video'),
  canvas: $('view'),
  cameraSelect: $('cameraSelect'),
  placeholder: $('placeholder'),
  calibrationPanel: $('calibrationPanel'),
  calibrationStatus: $('calibrationStatus'),
  handCount: $('handCount'),
  handsStatus: $('handsStatus'),
  startButton: $('startBtn'),
  pauseButton: $('pauseBtn'),
  snapshotButton: $('snapshotBtn'),
  liveBadge: $('liveBadge'),
  liveText: $('liveText'),
  resolution: $('resolution'),
  motionValue: $('motionValue'),
  stageMotion: $('stageMotion'),
  activityValue: $('activityValue'),
  durationValue: $('durationValue'),
  peakValue: $('peakValue'),
  sensitivity: $('sensitivity'),
  sensitivityLabel: $('sensitivityLabel'),
  graph: $('graph'),
  arms: $('armsCount'),
  opens: $('opensCount'),
  closes: $('closesCount'),
  tilts: $('tiltsCount'),
  slips: $('slipsCount'),
  jabs: $('jabsCount'),
  crosses: $('crossesCount'),
  combos: $('combosCount'),
  stance: $('stance'),
  comboStatus: $('comboStatus'),
  slipFeedback: $('slipFeedback'),
  slipStatus: $('slipStatus'),
  movementStatus: $('movementStatus'),
  toast: $('toast'),
};

const camera = new CameraSource(ui.video, ui.cameraSelect);
const vision = new VisionPipeline();
const enrollment = new HandEnrollment();
const motion = new MotionMeter();
const movementCounter = new MovementCounter();
const renderer = new OverlayRenderer(ui.video, ui.canvas);
const graphBars = [];
let handOverlays = [];
let lastHandObservation = null;

let running = false;
let paused = false;
let animationFrame = 0;
let lastInference = 0;
let lastVideoTime = -1;
let sessionStartedAt = 0;
let toastTimeout = 0;
let mirrored = true;
let results = { pose: null, hands: null, face: null };

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.remove('show'), 2600);
}

function setCameraStatus(isActive, label = isActive ? 'MOTION TRACKING' : 'CAMERA OFFLINE') {
  ui.liveBadge.classList.toggle('active', isActive);
  ui.liveText.textContent = label;
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function initializeHistoryGraph() {
  ui.graph.replaceChildren();
  for (let index = 0; index < 45; index += 1) {
    const bar = document.createElement('i');
    bar.className = 'bar';
    ui.graph.append(bar);
    graphBars.push(bar);
  }
}

function updateMetrics(sample) {
  const level = sample.level;
  ui.motionValue.innerHTML = `${level.toFixed(1)}<small>%</small>`;
  ui.stageMotion.textContent = `${level.toFixed(1)}%`;
  ui.peakValue.innerHTML = `${sample.peak.toFixed(1)}<small>%</small>`;
  ui.activityValue.textContent = level > 4 ? 'Moving' : level > 1.1 ? 'Low' : 'Idle';
  ui.activityValue.style.color = level > 4 ? 'var(--lime)' : 'var(--text)';
  sample.history.forEach((value, index) => {
    graphBars[index].style.height = `${Math.max(3, Math.min(56, value * 2.4))}px`;
    graphBars[index].classList.toggle('hot', value > 4);
  });
}

function updateCalibrationStatus() {
  ui.calibrationStatus.textContent = enrollment.statusMessage;
  if (enrollment.autoReady(performance.now())) finishSetup();
}

function drawFrame() {
  renderer.render({
    poseResult: results.pose,
    faceResult: results.face,
    handOverlays,
    selectedSides: enrollment.selectedSides,
    mirrored,
  });
}

function loop() {
  if (!running) return;
  animationFrame = requestAnimationFrame(loop);
  if (ui.video.readyState < 2) return;

  if (!paused) {
    const now = performance.now();
    if (now - lastInference >= INFERENCE_INTERVAL_MS && ui.video.currentTime !== lastVideoTime) {
      lastInference = now;
      lastVideoTime = ui.video.currentTime;
      try {
        results = vision.detect(ui.video, now);
        const freshHands = results.hands !== lastHandObservation;
        if (freshHands) {
          lastHandObservation = results.hands;
          handOverlays = enrollment.visibleHands(results.hands, results.pose, now);
        }
        if (enrollment.calibrating) {
          if (freshHands) enrollment.observe(results.hands, now);
          updateCalibrationStatus();
        } else {
          ui.handsStatus.textContent = `${handOverlays.length}/${enrollment.targets.length} hands visible${handOverlays.length < enrollment.targets.length ? ' — reacquiring missing hand' : ''}`;
          const selectedHands = handOverlays.filter(hand=>!hand.preview);
          const previousSlips = Number(ui.slips.textContent);
          const counts = movementCounter.sample(results.pose, selectedHands, now, ui.video.videoWidth / ui.video.videoHeight);
          for (const key of Object.keys(counts)) ui[key].textContent = counts[key];
          if (counts.slips > previousSlips) {
            ui.slipFeedback.textContent = `+${counts.slips-previousSlips} slip`;
            ui.slips.getAnimations().forEach(animation=>animation.cancel());
            ui.slips.animate([{transform:'scale(1.2)',color:'#fff'},{transform:'scale(1)',color:'#c4f06a'}],{duration:400});
          }
          ui.comboStatus.textContent = movementCounter.combo.status;
          ui.movementStatus.textContent = movementCounter.status;
          ui.slipStatus.textContent = movementCounter.slip.status;
        }
      } catch (error) {
        console.error('Landmark inference failed', error);
      }
    }
    updateMetrics(motion.sample(ui.video, Number(ui.sensitivity.value)));
  }

  drawFrame();
  ui.durationValue.innerHTML = `${formatDuration(Date.now() - sessionStartedAt)}<small>min</small>`;
}

async function startCamera() {
  ui.startButton.disabled = true;
  try {
    setCameraStatus(false, 'LOADING TRACKERS');
    await camera.start();
    await vision.initialize();

    running = true;
    paused = false;
    lastInference = 0;
    lastVideoTime = -1;
    results = { pose: null, hands: null, face: null };
    motion.reset();
    movementCounter.resetGesture();
    ui.movementStatus.textContent = 'Select hands to begin';
    ui.handsStatus.textContent = 'Selecting hands';
    handOverlays = [];
    lastHandObservation = null;
    enrollment.expectedHands = Number(ui.handCount.value);
    enrollment.begin();
    sessionStartedAt = Date.now();
    renderer.resize(ui.stage);

    ui.placeholder.style.display = 'none';
    ui.video.style.display = 'block';
    ui.calibrationPanel.style.display = 'block';
    ui.calibrationStatus.textContent = enrollment.statusMessage;
    ui.pauseButton.disabled = true;
    ui.pauseButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5v14M15 5v14"/></svg>Pause analysis';
    ui.snapshotButton.disabled = false;
    ui.startButton.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>Stop camera';
    ui.startButton.disabled = false;
    ui.resolution.textContent = `${ui.video.videoWidth} × ${ui.video.videoHeight}`;
    setCameraStatus(true, 'HAND SETUP');
    await camera.listDevices();
    loop();
  } catch (error) {
    camera.stop();
    running = false;
    ui.startButton.disabled = false;
    ui.video.style.display = 'none';
    setCameraStatus(false);
    const message = error.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access in your browser settings.'
      : error.name === 'NotFoundError'
        ? 'No camera was found on this device.'
        : `Could not start tracker: ${error.message}`;
    showToast(message);
  }
}

function stopCamera() {
  running = false;
  paused = false;
  movementCounter.resetGesture();
  ui.handsStatus.textContent = 'Camera off';
  ui.movementStatus.textContent = 'Camera off';
  ui.slipStatus.textContent = 'Camera off';
  enrollment.reset();
  handOverlays = [];
  lastHandObservation = null;
  cancelAnimationFrame(animationFrame);
  camera.stop();
  ui.video.style.display = 'none';
  ui.placeholder.style.display = 'flex';
  ui.calibrationPanel.style.display = 'none';
  ui.pauseButton.disabled = true;
  ui.snapshotButton.disabled = true;
  ui.startButton.disabled = false;
  ui.startButton.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z"/></svg>Start camera';
  ui.pauseButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5v14M15 5v14"/></svg>Pause analysis';
  ui.resolution.textContent = 'NO SIGNAL';
  ui.activityValue.textContent = 'Idle';
  setCameraStatus(false);
  renderer.clear();
}

function togglePause() {
  if (!running || enrollment.calibrating) return;
  paused = !paused;
  ui.movementStatus.textContent = paused ? 'Paused' : 'Counting automatically';
  ui.slipStatus.textContent = paused ? 'Paused' : 'Face camera; hold head centered briefly';
  movementCounter.resetGesture();
  ui.pauseButton.innerHTML = paused
    ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z"/></svg>Resume analysis'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5v14M15 5v14"/></svg>Pause analysis';
  ui.activityValue.textContent = paused ? 'Paused' : 'Idle';
}

function saveSnapshot() {
  if (!running) return;
  const output = document.createElement('canvas');
  output.width = ui.canvas.width;
  output.height = ui.canvas.height;
  const outputContext = output.getContext('2d');
  if (mirrored) {
    outputContext.translate(output.width, 0);
    outputContext.scale(-1, 1);
  }
  outputContext.drawImage(ui.canvas, 0, 0);
  output.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stillwatch-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Snapshot saved');
  }, 'image/png');
}

function resetMetrics() {
  motion.reset();
  movementCounter.reset();
  for (const key of ['arms','opens','closes','tilts','slips','jabs','crosses','combos']) ui[key].textContent = '0';
  updateMetrics({ level: 0, peak: 0, history: Array(45).fill(0) });
  if (running) sessionStartedAt = Date.now();
  ui.slipFeedback.textContent = '';
  ui.comboStatus.textContent = movementCounter.combo.status;
  showToast('Session metrics reset');
}

function setMirror(isMirrored) {
  mirrored = isMirrored;
  const transform = isMirrored ? 'scaleX(-1)' : 'none';
  ui.canvas.style.transform = transform;
  ui.video.style.transform = transform;
}

function updateClock() {
  $('clock').textContent = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date());
}

initializeHistoryGraph();
updateClock();
setInterval(updateClock, 1000);
renderer.resize(ui.stage);
window.addEventListener('resize', () => renderer.resize(ui.stage));
camera.listDevices();
camera.onDeviceChange(() => camera.listDevices());

ui.startButton.addEventListener('click', () => running ? stopCamera() : startCamera());
ui.pauseButton.addEventListener('click', togglePause);
ui.cameraSelect.addEventListener('change', () => {
  if (running) {
    stopCamera();
    startCamera();
  }
});
function finishSetup() {
  if (!enrollment.calibrating || !enrollment.confirm(results.pose)) return;
  ui.calibrationPanel.style.display = 'none';
  ui.pauseButton.disabled = false;
  movementCounter.resetGesture();
  ui.movementStatus.textContent = 'Counting automatically';
  lastHandObservation = null;
  setCameraStatus(true);
  showToast(`Tracking ${enrollment.targets.length} selected hand${enrollment.targets.length === 1 ? '' : 's'}`);
}
ui.sensitivity.addEventListener('input', () => { ui.sensitivityLabel.value = ui.sensitivity.value; });
ui.snapshotButton.addEventListener('click', saveSnapshot);
$('resetBtn').addEventListener('click', resetMetrics);
$('mirrorBtn').addEventListener('click', () => {
  setMirror(!mirrored);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) motion.resetPreviousFrame?.();
});

ui.stance.addEventListener('change', () => {
  movementCounter.combo.setLead(ui.stance.value);
  movementCounter.resetGesture();
  ui.comboStatus.textContent = movementCounter.combo.status;
});

function reselectHands() {
  enrollment.expectedHands = Number(ui.handCount.value);
  if (!running) return;
  enrollment.begin();
  handOverlays=[];lastHandObservation=null;
  paused=false;movementCounter.resetGesture();
  ui.calibrationPanel.style.display='block';
  ui.pauseButton.disabled=true;
  ui.pauseButton.innerHTML='Pause analysis';
  ui.calibrationStatus.textContent=enrollment.statusMessage;
  ui.handsStatus.textContent='Selecting hands';
  setCameraStatus(true,'HAND SETUP');
}
ui.handCount.addEventListener('change',reselectHands);
$('reselectHands').addEventListener('click',reselectHands);
