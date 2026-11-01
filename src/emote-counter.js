const MIN_TRAVEL = 0.065;
const MIN_REVERSAL = 0.035;
const RETURN_TOLERANCE = 0.045;
const MIN_CYCLE_MS = 280;
const MAX_CYCLE_MS = 2600;
const COUNT_DEBOUNCE_MS = 500;
const SMOOTHING = 0.45;

function makeAxis() {
  return { value: null, baseline: null, phase: 'idle', direction: 0, extreme: 0, startedAt: 0 };
}

function resetAxis(axis, value = null) {
  Object.assign(axis, { value, baseline: value, phase: 'idle', direction: 0, extreme: value ?? 0, startedAt: 0 });
}

function updateAxis(axis, sample, timestamp) {
  if (axis.value === null) {
    resetAxis(axis, sample);
    return false;
  }

  axis.value += (sample - axis.value) * SMOOTHING;
  if (axis.phase !== 'idle' && timestamp - axis.startedAt > MAX_CYCLE_MS) {
    resetAxis(axis, axis.value);
    return false;
  }

  if (axis.phase === 'idle') {
    axis.baseline += (axis.value - axis.baseline) * 0.025;
    const distance = axis.value - axis.baseline;
    if (Math.abs(distance) >= MIN_TRAVEL) {
      axis.phase = 'outbound';
      axis.direction = Math.sign(distance);
      axis.extreme = axis.value;
      axis.startedAt = timestamp;
    }
    return false;
  }

  if (axis.phase === 'outbound') {
    axis.extreme = axis.direction > 0
      ? Math.max(axis.extreme, axis.value)
      : Math.min(axis.extreme, axis.value);
    const reversed = (axis.extreme - axis.value) * axis.direction;
    if (reversed >= MIN_REVERSAL) axis.phase = 'returning';
    return false;
  }

  const returnedToStart = axis.direction > 0
    ? axis.value <= axis.baseline + RETURN_TOLERANCE
    : axis.value >= axis.baseline - RETURN_TOLERANCE;
  if (returnedToStart && timestamp - axis.startedAt >= MIN_CYCLE_MS) {
    resetAxis(axis, axis.value);
    return true;
  }
  return false;
}

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
    this.sharedHeight = makeAxis();
    this.alternatingHeight = makeAxis();
    this.lastCountAt = Number.NEGATIVE_INFINITY;
  }

  sample(hands, timestamp = performance.now()) {
    const left = hands.find((hand) => hand.side === 'Left' && Number.isFinite(hand.landmarks?.[0]?.y));
    const right = hands.find((hand) => hand.side === 'Right' && Number.isFinite(hand.landmarks?.[0]?.y));
    const tracked = [left, right].filter(Boolean);
    if (!tracked.length) {
      this.resetGesture();
      return this.count;
    }

    const averageHeight = tracked.reduce((sum, hand) => sum + hand.landmarks[0].y, 0) / tracked.length;
    const sharedCycle = updateAxis(this.sharedHeight, averageHeight, timestamp);
    let alternatingCycle = false;
    if (left && right) {
      alternatingCycle = updateAxis(
        this.alternatingHeight,
        right.landmarks[0].y - left.landmarks[0].y,
        timestamp,
      );
    } else {
      resetAxis(this.alternatingHeight);
    }

    if ((sharedCycle || alternatingCycle) && timestamp - this.lastCountAt >= COUNT_DEBOUNCE_MS) {
      this.count += 1;
      this.lastCountAt = timestamp;
      resetAxis(this.sharedHeight, averageHeight);
      resetAxis(this.alternatingHeight, left && right ? right.landmarks[0].y - left.landmarks[0].y : null);
    }
    return this.count;
  }
}
