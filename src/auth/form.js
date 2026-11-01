import { getClient } from './client.js';

const form = document.getElementById('auth-form');
const button = form.querySelector('button[type=submit]');
const message = document.getElementById('auth-message');
const signup = document.body.dataset.authMode === 'signup';
let client;
function showMessage(text, isError = false) {
  message.textContent = text;
  message.hidden = false;
  message.className = isError ? 'auth-error' : 'auth-notice';
  message.setAttribute('role', isError ? 'alert' : 'status');
}
// Attach immediately: no form submission should ever POST to a static host.
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client || button.disabled) return;
  const fields = new FormData(form);
  const email = fields.get('email').trim();
  const password = fields.get('password');
  const name = fields.get('name')?.trim();
  if (signup && (!name || password.length < 12 || password !== fields.get('confirm_password'))) {
    showMessage(!name ? 'Enter your name.' : password.length < 12 ? 'Use at least 12 characters.' : 'Your passwords do not match.', true);
    return;
  }
  button.disabled = true;
  button.textContent = signup ? 'Creating account…' : 'Logging in…';
  message.hidden = true;
  try {
    const result = signup
      ? await client.auth.signUp({ email, password, options: {
          data: { name }, emailRedirectTo: `${window.location.origin}/login.html`,
        } })
      : await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (result.data.session) window.location.replace('/');
    else {
      showMessage('Check your email to confirm your account, then return here to log in. If you already have an account, use Log in.');
      form.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
    }
  } catch (error) {
    const text = error.code === 'invalid_credentials' ? 'Email or password is incorrect.'
      : error.code === 'email_not_confirmed' ? 'Confirm your email before logging in.'
      : error.status === 429 ? 'Too many attempts. Please wait before trying again.'
      : error.message || 'Unable to connect. Please try again.';
    showMessage(text, true);
  } finally {
    button.disabled = false;
    button.textContent = signup ? 'Create account ↗' : 'Log in ↗';
  }
});

try {
  client = await getClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (session) window.location.replace('/');
  else {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const callbackError = params.get('error_description') || new URLSearchParams(window.location.search).get('error_description');
    if (callbackError) {
      showMessage('That confirmation link is invalid or expired. Request a new one from the site owner or try signing in.', true);
      history.replaceState(null, '', window.location.pathname);
    }
    button.disabled = false;
  }
} catch (error) {
  showMessage(error.message || 'Unable to load sign-in. Please refresh and try again.', true);
  button.disabled = !client;
}
