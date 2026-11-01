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
  snapshot() { return {...this.bucket()}; }
  summarizeRound(before={},chinTuckPercent=null) {
    const d=this.bucket();
    const delta=key=>Math.max(0,(d[key]||0)-(before[key]||0));
    const averageSince=key=>{
      const samples=delta(key+'Samples'),total=(d[key+'Total']||0)-(before[key+'Total']||0);
      return samples>0?Math.round(total/samples):null;
    };
    const tip=[];
    let activity=0,quality=null,activityText='No movement cycles were detected';
    const score=(qualityWeight=0.65)=>activity===0?0:quality===null?activity:Math.round(quality*qualityWeight+activity*(1-qualityWeight));

    if(this.sport==='Boxing') {
      const jabs=delta('jabs'),crosses=delta('crosses'),combos=delta('combos'),punches=jabs+crosses;
      const jabForm=averageSince('jabForm'),crossForm=averageSince('crossForm');
      const extension=[jabForm,crossForm].filter(Number.isFinite);
      const comboQuality=punches?Math.min(100,Math.round(combos/Math.max(1,Math.min(jabs,crosses))*100)):0;
      quality=extension.length?(extension.reduce((sum,n)=>sum+n,0)/extension.length)*(chinTuckPercent===null?0.72:0.58)+comboQuality*(chinTuckPercent===null?0.28:0.22):null;
      if(chinTuckPercent!==null) quality=(quality??0)+chinTuckPercent*0.20;
      activity=Math.min(100,punches*7+combos*10);
      activityText=`${jabs} jabs · ${crosses} crosses · ${combos} complete 1–2s`;
      if(punches===0)tip.push('Start from guard, then extend each arm far enough for a clear punch cycle.');
      else if(combos===0)tip.push('Link the lead jab into a rear cross to complete more 1–2s.');
      else if(comboQuality<65)tip.push('Return the lead hand toward guard before extending the rear cross.');
      const formValues=[jabForm,crossForm].filter(Number.isFinite);
      if(formValues.length&&Math.min(...formValues)<72)tip.push('Reach closer to full elbow extension while keeping the wrist aligned.');
      if(chinTuckPercent===null)tip.push('Keep your face visible during setup for chin feedback.');
      else if(chinTuckPercent<45)tip.push(`Tuck your chin while keeping your eyes forward; it was tucked in ${chinTuckPercent}% of visible samples.`);
      else tip.push(`Chin-tuck estimate: ${chinTuckPercent}% of visible round samples.`);
    } else if(this.sport==='Basketball') {
      const shots=delta('shots'),jumps=delta('jumps');
      quality=averageSince('releaseForm'); activity=Math.min(100,shots*18+jumps*7);
      activityText=`${shots} shot-like releases · ${jumps} jumps`;
      if(shots===0)tip.push('Begin with a bent elbow and finish with the shooting wrist above your shoulder.');
      else if(quality!==null&&quality<72)tip.push('Finish with a straighter elbow and raise the wrist above the shoulder.');
      else tip.push('Keep the same smooth bent-to-overhead release on each repetition.');
      if(jumps===0)tip.push('For jump feedback, keep hips and ankles visible and add a clear jump.');
    } else if(['Tennis','Table tennis','Badminton'].includes(this.sport)) {
      const swings=delta('swings'); quality=averageSince('extensionScore'); activity=Math.min(100,swings*13);
      activityText=`${swings} racket-swing estimates · ${delta('forehands')} forehand-direction · ${delta('backhands')} backhand-direction`;
      if(swings===0)tip.push('Use a clear wrist path across the camera view; racket and ball contact are not detected.');
      else if(quality!==null&&quality<70)tip.push('Let the elbow extend farther through the visible swing path.');
      else tip.push('Alternate stroke directions and return to a ready position between swings.');
    } else if(this.sport==='Archery') {
      const holds=delta('holds'),hold=averageSince('holdSeconds'),alignment=averageSince('alignmentScore'),extension=averageSince('extensionScore');
      quality=[alignment,extension].filter(Number.isFinite).reduce((sum,n,a,arr)=>sum+n/arr.length,0);
      if(!Number.isFinite(quality))quality=null;
      activity=Math.min(100,holds*24+(hold||0)*6); activityText=`${holds} stable draw holds${hold===null?'':` · ${hold}s average hold`}`;
      if(holds===0)tip.push('Set one arm extended and one bent, keep both wrists near shoulder height, then hold steady.');
      else if(alignment!==null&&alignment<75)tip.push('Level your shoulders and keep both wrists closer to the same height.');
      else tip.push('Keep the draw steady through the full hold.');
      if(extension!==null&&extension<72)tip.push('Straighten the bow-side arm more while keeping the opposite elbow bent.');
    } else if(this.sport==='Volleyball') {
      const swings=delta('swings'),jumps=delta('jumps');quality=averageSince('extensionScore');activity=Math.min(100,swings*13+jumps*7);
      activityText=`${swings} overhead swings · ${jumps} jumps`;
      if(swings===0)tip.push('Raise from a bent arm and finish with a clear overhead extension.');
      else if(quality!==null&&quality<72)tip.push('Reach through a straighter elbow at the overhead finish.');
      else tip.push('Keep the overhead reach consistent and land under control.');
      if(jumps===0)tip.push('Keep hips and ankles in frame for jump estimates.');
    } else if(this.sport==='Soccer') {
      const kicks=delta('kicks'),left=delta('leftKicks'),right=delta('rightKicks');quality=averageSince('kickScore');activity=Math.min(100,kicks*16);
      activityText=`${kicks} kick-like cycles · ${left} left · ${right} right`;
      if(kicks===0)tip.push('Show a clear knee bend followed by leg extension; keep the full leg in frame.');
      else if(Math.abs(left-right)>Math.max(1,kicks*0.3))tip.push('Practice the less-used side to balance left and right kick cycles.');
      else if(quality!==null&&quality<70)tip.push('Complete each kick with a clearer leg extension.');
      else tip.push('Keep the same full-leg motion on both sides.');
    } else if(this.sport==='Running') {
      const steps=delta('steps'),left=delta('leftSteps'),right=delta('rightSteps');
      const balance=steps?Math.round(100-Math.abs(left-right)/steps*100):null;
      quality=balance;activity=Math.min(100,steps*3);activityText=`${steps} alternating knee-lift steps · ${d.cadence||0} estimated steps/min`;
      if(steps===0)tip.push('Keep hips and knees visible and lift each knee clearly in turn.');
      else if(balance<75)tip.push('Make the left and right knee lifts more even.');
      else tip.push('Keep the alternating rhythm steady; this camera estimate is not a foot-strike measure.');
    } else if(this.sport==='Golf') {
      const swings=delta('swings'),turn=averageSince('turnScore'),extension=averageSince('extensionScore');
      quality=[turn,extension].filter(Number.isFinite).reduce((sum,n,a,arr)=>sum+n/arr.length,0);
      if(!Number.isFinite(quality))quality=null;
      activity=Math.min(100,swings*15);activityText=`${swings} swing estimates · ${averageSince('tempo')??0}s estimated tempo`;
      if(swings===0)tip.push('Make a broad, controlled cross-body swing with shoulders and hips in view.');
      else if(turn!==null&&turn<70)tip.push('Rotate your shoulders farther through the swing while keeping balance.');
      else tip.push('Keep the swing tempo smooth and finish with your arms extended.');
    } else {
      const throws=delta('throws');quality=averageSince('releaseScore');activity=Math.min(100,throws*17);
      activityText=`${throws} overhead throw-like motions · ${delta('leftThrows')} left · ${delta('rightThrows')} right`;
      if(throws===0)tip.push('Start with a bent elbow and complete a visible overhead arm extension.');
      else if(quality!==null&&quality<72)tip.push('Extend the throwing elbow more fully at the overhead finish.');
      else tip.push('Keep the overhead motion controlled; this does not measure throwing speed or release accuracy.');
    }
    const measuredQuality=Number.isFinite(quality)?Math.round(clamp(quality,0,100)):null;
    const totalScore=activity===0?0:measuredQuality===null?activity:score();
    const scoreMeaning=activity===0
      ?'No sport-specific movement was detected, so the round score is 0.'
      :measuredQuality===null
        ?`This score is based on detected activity (${Math.round(activity)}/100); no form measure was available this round.`
        :`The score blends measured movement quality (${measuredQuality}/100, 65% weight) with detected activity (${Math.round(activity)}/100, 35% weight). These are camera estimates, not a certified technique grade.`;
    return {sport:this.sport,score:Math.round(clamp(totalScore,0,100)),activityText,scoreMeaning,tips:tip.slice(0,2),chinTuckPercent};
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
  get dataGuide() {
    return ({
      Boxing:[
        'Jabs and crosses count bent-to-straight arm cycles with visible wrist travel; stance sets which arm is lead.',
        'A 1–2 counts when a detected jab is followed by a cross within about 1.3 seconds.',
        'Elbow extension averages the elbow-straightening estimate on counted punches. It does not grade impact, guard, or footwork.',
        'Chin tuck is the share of visible face samples where the chin moved down/back from the neutral countdown baseline. Keep your face in frame.',
      ],
      Basketball:[
        'Shot-like motions count a bent-to-straight arm cycle ending with the wrist above the shoulder; they are not shot attempts or makes.',
        'Release form estimate combines elbow extension (70%) and wrist height above the shoulder (30%).',
        'Jump estimates count pelvis lift above the standing baseline. Peak lift is a percentage of visible shoulder-to-ankle length, not inches or centimeters.',
      ],
      Tennis:[
        'Swing estimates count wrist travel relative to shoulder width, including camera-depth movement when 3D pose data is available.',
        'Forehand/backhand direction is a rough cue from wrist travel and detected hand side, not a verified stroke classification.',
        'Elbow extension is averaged at detected swings. Racket contact, ball contact, placement, and accuracy are not observed.',
      ],
      'Table tennis':[
        'Swing estimates count shorter wrist paths relative to shoulder width, including depth movement when available.',
        'Forehand/backhand direction is an approximate wrist-travel cue, not a verified stroke or ball-contact count.',
        'Elbow extension is averaged at detected swings; paddle contact and placement are not seen.',
      ],
      Badminton:[
        'Swing estimates count wrist travel relative to shoulder width, including depth movement when available.',
        'Forehand/backhand direction is estimated from wrist travel; an occluded wrist can hide an overhead swing.',
        'Elbow extension is averaged at detected swings. Shuttle contact and shot placement are not measured.',
      ],
      Archery:[
        'A stable draw hold needs one extended arm, one bent arm, wrists near shoulder height, and about one second in the pose.',
        'Average hold is measured until the pose ends; a hold is recorded after it passes the one-second threshold.',
        'Shoulder alignment estimates visible shoulder level and wrist height. Aim, bow alignment, and release are not measured.',
      ],
      Volleyball:[
        'Overhead swings count a bent-to-straight arm cycle ending above the shoulder.',
        'Jump estimates count pelvis lift; peak lift is relative to visible shoulder-to-ankle length.',
        'Full extension is average elbow straightening at detected overhead cycles. Ball contact and landing quality are not measured.',
      ],
      Soccer:[
        'Kick estimates count a knee bend followed by leg extension while the knee is visibly lifted.',
        'Left/right totals show which leg completed the cycle; kick extension is the average knee-straightening estimate.',
        'Ball contact, kick direction, and power are not seen. A side view with the full leg visible works best.',
      ],
      Running:[
        'Steps are alternating knee-lift estimates, not measured foot strikes.',
        'Cadence estimates steps per minute from recent knee lifts. Left/right totals show whether both sides were detected.',
        'Distance, speed, ground contact, and running efficiency are not measured. Keep hips and knees visible.',
      ],
      Golf:[
        'Swing estimates count broad wrist travel across or in camera depth relative to the torso.',
        'Turn estimate uses visible shoulder-to-hip line separation at a detected swing; arm extension is averaged at those swings.',
        'Tempo is approximate time across the detected wrist path. Club path, ball contact, and shot result are not measured.',
      ],
      Baseball:[
        'Throw-like motions count a bent-to-straight arm cycle ending overhead; left/right totals show the detected arm.',
        'Arm extension and overhead release are elbow-angle estimates at counted motions.',
        'Throwing speed, release point, ball trajectory, and injury risk are not measured.',
      ],
    })[this.sport] || [];
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
