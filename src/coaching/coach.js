import { isArmExtended, jointAngle } from '../movement-counter.js';
import { lessons } from './lessons.js';

const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99
  && (p.visibility ?? 0) >= 0.65;

export function checkPosition(goal, poseResult, aspect = 1, stance = 'Orthodox') {
  const p = poseResult?.landmarks?.[0];
  if (!p || ![11, 12, 13, 14, 15, 16].every(i => visible(p[i]))) {
    return { matched: false, feedback: 'Step back until both shoulders, elbows and wrists are clearly visible.' };
  }
  const scale = Math.hypot((p[11].x - p[12].x) * aspect, p[11].y - p[12].y);
  if (scale < 0.08) return { matched: false, feedback: 'Face your chest toward the camera so both arms can be measured.' };
  const arms = [[11, 13, 15], [12, 14, 16]].map(([s, e, w]) => ({
    angle: jointAngle(p[s], p[e], p[w], aspect),
    raised: p[w].y < p[s].y - scale * 0.12,
    overhead: visible(p[0]) && p[w].y < p[0].y,
    level: Math.abs(p[w].y - p[s].y) < scale * 0.45,
    down: p[w].y > p[e].y + scale * 0.1,
    bent: jointAngle(p[s], p[e], p[w], aspect) < 140,
    cheek: visible(p[0]) && Math.hypot((p[w].x - p[0].x) * aspect, p[w].y - p[0].y) < scale * 0.8,
    sideways: Math.abs(p[w].x - p[s].x) * aspect > scale * 0.65,
    below: p[w].y > p[s].y,
  }));
  const lead = stance === 'Southpaw' ? 1 : 0;
  const punchSide = goal === 'jab' ? lead : 1 - lead;
  const checks = {
    ready: [arms.every(a => a.bent && a.below), 'Bend both elbows and keep your hands in front, below your shoulders.'],
    handsUp: [arms.every(a => a.raised && a.bent), 'Raise both hands above shoulder height and keep your elbows bent.'],
    handsUpSingle: [arms.some(a => a.raised), 'Bring your bat hand above shoulder height.'],
    reachUp: [arms.some(a => a.overhead && isArmExtended(a.angle)), 'Reach one hand above your head and lengthen that arm gently.'],
    extendUp: [arms.every(a => a.overhead && isArmExtended(a.angle)), 'Reach both hands above your head and lengthen both arms gently.'],
    extendBoth: [arms.every(a => isArmExtended(a.angle) && a.level), 'Lengthen both arms at shoulder height; angle slightly outward so both elbows stay visible.'],
    guard: [arms.every(a => a.cheek && a.bent), 'Bring both hands near your cheeks with your elbows bent.'],
    jab: [isArmExtended(arms[punchSide].angle) && arms[punchSide].level && arms[1 - punchSide].cheek && arms[1 - punchSide].bent, `Extend your ${punchSide === 0 ? 'left' : 'right'} lead arm at shoulder height and keep the other hand near your cheek.`],
    cross: [isArmExtended(arms[punchSide].angle) && arms[punchSide].level && arms[1 - punchSide].cheek && arms[1 - punchSide].bent, `Extend your ${punchSide === 0 ? 'left' : 'right'} rear arm at shoulder height and keep the other hand near your cheek.`],
    sideReach: [arms.some(a => a.sideways && a.level && isArmExtended(a.angle)), 'Reach one arm sideways at shoulder height with a soft elbow.'],
    draw: [arms.some((a, i) => a.sideways && a.level && isArmExtended(a.angle) && arms[1 - i].cheek && arms[1 - i].bent), 'Keep one arm reaching sideways and bring your other hand near your cheek.'],
    relax: [arms.every(a => a.down), 'Lower both hands below your elbows and relax your shoulders.'],
    platform: [arms.every(a => isArmExtended(a.angle) && a.below) && Math.hypot((p[15].x - p[16].x) * aspect, p[15].y - p[16].y) < scale * 0.45, 'Bring your hands together below chest height and lengthen both arms.'],
  };
  const check = checks[goal];
  return { matched: Boolean(check?.[0]), feedback: check?.[1] || 'Follow the position cue.' };
}

export class CoachSession {
  constructor() { this.stance = 'Orthodox'; this.select('Basketball', 0); }
  setStance(stance) {
    if (!['Orthodox', 'Southpaw'].includes(stance)) throw new Error('Unknown stance.');
    this.stance = stance;
    this.reset();
  }
  select(sport, index) {
    if (!lessons[sport]?.[index]) throw new Error('Unknown coaching lesson.');
    this.lesson = lessons[sport][index];
    this.reset();
  }
  reset() {
    this.state = { phase: 'ready', step: 0, progress: 0, feedback: 'Read the cues, then start guided practice.' };
    this.suspend();
  }
  start() {
    this.reset();
    this.state.phase = 'practicing';
    this.state.feedback = 'Move into the first position. Hold each checkpoint briefly.';
  }
  suspend() { this.holdSince = null; this.lastSample = null; if (this.state) this.state.progress = 0; }
  sample(pose, now, aspect) {
    if (this.state.phase !== 'practicing') return;
    if (this.lastSample !== null && now - this.lastSample > 300) this.holdSince = null;
    this.lastSample = now;
    const check = checkPosition(this.lesson.steps[this.state.step].goal, pose, aspect, this.stance);
    if (!check.matched) {
      this.holdSince = null;
      this.state.progress = 0;
      this.state.feedback = check.feedback;
      return;
    }
    this.holdSince ??= now;
    this.state.progress = Math.min(1, (now - this.holdSince) / 800);
    this.state.feedback = 'Position detected. Hold gently…';
    if (this.state.progress < 1) return;
    this.suspend();
    if (this.state.step === this.lesson.steps.length - 1) {
      this.state.phase = 'completed';
      this.state.progress = 1;
      this.state.feedback = 'Position drill complete. Review the form cues, or practice again.';
    } else {
      this.state.step += 1;
      this.state.feedback = 'Checkpoint complete. Move into the next position.';
    }
  }
}
