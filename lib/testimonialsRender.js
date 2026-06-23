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
//     link:  "https://linkedin.com/...", // optional — public post to link the name to
//     photo: "/lib/img/abbey-pantano.jpg" } // optional — headshot beside the name
// Renders from 1. Set an optional heading per anchor with data-heading="…".
'use strict';

(function () {
  /** @type {{quote:string,name:string,role?:string,link?:string,photo?:string}[]} */
  var TESTIMONIALS = [
    {
      quote: "Sam came into my life during a period of intense overwhelm and chaos for me as a consultant, coach and business founder. I was the bottleneck for everything and juggling so much that I kept dropping balls and lost a few major opportunities as a result. Sam came on board as my AI mentor and it's honestly changing my life. The EA tool we built together has become my support system, second brain and connective tissue for me, my team and my business. I recommend Sam's AI EA system to every business owner I know. This is an investment you will never regret.",
      name: "Abbey Pantano",
      role: "Founder, The Impact Collab",
      photo: "/lib/img/abbey-pantano.jpg"
    },
    {
      quote: "I came in a confident ChatGPT user, new to what AI could really do for my business. A few sessions later I'm building production shotlists with moodboards, quote templates and pitch decks from scratch — on real client work. Sam meets you exactly where you are.",
      name: "Alex Mills",
      role: "Founder, Alex Mills Social",
      photo: "/lib/img/alex-mills.jpg"
    },
    {
      quote: "After my first block with Sam I booked a second one on the spot — and told him to put his price up. For what he helps you do, he's worth a lot more than he charges.",
      name: "Samantha Philpot",
      role: "Founder, Find Your People",
      photo: "/lib/img/samantha-philpot.jpg"
    },
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHTML(t) {
    var name = '<span class="t-name">' + esc(t.name) + '</span>';
    if (t.link) {
      name = '<a href="' + esc(t.link) + '" target="_blank" rel="noopener">' + name + '</a>';
    }
    var role = t.role ? '<span class="t-role">' + esc(t.role) + '</span>' : '';
    var photo = t.photo
      ? '<img class="testimonial-photo" src="' + esc(t.photo) + '" alt="' + esc(t.name) + '" width="52" height="52" loading="lazy">'
      : '';
    return '<figure class="testimonial-card">'
      + '<blockquote>' + esc(t.quote) + '</blockquote>'
      + '<figcaption class="attribution">' + photo
      + '<span class="attribution-text">' + name + role + '</span>'
      + '</figcaption>'
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
