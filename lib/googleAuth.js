// lib/googleAuth.js — Google SSO core (OAuth 2.0 authorization-code flow)
//
// getAuthUrl(state) builds the consent-screen redirect; makeVerifier() returns
// a verifyCode(code) that exchanges the code and verifies the ID token
// (signature + audience + email_verified) via google-auth-library. The client
// factory is injectable so the verifier is unit-testable without network.
'use strict';
const { OAuth2Client } = require('google-auth-library');

const REDIRECT_PATH = '/api/auth/google/callback';
const SCOPES = ['openid', 'email', 'profile'];

function baseUrl() { return process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://crads-ai.com'; }
function redirectUri() { return baseUrl() + REDIRECT_PATH; }
function clientId() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_OAUTH_CLIENT_ID not set');
  return id;
}
function newClient() {
  return new OAuth2Client(clientId(), process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri());
}

function getAuthUrl(state) {
  return newClient().generateAuthUrl({
    access_type: 'online', scope: SCOPES, state,
    prompt: 'select_account', include_granted_scopes: true,
  });
}

// clientFactory injectable for tests; defaults to a real OAuth2Client.
function makeVerifier(clientFactory = newClient) {
  return async function verifyCode(code) {
    const client = clientFactory();
    const { tokens } = await client.getToken(code);
    if (!tokens || !tokens.id_token) throw new Error('Google did not return an id_token');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId() });
    const p = ticket.getPayload();
    if (!p || !p.email) throw new Error('Google token has no email');
    if (!p.email_verified) throw new Error('Google email is not verified');
    return { email: p.email.toLowerCase(), sub: p.sub, email_verified: true };
  };
}

module.exports = { getAuthUrl, makeVerifier, REDIRECT_PATH, SCOPES, redirectUri };
