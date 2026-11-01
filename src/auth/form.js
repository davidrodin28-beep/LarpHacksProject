import { getClient } from './client.js';

const form = document.getElementById('auth-form');
const button = form.querySelector('button[type=submit]');
const message = document.getElementById('auth-message');
const mode = document.body.dataset.authMode;
const signup = mode === 'signup';
const forgotPassword = mode === 'forgot-password';
const resetPassword = mode === 'reset-password';
const idleLabel = signup ? 'Create account ↗' : forgotPassword ? 'Send reset link ↗' : resetPassword ? 'Save new password ↗' : 'Log in ↗';
let client;
let canSubmit = false;
let passwordSaved = false;
function showMessage(text, isError = false) {
  message.textContent = text;
  message.hidden = false;
  message.className = isError ? 'auth-error' : 'auth-notice';
  message.setAttribute('role', isError ? 'alert' : 'status');
}
// Attach immediately: no form submission should ever POST to a static host.
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client || !canSubmit || button.disabled) return;
  const fields = new FormData(form);
  const email = fields.get('email')?.trim();
  const password = fields.get('password');
  const name = fields.get('name')?.trim();
  if ((signup && !name) || ((signup || resetPassword) && (password.length < 12 || password.length > 128 || password !== fields.get('confirm_password')))) {
    showMessage(signup && !name ? 'Enter your name.' : password.length < 12 || password.length > 128 ? 'Use 12–128 characters.' : 'Your passwords do not match.', true);
    return;
  }
  button.disabled = true;
  button.textContent = signup ? 'Creating account…' : forgotPassword ? 'Sending reset link…' : resetPassword ? 'Saving password…' : 'Logging in…';
  message.hidden = true;
  try {
    const result = forgotPassword
      ? await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password.html` })
      : resetPassword
      ? await client.auth.updateUser({ password })
      : signup
      ? await client.auth.signUp({ email, password, options: {
          data: { name }, emailRedirectTo: `${window.location.origin}/login.html`,
        } })
      : await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (forgotPassword) {
      showMessage('If an account exists for that email, you’ll receive a password reset link. Check your inbox and spam folder, then open the link in this browser.');
    } else if (resetPassword) {
      passwordSaved = true;
      canSubmit = false;
      form.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
      showMessage('Your password has been updated. You can now return to log in with your new password.');
      // End the recovery session so the next visit uses the new credentials.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) showMessage('Your password has been updated. Return to log in to continue.');
    } else if (result.data.session) { sessionStorage.removeItem('boxingpal-guest'); window.location.replace('/'); }
    else {
      showMessage('Check your email to confirm your account, then return here to log in. If you already have an account, use Log in.');
      form.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
    }
  } catch (error) {
    if (passwordSaved) {
      showMessage('Your password has been updated. Return to log in to continue.');
      return;
    }
    const text = error.code === 'invalid_credentials' ? 'Email or password is incorrect.'
      : error.code === 'email_not_confirmed' ? 'Confirm your email before logging in.'
      : error.status === 429 ? 'Too many attempts. Please wait before trying again.'
      : error.message || 'Unable to connect. Please try again.';
    showMessage(text, true);
  } finally {
    button.disabled = passwordSaved;
    button.textContent = passwordSaved ? 'Password updated' : idleLabel;
  }
});

try {
  // Capture callback errors before Supabase processes and cleans the URL.
  const params = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const callbackError = params.get('error_description') || params.get('error') || query.get('error_description') || query.get('error');
  client = await getClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (callbackError) {
    showMessage(resetPassword ? 'That reset link is invalid or expired. Request a new reset link below.' : 'That confirmation link is invalid or expired. Request a new one from the site owner or try signing in.', true);
    history.replaceState(null, '', window.location.pathname);
    canSubmit = !resetPassword;
    button.disabled = !canSubmit;
  } else if (resetPassword) {
    canSubmit = Boolean(session);
    button.disabled = !canSubmit;
    if (!session) showMessage('Open the reset link from your email in the same browser where you requested it. If it has expired, request a new link below.', true);
  } else if (session && !forgotPassword) { sessionStorage.removeItem('boxingpal-guest'); window.location.replace('/'); }
  else {
    canSubmit = true;
    button.disabled = false;
  }
} catch (error) {
  showMessage(resetPassword && client ? 'Unable to verify your reset link. Open it in the same browser where you requested it, or request a new link below.' : error.message || 'Unable to load sign-in. Please refresh and try again.', true);
  button.disabled = true;
}
