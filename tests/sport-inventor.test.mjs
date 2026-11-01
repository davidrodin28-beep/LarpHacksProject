import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Exercise the actual submit callback without downloading React or calling NVIDIA.
async function submit(response) {
  const state = [];
  const requests = [];
  const timers = [];
  const context = vm.createContext({
    fetch: async (url, options) => {
      requests.push({ url, options });
      return response;
    },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    clearTimeout: () => {},
  });
  const useState = initial => {
    const index = state.push(initial) - 1;
    return [initial, value => { state[index] = value; }];
  };
  function stub(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  }
  const dependencies = {
    'https://esm.sh/react@19.2.0': stub({
      default: { createElement: () => {} },
      useState,
      useEffect: () => {},
      useRef: value => ({ current: value }),
    }),
    'https://esm.sh/htm@3.1.1': stub({
      default: { bind: () => (strings, ...values) => ({ strings, values }) },
    }),
    './config.js': stub({ SPORTGEN_API_URL: 'https://larphacksproject.onrender.com' }),
  };
  const source = await readFile(new URL('../src/sport-inventor.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link(name => dependencies[name]);
  await module.evaluate();
  const tree = module.namespace.SportInventor({ onPlay: () => {}, disabled: false });
  const invent = tree.values.find(value => typeof value === 'function' && value.name === 'invent');
  assert.ok(invent, 'Invent button must have a submit handler');
  await invent();
  return { state, requests, timers };
}

test('empty success response shows a clear error and never starts polling', async () => {
  const { state, timers } = await submit({ ok: true, text: async () => '' });
  assert.match(state[3], /empty response/i);
  assert.doesNotMatch(state[3], /expected pattern/);
  assert.equal(state[1], null);
  assert.equal(timers.length, 0);
});

test('HTML and missing API routes do not become JSON parser errors', async () => {
  for (const response of [
    { ok: true, text: async () => '<html>Static website</html>' },
    { ok: false, status: 404 },
    { ok: true, text: async () => '{}' },
  ]) {
    const { state, timers } = await submit(response);
    assert.match(state[3], /Could not start sport generation/);
    assert.equal(timers.length, 0);
  }
});

test('valid job response queues polling on the website domain', async () => {
  const { state, requests, timers } = await submit({
    ok: true,
    text: async () => '{"id":"test-job","engine":"fast"}',
  });
  assert.equal(state[3], '');
  assert.equal(state[1].id, 'test-job');
  assert.equal(state[1].status, 'queued');
  assert.equal(requests[0].url, 'https://larphacksproject.onrender.com/jobs');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 2000);
});
