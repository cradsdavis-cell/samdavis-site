// ============================================================
// crads-ai.com · shared site JS
// Italic morph + scroll observer + smooth anchor scroll.
// Imported as <script defer src="/lib/site.js"></script>
// ============================================================

(function () {
  'use strict';

  // ---------- Italic morph ----------
  // Looks for elements like:
  //   <span class="italic-morph" data-phrases="a|b|c">a</span>
  // Cycles through phrases on a 4s interval with crossfade.
  function initItalicMorph() {
    document.querySelectorAll('.italic-morph').forEach((el) => {
      const phrasesAttr = el.getAttribute('data-phrases') || '';
      const phrases = phrasesAttr.split('|').map(s => s.trim()).filter(Boolean);
      if (phrases.length < 2) return;

      const phraseEl = document.createElement('span');
      phraseEl.className = 'phrase';
      phraseEl.textContent = phrases[0];
      el.textContent = '';
      el.appendChild(phraseEl);

      let i = 0;
      setInterval(() => {
        i = (i + 1) % phrases.length;
        phraseEl.classList.add('exiting');
        setTimeout(() => {
          phraseEl.textContent = phrases[i];
          phraseEl.classList.remove('exiting');
          phraseEl.classList.add('entering');
          // Reflow before removing entering class
          // eslint-disable-next-line no-unused-expressions
          phraseEl.offsetWidth;
          phraseEl.classList.remove('entering');
        }, 600);
      }, 4000);
    });
  }

  // ---------- Scroll reveal ----------
  // Observes elements with .reveal-on-scroll, adds .revealed when they enter viewport.
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: just reveal all
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));
  }

  // ---------- Smooth anchor scroll ----------
  // Catches clicks on internal #anchor links and smooth-scrolls.
  function initSmoothScroll() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL hash without jump
      history.pushState(null, '', '#' + id);
    });
  }

  // ---------- Init ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initItalicMorph();
      initScrollReveal();
      initSmoothScroll();
    });
  } else {
    initItalicMorph();
    initScrollReveal();
    initSmoothScroll();
  }
})();
