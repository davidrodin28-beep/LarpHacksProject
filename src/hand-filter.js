// Smooth only fresh observations. Faster movements use less smoothing.
export class HandFilter {
  constructor() { this.reset(); }
  reset() { this.tracks = new Map(); }
  update(hands, now, aspect = 1) {
    const live = new Set();
    const output = hands.map(hand => {
      const key = hand.trackId ?? hand.side;
      live.add(key);
      const previous = this.tracks.get(key);
      const fresh = !previous || now-previous.time > 250;
      const dt = previous ? Math.max(0.01,(now-previous.time)/1000) : 0.033;
      const landmarks = hand.landmarks.map((p,i)=>{
        const old = previous?.landmarks[i];
        if (fresh || !old) return {...p};
        const speed = Math.hypot((p.x-old.x)*aspect,p.y-old.y)/dt;
        const alpha = Math.min(0.95, 1-Math.exp(-dt*(12+speed*80)));
        return {...p,x:old.x+alpha*(p.x-old.x),y:old.y+alpha*(p.y-old.y),
          z: Number.isFinite(p.z) && Number.isFinite(old.z) ? old.z+alpha*(p.z-old.z) : p.z};
      });
      this.tracks.set(key,{time:now,landmarks});
      return {...hand,landmarks};
    });
    for (const key of this.tracks.keys()) if (!live.has(key)) this.tracks.delete(key);
    return output;
  }
}
