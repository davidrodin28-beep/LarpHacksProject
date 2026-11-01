import { armGeometry } from './movement-counter.js';

const SPORTS = ['Basketball', 'Boxing', 'Tennis', 'Archery', 'Table tennis', 'Volleyball', 'Badminton', 'Soccer', 'Running', 'Golf', 'Baseball'];
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= 0.55;
const angle3 = (a, b, c) => {
  if (![a,b,c].every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) return null;
  const u=[a.x-b.x,a.y-b.y,a.z-b.z], v=[c.x-b.x,c.y-b.y,c.z-b.z];
  const size=Math.hypot(...u)*Math.hypot(...v);
  return size<1e-6 ? null : Math.acos(clamp(u.reduce((sum,n,i)=>sum+n*v[i],0)/size,-1,1))*180/Math.PI;
};
const armAngle = (pose, world, s, e, w, aspect) => {
  const joints=[pose[s],pose[e],pose[w]];
  if (!joints.every(visible)) return null;
  if ([world[s],world[e],world[w]].every(p=>p && Number.isFinite(p.z))) return angle3(world[s],world[e],world[w]);
  return armGeometry(...joints.map(p=>({x:p.x*aspect,y:p.y,z:0})))?.angle ?? null;
};

// These are single-camera movement estimates. They do not infer ball/racquet contact or force.
export class SportTracker {
  constructor(sport='Basketball') {
    this.sport=SPORTS.includes(sport)?sport:'Basketball';
    this.stance='Left';
    this.data=Object.fromEntries(SPORTS.map(name=>[name,{}]));
    this.clearGestureState();
  }
  setSport(sport) {
    if (!SPORTS.includes(sport) || sport===this.sport) return;
    this.sport=sport;
    this.clearGestureState();
  }
  setStance(stance) { this.stance=stance; this.clearGestureState(); }
  reset() { this.data=Object.fromEntries(SPORTS.map(name=>[name,{}])); this.clearGestureState(); }
  clearGestureState() {
    this.armState={Left:{bentAt:null,extended:false},Right:{bentAt:null,extended:false}};
    this.legState={Left:{bentAt:null,extended:false},Right:{bentAt:null,extended:false}};
    this.raiseState={Left:false,Right:false};
    this.swingState={Left:{samples:[],cooldown:0},Right:{samples:[],cooldown:0}};
    this.stepState={Left:{up:false,last:0,candidate:0},Right:{up:false,last:0,candidate:0}};
    this.jump={baseline:null,airborne:false,peak:0,counted:false,above:0,below:0};
    this.lastJabAt=0;
    this.stepTimes=[];
    this.holdSince=null; this.holdCounted=false;
  }
  bucket() { return this.data[this.sport]; }
  increment(key,n=1) { const b=this.bucket(); b[key]=(b[key]||0)+n; }
  average(key,value) {
    const b=this.bucket(), total=key+'Total', samples=key+'Samples';
    b[total]=(b[total]||0)+value;
    b[samples]=(b[samples]||0)+1;
    const digits=key.endsWith('Seconds')||key==='tempo'?1:0;
    b[key]=Number((b[total]/b[samples]).toFixed(digits));
    return b[key];
  }
  get metrics() {
    const d=this.bucket();
    if(this.sport==='Boxing') return [
      {label:'Jabs',value:d.jabs||0},{label:'Crosses',value:d.crosses||0},{label:'1–2 combos',value:d.combos||0},
      {label:'Jab extension',value:d.jabForm===undefined?'—':`${d.jabForm}%`},{label:'Cross extension',value:d.crossForm===undefined?'—':`${d.crossForm}%`},
    ];
    if(this.sport==='Basketball') return [
      {label:'Shooting motions',value:d.shots||0},{label:'Jump estimates',value:d.jumps||0},
      {label:'Peak lift estimate',value:d.peakLift===undefined?'—':`${d.peakLift}% body length`},{label:'Arm extension score',value:d.finishScore===undefined?'—':`${d.finishScore}%`},
    ];
    if(this.sport==='Archery') return [
      {label:'Stable draw holds',value:d.holds||0},{label:'Average hold',value:d.holdSeconds===undefined?'—':`${d.holdSeconds}s`},
      {label:'Arm extension',value:d.extensionScore===undefined?'—':`${d.extensionScore}%`},{label:'Shoulder alignment',value:d.alignmentScore===undefined?'—':`${d.alignmentScore}%`},
    ];
    if(this.sport==='Volleyball') return [
      {label:'Jump estimates',value:d.jumps||0},{label:'Peak lift estimate',value:d.peakLift===undefined?'—':`${d.peakLift}% body length`},
      {label:'Overhead swings',value:d.swings||0},{label:'Full extensions',value:d.extensionScore===undefined?'—':`${d.extensionScore}%`},
    ];
    if(this.sport==='Soccer') return [
      {label:'Kick estimates',value:d.kicks||0},{label:'Left foot',value:d.leftKicks||0},
      {label:'Right foot',value:d.rightKicks||0},{label:'Kick extension',value:d.kickScore===undefined?'—':`${d.kickScore}%`},
    ];
    if(this.sport==='Running') return [
      {label:'Steps',value:d.steps||0},{label:'Cadence',value:d.cadence===undefined?'—':`${d.cadence} steps/min`},
      {label:'Left steps',value:d.leftSteps||0},{label:'Right steps',value:d.rightSteps||0},
    ];
    if(this.sport==='Golf') return [
      {label:'Swing estimates',value:d.swings||0},{label:'Average arm extension',value:d.extensionScore===undefined?'—':`${d.extensionScore}%`},
      {label:'Turn estimate',value:d.turnScore===undefined?'—':`${d.turnScore}%`},{label:'Tempo',value:d.tempo===undefined?'—':`${d.tempo}s`},
    ];
    if(this.sport==='Baseball') return [
      {label:'Pitch / throw motions',value:d.throws||0},{label:'Arm extension',value:d.extensionScore===undefined?'—':`${d.extensionScore}%`},
      {label:'Overhead release',value:d.releaseScore===undefined?'—':`${d.releaseScore}%`},{label:'Left / right throws',value:`${d.leftThrows||0} / ${d.rightThrows||0}`},
    ];
    return [
      {label:'Racket swings',value:d.swings||0},{label:'Forehand estimates',value:d.forehands||0},
      {label:'Backhand estimates',value:d.backhands||0},{label:'Full extensions',value:d.extensionScore===undefined?'—':`${d.extensionScore}%`},
    ];
  }
  get explanation() {
    return ({
      Boxing:'Jab and cross are estimated from a bent-to-straight arm cycle using shoulder, elbow and wrist landmarks. Extension score reflects elbow straightening only; it is not a full boxing technique score.',
      Basketball:'Shooting motions are detected when an arm rises overhead and straightens. Arm extension score reflects elbow straightening at the overhead finish; it is not a complete shooting-form score. Jump lift is relative to visible body length, not centimeters. The camera cannot see the ball or verify a made shot.',
      Tennis:'Counts broad racket-swing motions and estimates forehand/backhand from wrist travel across the torso. Keep your upper body and both shoulders in view; ball or racket contact is not measured.',
      'Table tennis':'Counts quicker, shorter wrist swings and estimates stroke direction from wrist travel across the torso. Camera angle and wrist occlusion can affect the split.',
      Badminton:'Counts overhead and cross-body racket-swing motions with forehand/backhand estimates. It cannot identify shuttle contact or score shot placement.',
      Archery:'A draw hold counts when both arms are extended and held apart with level shoulders. Alignment reflects shoulder level and arm extension, not aim, release, or arrow accuracy.',
      Volleyball:'Counts overhead arm swings and jump estimates. Lift is relative to visible body length; the camera cannot identify ball contact, blocks, or spikes.',
      Soccer:'Counts a visible knee-bend to leg-extension cycle when the knee lifts. It cannot confirm ball contact, direction, or kick power; a side view with the full leg visible works best.',
      Running:'Counts alternating knee lifts as step estimates and calculates cadence from recent steps. Keep hips, knees, and ankles in frame; this is not a foot-strike or distance measurement.',
      Golf:'Counts broad cross-body arm swings. Extension, torso turn, and swing time are camera-based estimates; the tracker cannot identify club path, ball contact, or shot result.',
      Baseball:'Counts overhead arm raise-and-extension motions as pitch/throw estimates. It reports elbow extension and overhead position only; it cannot assess velocity, release point, or ball trajectory.',
    })[this.sport];
  }
  sample(result,now,aspect=1) {
    const pose=result?.landmarks?.[0]||[], world=result?.worldLandmarks?.[0]||[];
    const arms={};
    for(const [side,s,e,w] of [['Left',11,13,15],['Right',12,14,16]]) {
      const angle=armAngle(pose,world,s,e,w,aspect);
      const shoulder=pose[s], wrist=pose[w];
      arms[side]={angle,shoulder,wrist,overhead:visible(shoulder)&&visible(wrist)&&wrist.y<shoulder.y-0.035};
      const st=this.armState[side];
      if(angle!==null) {
        if(angle<125&&!st.extended) st.bentAt=now;
        if(angle>=150&&!st.extended) {
          const hasBend=st.bentAt!==null&&now-st.bentAt<1800;
          st.extended=true;
          if(hasBend) {
            this.increment('extensions');
            this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((angle-130)/40*100),0,100));
      if(this.sport==='Boxing') this.boxingPunch(side,now,angle);
          }
        }
        if(angle<130) st.extended=false;
      }
    }
    if(this.sport==='Basketball') this.basketball(arms,now);
    if(this.sport==='Volleyball') this.volleyball(arms,now);
    if(['Tennis','Table tennis','Badminton'].includes(this.sport)) this.racket(arms,pose,now);
    if(this.sport==='Archery') this.archery(arms,pose,now);
    if(this.sport==='Soccer') this.soccer(pose,world,aspect,now);
    if(this.sport==='Running') this.running(pose,now);
    if(this.sport==='Golf') this.golf(arms,pose,now);
    if(this.sport==='Baseball') this.baseball(arms,now);
    if(this.sport==='Basketball'||this.sport==='Volleyball') this.jumpSample(pose,world,now);
    return {metrics:this.metrics,explanation:this.explanation};
  }
  boxingPunch(side,now,angle) {
    const lead=this.stance, d=this.bucket();
    const score=clamp(Math.round((angle-125)/55*100),0,100);
    if(side===lead) { this.increment('jabs'); d.jabForm=this.average('jabForm',score); this.lastJabAt=now; }
    else {
      this.increment('crosses');
      d.crossForm=this.average('crossForm',score);
      if(this.lastJabAt && now-this.lastJabAt<=1300&&now-this.lastJabAt>=80) this.increment('combos');
      this.lastJabAt=0;
    }
    d.jabs=d.jabs||0; d.crosses=d.crosses||0; d.combos=d.combos||0;
  }
  basketball(arms,now) {
    for(const side of ['Left','Right']) {
      const arm=arms[side], already=this.raiseState[side];
      if(arm.overhead&&arm.angle>=145&&!already) {
        this.increment('shots');
        const extension=clamp(Math.round((arm.angle-125)/55*100),0,100);
        this.bucket().finishScore=this.average('finishScore',extension);
        this.raiseState[side]=true;
      }
      else if(!arm.overhead) this.raiseState[side]=false;
    }
  }
  volleyball(arms,now) {
    for(const side of ['Left','Right']) {
      const arm=arms[side], already=this.raiseState[side];
      if(arm.overhead&&arm.angle>=135&&!already) { this.increment('swings'); this.bucket().extensionScore=this.average('finishScore',clamp(Math.round((arm.angle-125)/50*100),0,100)); this.raiseState[side]=true; }
      else if(!arm.overhead) this.raiseState[side]=false;
    }
  }
  racket(arms,pose,now) {
    const shoulderWidth=Math.abs((pose[11]?.x??0)-(pose[12]?.x??0));
    if(shoulderWidth<0.05) return;
    const threshold=this.sport==='Table tennis'?0.3:0.48;
    for(const side of ['Left','Right']) {
      const wrist=arms[side].wrist, shoulder=arms[side].shoulder;
      if(!visible(wrist)||!visible(shoulder)) continue;
      const center=((pose[11]?.x||0)+(pose[12]?.x||0))/2;
      const value=(wrist.x-center)/shoulderWidth;
      const samples=this.swingState[side].samples;
      samples.push({x:value,t:now}); while(samples.length&&now-samples[0].t>650)samples.shift();
      if(now<this.swingState[side].cooldown||samples.length<2)continue;
      const start=samples[0], delta=value-start.x;
      if(Math.abs(delta)>=threshold) {
        this.increment('swings');
        // Direction is an estimate from the arm's cross-body travel.
        const forehand=(side==='Right')?delta>0:delta<0;
        this.increment(forehand?'forehands':'backhands');
        if(this.sport==='Golf') this.bucket().tempo=this.average('tempo',Math.max(0.1,(now-start.t)/1000));
        this.swingState[side].cooldown=now+420;
        samples.length=0;
      }
    }
  }
  archery(arms,pose,now) {
    const l=arms.Left,r=arms.Right;
    const shoulders=visible(pose[11])&&visible(pose[12]);
    if(!shoulders||l.angle===null||r.angle===null||!visible(l.wrist)||!visible(r.wrist)) { this.finishArcheryHold(now); return; }
    const width=Math.abs(pose[11].x-pose[12].x)||1;
    const shoulderLevel=Math.abs(pose[11].y-pose[12].y)/width;
    const span=Math.abs(l.wrist.x-r.wrist.x)/width;
    const draw=l.angle>=145&&r.angle>=145&&span>=1.25;
    if(draw) {
      if(this.holdSince===null) this.holdSince=now;
      if(!this.holdCounted&&now-this.holdSince>=900) {
        this.holdCounted=true; this.increment('holds');
        this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round(((l.angle+r.angle)/2-120)/40*100),0,100));
        this.bucket().alignmentScore=this.average('alignmentScore',clamp(Math.round(100-shoulderLevel*120),0,100));
      }
    } else this.finishArcheryHold(now);
  }
  soccer(pose,world,aspect,now) {
    for(const [side,h,k,a] of [['Left',23,25,27],['Right',24,26,28]]) {
      const angle=armAngle(pose,world,h,k,a,aspect);
      const hip=pose[h], knee=pose[k];
      const state=this.legState[side];
      if(angle===null||!visible(hip)||!visible(knee)) continue;
      if(angle<125&&!state.extended) state.bentAt=now;
      if(angle>=150&&!state.extended) {
        const lifted=knee.y<hip.y+0.08;
        if(state.bentAt!==null&&now-state.bentAt<1700&&lifted) {
          this.increment('kicks'); this.increment(side==='Left'?'leftKicks':'rightKicks');
          this.bucket().kickScore=this.average('kickScore',clamp(Math.round((angle-130)/40*100),0,100));
        }
        state.extended=true;
      }
      if(angle<130) state.extended=false;
    }
  }
  running(pose,now) {
    const recent=[];
    for(const [side,hipIndex,kneeIndex] of [['Left',23,25],['Right',24,26]]) {
      const hip=pose[hipIndex], knee=pose[kneeIndex], state=this.stepState[side];
      if(!visible(hip)||!visible(knee)) continue;
      const lifted=knee.y<hip.y-0.035;
      state.candidate=lifted?state.candidate+1:0;
      if(lifted&&state.candidate>=2&&!state.up&&now-state.last>260) {
        state.up=true; state.last=now; this.increment('steps'); this.increment(side==='Left'?'leftSteps':'rightSteps'); recent.push(now);
      }
      if(!lifted) state.up=false;
    }
    const bucket=this.bucket();
    this.stepTimes ||= [];
    if(recent.length)this.stepTimes.push(...recent);
    this.stepTimes=this.stepTimes.filter(t=>now-t<=10000);
    const elapsed=this.stepTimes.at(-1)-this.stepTimes[0];
    if(this.stepTimes.length>=2&&elapsed>0) bucket.cadence=Math.round((this.stepTimes.length-1)/(elapsed/60000));
  }
  golf(arms,pose,now) {
    this.racket(arms,pose,now);
    const shoulderTurn=this.lineRotation(pose,11,12), hipTurn=this.lineRotation(pose,23,24);
    if(shoulderTurn===null||hipTurn===null)return;
    const separation=Math.abs(Math.atan2(Math.sin(shoulderTurn-hipTurn),Math.cos(shoulderTurn-hipTurn)))*180/Math.PI;
    const bucket=this.bucket();
    bucket.turnScore=this.average('turnScore',clamp(Math.round(separation/45*100),0,100));
    const extended=['Left','Right'].map(side=>arms[side].angle).filter(Number.isFinite);
    if(extended.length)bucket.extensionScore=this.average('extensionScore',clamp(Math.round((Math.max(...extended)-120)/60*100),0,100));
  }
  baseball(arms,now) {
    for(const side of ['Left','Right']) {
      const arm=arms[side],state=this.raiseState[side];
      const release=arm.overhead&&arm.angle>=140;
      if(release&&!state) {
        this.increment('throws'); this.increment(side==='Left'?'leftThrows':'rightThrows');
        this.bucket().releaseScore=this.average('releaseScore',clamp(Math.round((arm.angle-120)/60*100),0,100));
        this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((arm.angle-120)/60*100),0,100));
        this.raiseState[side]=true;
      } else if(!release) this.raiseState[side]=false;
    }
  }
  lineRotation(pose,a,b) {
    if(!visible(pose[a])||!visible(pose[b]))return null;
    return Math.atan2(pose[b].y-pose[a].y,pose[b].x-pose[a].x);
  }
  finishArcheryHold(now) {
    if(this.holdCounted&&this.holdSince!==null) this.bucket().holdSeconds=this.average('holdSeconds',(now-this.holdSince)/1000);
    this.holdSince=null; this.holdCounted=false;
  }
  jumpSample(pose,world,now) {
    const hips=pose[23]&&pose[24]?(pose[23].y+pose[24].y)/2:null;
    const shoulders=pose[11]&&pose[12]?(pose[11].y+pose[12].y)/2:null;
    const ankles=pose[27]&&pose[28]?(pose[27].y+pose[28].y)/2:null;
    const bodyHeight=Number.isFinite(shoulders)&&Number.isFinite(ankles)?Math.abs(ankles-shoulders):0;
    if(!Number.isFinite(hips)||bodyHeight<0.12||![pose[11],pose[12],pose[23],pose[24],pose[27],pose[28]].every(visible)) return;
    const j=this.jump;
    if(!j.airborne) j.baseline=j.baseline===null?hips:j.baseline*.96+hips*.04;
    // Image-space pelvis lift normalized by shoulder-to-ankle length: a relative estimate, not a physical height.
    const lift=j.baseline===null?0:Math.max(0,(j.baseline-hips)/bodyHeight);
    const candidate=lift>0.12;
    j.above=candidate?j.above+1:0;
    if(!j.airborne&&j.above>=2) { j.airborne=true; j.peak=lift; j.counted=false; }
    if(j.airborne) {
      j.peak=Math.max(j.peak,lift);
      if(lift<0.05) j.below++; else j.below=0;
      if(j.below>=3) {
        if(!j.counted) { this.increment('jumps'); const percent=Math.round(j.peak*100); this.bucket().peakLift=Math.max(this.bucket().peakLift||0,percent); }
        j.airborne=false;j.counted=true;j.above=0;j.below=0;j.peak=0;
      }
    }
  }
}
export { SPORTS };
