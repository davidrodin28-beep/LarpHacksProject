const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const ARMS = [
  { side: 'Left', shoulder: 11, elbow: 13, wrist: 15, color: '#6be3cb' },
  { side: 'Right', shoulder: 12, elbow: 14, wrist: 16, color: '#e795ff' },
];

export class OverlayRenderer {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
  }

  resize(stage) {
    const bounds = stage.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(bounds.width * density);
    this.canvas.height = Math.round(bounds.height * density);
  }

  clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render({ poseResult, faceResult, handOverlays, selectedSides }) {
    const { context, canvas, video } = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.save();
    this.#drawPose(poseResult, selectedSides);
    this.#drawFace(faceResult, poseResult);
    handOverlays.forEach((hand) => this.#drawHand(hand));
    context.restore();
  }

  #point(point) {
    return { x: point.x * this.canvas.width, y: point.y * this.canvas.height };
  }

  #dot(point, color, radius = 5, minVisibility = 0.45) {
    if (!point || (point.visibility ?? 1) < minVisibility) return;
    const { x, y } = this.#point(point);
    const { context } = this;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#111712';
    context.stroke();
  }

  #label(text, point, color) {
    if (!point) return;
    const { context, canvas } = this;
    const { x, y } = this.#point(point);
    const fontSize = Math.max(11, canvas.width / 78);
    context.font = `600 ${fontSize}px DM Mono,monospace`;
    const textWidth = context.measureText(text).width;
    const boxHeight = fontSize + 8;
    const top = y - boxHeight - 8;
    context.fillStyle = '#111712dc';
    context.fillRect(x - textWidth / 2 - 6, top, textWidth + 12, boxHeight);
    context.fillStyle = color;
    context.textAlign = 'center';
    context.fillText(text, x, top + fontSize + 1);
    context.textAlign = 'start';
  }

  #drawPose(poseResult, selectedSides) {
    const pose = poseResult?.landmarks?.[0];
    if (!pose) return;
    const { context, canvas } = this;
    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    if (leftShoulder && rightShoulder && (leftShoulder.visibility ?? 1) > 0.45 && (rightShoulder.visibility ?? 1) > 0.45) {
      const left = this.#point(leftShoulder);
      const right = this.#point(rightShoulder);
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.strokeStyle = '#6be3cb';
      context.lineWidth = Math.max(2, canvas.width / 420);
      context.stroke();
      this.#dot(leftShoulder, '#6be3cb', 6);
      this.#dot(rightShoulder, '#6be3cb', 6);
      this.#label('SHOULDERS', {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2,
      }, '#6be3cb');
    }

    for (const arm of ARMS) {
      const shoulder = pose[arm.shoulder];
      const elbow = pose[arm.elbow];
      const wrist = pose[arm.wrist];
      const selected = selectedSides.includes(arm.side);
      const color = selected ? arm.color : '#a8b5ac';
      context.lineWidth = Math.max(selected ? 3 : 2, canvas.width / 500);
      context.strokeStyle = color;
      this.#drawSegment(shoulder, elbow, 0.05);
      this.#drawSegment(elbow, wrist, 0.05);
      this.#dot(elbow, color, selected ? 7 : 6, 0.05);
      this.#dot(wrist, color, selected ? 7 : 6, 0.05);
      if (elbow && (elbow.visibility ?? 1) > 0.05) this.#label(`${arm.side.toUpperCase()} ELBOW`, elbow, color);
      if (wrist && (wrist.visibility ?? 1) > 0.05) this.#label(`${arm.side.toUpperCase()} WRIST`, wrist, color);
    }
  }

  #drawSegment(from, to, visibility) {
    if (!from || !to || (from.visibility ?? 1) <= visibility || (to.visibility ?? 1) <= visibility) return;
    const a = this.#point(from);
    const b = this.#point(to);
    const { context } = this;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  #drawFace(faceResult, poseResult) {
    const face = faceResult?.faceLandmarks?.[0];
    const color = '#c4f06a';
    if (!face) {
      const nose = poseResult?.landmarks?.[0]?.[0];
      if (nose && (nose.visibility ?? 1) > 0.45) {
        const { x, y } = this.#point(nose);
        this.context.beginPath();
        this.context.arc(x, y, Math.max(10, this.canvas.width / 55), 0, Math.PI * 2);
        this.context.strokeStyle = color;
        this.context.lineWidth = Math.max(2, this.canvas.width / 480);
        this.context.stroke();
        this.#label('HEAD', nose, color);
      }
      return;
    }

    const midpoint = (first, second) => ({ x: (face[first].x + face[second].x) / 2, y: (face[first].y + face[second].y) / 2 });
    const leftEye = midpoint(33, 133);
    const rightEye = midpoint(362, 263);
    const nose = face[1];
    const mouth = midpoint(13, 14);
    const center = {
      x: (leftEye.x + rightEye.x + nose.x + mouth.x) / 4,
      y: (leftEye.y + rightEye.y + nose.y + mouth.y) / 4,
    };
    const eyeSpan = Math.hypot((rightEye.x - leftEye.x) * this.canvas.width, (rightEye.y - leftEye.y) * this.canvas.height);
    const { x, y } = this.#point(center);
    this.context.beginPath();
    this.context.arc(x, y, Math.max(14, eyeSpan * 0.82), 0, Math.PI * 2);
    this.context.strokeStyle = color;
    this.context.lineWidth = Math.max(2, this.canvas.width / 480);
    this.context.stroke();
    this.#label('HEAD', center, color);
    this.#faceFeature(nose, 'NOSE', '#ffbd70', 0, -8);
    this.#faceFeature(leftEye, 'EYE', '#6be3cb', -12, -7);
    this.#faceFeature(rightEye, 'EYE', '#6be3cb', 12, -7);
    this.#faceFeature(mouth, 'MOUTH', '#e795ff', 0, Math.max(13, this.canvas.width / 50));
  }

  #faceFeature(point, name, color, offsetX = 0, offsetY = 0) {
    const { context, canvas } = this;
    const { x, y } = this.#point(point);
    context.beginPath();
    context.arc(x, y, Math.max(3, canvas.width / 220), 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#111712';
    context.stroke();
    context.font = `500 ${Math.max(9, canvas.width / 100)}px DM Mono,monospace`;
    context.textAlign = 'center';
    context.fillStyle = color;
    context.fillText(name, x + offsetX, y + offsetY);
    context.textAlign = 'start';
  }

  #drawHand(hand) {
    const color = hand.preview ? '#8dd9ff' : hand.near ? '#ffbd70' : '#e795ff';
    const { context, canvas } = this;
    context.lineWidth = Math.max(2, canvas.width / 560);
    context.strokeStyle = color;
    for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
      const from = hand.landmarks[fromIndex];
      const to = hand.landmarks[toIndex];
      if (!from || !to) continue;
      const a = this.#point(from);
      const b = this.#point(to);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    hand.landmarks.forEach((point, index) => this.#dot(point, color, index === 0 ? 5 : FINGERTIPS.has(index) ? 4 : 2.5));
    const label = hand.preview
      ? `${hand.side?.toUpperCase() || 'HAND'} · PREVIEW`
      : `${hand.near ? 'NEAR' : 'TRACKED'} HAND${hand.side ? ` · ${hand.side.toUpperCase()}` : ''}`;
    this.#label(label, hand.landmarks[0], color);
  }
}
