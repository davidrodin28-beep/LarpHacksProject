import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');

async function api(origin, content = '') {
  const url = new URL(origin);
  const context = vm.createContext({ location: { origin: url.origin, protocol: url.protocol }, document: { querySelector: () => ({ content }) } });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  return module.namespace.SPORTGEN_API_URL;
}

test('deployed pages use their own origin for the combined website and API', async () => {
  assert.equal(await api('https://larphacksproject.onrender.com'), 'https://larphacksproject.onrender.com');
  assert.equal(await api('https://preview.example'), 'https://preview.example');
});
test('local pages use the same server and port as the website', async () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(await api(`http://${host}:8000`), `http://${host}:8000`);
});
test('legacy meta overrides cannot redirect API calls to an obsolete service', async () => {
  assert.equal(await api('https://larphacksproject.onrender.com', 'https://sportpau.onrender.com/'), 'https://larphacksproject.onrender.com');
});
test('non-web contexts use the production combined service', async () => {
  assert.equal(await api('file:///preview.html'), 'https://larphacksproject.onrender.com');
});
