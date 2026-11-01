export class CameraSource {
  constructor(video, selector) {
    this.video = video;
    this.selector = selector;
    this.stream = null;
  }

  get active() {
    return Boolean(this.stream);
  }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(({ kind }) => kind === 'videoinput');
      const previousSelection = this.selector.value;
      this.selector.replaceChildren();
      cameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${index + 1}`;
        this.selector.append(option);
      });
      if (!cameras.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No cameras found';
        this.selector.append(option);
      }
      if (cameras.some(({ deviceId }) => deviceId === previousSelection)) {
        this.selector.value = previousSelection;
      }
      return cameras;
    } catch {
      return [];
    }
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires localhost or a secure HTTPS page.');
    }
    this.stop();
    const deviceId = this.selector.value;
    const video = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    this.video.srcObject = this.stream;
    await this.video.play();
    return this.stream;
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  onDeviceChange(callback) {
    navigator.mediaDevices?.addEventListener?.('devicechange', callback);
  }
}
