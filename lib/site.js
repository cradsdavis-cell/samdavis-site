// ============================================================
// crads-ai.com · shared site JS
// Nav (single source of truth, injected), italic morph, scroll observer,
// smooth anchor scroll. Imported as <script defer src="/lib/site.js"></script>
// ============================================================

// ---------- Nav: one definition, injected on every page ----------
// The nav used to be pasted into 65 files. Now NAV_ITEMS is the only list;
// navHTML() renders it, initNavInject() swaps it into whatever static
// <nav class="site-nav-bar"> a page shipped with (a no-JS fallback that
// scripts/write-static-nav.js regenerates from this same function), and the
// docs pages, which are generated in another repo, get the current nav the
// moment this file runs. tests/navConsistency.test.js pins the static copies
// to NAV_ITEMS so the swap is invisible.
var NAV_ITEMS = [
  { href: '/docs', label: 'Docs', cls: 'nav-simple', prefix: '/docs/' },
  { href: '/how-it-works', label: 'How it works', cls: 'nav-simple' },
  { href: '/offer', label: 'Setup and support', cls: 'nav-simple' },
  { href: '/about', label: 'About', cls: 'nav-simple' },
  { href: '/book', label: 'Book a call', cls: 'nav-simple nav-book', prefix: '/book/' },
  { href: '/download', label: 'Download', cls: 'nav-simple nav-cta' },
];

function normalisePath(pathname) {
  var p = String(pathname || '/');
  p = p.split('?')[0].split('#')[0];
  if (p.endsWith('/index.html')) p = p.slice(0, -'/index.html'.length);
  else if (p.endsWith('.html')) p = p.slice(0, -'.html'.length);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

function isCurrent(item, p) {
  if (p === item.href) return true;
  return !!(item.prefix && p.indexOf(item.prefix) === 0);
}

function navHTML(pathname) {
  var p = normalisePath(pathname);
  var links = NAV_ITEMS.map(function (it) {
    var cls = it.cls + (isCurrent(it, p) ? ' current' : '');
    return '    <a href="' + it.href + '" class="' + cls + '">' + it.label + '</a>';
  }).join('\n');
  return [
    '<nav class="site-nav-bar" aria-label="Primary">',
    '  <a href="/" class="brand" aria-label="crads-ai home">',
    '    <img src="/lib/img/sam-illustration-sm.png" alt="">',
    '    <span class="wordmark">crads-<span class="accent">ai</span></span>',
    '  </a>',
    '  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-links" aria-label="Open menu">',
    '    <span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>',
    '  </button>',
    '  <div class="nav-links" id="site-nav-links">',
    links,
    '  </div>',
    '</nav>',
  ].join('\n');
}

if (typeof module === 'object' && module.exports) {
  module.exports = { NAV_ITEMS, navHTML, normalisePath };
}

(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  // ---------- Nav injection ----------
  function initNavInject() {
    var tpl = document.createElement('template');
    tpl.innerHTML = navHTML(window.location.pathname).trim();
    var fresh = tpl.content.firstElementChild;
    if (!fresh) return;
    var existing = document.querySelectorAll('nav.site-nav-bar');
    if (existing.length) {
      existing[0].replaceWith(fresh);
      for (var i = 1; i < existing.length; i++) existing[i].remove();
    } else {
      document.body.insertBefore(fresh, document.body.firstChild);
    }
  }

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
    // Auto-apply .reveal-on-scroll + --stagger-index to direct children of .stagger-grid
    document.querySelectorAll('.stagger-grid').forEach((parent) => {
      Array.from(parent.children).forEach((child, idx) => {
        if (!child.classList.contains('reveal-on-scroll')) {
          child.classList.add('reveal-on-scroll');
        }
        if (!child.style.getPropertyValue('--stagger-index')) {
          child.style.setProperty('--stagger-index', idx);
        }
      });
    });

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

  // ---------- Typewriter ----------
  // Walks direct children of [data-typewriter] elements and reveals them
  // one at a time on intersection. Children should have class "tw-line".
  // Respects prefers-reduced-motion.
  function initTypewriter() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-typewriter]').forEach((el) => {
      const lines = el.querySelectorAll('.tw-line');
      if (lines.length === 0) return;

      if (reduced) {
        // Reveal everything immediately
        lines.forEach(line => line.classList.add('tw-revealed'));
        return;
      }

      // Hide all lines initially
      lines.forEach(line => line.classList.remove('tw-revealed'));

      if (!('IntersectionObserver' in window)) {
        lines.forEach(line => line.classList.add('tw-revealed'));
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          // Reveal lines sequentially
          lines.forEach((line, i) => {
            setTimeout(() => line.classList.add('tw-revealed'), i * 90);
          });
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.3 });

      observer.observe(el);
    });
  }

  // ---------- About accordion ----------
  function initAboutAccordion() {
    const headers = document.querySelectorAll('.about-row-header');
    if (!headers.length) return;

    function toggle(header) {
      const row = header.closest('.about-row');
      if (!row) return;
      // aria-expanded lives on the <button> only (valid ARIA); the row carries
      // a data attribute as the CSS styling hook.
      const expanded = row.getAttribute('data-expanded') === 'true';
      row.setAttribute('data-expanded', expanded ? 'false' : 'true');
      header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }

    headers.forEach((header) => {
      header.addEventListener('click', () => toggle(header));
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(header);
        }
      });
    });
  }

  // ---------- Grouped nav (dropdowns + mobile drawer) ----------
  function initNav() {
    const bar = document.querySelector('.site-nav-bar');
    if (!bar) return;
    const toggle = bar.querySelector('.nav-toggle');
    const groups = Array.prototype.slice.call(bar.querySelectorAll('.nav-group'));
    const caretOf = (g) => g.querySelector('.nav-caret');

    function closeAllGroups() {
      groups.forEach((g) => {
        g.setAttribute('data-open', 'false');
        const c = caretOf(g);
        if (c) c.setAttribute('aria-expanded', 'false');
      });
    }
    function closeDrawer() {
      bar.classList.remove('nav-open');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      }
    }

    // hamburger
    if (toggle) {
      toggle.addEventListener('click', () => {
        const open = bar.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        if (!open) closeAllGroups();
      });
    }

    groups.forEach((group) => {
      const caret = caretOf(group);
      if (!caret) return;
      caret.setAttribute('aria-haspopup', 'true');

      // caret toggle drives touch + mobile (and manual toggle on desktop)
      caret.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = group.getAttribute('data-open') === 'true';
        groups.forEach((g) => {
          if (g !== group) {
            g.setAttribute('data-open', 'false');
            const c = caretOf(g);
            if (c) c.setAttribute('aria-expanded', 'false');
          }
        });
        group.classList.remove('nav-esc');
        group.setAttribute('data-open', isOpen ? 'false' : 'true');
        caret.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      });

      // keep the announced state in step with the CSS focus-within reveal (WCAG 4.1.2)
      function sync() {
        const open = !group.classList.contains('nav-esc') &&
          (group.getAttribute('data-open') === 'true' || group.matches(':focus-within'));
        caret.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      group.addEventListener('focusin', sync);
      group.addEventListener('focusout', () => { setTimeout(sync, 0); });
    });

    // Escape: dismiss the menu without losing your place (WCAG 1.4.13)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeAllGroups();
      const active = document.activeElement;
      const grp = active && active.closest ? active.closest('.nav-group') : null;
      if (grp) {
        grp.classList.add('nav-esc');                 // force the focus-within menu shut
        const trigger = grp.querySelector('.nav-trigger');
        if (trigger) trigger.focus();                 // keep focus on the trigger
        const clear = () => {
          grp.classList.remove('nav-esc');
          grp.removeEventListener('focusout', clear);
          grp.removeEventListener('mouseleave', clear);
        };
        grp.addEventListener('focusout', clear);
        grp.addEventListener('mouseleave', clear);
      }
      closeDrawer();
    });

    // click outside closes everything
    document.addEventListener('click', (e) => {
      if (bar.contains(e.target)) return;
      closeAllGroups();
      closeDrawer();
    });
  }

  // ---------- Init ----------
  // Each module is wrapped so a throw in one can't block the others: in
  // particular, scroll-reveal governs the visibility of pricing and key copy,
  // so it runs FIRST and can never be starved by an unrelated failure. (2026-06-21)
  function safe(fn) {
    try { fn(); } catch (e) { /* keep the other modules running */ }
  }

  function runInits() {
    safe(initNavInject);       // first: initNav binds to the bar it finds
    safe(initScrollReveal);
    safe(initItalicMorph);
    safe(initSmoothScroll);
    safe(initTypewriter);
    safe(initAboutAccordion);
    safe(initNav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInits);
  } else {
    runInits();
  }

  // Safety net: once the page (incl. images) has fully loaded, force-reveal any
  // reveal-on-scroll element already in view that somehow never got .revealed.
  // Content below the fold still reveals on scroll via the observer. This
  // guarantees nothing: least of all the prices: can stay permanently hidden.
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.querySelectorAll('.reveal-on-scroll:not(.revealed)').forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('revealed');
        }
      });
    }, 400);
  });
})();
