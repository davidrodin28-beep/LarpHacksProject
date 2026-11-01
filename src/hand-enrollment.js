import { matchHands } from './hand-matcher.js';
export class HandEnrollment {
  constructor() {
    this.expectedHands = 2;
    this.calibrating = false;
    this.tracks = [];
    this.targets = [];
    this.nextId = 1;
    this.selectionChangedAt = 0;
  }

  begin() {
    this.calibrating = true;
    this.tracks = [];
    this.targets = [];
    this.nextId = 1;
    this.selectionChangedAt = 0;
  }

  reset() {
    this.calibrating = false;
    this.tracks = [];
    this.targets = [];
  }

  observe(result, timestamp = performance.now()) {
    if (!this.calibrating) return;
    const hands = result?.landmarks || [];
    const handedness = result?.handedness || [];
    const claimed = new Set();

    hands.forEach((landmarks, index) => {
      const side = handedness[index]?.[0]?.categoryName;
      const wrist = landmarks?.[0];
      if ((side !== 'Left' && side !== 'Right') || !wrist) return;

      let match = null;
      let bestDistance = 0.35;
      for (const track of this.tracks) {
        if (claimed.has(track.id) || track.side !== side || timestamp - track.lastSeen > 1100) continue;
        const distance = Math.hypot(track.x - wrist.x, track.y - wrist.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          match = track;
        }
      }

      if (!match) {
        match = { id: this.nextId++, side, x: wrist.x, y: wrist.y, visibleSince: timestamp, visibleSamples: 0, selected: false, lastSeen: timestamp };
        this.tracks.push(match);
      }
      claimed.add(match.id);
      match.x = match.x * 0.35 + wrist.x * 0.65;
      match.y = match.y * 0.35 + wrist.y * 0.65;
      match.lastSeen = timestamp;

      match.visibleSamples += 1;
      if (match.visibleSamples >= 3 && !match.selected) {
        match.selected = true;
        this.selectionChangedAt = timestamp;
      }
    });
  }

  selectedTracks(now = performance.now()) {
    const bySide = new Map();
    for(const track of this.tracks) {
      if(!track.selected || now-track.lastSeen>700)continue;
      if(!bySide.has(track.side)||bySide.get(track.side).lastSeen<track.lastSeen)bySide.set(track.side,track);
    }
    return [...bySide.values()].slice(0,this.expectedHands);
  }
  autoReady(now) {
    return this.selectedTracks(now).length === this.expectedHands && now-this.selectionChangedAt>=500;
  }
  get statusMessage() {
    const selected=this.selectedTracks();
    return selected.length===this.expectedHands
      ? `${selected.length}/${this.expectedHands} hands selected — starting automatically`
      : selected.length
        ? `${selected.length}/${this.expectedHands} hands found — bring the remaining hand into view`
        : `Bring ${this.expectedHands===1?'one hand':'both hands'} into view — 0/${this.expectedHands} found`;
  }
  confirm(poseResult, now=performance.now()) {
    const pose=poseResult?.landmarks?.[0] || [];
    const selected=this.selectedTracks(now);
    if(selected.length!==this.expectedHands)return false;
    this.targets=selected.map(({id,side,x,y})=>{
      const anchors=[15,16].filter(i=>pose[i]&&(pose[i].visibility??0)>=.55)
        .map(i=>({i,d:Math.hypot(pose[i].x-x,pose[i].y-y)})).sort((a,b)=>a.d-b.d);
      const first=anchors[0],second=anchors[1];
      const poseIndex=first && first.d<.18 && (!second || second.d-first.d>.06) ? first.i : null;
      return {id,side,x,y,poseIndex,lastSeen:now,vx:0,vy:0};
    });
    this.calibrating=false;
    return true;
  }

  get selectedSides() {
    return [...new Set(this.targets.map(({ side }) => side))];
  }

  visibleHands(handResult, poseResult, now = performance.now()) {
    const hands = handResult?.landmarks || [];
    const handedness = handResult?.handedness || [];
    const pose = poseResult?.landmarks?.[0] || [];
    const candidates = hands.map((landmarks, index) => {
      const side = handedness[index]?.[0]?.categoryName;
      const wristIndex = side === 'Left' ? 15 : side === 'Right' ? 16 : -1;
      const poseWrist = pose[wristIndex];
      return {
        landmarks,
        side,
        x: landmarks[0]?.x ?? 0,
        y: landmarks[0]?.y ?? 0,
        depth: poseWrist && (poseWrist.visibility ?? 1) > 0.35 ? poseWrist.z : Infinity,
        preview: this.calibrating,
      };
    });

    if (this.calibrating) return candidates;

    const matched = matchHands(this.targets,candidates,pose,now);

    if (!matched.length) return [];
    const nearest = matched.reduce((closest, hand) => hand.depth < closest.depth ? hand : closest, matched[0]);
    return matched.map((hand) => ({ ...hand, near: hand === nearest }));
  }
}
