export class ComboCounter {
  constructor(lead = 'Left') {
    this.lead = lead;
    this.jabs = 0; this.crosses = 0; this.combos = 0;
    this.resetSequence();
  }
  resetSequence() { this.jabAt = null; this.status = 'Ready for jab → cross'; }
  setLead(side) { this.lead = side; this.resetSequence(); }
  observe(events, now) {
    if (this.jabAt !== null && now-this.jabAt > 1200) this.resetSequence();
    // A single frame cannot establish the order of two simultaneous extensions.
    if (events.length > 1) { this.resetSequence(); return; }
    if (!events.length) return;
    if (events[0] === this.lead) {
      this.jabs++; this.jabAt = now; this.status = 'Jab detected — follow with a cross';
    } else {
      this.crosses++;
      const elapsed = this.jabAt === null ? Infinity : now-this.jabAt;
      if (elapsed >= 80 && elapsed <= 1200) {
        this.combos++; this.status = 'Jab–cross +1';
      } else this.status = 'Cross detected — start the next combo with a jab';
      this.jabAt = null;
    }
  }
}
