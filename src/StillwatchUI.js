import { getClient } from './auth/client.js';
import React, { useState, useEffect, useRef } from 'https://esm.sh/react@19.2.0';
import { createRoot } from 'https://esm.sh/react-dom@19.2.0/client';
import htm from 'https://esm.sh/htm@3.1.1';
import { createMotionTracker } from './tracking/createMotionTracker.js';
import { lessons } from './coaching/lessons.js';
import { useNarration } from './coaching/use-narration.js';
import { coachingNarration, lessonInstructions, sportInstructions } from './coaching/narration.js';
import { SportInventor, LiveRound, fetchTriggers } from './sport-inventor.js';
const html = htm.bind(React.createElement);
const sports = { Basketball: 'Show us your best free throw.', Boxing: 'Give us your best shadowboxing impression.', Tennis: 'An imaginary racket. A championship serve.', Archery: 'Draw your imaginary bow. Find your target.', 'Table tennis': 'Make that imaginary rally look dramatic.', Volleyball: 'Set up the imaginary winning point.' };
function Pose() { return html`<svg viewBox="0 0 300 300" role="img" aria-label="Upper-body boxing stance with shoulder, elbow, and wrist tracking points">
  <g className="bones"><circle cx="150" cy="78" r="24"/><path d="M150 103v24m-44 12 44-12 44 12m-88 0-24 50 30-76m82 26 25 47-24-76m-89 29 10 95h68l10-95m-78 95h68"/></g>
  <g fill="#c2ec75" stroke="#253923" stroke-width="2"><path d="M99 109c-8-4-8-16-4-24 3-5 8-7 12-5l13 7c5 3 5 10 2 17l-5 12Z"/><path d="M185 114c-7-7-9-16-5-23l9-12c4-4 10-3 15 2 6 6 9 15 3 23l-9 13Z"/></g>
  <g className="joints">${[[106,139],[194,139],[82,189],[219,186],[112,113],[195,110]].map(([x,y])=>html`<circle key=${x} cx=${x} cy=${y} r="4"/>`)}</g>
  <text x="150" y="270" text-anchor="middle" fill="#72825f" font-size="10" font-family="Arial" letter-spacing="2">HANDS UP. YOU’VE GOT THIS.</text>
</svg>`; }
function Studio() {
  const [sport, setSport] = useState('Boxing');
  const [lessonIndex, setLessonIndex] = useState(0);
  const [stance, setStance] = useState('Orthodox');
  const [tracking, setTracking] = useState({ phase: 'off' });
  const [message, setMessage] = useState('');
  const [mirrored, setMirrored] = useState(true);
  const [custom, setCustom] = useState(null);      // generated sport being played, or null
  const [inventing, setInventing] = useState(false); // inventor panel open
  const [triggers, setTriggers] = useState(null);
  const video = useRef(null);
  const canvas = useRef(null);
  const stage = useRef(null);
  const tracker = useRef(null);
  const active = ['setup', 'tracking', 'paused'].includes(tracking.phase);
  const loading = tracking.phase === 'loading';
  const lesson = (lessons[sport] || lessons.Basketball)[lessonIndex] || (lessons[sport] || lessons.Basketball)[0];
  const coaching = tracking.coaching || { phase: 'ready', step: 0, progress: 0 };
  const guest = document.getElementById('root').dataset.guestMode === 'true';
  const voice = useNarration();
  const voiceCue = custom ? '' : coachingNarration(lesson, coaching, tracking.phase, tracking.paused);
  useEffect(() => {
    if (voice.enabled && voiceCue) void voice.speak(voiceCue);
    else voice.stop();
    // Only meaningful checkpoint/phase changes narrate, never frame-by-frame progress.
  }, [voice.enabled, voiceCue, sport, lessonIndex, stance, custom, tracking.phase, tracking.paused, voice.speak, voice.stop]);

  function chooseLesson(nextSport, index = 0) {
    setSport(nextSport);
    setLessonIndex(index);
    setTracking(previous => ({ ...previous, coaching: undefined }));
    tracker.current.selectLesson(nextSport, index);
  }

  function showError(error) {
    setTracking({ phase: 'off' });
    setMessage(error.name === 'NotAllowedError'
      ? 'Camera access was declined. You can enable it in your browser settings when you’re ready.'
      : error.name === 'NotFoundError'
        ? 'No camera found. Connect one and try again.'
        : `Could not start tracking: ${error.message}`);
  }

  useEffect(() => {
    let mounted = true;
    const instance = createMotionTracker({
      video: video.current,
      canvas: canvas.current,
      stage: stage.current,
      initialSport: sport,
      initialLessonIndex: lessonIndex,
      onStatus: status => { if (mounted) setTracking(status); },
      onError: error => { if (mounted) showError(error); },
    });
    tracker.current = instance;
    instance.mirror(true);
    instance.selectLesson('Boxing', 0);
    fetchTriggers().then(t => { if (mounted) setTriggers(t); });
    return () => {
      mounted = false;
      instance.dispose();
    };
  }, []);

  async function enable() {
    setMessage('');
    try {
      await tracker.current.start();
    } catch (error) {
      showError(error);
    }
  }

  function stop() {
    tracker.current.stop();
    setTracking({ phase: 'off' });
    setMessage('');
  }

  return html`
    <div className="studio-wrap">
    <section className=${'studio' + (inventing || custom ? ' studio--expanded' : '')}>
      <div className="studio-top">
        <span className="workspace-label">Your personal boxing corner</span>
        <div className="sport-controls">
          <button className=${inventing ? 'active' : ''} aria-pressed=${inventing} onClick=${() => setInventing(v => !v)}>✦ <span>Invent a sport</span></button>
        </div>
      </div>
      <div className="trainer-guide"><span><b>1</b> Frame your upper body</span><span><b>2</b> Show both hands</span><span><b>3</b> Punch, then return to guard</span></div>
      <div className="trainer-stats" aria-label="Session counts">
        <div><span>Arm extensions</span><strong>${tracking.metrics?.counts?.arms ?? 0}</strong><small>One count per extension</small></div>
        <div><span>Lead jabs</span><strong>${tracking.metrics?.counts?.jabs ?? 0}</strong><small>${stance === 'Southpaw' ? 'Right' : 'Left'} lead stance</small></div>
        <div><span>Rear crosses</span><strong>${tracking.metrics?.counts?.crosses ?? 0}</strong><small>${stance === 'Southpaw' ? 'Left' : 'Right'} rear hand</small></div>
        <div><span>1–2 combinations</span><strong>${tracking.metrics?.counts?.combos ?? 0}</strong><small>Jab followed by cross</small></div>
      </div>
      <div className="camera-slot">
      <div className="camera" ref=${stage}>
        <video ref=${video} autoPlay playsInline muted className="tracking-source" aria-hidden="true" tabIndex=${-1}></video>
        <canvas ref=${canvas} className="tracking-canvas" hidden=${!active && !loading}
          aria-label="Camera preview with tracking landmarks"></canvas>
        ${!active && !loading && html`
          <div className="camera-empty">
            <span className="camera-icon" aria-hidden="true">◎</span>
            <h2>Your stage is ready.</h2>
            <p>Step into frame when you’re ready.<br/>Your camera only turns on when you choose.</p>
            <button className="primary" onClick=${enable}>Start camera <span aria-hidden="true">↗</span></button>
          </div>
        `}
        ${loading && html`
          <div className="tracking-loading" role="status">
            <p>${tracking.instruction}</p>
            <button onClick=${stop}>Cancel</button>
          </div>
        `}
        ${active && html`
          <${React.Fragment}>
            <span className="camera-badge"><i></i>
              ${tracking.phase === 'setup' ? 'Hand setup' : tracking.paused ? 'Analysis paused' : 'Tracking live'}
            </span>
            <details className="settings">
              <summary aria-label="Camera settings">⚙</summary>
              <div>
                <label>
                  <input type="checkbox" checked=${mirrored} onChange=${event => {
                    setMirrored(event.target.checked);
                    tracker.current.mirror(event.target.checked);
                  }}/>
                  Mirror preview
                </label>
                <button disabled=${!tracking.canPause} onClick=${() => tracker.current.pause()}>
                  ${tracking.paused ? 'Resume analysis' : 'Pause analysis'}
                </button>
                <button onClick=${stop}>Turn off camera</button>
              </div>
            </details>
            ${tracking.phase === 'setup' && html`
              <div className="enrollment" role="status">
                <strong>Make a fist, then open your hand.</strong>
                <p>Do this with each hand you want to track. Tracking starts automatically after a short pause.</p>
                <span>${tracking.instruction}</span>
              </div>
            `}
          </${React.Fragment}>
        `}
      </div>
      </div>
      <div className="trainer-actions">
        <p role="status">${loading ? 'Getting the camera ready…' : tracking.phase === 'setup' ? 'Show each hand to finish setup.' : tracking.paused ? 'Paused. Resume whenever you’re ready.' : active ? 'Tracking live. Extend, then return to guard.' : 'Start your camera when you’re ready.'}</p>
        ${active && html`<div><button disabled=${!tracking.canPause} onClick=${()=>tracker.current.pause()}>${tracking.paused ? 'Resume training' : 'Pause training'}</button><button onClick=${stop}>Stop camera</button></div>`}
      </div>
      <div className="studio-bottom">
        <div className="session-summary">
          <div className="voice-controls" aria-label="Spoken instructions">
            <button type="button" disabled=${guest} aria-pressed=${voice.enabled} onClick=${voice.toggle}>${voice.enabled ? 'Voice on · mute' : 'Enable voice'}</button>
            <button type="button" disabled=${!voice.enabled || tracking.paused} onClick=${() => voice.speak(custom ? sportInstructions(custom) : lessonInstructions(lesson))}>Read instructions</button>
            <button type="button" disabled=${!voice.status} onClick=${voice.stop}>Stop voice</button>
          </div>
          <p className="voice-status" role="status" aria-live="polite">${guest ? html`<a href="/login.html">Log in</a> to use spoken instructions. Camera practice is available as a guest.` : voice.status || (voice.enabled ? 'Spoken instructions by ElevenLabs' : 'Turn on voice to hear the instructions.')}</p>
          ${custom ? html`<p><strong>${custom.name}.</strong> ${custom.tagline}</p>
          <p className="extension-count">Arm extensions: <output aria-label="Arm extensions">${tracking.metrics?.counts?.arms ?? 0}</output></p>` : html`
          <div className="coach-heading"><span className="workspace-label">Your coach</span><span className="coach-level">Basics</span></div>
          <label className="move-label" htmlFor="move">Choose a move</label>
          <select id="move" value=${lessonIndex} onChange=${event => chooseLesson(sport, Number(event.target.value))}>
            ${lessons[sport].map((move, index) => html`<option key=${move.name} value=${index}>${move.name}</option>`)}
          </select>
          ${sport === 'Boxing' && html`<label className="move-label" htmlFor="coaching-stance">Your stance</label><select id="coaching-stance" value=${stance} onChange=${event => {
            setStance(event.target.value);
            setTracking(previous => ({ ...previous, coaching: undefined }));
            tracker.current.setCoachingStance(event.target.value);
          }}><option value="Orthodox">Orthodox · left hand leads</option><option value="Southpaw">Southpaw · right hand leads</option></select>`}
          <h2 className="lesson-title">${lesson.name}</h2>
          <p>${lesson.focus}</p>
          <div className="coach-feedback" role="status" aria-live="polite">
            <strong>${coaching.phase === 'completed' ? 'Drill complete ✓' : tracking.paused ? 'Practice paused' : coaching.phase === 'practicing' ? `Checkpoint ${coaching.step + 1} of ${lesson.steps.length}` : 'Let’s learn the movement'}</strong>
            ${coaching.phase === 'practicing' && html`<p className="current-cue">${lesson.steps[coaching.step].cue}</p>`}
            <p>${tracking.paused ? 'Resume analysis to continue your lesson.' : coaching.feedback || 'Read the cues below each checkpoint. Enable the camera for guided practice.'}</p>
            ${coaching.phase === 'practicing' && html`<progress max="1" value=${coaching.progress} aria-label="Checkpoint hold progress"></progress>`}
          </div>
          <button className="primary practice-button" disabled=${tracking.phase !== 'tracking'} onClick=${() => {
            if (coaching.phase === 'practicing') tracker.current.endLesson();
            else tracker.current.startLesson();
          }}>${coaching.phase === 'practicing' ? 'End practice' : coaching.phase === 'completed' ? 'Practice again' : 'Start guided practice'} <span aria-hidden="true">↗</span></button>
          ${tracking.phase !== 'tracking' && html`<p className="coach-help">${tracking.paused ? 'Resume analysis to practice.' : active ? 'Finish hand setup to practice.' : loading ? 'Waiting for camera setup…' : 'Enable your camera to get live position feedback.'}</p>`}
          <ol className="lesson-steps" aria-label="Form checkpoints">
            ${lesson.steps.map((step, index) => html`<li key=${step.title}
              className=${coaching.phase === 'completed' || (coaching.phase === 'practicing' && index < coaching.step) ? 'done' : coaching.phase === 'practicing' && index === coaching.step ? 'current' : ''}
              aria-current=${coaching.phase === 'practicing' && index === coaching.step ? 'step' : undefined}>
              <strong>${step.title}</strong><p>${step.cue}</p>
            </li>`)}
          </ol>
          <details className="form-tips"><summary>Form tip & camera limits</summary><p>${lesson.tip}</p><p>Rehearse slowly without equipment. Hold each position for a moment. Camera checks estimate upper-body positions; they do not verify complete technique, footwork, or sporting performance.</p></details>
          <p className="extension-count">Arm extensions: <output aria-label="Arm extensions">${tracking.metrics?.counts?.arms ?? 0}</output></p>
          `}
        </div>
        <button className="primary" disabled=${!active} onClick=${async () => {
          try {
            await tracker.current.snapshot();
            setMessage('Snapshot saved to your device.');
          } catch (error) {
            setMessage(error.message);
          }
        }}>Save snapshot <span aria-hidden="true">↗</span></button>
      </div>
      <p className="message" role="status">${message}</p>
    </section>
    <section className="panels">
      ${inventing && html`<${SportInventor} disabled=${false} onRead=${voice.enabled ? s => voice.speak(sportInstructions(s)) : undefined} onPlay=${s => { setCustom(s); setInventing(false); }}/>`}
      ${custom && html`<${LiveRound} sport=${custom} triggers=${triggers || {}} counts=${tracking.metrics?.counts} cameraOn=${tracking.phase === "tracking"}
          onRead=${voice.enabled ? () => voice.speak(sportInstructions(custom)) : undefined}
          onExit=${() => { setCustom(null); setInventing(true); }}/>`}
    </section>
    </div>
  `;
}
function AccountControls() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = document.getElementById('root').dataset.accountName;
  async function logout() {
    if (document.getElementById('root').dataset.guestMode === 'true') {
      sessionStorage.removeItem('boxingpal-guest');
      window.location.replace('/login.html');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const client = await getClient();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      window.location.replace('/login.html');
    } catch {
      setError('Could not log out. Please try again.');
      setBusy(false);
    }
  }
  return html`<div className="account-controls">
    <span className="account-name" title=${name}>${name}</span>
    <button type="button" onClick=${logout} disabled=${busy}>${busy ? 'Logging out…' : document.getElementById('root').dataset.guestMode === 'true' ? 'Exit guest mode' : 'Log out'}</button>
    ${error && html`<span role="alert" className="account-error">${error}</span>`}
  </div>`;
}
function App() { const [screen,setScreen]=useState('intro');return html`<main className="shell"><header><a className="brand" href="#" onClick=${e=>{e.preventDefault();setScreen('intro');}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 9h1m6 0h1m-8 5q4 5 8 0"/></svg>BoxingPal</a>${screen==='intro'?html`<span className="tagline">Your camera. Your corner.</span>`:html`<button className="back" onClick=${()=>setScreen('intro')}>← Back</button>`}<${AccountControls}/></header>${screen==='intro'?html`<section className="intro"><div className="intro-copy"><div className="kicker">Your personal boxing corner</div><h1>Build your<br/><em>boxing rhythm.</em></h1><p>Practice your jab, sharpen your cross, and return to guard.<br/>A little space. Your webcam. Your next round.</p><button className="primary start" onClick=${()=>setScreen('studio')}>Start training <span aria-hidden="true">↗</span></button><div className="boxing-highlights"><span>Jabs & crosses</span><span>Guided practice</span><span>Live movement tracking</span></div><p className="boxing-start-note">Start your camera when you’re ready. We’ll guide you through setup.</p></div><div className="art"><${Pose}/><span>Hands up. You’ve got this.</span></div></section>`:html`<${Studio}/>`}<footer><span>♧ Video stays on your device.</span><span>BoxingPal · Make every round count.</span></footer></main>`; }
createRoot(document.getElementById('root')).render(html`<${App}/>`);
