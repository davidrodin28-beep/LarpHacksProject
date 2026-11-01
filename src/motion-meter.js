import { MOTION_FRAME_SIZE, MOTION_SAMPLE_STEP } from './config.js';

export class MotionMeter {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = MOTION_FRAME_SIZE.width;
    this.canvas.height = MOTION_FRAME_SIZE.height;
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.previousFrame = null;
    this.peak = 0;
    this.history = Array(45).fill(0);
    this.lastHistoryAt = 0;
  }

  sample(video, sensitivity, now = Date.now()) {
    const { width, height } = MOTION_FRAME_SIZE;
    this.context.drawImage(video, 0, 0, width, height);
    const rgba = this.context.getImageData(0, 0, width, height).data;
    const grayscale = new Uint8Array(width * height);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
      grayscale[target] = (rgba[source] * 77 + rgba[source + 1] * 150 + rgba[source + 2] * 29) >> 8;
    }

    if (!this.previousFrame) {
      this.previousFrame = grayscale;
      return this.#snapshot(0);
    }

    let changedCells = 0;
    const step = MOTION_SAMPLE_STEP;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        let difference = 0;
        let count = 0;
        for (let sampleY = y; sampleY < Math.min(y + step, height); sampleY += 2) {
          for (let sampleX = x; sampleX < Math.min(x + step, width); sampleX += 2) {
            const index = sampleY * width + sampleX;
            difference += Math.abs(grayscale[index] - this.previousFrame[index]);
            count += 1;
          }
        }
        if (difference / count > sensitivity) changedCells += 1;
      }
    }

    this.previousFrame = grayscale;
    const level = Math.min(100, changedCells / ((width / step) * (height / step)) * 100);
    this.peak = Math.max(this.peak, level);
    if (now - this.lastHistoryAt >= 1000) {
      this.history.push(level);
      this.history.shift();
      this.lastHistoryAt = now;
    }
    return this.#snapshot(level);
  }

  reset() {
    this.previousFrame = null;
    this.peak = 0;
    this.history.fill(0);
    this.lastHistoryAt = 0;
  }

  resetPreviousFrame() {
    this.previousFrame = null;
  }

  #snapshot(level) {
    return { level, peak: this.peak, history: [...this.history] };
  }
}
