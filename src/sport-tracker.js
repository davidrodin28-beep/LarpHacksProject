import { armGeometry } from './movement-counter.js';

const SPORTS = ['Basketball', 'Boxing', 'Tennis', 'Archery', 'Table tennis', 'Volleyball', 'Badminton', 'Soccer', 'Running', 'Golf', 'Baseball'];
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= 0.55;
const armMeasure = (pose, world, s, e, w, aspect) => {
  const joints=[pose[s],pose[e],pose[w]];
  if (!joints.every(visible)) return null;
  if ([world[s],world[e],world[w]].every(p=>p && [p.x,p.y,p.z].every(Number.isFinite))) {
    const geometry=armGeometry(world[s],world[e],world[w]);
    return geometry ? {...geometry,mode:'3D'} : null;
  }
  const image=armGeometry(...joints.map(p=>({x:p.x*aspect,y:p.y,z:0})));
  return image ? {...image,mode:'2D'} : null;
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
    this.armState={Left:{bentAt:null,extended:false,anchor:null},Right:{bentAt:null,extended:false,anchor:null}};
    this.legState={Left:{bentAt:null,extended:false},Right:{bentAt:null,extended:false}};
    this.raiseState={Left:false,Right:false};
    this.swingState={Left:{samples:[],cooldown:0},Right:{samples:[],cooldown:0}};
    this.stepState={Left:{up:false,last:0,candidate:0},Right:{up:false,last:0,candidate:0}};
    this.jump={baseline:null,airborne:false,peak:0,counted:false,above:0,below:0};
    this.lastJabAt=0;
    this.lastStepSide=null;
    this.lastStepAt=0;
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
      {label:'Jab elbow extension',value:d.jabForm===undefined?'—':`${d.jabForm}%`},{label:'Cross elbow extension',value:d.crossForm===undefined?'—':`${d.crossForm}%`},
    ];
    if(this.sport==='Basketball') return [
      {label:'Shot-like motions',value:d.shots||0},{label:'Jump estimates',value:d.jumps||0},
      {label:'Peak lift estimate',value:d.peakLift===undefined?'—':`${d.peakLift}% body length`},{label:'Release form estimate',value:d.releaseForm===undefined?'—':`${d.releaseForm}%`},
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
      {label:'Racket swing estimates',value:d.swings||0},{label:'Forehand direction estimates',value:d.forehands||0},
      {label:'Backhand direction estimates',value:d.backhands||0},{label:'Elbow extension at swing',value:d.extensionScore===undefined?'—':`${d.extensionScore}%`},
    ];
  }
  get explanation() {
    return ({
      Boxing:'A jab or cross estimate needs a bent-to-straight arm cycle plus visible wrist travel away from the guard. Orthodox or southpaw stance determines which arm is lead. Elbow extension is only one measurable part of form; impact, force, guard, and footwork are not assessed.',
      Basketball:'A shot-like motion is counted after a bent arm rises and straightens overhead. The release estimate combines elbow extension and wrist height above the shoulder. It does not score feet, hand placement, ball arc, or whether the shot went in. Jump lift is relative to visible body length, not centimeters.',
      Tennis:'Counts broad racket-swing motions and estimates forehand/backhand from wrist travel across the torso. Keep your upper body and both shoulders in view; ball or racket contact is not measured.',
      'Table tennis':'Counts quicker, shorter wrist swings and estimates stroke direction from wrist travel across the torso. Camera angle and wrist occlusion can affect the split.',
      Badminton:'Counts overhead and cross-body racket-swing motions with forehand/backhand estimates. It cannot identify shuttle contact or score shot placement.',
      Archery:'A draw-like hold requires one extended arm, one bent arm, wrists near shoulder height, and a brief steady hold. Alignment reflects visible shoulder level and arm positions, not aim, release, or arrow accuracy.',
      Volleyball:'Counts overhead arm raise-and-extension cycles and jump estimates. Lift is relative to visible body length; the camera cannot identify ball contact, blocks, or spikes.',
      Soccer:'Counts a visible knee-bend to leg-extension cycle when the knee lifts. It cannot confirm ball contact, direction, or kick power; a side view with the full leg visible works best.',
      Running:'Counts alternating knee lifts as step estimates and calculates cadence from recent steps. Keep hips, knees, and ankles in frame; this is not a foot-strike or distance measurement.',
      Golf:'Counts broad cross-body arm swings. Extension, torso turn, and swing time are camera-based estimates; the tracker cannot identify club path, ball contact, or shot result.',
      Baseball:'Counts a bent-to-straight arm cycle that finishes overhead as a throw-like motion. It reports elbow extension and arm side only; it cannot assess velocity, release point, or ball trajectory.',
    })[this.sport];
  }
  sample(result,now,aspect=1) {
    const pose=result?.landmarks?.[0]||[], world=result?.worldLandmarks?.[0]||[];
    const arms={};
    for(const [side,s,e,w] of [['Left',11,13,15],['Right',12,14,16]]) {
      const measurement=armMeasure(pose,world,s,e,w,aspect);
      const angle=measurement?.angle ?? null;
      const shoulder=pose[s], wrist=pose[w];
      arms[side]={...measurement,angle,shoulder,wrist,overhead:visible(shoulder)&&visible(wrist)&&wrist.y<shoulder.y-0.035,extendedNow:false};
      const st=this.armState[side];
      if(angle!==null) {
        if(angle<125&&!st.extended&&st.bentAt===null) {
          st.bentAt=now;
          const shoulderWorld=world[s],wristWorld=world[w];
          st.anchor=shoulderWorld&&wristWorld&&[shoulderWorld.x,shoulderWorld.y,shoulderWorld.z,wristWorld.x,wristWorld.y,wristWorld.z].every(Number.isFinite)
            ? {mode:'3D',shoulder:{...shoulderWorld},wrist:{...wristWorld}}
            : {mode:'2D',shoulder:{x:shoulder.x*aspect,y:shoulder.y},wrist:{x:wrist.x*aspect,y:wrist.y}};
        }
        if(angle>=150&&!st.extended) {
          const hasBend=st.bentAt!==null&&now-st.bentAt<1800;
          st.extended=true;
          if(hasBend) {
            arms[side].extendedNow=true;
            arms[side].punchAnchor=st.anchor;
            this.increment('extensions');
            this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((angle-120)/60*100),0,100));
          }
          st.bentAt=null; st.anchor=null;
        }
        if(angle<130) st.extended=false;
        if(st.bentAt!==null&&now-st.bentAt>1800) { st.bentAt=null; st.anchor=null; }
      }
    }
    if(this.sport==='Boxing') for(const side of ['Left','Right']) if(arms[side].extendedNow) this.boxingPunch(side,now,arms[side],pose,world,aspect);
    if(this.sport==='Basketball') this.basketball(arms,pose,now);
    if(this.sport==='Volleyball') this.volleyball(arms,now);
    if(['Tennis','Table tennis','Badminton'].includes(this.sport)) this.racket(arms,pose,world,now,aspect);
    if(this.sport==='Archery') this.archery(arms,pose,world,now,aspect);
    if(this.sport==='Soccer') this.soccer(pose,world,aspect,now);
    if(this.sport==='Running') this.running(pose,now);
    if(this.sport==='Golf') this.golf(arms,pose,world,now,aspect);
    if(this.sport==='Baseball') this.baseball(arms,now);
    if(this.sport==='Basketball'||this.sport==='Volleyball') this.jumpSample(pose,world,now);
    return {metrics:this.metrics,explanation:this.explanation};
  }
  boxingPunch(side,now,arm,pose,world,aspect) {
    const lead=this.stance, d=this.bucket();
    const anchor=arm.punchAnchor;
    const shoulderIndex=side==='Left'?11:12, wristIndex=side==='Left'?15:16;
    const currentShoulder=world[shoulderIndex], currentWrist=world[wristIndex];
    let travel=0;
    if(anchor&&arm.mode==='3D'&&anchor.mode==='3D'&&currentShoulder&&currentWrist) {
      const start={x:anchor.wrist.x-anchor.shoulder.x,y:anchor.wrist.y-anchor.shoulder.y,z:anchor.wrist.z-anchor.shoulder.z};
      const end={x:currentWrist.x-currentShoulder.x,y:currentWrist.y-currentShoulder.y,z:currentWrist.z-currentShoulder.z};
      const a=world[11],b=world[12];
      const shoulderWidth=a&&b?Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z):0;
      travel=shoulderWidth>0?Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)/shoulderWidth:0;
    } else if(anchor&&arm.mode==='2D') {
      const a=pose[11],b=pose[12],shoulder=pose[shoulderIndex],wrist=pose[wristIndex];
      const width=a&&b?Math.hypot((a.x-b.x)*aspect,a.y-b.y):0;
      if(width>0&&shoulder&&wrist) travel=Math.hypot((wrist.x-shoulder.x)*aspect-(anchor.wrist.x-anchor.shoulder.x),wrist.y-shoulder.y-(anchor.wrist.y-anchor.shoulder.y))/width;
    }
    if(travel<0.18)return;
    const score=clamp(Math.round((arm.angle-120)/60*100),0,100);
    if(side===lead) { this.increment('jabs'); d.jabForm=this.average('jabForm',score); this.lastJabAt=now; }
    else {
      this.increment('crosses');
      d.crossForm=this.average('crossForm',score);
      if(this.lastJabAt && now-this.lastJabAt<=1300&&now-this.lastJabAt>=80) this.increment('combos');
      this.lastJabAt=0;
    }
    d.jabs=d.jabs||0; d.crosses=d.crosses||0; d.combos=d.combos||0;
  }
  basketball(arms,pose,now) {
    for(const side of ['Left','Right']) {
      const arm=arms[side];
      if(arm.extendedNow&&arm.overhead) {
        this.increment('shots');
        const extension=clamp(Math.round((arm.angle-120)/60*100),0,100);
        this.bucket().finishScore=this.average('finishScore',extension);
        const hip=pose[side==='Left'?23:24];
        const torsoLength=visible(hip)?Math.abs(hip.y-arm.shoulder.y):0;
        const heightScore=torsoLength>0.08?clamp(Math.round(55+(arm.shoulder.y-arm.wrist.y)/torsoLength*90),0,100):50;
        this.bucket().releaseForm=this.average('releaseForm',Math.round(extension*0.7+heightScore*0.3));
      }
    }
  }
  volleyball(arms,now) {
    for(const side of ['Left','Right']) {
      const arm=arms[side], already=this.raiseState[side];
      if(arm.wrist&&arm.shoulder&&arm.wrist.y>arm.shoulder.y+0.12&&arm.angle<140) this.raiseState[side]=false;
      if(arm.extendedNow&&arm.overhead&&!already) {
        this.increment('swings');
        this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((arm.angle-120)/60*100),0,100));
        this.raiseState[side]=true;
      }
    }
  }
  racket(arms,pose,world,now,aspect=1) {
    const left=world[11],right=world[12];
    const worldWidth=left&&right&&[left.x,left.y,left.z,right.x,right.y,right.z].every(Number.isFinite)
      ?Math.hypot(left.x-right.x,left.y-right.y,left.z-right.z):0;
    const shoulderWidth=worldWidth||Math.hypot(((pose[11]?.x??0)-(pose[12]?.x??0))*aspect,(pose[11]?.y??0)-(pose[12]?.y??0));
    if(shoulderWidth<0.05) return;
    const threshold=this.sport==='Table tennis'?0.3:0.48;
    for(const side of ['Left','Right']) {
      const wrist=arms[side].wrist, shoulder=arms[side].shoulder;
      if(!visible(wrist)||!visible(shoulder)) continue;
      const shoulderWorld=world[side==='Left'?11:12],wristWorld=world[side==='Left'?15:16];
      let x,z;
      if(worldWidth&&shoulderWorld&&wristWorld&&[shoulderWorld.x,shoulderWorld.z,wristWorld.x,wristWorld.z].every(Number.isFinite)) {
        const centerX=(left.x+right.x)/2,centerZ=(left.z+right.z)/2;
        x=(wristWorld.x-centerX)/worldWidth; z=(wristWorld.z-centerZ)/worldWidth;
      } else {
        const center=((pose[11]?.x||0)+(pose[12]?.x||0))/2;
        x=(wrist.x-center)*aspect/shoulderWidth; z=0;
      }
      const samples=this.swingState[side].samples;
      samples.push({x,z,t:now}); while(samples.length&&now-samples[0].t>650)samples.shift();
      if(now<this.swingState[side].cooldown||samples.length<2)continue;
      const start=samples[0], delta=x-start.x, depthDelta=z-start.z;
      if(Math.hypot(delta,depthDelta)>=threshold) {
        this.increment('swings');
        // Swing counts use both side-to-side and camera-depth travel; side labels are rough direction cues.
        const direction= Math.abs(delta)>=Math.abs(depthDelta)*0.55 ? delta : depthDelta;
        const forehand=(side==='Right')?direction>0:direction<0;
        this.increment(forehand?'forehands':'backhands');
        if(this.sport!=='Golf'&&Number.isFinite(arms[side].angle)) this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((arms[side].angle-120)/60*100),0,100));
        if(this.sport==='Golf') this.bucket().tempo=this.average('tempo',Math.max(0.1,(now-start.t)/1000));
        this.swingState[side].cooldown=now+420;
        samples.length=0;
      }
    }
  }
  archery(arms,pose,world,now,aspect) {
    const l=arms.Left,r=arms.Right;
    const shoulders=visible(pose[11])&&visible(pose[12]);
    if(!shoulders||l.angle===null||r.angle===null||!visible(l.wrist)||!visible(r.wrist)) { this.finishArcheryHold(now); return; }
    const [ls,rs,lw,rw]=[world[11],world[12],world[15],world[16]];
    const usable3D=[ls,rs,lw,rw].every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite));
    const width=usable3D?Math.hypot(ls.x-rs.x,ls.y-rs.y,ls.z-rs.z):Math.hypot((pose[11].x-pose[12].x)*aspect,(pose[11].y-pose[12].y));
    if(width<0.05){this.finishArcheryHold(now);return;}
    const shoulderLevel=usable3D?Math.abs(ls.y-rs.y)/width:Math.abs(pose[11].y-pose[12].y)/width;
    const span=usable3D?Math.hypot(lw.x-rw.x,lw.y-rw.y,lw.z-rw.z)/width:Math.hypot((l.wrist.x-r.wrist.x)*aspect,l.wrist.y-r.wrist.y)/width;
    const shoulderY=usable3D?(ls.y+rs.y)/2:(pose[11].y+pose[12].y)/2;
    const wristY=usable3D?(lw.y+rw.y)/2:(l.wrist.y+r.wrist.y)/2;
    const wristLevel=Math.abs(wristY-shoulderY)/width;
    const drawSpan=span>=1.15&&wristLevel<=0.75;
    const drawAngles=(l.angle>=150&&r.angle>=65&&r.angle<=135)||(r.angle>=150&&l.angle>=65&&l.angle<=135);
    const draw=drawSpan&&drawAngles;
    if(draw) {
      if(this.holdSince===null) this.holdSince=now;
      if(!this.holdCounted&&now-this.holdSince>=900) {
        this.holdCounted=true; this.increment('holds');
        this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((Math.max(l.angle,r.angle)-120)/60*100),0,100));
        this.bucket().alignmentScore=this.average('alignmentScore',clamp(Math.round(100-shoulderLevel*120-wristLevel*35),0,100));
      }
    } else this.finishArcheryHold(now);
  }
  soccer(pose,world,aspect,now) {
    for(const [side,h,k,a] of [['Left',23,25,27],['Right',24,26,28]]) {
      const measurement=armMeasure(pose,world,h,k,a,aspect);
      const angle=measurement?.angle ?? null;
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
      const alternates=this.lastStepSide!==side||now-this.lastStepAt>1800;
      if(lifted&&state.candidate>=2&&!state.up&&now-state.last>260&&now-this.lastStepAt>180&&alternates) {
        state.up=true; state.last=now; this.lastStepSide=side; this.lastStepAt=now; this.increment('steps'); this.increment(side==='Left'?'leftSteps':'rightSteps'); recent.push(now);
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
  golf(arms,pose,world,now,aspect) {
    const previousSwings=this.bucket().swings||0;
    this.racket(arms,pose,world,now,aspect);
    const shoulderTurn=this.lineRotation(pose,11,12,aspect), hipTurn=this.lineRotation(pose,23,24,aspect);
    if(shoulderTurn===null||hipTurn===null)return;
    const separation=Math.abs(Math.atan2(Math.sin(shoulderTurn-hipTurn),Math.cos(shoulderTurn-hipTurn)))*180/Math.PI;
    const bucket=this.bucket();
    if((bucket.swings||0)>previousSwings) {
      bucket.turnScore=this.average('turnScore',clamp(Math.round(separation/45*100),0,100));
      const extended=['Left','Right'].map(side=>arms[side].angle).filter(Number.isFinite);
      if(extended.length)bucket.extensionScore=this.average('extensionScore',clamp(Math.round((Math.max(...extended)-120)/60*100),0,100));
    }
  }
  baseball(arms,now) {
    for(const side of ['Left','Right']) {
      const arm=arms[side];
      if(arm.extendedNow&&arm.overhead) {
        this.increment('throws'); this.increment(side==='Left'?'leftThrows':'rightThrows');
        this.bucket().releaseScore=this.average('releaseScore',clamp(Math.round((arm.angle-120)/60*100),0,100));
        this.bucket().extensionScore=this.average('extensionScore',clamp(Math.round((arm.angle-120)/60*100),0,100));
      }
    }
  }
  lineRotation(pose,a,b,aspect=1) {
    if(!visible(pose[a])||!visible(pose[b]))return null;
    return Math.atan2(pose[b].y-pose[a].y,(pose[b].x-pose[a].x)*aspect);
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
    if(!j.airborne) j.baseline=j.baseline===null?hips:j.baseline*.99+hips*.01;
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
