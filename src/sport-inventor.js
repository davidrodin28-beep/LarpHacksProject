// Invent-a-sport panel + live scoring against the generated rules.
// Talks to the sportgen FastAPI service (see SPORTGEN_API_URL in config.js). Scoring is pure arithmetic on the
// tracker's MovementCounter.counts: each generated move names a trigger, /triggers maps triggers to counter
// keys, and a round scores sum(points * delta(count)) from the moment the round starts.
import React, { useState, useEffect, useRef } from 'https://esm.sh/react@19.2.0';
import htm from 'https://esm.sh/htm@3.1.1';
import { SPORTGEN_API_URL } from './config.js';
const html = htm.bind(React.createElement);

const FALLBACK_TRIGGERS = { arm_extend: ['arms'], punch: ['jabs', 'crosses'], hand_open: ['opens'], hand_close: ['closes'], head_tilt: ['tilts'], slip: ['slips'] };
const STAGES = { queued: 'Waiting for a slot…', 'inventing candidates': 'Inventing candidate sports…', done: 'Done', failed: 'Failed' };

async function readEngineResponse(response) {
  if (!response.ok) {
    throw new Error(response.status === 404
      ? 'Sport generation is not available on this website yet.'
      : `The sport engine returned HTTP ${response.status}. Please try again.`);
  }
  // Some static hosts accept POST with an empty 200 response. Safari's JSON
  // parser reports that as "The string did not match the expected pattern."
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('The website returned an empty response. Sport generation is not available yet.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The website returned an unexpected response. Sport generation is not available yet.');
  }
}

export async function fetchTriggers() {
  try { return await readEngineResponse(await fetch(`${SPORTGEN_API_URL}/triggers`)); } catch {}
  return FALLBACK_TRIGGERS;
}

export function scoreRound(sport, triggers, baseline, counts) {
  const perMove = sport.moves.map(move => {
    const keys = triggers[move.trigger] || [];
    const hits = keys.reduce((sum, key) => sum + Math.max(0, (counts?.[key] ?? 0) - (baseline?.[key] ?? 0)), 0);
    return { name: move.name, trigger: move.trigger, points: move.points, hits, total: hits * move.points };
  });
  return { perMove, total: perMove.reduce((sum, m) => sum + m.total, 0) };
}

export function SportInventor({ onPlay, disabled, onRead }) {
  const [form, setForm] = useState({ players: 'solo', minutes: 2, intensity: 'medium', audience: 'adults', depth: 'simple', notes: '', engine: 'fast' });
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);
  const busy = job && !['done', 'error'].includes(job.status);
  const set = key => event => setForm(f => ({ ...f, [key]: event.target.value }));

  useEffect(() => () => clearTimeout(timer.current), []);

  async function poll(id) {
    try {
      const r = await fetch(`${SPORTGEN_API_URL}/jobs/${id}`);
      const j = await readEngineResponse(r);
      if (!j || !['queued', 'running', 'done', 'error'].includes(j.status)) {
        throw new Error('The sport engine returned an invalid job status. Please try again.');
      }
      setJob(j);
      if (j.status === 'done') setResult(j.result);
      else if (j.status === 'error') setError(j.error || 'Generation failed.');
      else timer.current = setTimeout(() => poll(id), 3000);
    } catch (e) {
      setError(`Lost contact with the sport engine: ${e.message}`);
      setJob(j => j && { ...j, status: 'error' });
    }
  }

  async function invent() {
    setError(''); setResult(null);
    const body = { ...form, minutes: Number(form.minutes), equipment: ['none'], space: 'standing in front of a webcam, upper body in frame' };
    try {
      const r = await fetch(`${SPORTGEN_API_URL}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await readEngineResponse(r);
      if (!data || typeof data.id !== 'string' || !data.id) {
        throw new Error('The sport engine did not start a game. Please try again.');
      }
      const { id, engine } = data;
      setJob({ id, engine, status: 'queued', stage: 'queued', elapsed_s: 0 });
      timer.current = setTimeout(() => poll(id), 2000);
    } catch (e) {
      setError(`Could not start sport generation: ${e.message}`);
    }
  }

  const sport = result?.sport;
  const judge = result?.final_critique || result?.critique;
  return html`
    <section className="inventor" aria-labelledby="inventor-title">
      <div className="inventor-head">
        <h2 id="inventor-title">Invent a sport</h2>
        <p>Answer five questions. The AI designs a game your camera can score.</p>
      </div>
      <div className="inventor-form">
        <label>Players
          <select value=${form.players} onChange=${set('players')}>
            <option value="solo">Solo</option><option value="1v1 taking turns">1v1, taking turns</option><option value="2-4 taking turns">2–4, taking turns</option>
          </select></label>
        <label>Minutes
          <select value=${form.minutes} onChange=${set('minutes')}>${[1, 2, 3, 5].map(m => html`<option key=${m} value=${m}>${m}</option>`)}</select></label>
        <label>Intensity
          <select value=${form.intensity} onChange=${set('intensity')}><option>low</option><option>medium</option><option>high</option></select></label>
        <label>Who plays
          <select value=${form.audience} onChange=${set('audience')}>
            <option value="adults">Adults</option><option value="kids 8-12">Kids 8–12</option><option value="teens">Teens</option><option value="office team">Office team</option><option value="party">Party</option>
          </select></label>
        <label>Rules
          <select value=${form.depth} onChange=${set('depth')}><option value="simple">Simple</option><option value="normal">Normal</option><option value="deep">Deep</option></select></label>
        <label>Engine
          <select value=${form.engine} onChange=${set('engine')}><option value="fast">Fast (~1–3 min)</option><option value="best">Best (~5–8 min)</option></select></label>
        <label className="wide">Anything else
          <input value=${form.notes} onChange=${set('notes')} placeholder="sore shoulder, make it silly, boxing theme…" maxLength="140"/></label>
      </div>
      <div className="inventor-actions">
        <button className="primary" disabled=${busy} onClick=${invent}>${busy ? 'Inventing…' : result ? 'Invent another' : 'Invent my sport'} <span aria-hidden="true">↗</span></button>
        ${busy && html`<span className="inventor-status" role="status"><i></i>${STAGES[job.stage] || job.stage} ${Math.round(job.elapsed_s || 0)}s</span>`}
      </div>
      ${error && html`<p className="message" role="alert">${error}</p>`}
      ${sport && html`<${RuleCard} sport=${sport} judge=${judge} alternatives=${result.alternatives} onPlay=${() => onPlay(sport)} onRead=${onRead ? () => onRead(sport) : undefined} disabled=${disabled}/>`}
    </section>`;
}

export function RuleCard({ sport, judge, alternatives, onPlay, disabled, onRead }) {
  return html`
    <article className="rule-card">
      <header>
        <h3>${sport.name}</h3>
        <p className="rule-tagline">${sport.tagline}</p>
      </header>
      <p><strong>Goal.</strong> ${sport.objective}</p>
      <p><strong>Setup.</strong> ${sport.field}</p>
      <ul className="moves">
        ${sport.moves.map(m => html`<li key=${m.name}>
          <span className=${'pts ' + (m.points < 0 ? 'neg' : m.points === 0 ? 'zero' : '')}>${m.points > 0 ? '+' : ''}${m.points}</span>
          <div><strong>${m.name}</strong> <code>${m.trigger}</code><br/>${m.rule}</div>
        </li>`)}
      </ul>
      <p><strong>Twist.</strong> ${sport.twist}</p>
      <p><strong>Catch-up.</strong> ${sport.catch_up}</p>
      ${sport.fouls?.length ? html`<p><strong>Fouls.</strong> ${sport.fouls.join(' ')}</p>` : null}
      <p><strong>Round.</strong> ${sport.round_seconds}s · ${sport.duration}</p>
      <p className="first30"><strong>First 30 seconds.</strong> ${sport.first_30_seconds}</p>
      <footer>
        <button type="button" disabled=${!onRead} onClick=${onRead} title=${onRead ? 'Read these rules aloud' : 'Enable voice in the coach controls to hear the rules'}>Read rules aloud</button>
        <button className="primary" disabled=${disabled} onClick=${onPlay}>Play ${sport.name} <span aria-hidden="true">↗</span></button>
        ${judge && html`<span className="judge" title="AI playtest judge, out of 35">judge ${Object.values(judge.scores).reduce((a, b) => a + b, 0)}/35</span>`}
        ${alternatives?.length ? html`<span className="alts">also considered: ${alternatives.map(a => a.name).join(', ')}</span>` : null}
      </footer>
    </article>`;
}

// Live round: call start() when the camera is tracking; feed the latest tracker counts via `counts`.
export function LiveRound({ sport, triggers, counts, onExit, onRead }) {
  const [round, setRound] = useState(null); // { baseline, startedAt, endsAt, final? }
  const [now, setNow] = useState(Date.now());
  const bestKey = `stillwatch.best.${sport.name}`;
  const [best, setBest] = useState(() => Number(localStorage.getItem(bestKey) || 0));

  useEffect(() => {
    if (!round || round.final) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [round]);

  const live = round ? scoreRound(sport, triggers, round.baseline, counts) : null;
  useEffect(() => {
    if (round && !round.final && now >= round.endsAt) {
      const final = scoreRound(sport, triggers, round.baseline, counts);
      setRound(r => ({ ...r, final }));
      if (final.total > best) { setBest(final.total); localStorage.setItem(bestKey, String(final.total)); }
    }
  }, [now]);

  function start() {
    const startedAt = Date.now();
    setRound({ baseline: { ...(counts || {}) }, startedAt, endsAt: startedAt + sport.round_seconds * 1000 });
  }

  const remaining = round ? Math.max(0, Math.ceil((round.endsAt - now) / 1000)) : sport.round_seconds;
  const shown = round?.final || live;
  return html`
    <section className="live-round" aria-live="polite">
      <div className="live-head">
        <div><span className="workspace-label">Now playing</span><h3>${sport.name}</h3></div>
        <div className="clock ${round && !round.final && remaining <= 10 ? 'urgent' : ''}">${remaining}s</div>
      </div>
      <div className="scoreboard">
        <output className="total" aria-label="Score">${shown ? shown.total : 0}</output>
        <ul>
          ${(shown?.perMove || sport.moves.map(m => ({ ...m, hits: 0, total: 0 }))).map(m => html`<li key=${m.name}>
            <span>${m.name}</span><span className="hits">${m.hits}×</span><span className=${'pts ' + (m.points < 0 ? 'neg' : '')}>${m.total > 0 ? '+' : ''}${m.total}</span>
          </li>`)}
        </ul>
      </div>
      <p className="live-hint">${!round ? sport.first_30_seconds : round.final ? (round.final.total >= best && round.final.total > 0 ? 'New best!' : `Best: ${best}`) : sport.twist}</p>
      <div className="live-actions">
        <button type="button" disabled=${!onRead} onClick=${onRead}>Read rules aloud</button>
        ${!round || round.final
          ? html`<button className="primary" onClick=${start}>${round ? 'Play again' : `Start ${sport.round_seconds}s round`} <span aria-hidden="true">↗</span></button>`
          : html`<button onClick=${() => setRound(r => ({ ...r, endsAt: Date.now() }))}>End round</button>`}
        <button onClick=${onExit}>Back to sports</button>
      </div>
    </section>`;
}
