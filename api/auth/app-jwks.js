'use strict';
// Public verification keys for Crads app tokens (T3). Served at
// /.well-known/crads-app-jwks.json via a vercel.json rewrite; the directory
// worker and boxes cache it the way they cache Google's JWKS. A missing
// signing key answers 503 (dark, not broken) until APP_TOKEN_PRIVATE_KEY
// lands in the Vercel env.
const { appJwks } = require('../../lib/appAuth');
module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.APP_TOKEN_PRIVATE_KEY) return res.status(503).json({ error: 'not_configured' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json(appJwks());
};
