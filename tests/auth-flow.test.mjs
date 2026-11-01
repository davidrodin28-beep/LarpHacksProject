import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/auth/form.js', import.meta.url), 'utf8');

async function page({ signup = false, result = {}, initError = null } = {}) {
  let submit;
  let redirected;
  let call;
  const button = { disabled: true, textContent: '' };
  const message = { hidden: true, setAttribute() {} };
  const values = new Map(Object.entries({ email: 'test@example.test', password: 'long test password', confirm_password: 'long test password', name: 'Test' }));
  const form = { querySelector: () => button, querySelectorAll: () => [], addEventListener: (event, handler) => { submit = handler; } };
  const client = { auth: {
    getSession: async () => ({ data: { session: null } }),
    signUp: async data => { call = data; return result; },
    signInWithPassword: async data => { call = data; return result; },
  } };
  const context = vm.createContext({
    document: { body: { dataset: { authMode: signup ? 'signup' : 'login' } }, getElementById: id => id === 'auth-form' ? form : message },
    window: { location: { origin: 'https://stillwatch.example', hash: '', search: '', replace: url => { redirected = url; } } },
    history: { replaceState() {} }, URLSearchParams,
    FormData: class { get(key) { return values.get(key); } },
  });
  const dependency = new vm.SyntheticModule(['getClient'], function () {
    this.setExport('getClient', async () => { if (initError) throw initError; return client; });
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => dependency);
  await module.evaluate();
  return { button, message, values, redirect: () => redirected, call: () => call, submit: async () => {
    let prevented = false;
    await submit({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
  } };
}

test('login sends credentials to Supabase and redirects instead of POSTing', async () => {
  const p = await page({ result: { data: { session: {} } } });
  await p.submit();
  assert.equal(p.call().email, 'test@example.test');
  assert.equal(p.redirect(), '/');
});
test('signup without session asks for email confirmation', async () => {
  const p = await page({ signup: true, result: { data: { session: null } } });
  await p.submit();
  assert.equal(p.redirect(), undefined);
  assert.match(p.message.textContent, /Check your email/);
  assert.equal(p.call().options.emailRedirectTo, 'https://stillwatch.example/login.html');
});
test('mismatched passwords never reach Supabase', async () => {
  const p = await page({ signup: true });
  p.values.set('confirm_password', 'wrong');
  await p.submit();
  assert.equal(p.call(), undefined);
  assert.match(p.message.textContent, /do not match/);
});
test('failed credentials keep form usable', async () => {
  const p = await page({ result: { error: { code: 'invalid_credentials' } } });
  await p.submit();
  assert.match(p.message.textContent, /incorrect/);
  assert.equal(p.button.disabled, false);
});
test('configuration failure disables submission and reports failure', async () => {
  const p = await page({ initError: new Error('Sign-in is not configured yet.') });
  assert.equal(p.button.disabled, true);
  assert.match(p.message.textContent, /not configured/);
  await p.submit();
  assert.equal(p.call(), undefined);
});
