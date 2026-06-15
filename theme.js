// Standalone theme toggle for static pages (e.g. rules.html)
// Mirrors the dark/light theme logic from script.js so the
// preference stays in sync across pages via localStorage.

document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon   = document.getElementById('themeIcon');

  function loadTheme() {
    const saved = localStorage.getItem('wc2026-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      themeIcon.textContent = saved === 'light' ? '☀️' : '🌙';
    }
  }

  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeIcon.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('wc2026-theme', isDark ? 'light' : 'dark');
  }

  loadTheme();
  themeToggle.addEventListener('click', toggleTheme);
});
