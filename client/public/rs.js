/* RoomSketch — shared JS for all static SEO pages */

// ── Dark mode ────────────────────────────────────────────────────────────────
(function () {
  const stored = localStorage.getItem('rs-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (stored === 'dark' || (!stored && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
})();

document.addEventListener('DOMContentLoaded', function () {

  // Toggle dark mode
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('rs-theme', isDark ? 'dark' : 'light');
    });
  }

  // Mobile nav
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Scroll fade-in
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.fade-in').forEach(function (el) { observer.observe(el); });

  // Active nav link
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    if (a.getAttribute('href') === path || a.getAttribute('href') === path + '.html') {
      a.classList.add('active');
    }
  });
});
