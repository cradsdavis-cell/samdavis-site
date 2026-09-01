// api/download.js - serves /download. The gate is GONE (Sam's call,
// 2026-09-01, self-host pivot): the software is free and the images are
// public, so a password on the download page was friction guarding nothing.
// The beta gate lived in lib/downloadGate.js; archived with its test.
//
// Routes (wired in vercel.json):
//   GET  /download          the page
//   GET  /download/windows  302 to the exe
//   GET  /download/mac      302 to the zip
//   POST /download          303 back to /download (old bookmarked password forms)
'use strict';

const { PAGE_HTML } = require('../lib/downloadPage');

const REL = 'https://github.com/cradsdavis-cell/crads-ai-app/releases/download/wizard-app';
const ASSETS = { windows: `${REL}/crads-ai.exe`, mac: `${REL}/crads-ai-mac.zip` };

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

module.exports = async (req, res) => {
  noStore(res);
  const asset = String((req.query && req.query.asset) || '').toLowerCase();

  if (req.method === 'POST') { res.redirect(303, '/download'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.status(405).end();
    return;
  }
  if (asset) {
    if (!ASSETS[asset]) { res.status(404).end(); return; }
    res.redirect(302, ASSETS[asset]);
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(PAGE_HTML);
};
