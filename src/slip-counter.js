const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= 0.65;
export class SlipCounter {
  constructor() { this.count = 0; this.resetGesture(); }
  resetGesture() {
    this.baseline = null; this.referenceWidth = null; this.samples = [];
    this.lastSeen = null; this.stable = 'center'; this.candidate = null;
    this.status = 'Face camera; hold head centered briefly';
  }
  sample(pose, now, aspect = 1) {
    if (this.lastSeen !== null && now-this.lastSeen > 700) this.resetGesture();
    if (![pose?.[7],pose?.[8],pose?.[11],pose?.[12]].every(valid)) {
      this.status = 'Keep both ears and shoulders visible';
      return this.count;
    }
    const [a,b,l,r] = [pose[7],pose[8],pose[11],pose[12]];
    const sx=(r.x-l.x)*aspect, sy=r.y-l.y, width=Math.hypot(sx,sy);
    const ex=(b.x-a.x)*aspect, ey=b.y-a.y;
    const earSpan=Math.hypot(ex,ey);
    const roll=Math.abs(Math.atan2(ex*sy-ey*sx,ex*sx+ey*sy))*180/Math.PI;
    if (width < 0.12 || earSpan/width < 0.25 || roll > 20) {
      this.status = 'Face forward; slip sideways with head mostly upright';
      return this.count;
    }
    this.lastSeen = now;
    if (this.referenceWidth && Math.abs(width/this.referenceWidth-1) > 0.4) this.resetGesture();
    const hx=((a.x+b.x-l.x-r.x)/2)*aspect, hy=(a.y+b.y-l.y-r.y)/2;
    const offset=(hx*sx+hy*sy)/(width*width);
    if (this.baseline === null) {
      this.samples.push({offset,time:now});
      if (Math.max(...this.samples.map(s=>s.offset))-Math.min(...this.samples.map(s=>s.offset)) > 0.06) this.samples=[{offset,time:now}];
      if (this.samples.length >= 8 && now-this.samples[0].time >= 450) {
        this.baseline=this.samples.reduce((s,p)=>s+p.offset,0)/this.samples.length;
        this.referenceWidth=width; this.status='Ready for head slips';
      }
      return this.count;
    }
    const delta=offset-this.baseline;
    const next=delta > 0.18 ? 'right' : delta < -0.18 ? 'left' : Math.abs(delta)<0.07 ? 'center' : null;
    if (!next) { this.candidate=null; return this.count; }
    if (this.candidate !== next) { this.candidate=next; this.since=now; }
    if (now-this.since >= 60 && next !== this.stable) {
      if (next !== 'center') this.count++;
      this.stable=next;
    }
    this.status = this.stable === 'center' ? 'Ready for head slips' : 'Slip detected — return or switch sides';
    return this.count;
  }
}
