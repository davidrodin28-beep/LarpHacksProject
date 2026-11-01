export function jointAngle(a, b, c, aspect = 1) {
  const u = [(a.x-b.x)*aspect, a.y-b.y];
  const v = [(c.x-b.x)*aspect, c.y-b.y];
  const size = Math.hypot(...u)*Math.hypot(...v);
  return size < 1e-6 ? null : Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1])/size)))*180/Math.PI;
}
export function worldJointAngle(a,b,c) {
  const u = [a.x-b.x,a.y-b.y,a.z-b.z];
  const v = [c.x-b.x,c.y-b.y,c.z-b.z];
  const size = Math.hypot(...u)*Math.hypot(...v);
  return size < 1e-6 ? null : Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,n,i)=>sum+n*v[i],0)/size)))*180/Math.PI;
}
// Reach is normalized by the two arm segments, not projected shoulder width.
// This remains unchanged when a 3D arm rotates or the person moves farther away.
export function armGeometry(shoulder, elbow, wrist) {
  const points = [shoulder,elbow,wrist];
  if (!points.every(p=>p && [p.x,p.y,p.z].every(Number.isFinite))) return null;
  const length = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const upper = length(shoulder,elbow), lower = length(elbow,wrist);
  if (Math.min(upper,lower) < 1e-5 || Math.max(upper,lower)/Math.min(upper,lower) > 3) return null;
  const angle = worldJointAngle(shoulder,elbow,wrist);
  const reach = length(shoulder,wrist)/(upper+lower);
  return { angle, reach, state: angle >= 150 && reach >= 0.96 ? 'straight'
    : angle <= 120 && reach <= 0.9 ? 'bent' : null };
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
    this.reaches = {};
    this.status = 'Counting automatically';
  }
  transition(key, next, now, onChange, requiredSamples = 2) {
    if (!next) {
      const existing = this.states.get(key);
      if (existing) { existing.seen = now; existing.samples = 0; existing.candidate = null; }
      return;
    }
    let state = this.states.get(key);
    if (!state || now-state.seen > 700) state = { stable: null, candidate: null, samples: 0 };
    state.seen = now;
    state.samples = state.candidate === next ? state.samples+1 : 1;
    state.candidate = next;
    if (state.samples >= requiredSamples && state.stable !== next) {
      onChange(state.stable, next);
      state.stable = next;
    }
    this.states.set(key,state);
  }
  sample(poseResult, hands, now, aspect = 1) {
    const pose = poseResult?.landmarks?.[0] || [];
    this.angles = {};
    this.reaches = {};
    const world = poseResult?.worldLandmarks?.[0] || [];
    for (const [side,s,e,w] of [['Left',11,13,15],['Right',12,14,16]]) {
      const key = 'arm'+side;
      const joints = [pose[s],pose[e],pose[w]];
      const hasWorld = [world[s],world[e],world[w]].every(p=>p && [p.x,p.y,p.z].every(Number.isFinite));
      const confidence = Math.min(...joints.map(p=>p?.visibility ?? (p ? 1 : 0)));
      if (confidence < (hasWorld ? 0.35 : 0.65) || !joints.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
        const prior = this.states.get(key);
        if (prior && now-prior.seen > 250) this.states.delete(key);
        continue;
      }
      // Fall back to aspect-corrected image geometry only when world data is absent.
      const geometry = hasWorld
        ? armGeometry(world[s],world[e],world[w])
        : armGeometry(...joints.map(p=>({x:p.x*aspect,y:p.y,z:0})));
      if (!geometry) { this.states.delete(key); continue; }
      const mode = hasWorld ? '3D' : '2D';
      const previous = this.states.get(key);
      if (previous && previous.mode !== mode) this.states.delete(key);
      const { angle, reach, state } = geometry;
      this.angles[side] = Math.round(angle);
      this.reaches[side] = { percent: Math.round(reach*100), mode };
      this.transition(key,state,now,(before,after)=>{
        if (before === 'bent' && after === 'straight') this.counts.arms++;
      }, hasWorld && confidence >= 0.65 ? 1 : 2);
      const current = this.states.get(key);
      if (current) current.mode = mode;
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
    const angles = Object.entries(this.angles).map(([side,a])=>`${side}: ${a}° · ${this.reaches[side].percent}% reach (${this.reaches[side].mode})`).join(' · ');
    this.status = angles || 'Keep shoulders, elbows and wrists visible';
    return this.counts;
  }
}
