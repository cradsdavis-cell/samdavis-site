// scripts/certificate-page.js - writes the public pages for the Crads AI
// completion certificate. The program rules live in lib/certificates.js; the
// private register of who holds what lives in the brain
// (client-deliverables/certificates/register.json), never in this repo, because
// every file here is served.
//
//   node scripts/certificate-page.js write --id CA-XXXXXX --name "Full Name" \
//        --program guided-setup --issued 2026-11-23 [--withdrawn 2026-12-01]
//   node scripts/certificate-page.js index
//
// One page per certificate at /certificates/<ID> (noindex: it carries a
// person's name), and /certificates, which says what the certificate means and
// has a box to check an ID. Re-run `write` with --withdrawn to withdraw one.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../lib/certificates.js');
const { navHTML, footerHTML } = require('../lib/site.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'certificates');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const STYLE = `
  <style>
    .cert-page { padding-block: var(--space-5) var(--space-6); }
    .cert-card {
      max-width: 760px;
      background: var(--bg-soft);
      border: 1px solid var(--rule);
      border-top: 4px solid var(--accent);
      border-radius: 6px;
      padding: clamp(24px, 4vw, 48px);
    }
    .cert-status {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: var(--mono); font-size: var(--fs-micro); letter-spacing: 0.04em;
      color: var(--good); margin: 0 0 var(--space-3);
    }
    .cert-status::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--good); }
    .cert-status.withdrawn { color: var(--accent-ink); }
    .cert-status.withdrawn::before { background: var(--accent); }
    .cert-card h1 { font-family: var(--serif); font-size: var(--fs-1); color: var(--ink-deep); line-height: 1.08; margin: 0 0 var(--space-1); }
    .cert-card .cert-program { font-family: var(--serif); font-size: var(--fs-2); color: var(--ink-deep); line-height: 1.2; margin: 0 0 var(--space-3); }
    .cert-card .cert-program span { display: block; font-family: var(--sans); font-size: var(--fs-small); color: var(--ink-soft); margin-bottom: 4px; }
    .cert-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-2) var(--space-3); margin: 0 0 var(--space-4); padding: var(--space-3) 0; border-block: 1px solid var(--rule); }
    .cert-facts dt { font-family: var(--mono); font-size: var(--fs-micro); color: var(--ink-faint); margin: 0 0 4px; }
    .cert-facts dd { margin: 0; font-size: var(--fs-small); color: var(--ink-deep); }
    .cert-card h2 { font-family: var(--sans); font-size: var(--fs-small); font-weight: 600; color: var(--ink-deep); margin: var(--space-3) 0 var(--space-1); }
    .cert-card ul { margin: 0; padding-left: 1.2em; color: var(--ink-soft); font-size: var(--fs-small); line-height: 1.6; }
    .cert-card p { color: var(--ink-soft); font-size: var(--fs-small); line-height: 1.6; margin: 0; }
    .cert-claim { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--rule); }
    .cert-claim a { color: var(--accent-ink); font-weight: 600; }
    .cert-explain { max-width: var(--read-col); }
    .cert-explain h1 { font-family: var(--serif); font-size: var(--fs-1); color: var(--ink-deep); line-height: 1.08; margin: var(--space-1) 0 var(--space-3); }
    .cert-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .cert-explain h2 { font-family: var(--serif); font-size: var(--fs-2); color: var(--ink-deep); margin: var(--space-5) 0 var(--space-2); }
    .cert-explain h3 { font-family: var(--serif); font-size: var(--fs-3); color: var(--ink-deep); margin: var(--space-4) 0 var(--space-1); }
    .cert-explain p, .cert-explain li { color: var(--ink-soft); line-height: 1.6; }
    .cert-explain .meta { margin: 0 0 var(--space-1); }
    .cert-check { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; margin: var(--space-3) 0 var(--space-1); }
    .cert-check input { font-family: var(--mono); font-size: var(--fs-body); text-transform: uppercase; min-height: var(--tap, 44px); padding: 0 14px; border: 1px solid var(--rule); border-radius: 6px; background: #fff; color: var(--ink-deep); width: 14ch; }
    .cert-check button { min-height: var(--tap, 44px); padding: 0 20px; border: 0; border-radius: 6px; background: var(--ink-deep); color: var(--bg-main); font-family: var(--sans); font-size: var(--fs-small); font-weight: 600; cursor: pointer; }
    .cert-id { white-space: nowrap; font-family: var(--mono); font-size: 0.92em; }
    .cert-check-msg { min-height: 1.6em; font-size: var(--fs-small); color: var(--accent-ink); margin: 0; }
  </style>`;

function head({ title, description, robots, url, navPath, extra = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
  <link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${robots ? `  <meta name="robots" content="${robots}">\n` : ''}  <meta name="description" content="${esc(description)}">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Crads-AI">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${C.HOST}/lib/img/og-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/lib/site.css">${STYLE}${extra}
<script defer src="/lib/site.js"></script>
</head>
<body>
  ${navHTML(navPath)}
`;
}

function foot() {
  return `
  ${footerHTML()}
</body>
</html>
`;
}

function certificatePage({ id, name, program, issued, withdrawn }) {
  const p = C.PROGRAMS[program];
  const url = C.checkUrl(id);
  const status = withdrawn
    ? `<p class="cert-status withdrawn">Withdrawn on ${esc(longDate(withdrawn))}. This certificate is no longer valid.</p>`
    : '<p class="cert-status">Valid. Issued by Crads AI.</p>';
  const title = `${name}: ${p.title} · Crads AI completion certificate`;
  const description = `${name} completed ${p.title} with Crads AI and was issued a completion certificate on ${longDate(issued)}. Certificate ID ${id}.`;
  const claim = withdrawn ? '' : `
      <div class="cert-claim">
        <h2>Is this yours?</h2>
        <p><a href="${esc(C.linkedinAddUrl({ id, program, issued }))}" target="_blank" rel="noopener">Add it to your LinkedIn profile</a>, under Licenses &amp; certifications. On a CV: <em>${esc(C.cvLine({ program, issued }))}</em>.</p>
      </div>`;
  return head({ title, description, robots: 'noindex', url, navPath: `/certificates/${id}` }) + `
  <main class="wrap cert-page">
    <article class="cert-card">
      ${status}
      <h1>${esc(name)}</h1>
      <p class="cert-program"><span>completed</span>${esc(p.title)}</p>
      <dl class="cert-facts">
        <div><dt>Issued</dt><dd>${esc(longDate(issued))}</dd></div>
        <div><dt>Certificate ID</dt><dd>${esc(id)}</dd></div>
        <div><dt>Issued by</dt><dd>${esc(C.ISSUER)}, signed by ${esc(C.SIGNED_BY)}</dd></div>
        <div><dt>Expiry</dt><dd>None</dd></div>
      </dl>
      <h2>What they showed</h2>
      <ul>
${p.criteria.map((c) => `        <li>${esc(c)}</li>`).join('\n')}
      </ul>
      <h2>How it was assessed</h2>
      <p>${esc(C.PASS_MARK)}</p>
      <h2>Format</h2>
      <p>${esc(p.format)}</p>
      <h2>What this certificate is</h2>
      <p>${esc(C.WHAT_IT_IS)} ${esc(C.EXPIRY)} <a href="/certificates">More about the certificate</a>.</p>${claim}
    </article>
  </main>
` + foot();
}

const CHECK_SCRIPT = `
<script>
(function () {
  var form = document.getElementById('cert-check');
  if (!form) return;
  var input = form.querySelector('input');
  var msg = document.getElementById('cert-check-msg');
  var RE = ${C.ID_RE.toString()};
  function normalise(raw) {
    var s = String(raw || '').trim().toUpperCase().replace(/\\s+/g, '');
    if (s.indexOf('CA-') === 0) return s;
    if (s.length === 8 && s.indexOf('CA') === 0) return 'CA-' + s.slice(2);
    return 'CA-' + s;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = normalise(input.value);
    if (!RE.test(id)) { msg.textContent = 'That doesn\\u2019t look like a certificate ID. They look like CA-7K3M9Q.'; return; }
    msg.textContent = 'Checking\\u2026';
    fetch('/certificates/' + id, { method: 'HEAD' }).then(function (r) {
      if (r.ok) { window.location.href = '/certificates/' + id; return; }
      msg.textContent = 'No certificate with the ID ' + id + '. Check the letters, or email sam@crads-ai.com.';
    }).catch(function () { window.location.href = '/certificates/' + id; });
  });
})();
</script>`;

function indexPage() {
  const url = `${C.HOST}/certificates`;
  const title = 'Completion certificates · Crads AI';
  const description = 'What a Crads AI completion certificate means, how it is assessed, and how to check one.';
  // One section per distinct title (the two Walkthrough formats share one).
  const seen = new Set();
  const sections = Object.values(C.PROGRAMS).filter((p) => !seen.has(p.title) && seen.add(p.title)).map((p) => {
    const offers = Object.values(C.PROGRAMS).filter((q) => q.title === p.title).map((q) => q.offer).join(' or ');
    return `
    <h3>${esc(p.title)}</h3>
    <p class="meta">Awarded on the ${esc(offers)}</p>
    <ul>
${p.criteria.map((c) => `      <li>${esc(c)}</li>`).join('\n')}
    </ul>`;
  }).join('\n');
  return head({ title, description, url, navPath: '/certificates' }) + `
  <main class="wrap cert-page">
    <div class="cert-explain">
      <p class="eyebrow">Completion certificates</p>
      <h1>Check a certificate</h1>
      <p class="lede">Every Crads AI completion certificate has an ID like <span class="cert-id">CA-7K3M9Q</span> and its own page here. Type the ID to see who holds it and what they showed.</p>
      <form class="cert-check" id="cert-check" novalidate>
        <label class="cert-sr" for="cert-id">Certificate ID</label>
        <input id="cert-id" name="id" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="CA-7K3M9Q" maxlength="12">
        <button type="submit">Check</button>
      </form>
      <p class="cert-check-msg" id="cert-check-msg" role="status"></p>

      <h2>What the certificate means</h2>
      <p>It is given to people who set up their own AI assistant with Sam Davis, PhD, and then showed, live, that they can run it and change it themselves. Nobody gets one for turning up.</p>
${sections}

      <h3>How it is assessed</h3>
      <p>${esc(C.PASS_MARK)} All of them, or no certificate.</p>
      <h3>What it isn't</h3>
      <p>It's a completion certificate, not an accredited or nationally recognised qualification. It isn't awarded for Done for you or Bespoke work, where we build it for you.</p>
      <h3>Expiry</h3>
      <p>${esc(C.EXPIRY)}</p>
      <h3>Claiming it</h3>
      <p>On LinkedIn, add it under Licenses &amp; certifications: the program name with "(completion certificate)", issuing organisation Crads AI, the certificate ID and its page on this site. On a CV, one line: the program name, "completion certificate", Crads AI and the month it was issued.</p>
    </div>
  </main>
` + CHECK_SCRIPT + foot();
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i++; } else out._.push(a);
  }
  return out;
}

function validate({ id, name, program, issued, withdrawn }) {
  const errs = [];
  if (!C.isValidId(id || '')) errs.push(`bad --id "${id}" (want CA- plus 6 of ${C.ID_ALPHABET})`);
  if (!name || !name.trim()) errs.push('missing --name');
  if (!C.PROGRAMS[program]) errs.push(`bad --program "${program}" (one of ${Object.keys(C.PROGRAMS).join(', ')})`);
  if (!isIsoDate(issued)) errs.push(`bad --issued "${issued}" (YYYY-MM-DD)`);
  if (withdrawn !== undefined && !isIsoDate(withdrawn)) errs.push(`bad --withdrawn "${withdrawn}" (YYYY-MM-DD)`);
  return errs;
}

function writeCertificate(cert) {
  const errs = validate(cert);
  if (errs.length) throw new Error(errs.join('; '));
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${cert.id}.html`);
  fs.writeFileSync(file, certificatePage({ ...cert, name: cert.name.trim() }));
  return file;
}

function writeIndex() {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, 'index.html');
  fs.writeFileSync(file, indexPage());
  return file;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args._[0] === 'write') {
      const file = writeCertificate({ id: args.id, name: args.name, program: args.program, issued: args.issued, withdrawn: args.withdrawn });
      console.log(path.relative(ROOT, file));
    } else if (args._[0] === 'index') {
      console.log(path.relative(ROOT, writeIndex()));
    } else {
      console.error('usage: certificate-page.js write --id CA-XXXXXX --name "Full Name" --program <program> --issued YYYY-MM-DD [--withdrawn YYYY-MM-DD]\n       certificate-page.js index');
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { certificatePage, indexPage, writeCertificate, writeIndex, validate, longDate };
