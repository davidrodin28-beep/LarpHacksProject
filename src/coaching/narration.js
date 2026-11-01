// Audio playback is separate from tracking: inference frames never trigger requests.
export function speechChunks(text, limit = 1400) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let end = remaining.lastIndexOf(' ', limit);
    if (end < limit / 2) end = limit;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function coachingNarration(lesson, coaching, phase, paused) {
  if (paused || phase !== 'tracking') return '';
  if (coaching.phase === 'completed') return 'Position drill complete. Well done. You can practice again when you are ready.';
  if (coaching.phase === 'practicing') {
    const step = lesson.steps[coaching.step];
    return step ? `Checkpoint ${coaching.step + 1}. ${step.title}. ${step.cue} Hold the position gently.` : '';
  }
  return '';
}

export function sportInstructions(sport) {
  return [sport.name, sport.tagline, `Goal. ${sport.objective}`, `Setup. ${sport.field}`,
    ...sport.moves.map(move => `${move.name}. ${move.rule} ${move.points} points.`),
    `Twist. ${sport.twist}`, `Catch up. ${sport.catch_up}`,
    ...(sport.fouls || []).map(foul => `Foul. ${foul}`),
    `Round length. ${sport.round_seconds} seconds. ${sport.duration}`,
    `First thirty seconds. ${sport.first_30_seconds}`].join(' ');
}

export class VoiceNarrator {
  constructor({ endpoint, getToken, onStatus = () => {}, fetcher = (url, options) => fetch(url, options),
    createAudio = url => new Audio(url), urls = URL }) {
    Object.assign(this, { endpoint, getToken, onStatus, fetcher, createAudio, urls });
    this.cache = new Map();
    this.version = 0;
  }

  stop() {
    this.version++;
    this.request?.abort();
    this.releasePlayback?.();
    this.audio?.pause();
    if (this.audio) this.audio.src = '';
    if (this.url) this.urls.revokeObjectURL(this.url);
    this.audio = this.url = this.releasePlayback = null;
    this.onStatus('');
  }

  async speak(text) {
    this.stop();
    const version = this.version;
    const request = this.request = new AbortController();
    try {
      for (const chunk of speechChunks(text)) {
        if (version !== this.version) return;
        let blob = this.cache.get(chunk);
        if (!blob) {
          this.onStatus('Preparing voice…');
          const token = await this.getToken();
          if (version !== this.version) return;
          if (!token) throw new Error('Log in again to use spoken instructions.');
          const timeout = setTimeout(() => request.abort(), 50000);
          let response;
          try {
            response = await this.fetcher(this.endpoint, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ text: chunk }), signal: request.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
          if (!response.ok) {
            let detail;
            try { detail = (await response.json()).detail; } catch {}
            throw new Error(typeof detail === 'string' ? detail : 'Spoken instructions are unavailable. Please try again.');
          }
          blob = await response.blob();
          if (version !== this.version) return;
          if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value);
          this.cache.set(chunk, blob);
        }
        if (version !== this.version) return;
        if (this.url) this.urls.revokeObjectURL(this.url);
        this.url = this.urls.createObjectURL(blob);
        const audio = this.audio = this.createAudio(this.url);
        await new Promise((resolve, reject) => {
          this.releasePlayback = resolve;
          audio.onended = resolve;
          audio.onerror = () => reject(new Error('Unable to play voice audio. Please try again.'));
          Promise.resolve(audio.play()).then(() => {
            if (version === this.version) this.onStatus('Speaking…');
          }, reject);
        });
      }
      if (version === this.version) this.stop();
    } catch (error) {
      if (version !== this.version) return;
      this.stop();
      this.onStatus(error.name === 'NotAllowedError'
        ? 'Your browser blocked playback. Use the step or rules playback button to try again.'
        : error.name === 'AbortError' ? 'Voice took too long to load. Please try again.'
        : error.message || 'Spoken instructions are unavailable. Please try again.');
    }
  }

  dispose() {
    this.stop();
    this.cache.clear();
  }
}
