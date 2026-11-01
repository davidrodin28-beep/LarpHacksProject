import { CameraSource } from './camera-source.js';
import { ChinTracker } from './chin-tracker.js';
import { HandEnrollment } from './hand-enrollment.js';
import { INFERENCE_INTERVAL_MS } from './config.js';
import { MovementCounter } from './movement-counter.js';
import { MotionMeter } from './motion-meter.js';
import { OverlayRenderer } from './overlay-renderer.js';
import { SportTracker } from './sport-tracker.js';
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
  sportSelect: $('sportSelect'),
  sportStance: $('sportStance'),
  sportStanceRow: $('sportStanceRow'),
  sportMetrics: $('sportMetrics'),
  sportDescription: $('sportDescription'),
  chinStatus: $('chinStatus'),
  roundDuration: $('roundDuration'),
  roundStart: $('roundStart'),
  roundClock: $('roundClock'),
  roundProgress: $('roundProgress'),
  roundResult: $('roundResult'),
  roundScore: $('roundScore'),
  roundActivity: $('roundActivity'),
  roundTips: $('roundTips'),
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
const sportTracker = new SportTracker(ui.sportSelect.value);
const chinTracker = new ChinTracker();
const renderer = new OverlayRenderer(ui.video, ui.canvas);
const graphBars = [];
let handOverlays = [];
let lastHandObservation = null;
let lastFaceObservation = null;

const practiceRound = { phase:'idle', duration:10, prepareEndsAt:0, startsAt:0, endsAt:0, snapshot:null };

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

function renderSportStats() {
  const metrics=sportTracker.metrics;
  const currentLabels=[...ui.sportMetrics.children].map(card=>card.firstElementChild?.dataset.label);
  if (JSON.stringify(currentLabels)!==JSON.stringify(metrics.map(item=>item.label))) {
    ui.sportMetrics.replaceChildren();
    for (const item of metrics) {
      const card=document.createElement('div'); card.className='metric';
      const label=document.createElement('div'); label.className='metric-label'; label.dataset.label=item.label; label.textContent=item.label;
      const value=document.createElement('div'); value.className='metric-value lime'; value.textContent=item.value;
      card.append(label,value); ui.sportMetrics.append(card);
    }
  } else {
    metrics.forEach((item,index)=>{
      const value=ui.sportMetrics.children[index].lastElementChild;
      if (value.textContent!==String(item.value)) value.textContent=item.value;
    });
  }
  if (ui.sportDescription.textContent!==sportTracker.explanation) ui.sportDescription.textContent=sportTracker.explanation;
  ui.sportStanceRow.hidden=sportTracker.sport!=='Boxing';
}

function updatePracticeControls() {
  const busy=practiceRound.phase==='preparing'||practiceRound.phase==='active';
  ui.roundDuration.disabled=busy;
  ui.roundStart.disabled=!running||enrollment.calibrating||paused||busy;
  ui.roundStart.textContent=busy
    ? practiceRound.phase==='preparing'?'Get ready…':'Round in progress'
    : practiceRound.phase==='complete'?'Run again':`Start ${ui.roundDuration.value}s round`;
}

function resetPracticeRound(message='Start camera and finish hand setup.') {
  practiceRound.phase='idle';
  practiceRound.snapshot=null;
  ui.roundClock.textContent=message;
  ui.roundProgress.style.width='0%';
  ui.roundResult.hidden=true;
  chinTracker.reset();
  ui.chinStatus.textContent='Face camera during the round setup';
  updatePracticeControls();
}

function startPracticeRound() {
  if(!running||enrollment.calibrating||paused||practiceRound.phase==='preparing'||practiceRound.phase==='active')return;
  practiceRound.duration=Number(ui.roundDuration.value);
  practiceRound.phase='preparing';
  practiceRound.prepareEndsAt=performance.now()+3000;
  practiceRound.snapshot=null;
  chinTracker.beginCalibration();
  ui.roundResult.hidden=true;
  ui.roundClock.textContent='Stand relaxed and face the camera — chin baseline';
  ui.roundProgress.style.width='0%';
  updatePracticeControls();
}

function finishPracticeRound() {
  const report=sportTracker.summarizeRound(practiceRound.snapshot||{},chinTracker.tuckPercent);
  practiceRound.phase='complete';
  ui.roundProgress.style.width='100%';
  ui.roundClock.textContent=`${practiceRound.duration}-second round complete`;
  ui.roundScore.textContent=String(report.score);
  ui.roundActivity.textContent=report.activityText;
  ui.roundTips.replaceChildren();
  for(const tip of report.tips) {
    const item=document.createElement('li');
    item.textContent=tip;
    ui.roundTips.append(item);
  }
  ui.roundResult.hidden=false;
  updatePracticeControls();
}

function updatePracticeRound(now) {
  if(practiceRound.phase==='preparing') {
    const remaining=Math.max(0,practiceRound.prepareEndsAt-now);
    const countdown=Math.ceil(remaining/1000);
    ui.roundClock.textContent=remaining>0
      ? `${countdown} — stand neutral for chin baseline`
      : 'Go!';
    ui.roundProgress.style.width=`${Math.min(100,(1-remaining/3000)*100)}%`;
    if(remaining<=0) {
      practiceRound.snapshot=sportTracker.snapshot();
      chinTracker.finishCalibration();
      practiceRound.phase='active';
      practiceRound.startsAt=now;
      practiceRound.endsAt=now+practiceRound.duration*1000;
      ui.roundClock.textContent=`${practiceRound.duration}s — go!`;
      updatePracticeControls();
    }
  } else if(practiceRound.phase==='active') {
    const remaining=Math.max(0,practiceRound.endsAt-now);
    ui.roundClock.textContent=`${Math.ceil(remaining/1000)} seconds left`;
    ui.roundProgress.style.width=`${Math.min(100,(1-remaining/(practiceRound.duration*1000))*100)}%`;
    if(remaining<=0)finishPracticeRound();
  }
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
        if(results.face!==lastFaceObservation) {
          lastFaceObservation=results.face;
          const facePhase=practiceRound.phase==='preparing'||practiceRound.phase==='active'?practiceRound.phase:'idle';
          chinTracker.sample(results.face,facePhase,ui.video.videoWidth/ui.video.videoHeight);
          if(practiceRound.phase==='preparing'||practiceRound.phase==='active')ui.chinStatus.textContent=chinTracker.status;
        }
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
          for (const key of ['arms','opens','closes','tilts','slips']) ui[key].textContent = counts[key];
          sportTracker.sample(results.pose, now, ui.video.videoWidth / ui.video.videoHeight);
          renderSportStats();
          if (counts.slips > previousSlips) {
            ui.slipFeedback.textContent = `+${counts.slips-previousSlips} slip`;
            ui.slips.getAnimations().forEach(animation=>animation.cancel());
            ui.slips.animate([{transform:'scale(1.2)',color:'#fff'},{transform:'scale(1)',color:'#c4f06a'}],{duration:400});
          }
          ui.movementStatus.textContent = movementCounter.status;
          ui.slipStatus.textContent = movementCounter.slip.status;
        }
      } catch (error) {
        console.error('Landmark inference failed', error);
      }
    }
    updateMetrics(motion.sample(ui.video, Number(ui.sensitivity.value)));
    updatePracticeRound(performance.now());
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
    lastFaceObservation = null;
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
  resetPracticeRound('Start camera and finish hand setup.');
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
  updatePracticeControls();
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
  resetPracticeRound(running?'Camera ready — start a round when you are.':'Start camera and finish hand setup.');
  motion.reset();
  movementCounter.reset();
  for (const key of ['arms','opens','closes','tilts','slips']) ui[key].textContent = '0';
  sportTracker.reset();
  renderSportStats();
  updateMetrics({ level: 0, peak: 0, history: Array(45).fill(0) });
  if (running) sessionStartedAt = Date.now();
  ui.slipFeedback.textContent = '';
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
  updatePracticeControls();
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

ui.sportSelect.addEventListener('change', () => {
  if(practiceRound.phase!=='idle')resetPracticeRound('Sport changed — start a new round.');
  sportTracker.setSport(ui.sportSelect.value);
  renderSportStats();
  if (running) showToast(`${ui.sportSelect.value} tracking selected`);
});
ui.sportStance.addEventListener('change', () => {
  sportTracker.setStance(ui.sportStance.value);
});
ui.roundStart.addEventListener('click',startPracticeRound);
ui.roundDuration.addEventListener('change',updatePracticeControls);

function reselectHands() {
  enrollment.expectedHands = Number(ui.handCount.value);
  if (!running) return;
  resetPracticeRound('Hands reselected — wait for setup to finish.');
  enrollment.begin();
  handOverlays=[];lastHandObservation=null;
  paused=false;movementCounter.resetGesture();
  ui.calibrationPanel.style.display='block';
  ui.pauseButton.disabled=true;
  ui.pauseButton.innerHTML='Pause analysis';
  ui.calibrationStatus.textContent=enrollment.statusMessage;
  ui.handsStatus.textContent='Selecting hands';
  setCameraStatus(true,'HAND SETUP');
  updatePracticeControls();
}
ui.handCount.addEventListener('change',reselectHands);
$('reselectHands').addEventListener('click',reselectHands);
sportTracker.setStance(ui.sportStance.value);
renderSportStats();
updatePracticeControls();
