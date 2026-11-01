// Camera lifecycle only. Teammate-owned landmark tracking can be integrated here.
// UI does not own streams or frame processing.
export function createCamera(video) {
  let stream = null;
  let generation = 0;
  let mirrored = true;
  return {
    async start() {
      const request = ++generation;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost or HTTPS.');
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (request !== generation) { next.getTracks().forEach(track => track.stop()); return false; }
      stream?.getTracks().forEach(track => track.stop());
      stream = next;
      video.srcObject = stream;
      await video.play();
      return request === generation;
    },
    stop() { generation++; stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; },
    mirror(value) { mirrored = value; video.style.transform = value ? 'scaleX(-1)' : 'none'; },
    async snapshot() {
      if (!stream || video.readyState < 2) throw new Error('Enable your camera before saving a snapshot.');
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not save this frame. Please try again.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `stillwatch-${Date.now()}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
}
