import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = vm.createContext({});
const modules = new Map();
async function load(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
  modules.set(url.href, module);
  await module.link((path, parent) => load(new URL(path, parent.identifier)));
  return module;
}
const module = await load(new URL('../src/coaching/coach.js', import.meta.url));
await module.evaluate();
const { CoachSession, checkPosition } = module.namespace;
const { lessons } = modules.get(new URL('../src/coaching/lessons.js', import.meta.url).href).namespace;
const { armGeometry, MovementCounter } = modules.get(new URL('../src/movement-counter.js', import.meta.url).href).namespace;

function armAtAngle(degrees) {
  const angle = degrees * Math.PI / 180;
  return [
    { x: .4, y: .5, z: 0, visibility: .99 },
    { x: .3, y: .5, z: 0, visibility: .99 },
    { x: .3 + .1 * Math.cos(angle), y: .5 - .1 * Math.sin(angle), z: 0, visibility: .99 },
  ];
}

test('arm extensions accept 125 degrees without the former reach restriction', () => {
  const geometry = armGeometry(...armAtAngle(125));
  assert.ok(geometry.reach < .96);
  assert.equal(geometry.state, 'straight');
  assert.equal(armGeometry(...armAtAngle(124)).state, null);
  assert.equal(armGeometry(...armAtAngle(119)).state, 'bent');
});

test('125 degree extensions count once per bend in both 3D and 2D', () => {
  for (const world of [true, false]) {
    const counter = new MovementCounter();
    let now = 0;
    function sample(degrees) {
      const p = [];
      [p[11], p[13], p[15]] = armAtAngle(degrees);
      const result = { landmarks: [p], ...(world ? { worldLandmarks: [p] } : {}) };
      // The image-only fallback requires two confirming samples.
      for (let i = 0; i < 2; i++) counter.sample(result, [], now += 33);
    }
    sample(100);
    sample(124);
    assert.equal(counter.counts.arms, 0);
    sample(125);
    assert.equal(counter.counts.arms, 1);
    assert.equal(counter.counts.jabs, 1);
    sample(130);
    sample(125);
    assert.equal(counter.counts.arms, 1);
    assert.equal(counter.counts.jabs, 1);
    sample(100);
    sample(125);
    assert.equal(counter.counts.arms, 2);
    assert.equal(counter.counts.jabs, 2);
  }
});

test('guided arm extension accepts 125 degrees and rejects 124', () => {
  for (const [degrees, expected] of [[125, true], [124, false]]) {
    const sample = pose();
    const p = sample.landmarks[0];
    [p[11], p[13], p[15]] = armAtAngle(degrees);
    [p[12], p[14], p[16]] = armAtAngle(degrees).map(point => ({ ...point, x: 1 - point.x }));
    assert.equal(checkPosition('extendBoth', sample).matched, expected);
  }
});

function pose() {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  p[0] = { x: 0.5, y: 0.2, visibility: 0.99 };
  [[11, .35, .45], [12, .65, .45], [13, .25, .35], [14, .75, .35], [15, .35, .25], [16, .65, .25]]
    .forEach(([i, x, y]) => { p[i] = { x, y, visibility: .99 }; });
  return { landmarks: [p] };
}
function hold(coach, sample, start = 0) {
  for (let now = start; now <= start + 800; now += 100) coach.sample(sample, now, 1);
}

test('every sport has distinct lessons with supported position checks', () => {
  assert.equal(Object.keys(lessons).length, 6);
  for (const list of Object.values(lessons)) {
    assert.ok(list.length >= 2);
    assert.equal(new Set(list.map(l => l.name)).size, list.length);
    for (const lesson of list) for (const step of lesson.steps) {
      assert.notEqual(checkPosition(step.goal, pose()).feedback, 'Follow the position cue.');
    }
  }
});
test('missing, hidden and cropped joints cannot pass', () => {
  assert.equal(checkPosition('handsUp', null).matched, false);
  for (const patch of [{ visibility: .2 }, { x: 1.1 }, { y: NaN }]) {
    const sample = pose();
    Object.assign(sample.landmarks[0][15], patch);
    assert.equal(checkPosition('handsUp', sample).matched, false);
  }
});
test('drill advances only after a continuous hold and completes all checkpoints', () => {
  const coach = new CoachSession();
  const sample = pose();
  coach.start();
  coach.sample(sample, 0, 1);
  coach.sample(sample, 100, 1);
  assert.equal(coach.state.step, 0);
  coach.sample(null, 200, 1);
  assert.equal(coach.state.progress, 0);
  hold(coach, sample, 300);
  assert.equal(coach.state.step, 1);
  const p = sample.landmarks[0];
  p[13] = { x: .35, y: .28, visibility: .99 };
  p[15] = { x: .35, y: .1, visibility: .99 };
  hold(coach, sample, 1200);
  assert.equal(coach.state.phase, 'completed');
  assert.equal(coach.state.progress, 1);
  coach.start();
  assert.equal(coach.state.step, 0);
  assert.equal(coach.state.phase, 'practicing');
});
test('tracking gaps and pauses discard partial holds', () => {
  const coach = new CoachSession();
  coach.start();
  coach.sample(pose(), 0, 1);
  coach.sample(pose(), 200, 1);
  coach.sample(pose(), 1000, 1);
  assert.equal(coach.state.step, 0);
  assert.equal(coach.state.progress, 0);
  coach.sample(pose(), 1100, 1);
  coach.suspend();
  coach.sample(pose(), 1200, 1);
  assert.equal(coach.state.progress, 0);
});
test('lesson changes and reset clear active practice', () => {
  const coach = new CoachSession();
  coach.start();
  hold(coach, pose());
  coach.select('Volleyball', 1);
  assert.equal(coach.lesson.name, 'Overhead set');
  assert.equal(coach.state.phase, 'ready');
  assert.equal(coach.state.step, 0);
  coach.start();
  coach.reset();
  assert.equal(coach.state.phase, 'ready');
  assert.throws(() => coach.select('Unknown', 0));
});
test('jab and cross checks respect anatomical arm and boxing stance', () => {
  const sample = pose();
  sample.landmarks[0][13] = { x: .2, y: .45, visibility: .99 };
  sample.landmarks[0][15] = { x: .05, y: .45, visibility: .99 };
  assert.equal(checkPosition('jab', sample, 1, 'Orthodox').matched, true);
  assert.equal(checkPosition('cross', sample, 1, 'Orthodox').matched, false);
  assert.equal(checkPosition('jab', sample, 1, 'Southpaw').matched, false);
  assert.equal(checkPosition('cross', sample, 1, 'Southpaw').matched, true);
  const coach = new CoachSession();
  coach.start();
  coach.setStance('Southpaw');
  assert.equal(coach.state.phase, 'ready');
});
