// lib/testimonialsRender.js — client-side proof strip.
// Renders into any <section data-testimonials hidden> when 1+ REAL client
// quotes exist, and unhides it. Empty by design on ship.
//
// ⚠️  HONESTY RULE: real, attributable client quotes ONLY. Never invent one.
//     The strip stays hidden until a genuine quote is added here.
//
// To add a quote, drop an object into TESTIMONIALS below:
//   { quote: "what they said (no surrounding quote marks)",
//     name:  "Abbey",
//     role:  "founder, [business]",      // optional
//     link:  "https://linkedin.com/..." } // optional — public post to link the name to
// Renders from 1. Set an optional heading per anchor with data-heading="…".
'use strict';

(function () {
  /** @type {{quote:string,name:string,role?:string,link?:string}[]} */
  var TESTIMONIALS = [
    // EMPTY until Sam adds real client quotes. Do not fabricate.
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHTML(t) {
    var attr = '<strong>' + esc(t.name) + '</strong>' + (t.role ? ' — ' + esc(t.role) : '');
    if (t.link) {
      attr = '<a href="' + esc(t.link) + '" target="_blank" rel="noopener">' + attr + '</a>';
    }
    return '<figure class="testimonial-card">'
      + '<blockquote>' + esc(t.quote) + '</blockquote>'
      + '<figcaption class="attribution">' + attr + '</figcaption>'
      + '</figure>';
  }

  function render() {
    var anchors = document.querySelectorAll('[data-testimonials]');
    if (!anchors.length) return;
    var valid = TESTIMONIALS.filter(function (t) { return t && t.quote && t.name; });
    if (valid.length < 1) return; // no real proof yet → leave the strip hidden
    var cards = valid.map(cardHTML).join('');
    anchors.forEach(function (el) {
      var heading = el.getAttribute('data-heading') || 'What clients say';
      el.innerHTML = '<h2>' + esc(heading) + '</h2><div class="grid">' + cards + '</div>';
      el.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
