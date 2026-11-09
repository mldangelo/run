/* Apply saved preferences before styles are painted; system mode stays in CSS. */
(() => {
  const key = 'sf-run-theme';
  const root = document.documentElement;
  const normalize = (value) =>
    value === 'light' || value === 'dark' ? value : 'system';
  let preference = 'system';
  try {
    preference = normalize(window.localStorage.getItem(key));
  } catch {
    // The system preference remains available when storage is blocked.
  }
  function apply(value) {
    preference = normalize(value);
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
    // The browser bar follows the device in system mode and the saved theme otherwise.
    for (const meta of document.querySelectorAll(
      'meta[name="theme-color"][data-scheme]',
    )) {
      const scheme = meta.getAttribute('data-scheme');
      meta.setAttribute(
        'media',
        preference === 'system'
          ? `(prefers-color-scheme: ${scheme})`
          : scheme === preference
            ? 'all'
            : 'not all',
      );
    }
  }
  apply(preference);
  document.addEventListener('DOMContentLoaded', () => {
    const control = document.getElementById('theme-control');
    const select = document.getElementById('theme');
    select.value = preference;
    control.hidden = false;
    select.addEventListener('change', () => {
      apply(select.value);
      try {
        if (preference === 'system') window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, preference);
      } catch {
        // The selection still works for this page when storage is blocked.
      }
    });
    window.addEventListener('storage', (event) => {
      if (event.key === key || event.key === null) {
        apply(event.key === null ? null : event.newValue);
        select.value = preference;
      }
    });
  });
})();
