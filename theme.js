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
  initRevealObserver();
});

// ── SCROLL REVEAL ────────────────────────────────────────────────────────
/**
 * Fades/slides .reveal elements into view as they enter the viewport
 * (see .reveal / .reveal.is-visible in style.css). Without this, elements
 * marked "reveal" stay permanently at opacity:0 and never appear.
 */
function initRevealObserver() {
  const revealEls = document.querySelectorAll('.reveal');
  if (!revealEls.length) return;

  if (!('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => observer.observe(el));
}
