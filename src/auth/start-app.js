import { getClient } from './client.js';

const root = document.getElementById('root');
try {
  const params = new URLSearchParams(window.location.search);
  if (params.get('guest') === '1') {
    sessionStorage.setItem('boxingpal-guest', '1');
    params.delete('guest');
    history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params : '') + window.location.hash);
  }
  if (sessionStorage.getItem('boxingpal-guest') === '1') {
    root.dataset.accountName = 'Guest';
    root.dataset.guestMode = 'true';
    await import('../StillwatchUI.js');
  } else {
  const client = await getClient();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) {
    window.location.replace('/login.html');
  } else {
    const { data: { user }, error } = await client.auth.getUser();
    if (error) throw error;
    if (!user) window.location.replace('/login.html');
    else {
      const name = user.user_metadata?.name;
      root.dataset.accountName = typeof name === 'string' && name.trim() ? name : user.email || 'Your account';
      client.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') window.location.replace('/login.html');
      });
      await import('../StillwatchUI.js');
    }
  }
  }
} catch (error) {
  root.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'auth-loading';
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'We couldn’t load your session. Check your connection and try signing in again.';
  const link = document.createElement('a');
  link.href = '/login.html';
  link.textContent = 'Go to login';
  panel.append(message, link);
  root.append(panel);
  console.error('Session initialization failed', error.message);
}
