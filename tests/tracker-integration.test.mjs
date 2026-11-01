import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function fixture() {
  let now = 0, nextFrame, counter, status;
  let landmarks = [];
  const context = vm.createContext({
    document: { createElement: () => ({}), querySelector: () => null, addEventListener() {}, removeEventListener() {} },
    location: { hostname: 'localhost' },
    performance: { now: () => now },
    requestAnimationFrame: callback => { nextFrame = callback; return 1; }, cancelAnimationFrame() {},
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  const modules = new Map();
  async function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
    modules.set(url.href, module);
    await module.link((path, parent) => load(new URL(path, parent.identifier)));
    return module;
  }
  const module = await load(new URL('../src/tracking/createMotionTracker.js', import.meta.url));
  await module.evaluate();
  const { MovementCounter } = modules.get(new URL('../src/movement-counter.js', import.meta.url).href).namespace;
  const video = { readyState: 2, currentTime: 0, videoWidth: 100, videoHeight: 100, async play() {} };
  const tracker = module.namespace.createMotionTracker({
    video, canvas: {}, stage: {}, initialSport: 'Boxing', onStatus: value => { status = value; },
  }, {
    CameraSource: class { async start() {} stop() {} },
    VisionPipeline: class { async initialize() {} close() {} detect() { return { pose: { landmarks: [landmarks] } }; } },
    HandEnrollment: class {
      calibrating = false; selectedSides = [];
      reset() {} begin() {} visibleHands() { return []; }
    },
    OverlayRenderer: class { resize() {} render() {} clear() {} },
    MotionMeter: class { reset() {} sample() { return {}; } },
    MovementCounter: class extends MovementCounter { constructor() { super(); counter = this; } },
  });
  return { tracker, counter: () => counter, status: () => status,
    hold(points) {
      landmarks = points;
      // Include the low-frequency status publication after the 800 ms hold.
      for (let i = 0; i < 12; i++) { now += 100; video.currentTime += .1; nextFrame(); }
    },
  };
}

function guard() {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .99 }));
  for (const [i, x, y] of [[0, .5, .2], [11, .35, .45], [12, .65, .45], [13, .25, .35], [14, .75, .35], [15, .35, .25], [16, .65, .25]]) {
    p[i] = { x, y, visibility: .99 };
  }
  return p;
}

test('the initial Boxing selection runs the three-checkpoint jab lesson', async () => {
  const f = await fixture();
  await f.tracker.start();
  f.tracker.startLesson();
  f.hold(guard());
  assert.equal(f.status().coaching.step, 1);
  const jab = guard();
  jab[13] = { x: .2, y: .45, visibility: .99 };
  jab[15] = { x: .05, y: .45, visibility: .99 };
  f.hold(jab);
  assert.equal(f.status().coaching.step, 2);
  f.hold(guard());
  assert.equal(f.status().coaching.phase, 'completed');
  f.tracker.dispose();
});

test('Southpaw changes punch counting and survives a camera start', async () => {
  const f = await fixture();
  f.counter().states.set('punchLeft', { stable: 'bent' });
  f.tracker.setCoachingStance('Southpaw');
  assert.equal(f.counter().states.size, 0);
  await f.tracker.start();
  assert.equal(f.counter().combo.lead, 'Right');
  f.counter().combo.observe(['Right'], 100);
  f.counter().combo.observe(['Left'], 200);
  assert.equal(f.counter().combo.jabs, 1);
  assert.equal(f.counter().combo.crosses, 1);
  assert.equal(f.counter().combo.combos, 1);
  f.tracker.dispose();
});
