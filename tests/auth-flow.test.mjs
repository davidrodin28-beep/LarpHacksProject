import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/auth/form.js', import.meta.url), 'utf8');

async function page({ signup = false, mode = signup ? 'signup' : 'login', result = {}, initError = null, session = null, sessionError = null, hash = '', search = '' } = {}) {
  let submit;
  let redirected;
  let call;
  let resetRequest;
  let update;
  let signedOut = false;
  let cleaned = false;
  const storage = new Map([['boxingpal-guest', '1']]);
  const button = { disabled: true, textContent: '' };
  const message = { hidden: true, setAttribute() {} };
  const values = new Map(Object.entries({ email: 'test@example.test', password: 'long test password', confirm_password: 'long test password', name: 'Test' }));
  const form = { querySelector: () => button, querySelectorAll: () => [], addEventListener: (event, handler) => { submit = handler; } };
  const client = { auth: {
    getSession: async () => ({ data: { session }, error: sessionError }),
    signUp: async data => { call = data; return result; },
    signInWithPassword: async data => { call = data; return result; },
    resetPasswordForEmail: async (email, options) => { resetRequest = { email, options }; return result; },
    updateUser: async data => { update = data; return result; },
    signOut: async () => { signedOut = true; return {}; },
  } };
  const context = vm.createContext({
    document: { body: { dataset: { authMode: mode } }, getElementById: id => id === 'auth-form' ? form : message },
    window: { location: { origin: 'https://stillwatch.example', hash, search, pathname: `/${mode}.html`, replace: url => { redirected = url; } } },
    history: { replaceState() { cleaned = true; } }, URLSearchParams,
    sessionStorage: { removeItem: key => storage.delete(key) },
    FormData: class { get(key) { return values.get(key); } },
  });
  const dependency = new vm.SyntheticModule(['getClient'], function () {
    this.setExport('getClient', async () => { if (initError) throw initError; return client; });
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => dependency);
  await module.evaluate();
  return { button, message, values, storage, redirect: () => redirected, call: () => call, resetRequest: () => resetRequest, update: () => update, signedOut: () => signedOut, cleaned: () => cleaned, submit: async () => {
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
  assert.equal(p.storage.has('boxingpal-guest'), false);
});
test('an existing login exits guest mode before redirecting', async () => {
  const p = await page({ session: {} });
  assert.equal(p.redirect(), '/');
  assert.equal(p.storage.has('boxingpal-guest'), false);
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


test('forgot password sends a recovery email with the password form callback', async () => {
  const p = await page({ mode: 'forgot-password', result: { data: {} } });
  await p.submit();
  assert.equal(p.resetRequest().email, 'test@example.test');
  assert.equal(p.resetRequest().options.redirectTo, 'https://stillwatch.example/reset-password.html');
  assert.match(p.message.textContent, /If an account exists/);
  assert.equal(p.redirect(), undefined);
  assert.equal(p.button.disabled, false);
});

test('forgot password remains accessible with an existing session', async () => {
  const p = await page({ mode: 'forgot-password', session: {} });
  assert.equal(p.redirect(), undefined);
  assert.equal(p.button.disabled, false);
});

test('reset email failures are reported and can be retried', async () => {
  const p = await page({ mode: 'forgot-password', result: { error: { status: 429 } } });
  await p.submit();
  assert.match(p.message.textContent, /Too many attempts/);
  assert.equal(p.button.disabled, false);
});

test('recovery session stays on password form and saves new password', async () => {
  const p = await page({ mode: 'reset-password', session: {}, search: '?code=recovery-code', result: { data: { user: {} } } });
  assert.equal(p.redirect(), undefined);
  await p.submit();
  assert.equal(p.update().password, 'long test password');
  assert.equal(p.signedOut(), true);
  assert.match(p.message.textContent, /password has been updated/);
  assert.equal(p.button.disabled, true);
});

test('reset password requires a session from the recovery link', async () => {
  const p = await page({ mode: 'reset-password' });
  assert.equal(p.button.disabled, true);
  await p.submit();
  assert.equal(p.update(), undefined);
  assert.match(p.message.textContent, /Open the reset link/);
});

test('expired callback cannot use a preexisting session to reset a password', async () => {
  for (const callback of [{ hash: '#error=access_denied&error_description=Expired' }, { search: '?error=access_denied' }]) {
    const p = await page({ mode: 'reset-password', session: {}, ...callback });
    assert.equal(p.button.disabled, true);
    await p.submit();
    assert.equal(p.update(), undefined);
    assert.match(p.message.textContent, /invalid or expired/);
    assert.equal(p.cleaned(), true);
  }
});

test('failed recovery session validation keeps password submission disabled', async () => {
  const p = await page({ mode: 'reset-password', sessionError: new Error('Invalid code verifier') });
  assert.equal(p.button.disabled, true);
  await p.submit();
  assert.equal(p.update(), undefined);
  assert.match(p.message.textContent, /Unable to verify/);
});

test('short, oversized and mismatched new passwords never reach Supabase', async () => {
  for (const password of ['short', 'x'.repeat(129), 'different long password']) {
    const p = await page({ mode: 'reset-password', session: {} });
    p.values.set('password', password);
    await p.submit();
    assert.equal(p.update(), undefined);
    assert.equal(p.button.disabled, false);
    assert.equal(p.message.className, 'auth-error');
  }
});

test('password update failure keeps form usable without signing out', async () => {
  const p = await page({ mode: 'reset-password', session: {}, result: { error: { message: 'Use a different password.' } } });
  await p.submit();
  assert.match(p.message.textContent, /different password/);
  assert.equal(p.button.disabled, false);
  assert.equal(p.signedOut(), false);
});
