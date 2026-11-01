export function jointAngle(a, b, c, aspect = 1) {
  const u = [(a.x-b.x)*aspect, a.y-b.y];
  const v = [(c.x-b.x)*aspect, c.y-b.y];
  const size = Math.hypot(...u)*Math.hypot(...v);
  return size < 1e-6 ? null : Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1])/size)))*180/Math.PI;
}
const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= 0.65;
const distance = (a,b,aspect) => Math.hypot((a.x-b.x)*aspect,a.y-b.y);

export class MovementCounter {
  constructor() { this.reset(); }
  reset() {
    this.counts = { arms: 0, opens: 0, closes: 0, tilts: 0 };
    this.resetGesture();
  }
  resetGesture() {
    this.states = new Map();
    this.angles = {};
    this.status = 'Counting automatically';
  }
  transition(key, next, now, onChange) {
    if (!next) {
      const existing = this.states.get(key);
      if (existing) existing.seen = now;
      return;
    }
    let state = this.states.get(key);
    if (!state || now-state.seen > 700) state = { stable: null, candidate: null, samples: 0 };
    state.seen = now;
    state.samples = state.candidate === next ? state.samples+1 : 1;
    state.candidate = next;
    if (state.samples >= 2 && state.stable !== next) {
      onChange(state.stable, next);
      state.stable = next;
    }
    this.states.set(key,state);
  }
  sample(poseResult, hands, now, aspect = 1) {
    const pose = poseResult?.landmarks?.[0] || [];
    this.angles = {};
    for (const [side,s,e,w] of [['Left',11,13,15],['Right',12,14,16]]) {
      if (![pose[s],pose[e],pose[w]].every(valid)) { this.states.delete('arm'+side); continue; }
      const angle = jointAngle(pose[s],pose[e],pose[w],aspect);
      if (angle === null) continue;
      this.angles[side] = Math.round(angle);
      this.transition('arm'+side,angle >= 155 ? 'straight' : angle <= 115 ? 'bent' : null,now,(before,after)=>{
        if (before === 'bent' && after === 'straight') this.counts.arms++;
      });
    }
    for (const hand of hands) {
      const p = hand.landmarks;
      if (!hand.side || !p || p.length < 21) continue;
      const angles = [[5,6,8],[9,10,12],[13,14,16],[17,18,20]].map(([a,b,c])=>jointAngle(p[a],p[b],p[c],aspect));
      const open = angles.filter(a=>a !== null && a >= 150).length >= 3;
      const closed = angles.filter(a=>a !== null && a <= 100).length >= 3;
      this.transition('hand'+hand.side,open ? 'open' : closed ? 'closed' : null,now,(before,after)=>{
        if (before === 'open' && after === 'closed') this.counts.closes++;
        if (before === 'closed' && after === 'open') this.counts.opens++;
      });
    }
    // Ears 7/8 and shoulders 11/12 belong to the same detected pose.
    if ([pose[7],pose[8],pose[11],pose[12]].every(valid)) {
      const width = distance(pose[11],pose[12],aspect);
      const lineAngle = (a,b)=>Math.atan2(b.y-a.y,(b.x-a.x)*aspect);
      let roll = lineAngle(pose[7],pose[8])-lineAngle(pose[11],pose[12]);
      roll = Math.atan2(Math.sin(roll),Math.cos(roll));
      const tilt = Math.abs(roll)*180/Math.PI;
      const leftGap = distance(pose[7],pose[11],aspect);
      const rightGap = distance(pose[8],pose[12],aspect);
      const difference = width > 0.08 ? (rightGap-leftGap)/width : 0;
      const next = tilt < 8 ? 'neutral' : tilt > 15 && Math.abs(difference) > 0.12 ? (difference > 0 ? 'left' : 'right') : null;
      this.transition('neck',next,now,(before,after)=>{
        if (before && after !== 'neutral' && before !== after) this.counts.tilts++;
      });
    } else this.states.delete('neck');
    const angles = Object.entries(this.angles).map(([side,a])=>`${side} elbow ${a}°`).join(' · ');
    this.status = angles || 'Keep shoulders, elbows and wrists visible';
    return this.counts;
  }
}
