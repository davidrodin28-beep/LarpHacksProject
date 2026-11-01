const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]];

function classifyHand(landmarks) {
  const wrist = landmarks[0];
  let extended = 0;
  let curled = 0;
  for (const [tipIndex, pipIndex] of FINGERS) {
    const tip = landmarks[tipIndex];
    const pip = landmarks[pipIndex];
    const tipDistance = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const pipDistance = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    if (tipDistance > pipDistance * 1.16) extended += 1;
    else if (tipDistance < pipDistance * 0.94) curled += 1;
  }
  return { open: extended >= 3, fist: curled >= 3 };
}

export class HandEnrollment {
  constructor() {
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
      let bestDistance = 0.18;
      for (const track of this.tracks) {
        if (claimed.has(track.id) || track.side !== side || timestamp - track.lastSeen > 1100) continue;
        const distance = Math.hypot(track.x - wrist.x, track.y - wrist.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          match = track;
        }
      }

      if (!match) {
        match = { id: this.nextId++, side, x: wrist.x, y: wrist.y, sawFist: false, selected: false, lastSeen: timestamp };
        this.tracks.push(match);
      }
      claimed.add(match.id);
      match.x = match.x * 0.35 + wrist.x * 0.65;
      match.y = match.y * 0.35 + wrist.y * 0.65;
      match.lastSeen = timestamp;

      const gesture = classifyHand(landmarks);
      if (gesture.fist) match.sawFist = true;
      if (gesture.open && match.sawFist) {
        if (!match.selected) this.selectionChangedAt = timestamp;
        match.selected = true;
        match.sawFist = false;
      }
    });
  }

  autoReady(now) {
    const selected = this.tracks.filter(t => t.selected && now-t.lastSeen < 700);
    const waiting = this.tracks.some(t => t.sawFist && !t.selected && now-t.lastSeen < 700);
    return selected.length > 0 && !waiting && now-this.selectionChangedAt >= 2500;
  }

  get canConfirm() {
    return this.tracks.some((track) => track.selected);
  }

  get statusMessage() {
    const selected = this.tracks.filter((track) => track.selected);
    const waitingForOpen = this.tracks.some((track) => track.sawFist && !track.selected);
    if (selected.length) {
      const names = selected.map(({ side }) => `${side} hand`).join(' + ');
      return `${names} selected${waitingForOpen ? ' · open your fist' : ''} · starting automatically${selected.length < 2 ? '; add another hand now' : ''}`;
    }
    return waitingForOpen ? 'Fist detected — now open your hand' : 'Make a fist, then open it';
  }

  confirm() {
    this.targets = this.tracks
      .filter((track) => track.selected)
      .map(({ id, side, x, y }) => ({ id, side, x, y }));
    if (this.targets.length) this.calibrating = false;
    return this.targets.length > 0;
  }

  get selectedSides() {
    return [...new Set(this.targets.map(({ side }) => side))];
  }

  visibleHands(handResult, poseResult) {
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

    const remaining = [...candidates];
    const matched = [];
    for (const target of this.targets) {
      let bestIndex = -1;
      let bestDistance = 0.35;
      for (let index = 0; index < remaining.length; index += 1) {
        const hand = remaining[index];
        if (hand.side !== target.side) continue;
        const distance = Math.hypot(hand.x - target.x, hand.y - target.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      if (bestIndex < 0) continue;
      const [hand] = remaining.splice(bestIndex, 1);
      target.x = target.x * 0.35 + hand.x * 0.65;
      target.y = target.y * 0.35 + hand.y * 0.65;
      matched.push({...hand,trackId:target.id});
    }

    if (!matched.length) return [];
    const nearest = matched.reduce((closest, hand) => hand.depth < closest.depth ? hand : closest, matched[0]);
    return matched.map((hand) => ({ ...hand, near: hand === nearest }));
  }
}
