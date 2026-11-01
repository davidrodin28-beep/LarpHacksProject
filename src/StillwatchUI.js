import React, { useState, useEffect, useRef } from 'https://esm.sh/react@19.2.0';
import { createRoot } from 'https://esm.sh/react-dom@19.2.0/client';
import htm from 'https://esm.sh/htm@3.1.1';
import { createMotionTracker } from './tracking/createMotionTracker.js';
import { SPORTS, SportTracker } from './sport-tracker.js';
const html = htm.bind(React.createElement);
const sports = {
  Basketball: 'Shooting motion, release elbow extension, and relative jump lift.',
  Boxing: 'Jab and cross counts, their extension scores, and detected 1–2 combinations.',
  Tennis: 'Racket-swing estimates and approximate forehand/backhand direction.',
  Archery: 'Stable draw holds, hold time, arm extension, and shoulder alignment.',
  'Table tennis': 'Shorter racket-swing estimates and approximate stroke direction.',
  Volleyball: 'Overhead swing estimates, arm extension, and relative jump lift.',
  Badminton: 'Racket-swing estimates and approximate forehand/backhand direction.',
  Soccer: 'Visible leg-extension kick estimates, split by side.',
  Running: 'Alternating knee-lift step estimates and step cadence.',
  Golf: 'Swing estimates, arm extension, torso-turn estimate, and swing tempo.',
  Baseball: 'Overhead pitch/throw motion counts and arm-extension estimates.',
};
function Pose() { return html`<svg viewBox="0 0 300 300" role="img" aria-label="Illustration of a basketball pose"><circle className="ball" cx="222" cy="51" r="19"/><path className="ball-lines" d="M204 45q18 4 27 22m-26-29q-4 22 18 30M204 52h36"/><g className="bones"><circle cx="138" cy="88" r="20"/><path d="m137 110-3 17m-29 6 58-10m-58 10-35-37 23-31m70 58 34-29 13-25m-102 65 5 62 39-2 7-68m-46 70-26 35-15 36m80-73 28 26 23 29m-99-55 39-2"/></g><g className="joints">${[[105,133],[163,123],[70,96],[93,65],[197,94],[210,69],[113,196],[152,194],[87,231],[180,220],[72,267],[203,249]].map(([x,y])=>html`<circle key=${x} cx=${x} cy=${y} r="4"/>`)}</g></svg>`; }
function Studio() {
  const [sport, setSport] = useState('Basketball');
  const [stance, setStance] = useState('Left');
  const [handCount, setHandCount] = useState('2');
  const [tracking, setTracking] = useState({ phase: 'off' });
  const [message, setMessage] = useState('');
  const [mirrored, setMirrored] = useState(true);
  const video = useRef(null);
  const canvas = useRef(null);
  const stage = useRef(null);
  const tracker = useRef(null);
  const active = ['setup', 'tracking', 'paused'].includes(tracking.phase);
  const loading = tracking.phase === 'loading';
  const sportPreview = new SportTracker(sport);
  const sportMetrics = tracking.metrics?.sport || sportPreview.metrics;

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
      onStatus: status => { if (mounted) setTracking(status); },
      onError: error => { if (mounted) showError(error); },
    });
    tracker.current = instance;
    instance.mirror(true);
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
    <section className="studio">
      <div className="studio-top">
        <span className="workspace-label">Your next alter ego</span>
        <div className="sport-controls">
          <label htmlFor="sport">Your sport</label>
          <select id="sport" value=${sport} onChange=${event => { setSport(event.target.value); tracker.current?.setSport(event.target.value); }}>
            ${SPORTS.map(name => html`<option key=${name}>${name}</option>`)}
          </select>
          <button onClick=${() => {
            const choices = SPORTS.filter(name => name !== sport);
            const next = choices[Math.floor(Math.random() * choices.length)];
            setSport(next); tracker.current?.setSport(next);
          }}>⤨ <span>Random</span></button>
          <label htmlFor="hand-count">Track</label>
          <select id="hand-count" value=${handCount} onChange=${event => { setHandCount(event.target.value); tracker.current?.setHandCount(event.target.value); }}>
            <option value="2">Both hands</option><option value="1">One hand</option>
          </select>
        </div>
        ${sport === 'Boxing' && html`<label className="stance-control" htmlFor="stance">Boxing stance
          <select id="stance" value=${stance} onChange=${event => { setStance(event.target.value); tracker.current?.setStance(event.target.value); }}>
            <option value="Left">Orthodox · left jab</option><option value="Right">Southpaw · right jab</option>
          </select>
        </label>`}
        <section className="sport-stats" aria-live="polite">
          <div className="sport-stats-heading"><h2>${sport} practice stats</h2><span>CAMERA ESTIMATES</span></div>
          <div className="sport-stat-grid">${sportMetrics.map(metric => html`
            <div className="sport-stat" key=${metric.label}><span>${metric.label}</span><strong>${metric.value}</strong></div>
          `)}</div>
          <p>${sports[sport]}</p>
          <small>${tracking.metrics?.sportExplanation || sportPreview.explanation} These are camera-based practice estimates, not professional coaching scores. The camera cannot confirm ball, racket, or equipment contact.</small>
        </section>
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
            <button className="primary" onClick=${enable}>Enable camera <span aria-hidden="true">↗</span></button>
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
                <strong>Bring ${handCount === '1' ? 'one hand' : 'both hands'} into view.</strong>
                <p>Hold still for a moment. The tracker selects visible hands and starts automatically—no gesture or setup button needed.</p>
                <span>${tracking.instruction}</span>
              </div>
            `}
          </${React.Fragment}>
        `}
      </div>
      </div>
      <div className="studio-bottom">
        <div className="session-summary">
          <p><strong>${sport}.</strong> ${sports[sport]}</p>
          <p className="extension-count">
            General arm extensions: <output aria-label="Arm extensions">${tracking.metrics?.counts?.arms ?? 0}</output>
          </p>
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
  `;
}
function App() { const [screen,setScreen]=useState('intro');return html`<main className="shell"><header><a className="brand" href="#" onClick=${e=>{e.preventDefault();setScreen('intro');}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 9h1m6 0h1m-8 5q4 5 8 0"/></svg>stillwatch</a>${screen==='intro'?html`<span className="tagline">Play someone else.</span>`:html`<button className="back" onClick=${()=>setScreen('intro')}>← Back</button>`}</header>${screen==='intro'?html`<section className="intro"><div className="intro-copy"><div className="kicker">Your next alter ego</div><h1>Play the <em>part.</em></h1><p>Pick a sport. Step into frame.<br/>See what you can pull off.</p><button className="primary start" onClick=${()=>setScreen('studio')}>Start <span aria-hidden="true">↗</span></button></div><div className="art"><${Pose}/><span>Same you. Different game.</span></div></section>`:html`<${Studio}/>`}<footer><span>♧ Video stays on your device.</span><span>Pick a sport. Play the part.</span></footer></main>`; }
createRoot(document.getElementById('root')).render(html`<${App}/>`);
