const TRAVEL = 0.035;
const MAX_GAP_MS = 650;
const GROUP_WINDOW_MS = 400;

// Each enrolled wrist has its own trajectory. Averaging two wrists would
// cancel out the opposite movements in a seesaw gesture.
export class EmoteCounter {
  constructor() {
    this.count = 0;
    this.resetGesture();
  }

  reset() {
    this.count = 0;
    this.resetGesture();
  }

  resetGesture() {
    this.wrists = new Map();
    this.lastCountAt = -Infinity;
  }

  get status() {
    return [...this.wrists.values()].some(wrist => wrist.rising)
      ? 'Wrist raised — lower to count'
      : 'Ready — raise your wrists';
  }

  sample(hands, timestamp = performance.now()) {
    let completed = false;
    for (const hand of hands) {
      const y = hand.landmarks?.[0]?.y;
      if (!Number.isFinite(y) || !hand.side) continue;
      let wrist = this.wrists.get(hand.side);
      if (!wrist || timestamp - wrist.seenAt > MAX_GAP_MS) {
        wrist = { y, bottom: y, top: y, rising: false, seenAt: timestamp };
        this.wrists.set(hand.side, wrist);
        continue;
      }
      wrist.seenAt = timestamp;
      wrist.y += (y - wrist.y) * 0.75;
      if (!wrist.rising) {
        wrist.bottom = Math.max(wrist.bottom, wrist.y);
        if (wrist.bottom - wrist.y >= TRAVEL) {
          wrist.rising = true;
          wrist.top = wrist.y;
        }
      } else {
        wrist.top = Math.min(wrist.top, wrist.y);
        if (wrist.y - wrist.top >= TRAVEL) {
          completed = true;
          wrist.rising = false;
          wrist.bottom = wrist.y;
        }
      }
    }
    // Pair near-simultaneous completions so moving both hands adds only one.
    if (completed && timestamp - this.lastCountAt >= GROUP_WINDOW_MS) {
      this.count += 1;
      this.lastCountAt = timestamp;
    }
    return this.count;
  }
}
