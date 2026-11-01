import React, { useState, useEffect, useRef } from 'https://esm.sh/react@19.2.0';
import { createRoot } from 'https://esm.sh/react-dom@19.2.0/client';
import htm from 'https://esm.sh/htm@3.1.1';
import { createMotionTracker } from './tracking/createMotionTracker.js';
const html = htm.bind(React.createElement);
const sports = { Boxing: 'Hands up. Practice your jab, cross, and return to guard.' };
function Pose() { return html`<svg viewBox="0 0 300 300" role="img" aria-label="Upper-body boxing stance with shoulder, elbow, and wrist tracking points">
  <g className="bones"><circle cx="150" cy="78" r="24"/><path d="M150 103v24m-44 12 44-12 44 12m-88 0-24 50 30-76m82 26 25 47-24-76m-89 29 10 95h68l10-95m-78 95h68"/></g>
  <g fill="#c2ec75" stroke="#253923" stroke-width="2"><path d="M99 109c-8-4-8-16-4-24 3-5 8-7 12-5l13 7c5 3 5 10 2 17l-5 12Z"/><path d="M185 114c-7-7-9-16-5-23l9-12c4-4 10-3 15 2 6 6 9 15 3 23l-9 13Z"/></g>
  <g className="joints">${[[106,139],[194,139],[82,189],[219,186],[112,113],[195,110]].map(([x,y])=>html`<circle key=${x} cx=${x} cy=${y} r="4"/>`)}</g>
  <text x="150" y="270" text-anchor="middle" fill="#72825f" font-size="10" font-family="Arial" letter-spacing="2">HANDS UP. YOU’VE GOT THIS.</text>
</svg>`; }
function Studio() {
  const [sport, setSport] = useState('Boxing');
  const [tracking, setTracking] = useState({ phase: 'off' });
  const [message, setMessage] = useState('');
  const [mirrored, setMirrored] = useState(true);
  const video = useRef(null);
  const canvas = useRef(null);
  const stage = useRef(null);
  const tracker = useRef(null);
  const active = ['setup', 'tracking', 'paused'].includes(tracking.phase);
  const loading = tracking.phase === 'loading';

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
        <span className="workspace-label">YOUR PERSONAL BOXING CORNER</span>
        <div className="sport-controls"><span>Boxing · Shadowboxing practice</span></div>
      </div>
      <div className="camera-slot">
      <div className="camera" ref=${stage}>
        <video ref=${video} autoPlay playsInline muted className="tracking-source" aria-hidden="true" tabIndex=${-1}></video>
        <canvas ref=${canvas} className="tracking-canvas" hidden=${!active && !loading}
          aria-label="Camera preview with tracking landmarks"></canvas>
        ${!active && !loading && html`
          <div className="camera-empty">
            <span className="camera-icon" aria-hidden="true">◎</span>
            <h2>Your corner is ready.</h2>
            <p>Keep your head, shoulders, elbows, and hands in frame.<br/>Leave room to extend both arms.</p>
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
                <strong>Make a fist, then open your hand.</strong>
                <p>Do this with each hand you want to track. Tracking starts automatically after a short pause.</p>
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
            Arm extensions: <output aria-label="Arm extensions">${tracking.metrics?.counts?.arms ?? 0}</output>
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
function AccountControls() {
  const account = document.getElementById('root').dataset;
  return html`<div className="account-controls">
    <span className="account-name" title=${account.accountName}>${account.accountName}</span>
    <form method="post" action="/logout">
      <input type="hidden" name="csrf_token" value=${account.csrfToken}/>
      <button type="submit">Log out</button>
    </form>
  </div>`;
}
function App() { const [screen,setScreen]=useState('intro');return html`<main className="shell"><header><a className="brand" href="#" onClick=${e=>{e.preventDefault();setScreen('intro');}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 9h1m6 0h1m-8 5q4 5 8 0"/></svg>BoxingPal</a>${screen==='intro'?html`<span className="tagline">Your corner. Anywhere.</span>`:html`<button className="back" onClick=${()=>setScreen('intro')}>← Back</button>`}<${AccountControls}/></header>${screen==='intro'?html`<section className="intro"><div className="intro-copy"><div className="kicker">YOUR PERSONAL BOXING CORNER</div><h1>Find your <em>fight.</em></h1><p>Step into frame. Bring your hands to guard.<br/>Make every round count.</p><button className="primary start" onClick=${()=>setScreen('studio')}>Start <span aria-hidden="true">↗</span></button></div><div className="art"><${Pose}/><span>Your camera. Your corner.</span></div></section>`:html`<${Studio}/>`}<footer><span>♧ Video stays on your device.</span><span>BoxingPal · Make every round count.</span></footer></main>`; }
createRoot(document.getElementById('root')).render(html`<${App}/>`);
