import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = vm.createContext({ AbortController, setTimeout, clearTimeout,
  fetch: function () {
    assert.equal(this, undefined, 'Browser fetch must be called without a narrator instance as its receiver.');
    return Promise.resolve({ ok: true, blob: async () => ({ audio: true }) });
  },
});
const module = new vm.SourceTextModule(await readFile(new URL('../src/coaching/narration.js', import.meta.url), 'utf8'), { context });
await module.link(() => { throw new Error('Narration must stay independent of tracking and React.'); });
await module.evaluate();
const { VoiceNarrator, speechChunks, coachingNarration, sportInstructions } = module.namespace;
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ fetcher, autoFinish = true, token = 'session-token', defaultFetch = false } = {}) {
  const calls = [], audios = [], statuses = [], revoked = [];
  const narrator = new VoiceNarrator({
    endpoint: 'https://engine.example/speech', getToken: async () => token,
    onStatus: status => statuses.push(status),
    fetcher: defaultFetch ? undefined : fetcher || (async (url, options) => {
      calls.push({ url, options });
      return { ok: true, blob: async () => ({ audio: true }) };
    }),
    urls: { createObjectURL: () => `blob:${audios.length}`, revokeObjectURL: url => revoked.push(url) },
    createAudio: url => {
      const audio = { src: url, paused: false,
        pause() { this.paused = true; },
        play() { if (autoFinish) queueMicrotask(() => this.onended()); return Promise.resolve(); },
      };
      audios.push(audio);
      return audio;
    },
  });
  return { narrator, calls, audios, statuses, revoked };
}

test('the default browser fetch is called with a valid receiver', async () => {
  const f = fixture({ defaultFetch: true });
  await f.narrator.speak('Keep your hands up.');
  assert.equal(f.audios.length, 1);
  assert.equal(f.statuses.at(-1), '');
});

test('voice uses the backend and session token, then replays cached audio', async () => {
  const f = fixture();
  await f.narrator.speak('Extend your lead arm.');
  await f.narrator.speak('Extend your lead arm.');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://engine.example/speech');
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer session-token');
  assert.equal(JSON.parse(f.calls[0].options.body).text, 'Extend your lead arm.');
  assert.equal(f.audios.length, 2);
  assert.equal(f.revoked.length, 2);
});

test('muting stops playback and releases audio resources', async () => {
  const f = fixture({ autoFinish: false });
  const playing = f.narrator.speak('Hold your guard.');
  await tick();
  f.narrator.stop();
  await playing;
  assert.equal(f.audios[0].paused, true);
  assert.equal(f.audios[0].src, '');
  assert.equal(f.revoked.length, 1);
  assert.equal(f.statuses.at(-1), '');
});

test('a late response cannot play a stale checkpoint after a newer cue', async () => {
  let resolveOld;
  let oldSignal;
  const response = { ok: true, blob: async () => ({}) };
  const f = fixture({ fetcher: async (url, options) => {
    if (JSON.parse(options.body).text === 'Old cue') {
      oldSignal = options.signal;
      return new Promise(resolve => { resolveOld = resolve; });
    }
    return response;
  } });
  const old = f.narrator.speak('Old cue');
  await tick();
  await f.narrator.speak('New cue');
  resolveOld(response);
  await old;
  assert.equal(oldSignal.aborted, true);
  assert.equal(f.audios.length, 1);
});

test('long instructions are split and all chunks play in order', async () => {
  const text = 'Keep your hands near your cheeks. '.repeat(140).trim();
  const chunks = Array.from(speechChunks(text));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 1400));
  assert.equal(chunks.join(' '), text);
  const f = fixture();
  await f.narrator.speak(text);
  assert.equal(f.audios.length, chunks.length);
  assert.equal(f.calls.map(call => JSON.parse(call.options.body).text).join(' '), text);
});

test('missing sessions and provider errors show actionable messages without audio', async () => {
  const missing = fixture({ token: null });
  await missing.narrator.speak('Get ready.');
  assert.equal(missing.calls.length, 0);
  assert.match(missing.statuses.at(-1), /Log in again/);
  const unavailable = fixture({ fetcher: async () => ({ ok: false, json: async () => ({ detail: 'Voice is not configured.' }) }) });
  await unavailable.narrator.speak('Get ready.');
  assert.equal(unavailable.audios.length, 0);
  assert.match(unavailable.statuses.at(-1), /not configured/);
});

test('browser playback rejection is reported and does not leak the audio URL', async () => {
  const f = fixture({ autoFinish: false });
  f.narrator.createAudio = () => ({ pause() {}, play: () => Promise.reject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' })) });
  await f.narrator.speak('Get ready.');
  assert.match(f.statuses.at(-1), /browser blocked playback/);
  assert.equal(f.revoked.length, 1);
});

test('coaching narrates checkpoint changes but ignores frame progress and pauses', () => {
  const lesson = { name: 'Jab', focus: 'Return to guard.', tip: 'Move slowly.', steps: [
    { title: 'Guard', cue: 'Hands near cheeks.' }, { title: 'Extend', cue: 'Extend your lead hand.' },
  ] };
  const state = { phase: 'practicing', step: 0, progress: 0 };
  const first = coachingNarration(lesson, state, 'tracking', false);
  assert.match(first, /Hands near cheeks/);
  assert.doesNotMatch(first, /Extend your lead hand|Move slowly/);
  assert.equal(coachingNarration(lesson, { ...state, progress: .5 }, 'tracking', false), first);
  assert.match(coachingNarration(lesson, { ...state, step: 1 }, 'tracking', false), /Extend your lead hand/);
  assert.equal(coachingNarration(lesson, state, 'tracking', true), '');
  assert.equal(coachingNarration(lesson, state, 'off', false), '');
  const next = coachingNarration(lesson, { ...state, step: 1 }, 'tracking', false);
  assert.doesNotMatch(next, /Hands near cheeks/);
  assert.equal(coachingNarration(lesson, { ...state, phase: 'ready' }, 'tracking', false), '');
  assert.equal(coachingNarration(lesson, state, 'setup', false), '');
});

test('finishing the final checkpoint announces completion without reading steps ahead', () => {
  const lesson = { steps: [{ title: 'Guard', cue: 'Hands near cheeks.' }] };
  const text = coachingNarration(lesson, { phase: 'completed', step: 0 }, 'tracking', false);
  assert.match(text, /drill complete/);
  assert.doesNotMatch(text, /Hands near cheeks|Checkpoint/);
});

test('invented game narration includes rules, scoring, fouls and starting instructions', () => {
  const text = sportInstructions({ name: 'Shadow game', tagline: 'Test', objective: 'Score points', field: 'Stand in frame',
    moves: [{ name: 'Jab', rule: 'Extend your lead hand', points: 2 }], twist: 'Alternate arms', catch_up: 'Double points',
    fouls: ['No equipment'], round_seconds: 60, duration: 'One round', first_30_seconds: 'Start in guard' });
  for (const instruction of ['Extend your lead hand', '2 points', 'No equipment', 'Start in guard', '60 seconds']) assert.ok(text.includes(instruction));
});
