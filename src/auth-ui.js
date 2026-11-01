document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Hide' : 'Show';
    button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(visible));
  });
});
document.querySelectorAll('[data-auth-form]').forEach((form) => {
  form.addEventListener('submit', () => {
    const button = form.querySelector('button[type="submit"]');
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = button.dataset.pending;
  });
});
window.addEventListener('pageshow', () => {
  document.querySelectorAll('[data-auth-form] button[type="submit"]').forEach((button) => {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  });
});
