const finite = point => point && [point.x,point.y,point.z].every(Number.isFinite);
const midpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2});
const median = values => {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b), middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};

// Tracks chin movement relative to the eye line, so whole-head motion is reduced.
// The feature is a camera estimate, not a clinical measurement of neck posture.
export class ChinTracker {
  constructor(threshold=0.035) {
    this.threshold=threshold;
    this.reset();
  }
  reset() {
    this.baseline=null;
    this.samples=[];
    this.validFrames=0;
    this.tuckedFrames=0;
    this.current=null;
    this.status='Face camera during the round setup';
  }
  feature(faceResult,aspect=1) {
    const face=faceResult?.faceLandmarks?.[0];
    if(!face||face.length<=362||![face[33],face[133],face[263],face[362],face[152]].every(finite))return null;
    const left=midpoint(face[33],face[133]),right=midpoint(face[362],face[263]);
    const eyes=midpoint(left,right),chin=face[152];
    const eyeDx=(right.x-left.x)*aspect,eyeDy=right.y-left.y;
    const span=Math.hypot(eyeDx,eyeDy);
    if(span<0.025)return null;
    const roll=Math.atan2(eyeDy,eyeDx);
    const dx=(chin.x-eyes.x)*aspect,dy=chin.y-eyes.y;
    const rollCorrectedVertical=-dx*Math.sin(roll)+dy*Math.cos(roll);
    const depth=(chin.z-eyes.z)/span;
    return rollCorrectedVertical/span+depth*0.25;
  }
  sample(faceResult,phase,aspect=1) {
    const value=this.feature(faceResult,aspect);
    if(value===null) {
      this.current=null;
      if(phase==='preparing'||phase==='active')this.status='Face not visible — keep it in frame';
      return;
    }
    this.current=value;
    if(phase==='preparing') {
      this.samples.push(value);
      this.status=this.samples.length>=5?'Hold a relaxed, neutral chin':'Face visible — hold neutral for setup';
      return;
    }
    if(phase==='active') {
      if(this.baseline===null)return;
      this.validFrames++;
      if(value-this.baseline>=this.threshold) {
        this.tuckedFrames++;
        this.status='Chin tucked';
      } else this.status='Chin near neutral';
    }
  }
  beginCalibration() { this.reset(); }
  finishCalibration() {
    this.baseline=median(this.samples);
    this.validFrames=0;
    this.tuckedFrames=0;
    this.status=this.baseline===null?'Face not visible during setup':'Tracking chin position';
  }
  get available() { return this.baseline!==null&&this.validFrames>0; }
  get tuckPercent() { return this.available?Math.round(this.tuckedFrames/this.validFrames*100):null; }
}
