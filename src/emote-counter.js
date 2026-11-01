const VERTICAL_SEPARATION = 0.09;
const STABLE_SAMPLES = 2;
const CYCLE_COOLDOWN_MS = 650;

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
    this.lastStableSide = 0;
    this.startSide = 0;
    this.sawOppositeSide = false;
    this.candidateSide = 0;
    this.candidateSamples = 0;
    this.lastCountAt = Number.NEGATIVE_INFINITY;
  }

  sample(hands, timestamp = performance.now()) {
    const left = hands.find((hand) => hand.side === 'Left' && hand.landmarks?.[0]);
    const right = hands.find((hand) => hand.side === 'Right' && hand.landmarks?.[0]);
    if (!left || !right) {
      this.resetGesture();
      return this.count;
    }

    // Image y increases downward: opposite wrist heights form the seesaw pose.
    const heightDifference = right.landmarks[0].y - left.landmarks[0].y;
    const observedSide = heightDifference > VERTICAL_SEPARATION ? 1
      : heightDifference < -VERTICAL_SEPARATION ? -1
        : 0;
    if (!observedSide) {
      this.candidateSide = 0;
      this.candidateSamples = 0;
      return this.count;
    }

    if (observedSide === this.candidateSide) this.candidateSamples += 1;
    else {
      this.candidateSide = observedSide;
      this.candidateSamples = 1;
    }
    if (this.candidateSamples < STABLE_SAMPLES || observedSide === this.lastStableSide) return this.count;

    this.lastStableSide = observedSide;
    if (!this.startSide) {
      this.startSide = observedSide;
    } else if (observedSide !== this.startSide) {
      this.sawOppositeSide = true;
    } else if (this.sawOppositeSide && timestamp - this.lastCountAt >= CYCLE_COOLDOWN_MS) {
      this.count += 1;
      this.lastCountAt = timestamp;
      this.sawOppositeSide = false;
    }
    return this.count;
  }
}
