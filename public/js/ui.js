export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

let toastTimeout;
export function toast(message, type = 'success') {
  const element = document.getElementById('toast');
  clearTimeout(toastTimeout);
  element.className = `toast${type === 'error' ? ' error' : ''}`;
  element.innerHTML = `<span class="toast-symbol" aria-hidden="true">${type === 'error' ? '!' : '✓'}</span><span>${escapeHtml(message)}</span>`;
  element.hidden = false;
  toastTimeout = setTimeout(() => {
    element.hidden = true;
  }, 3000);
}

export function showConflict(message) {
  document.getElementById('conflict-description').textContent = message;
  document.getElementById('conflict-dialog').showModal();
}

export function displayFieldErrors(form, errors, prefix = '') {
  form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((field) => {
    field.textContent = '';
  });
  for (const [name, message] of Object.entries(errors)) {
    const field = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (field) field.setAttribute('aria-invalid', 'true');
    const container = form.querySelector(`#${CSS.escape(`${prefix}${name}-error`)}`);
    if (container) container.textContent = message;
  }
  form.querySelector('[aria-invalid="true"]')?.focus();
}

export function storageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storageSet(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}
