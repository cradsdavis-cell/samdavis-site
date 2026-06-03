# samdavis-site

The public site for Sam Davis — AI coach & systems builder.

## Structure

- `/` — landing page (index.html)
- `/overview/` — product demo deck (what the EA is)
- `/offer/` — offer deck (how we work together)
- `/account/` — client portal (auth + onboarding + packs)

## Hosting

Deployed via **Vercel** (static pages + serverless functions in `/api`). The custom domain is set in `CNAME` (crads-ai.com).

## Accounts / auth

Google SSO + email/password, with magic-link as the hidden password-reset channel (`lib/auth.js`, `lib/passwordAuth.js`, `lib/googleAuth.js`). Required Vercel **Production** env vars:

- `SESSION_SECRET` (32+ chars)
- `REDIS_URL`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Google OAuth web client; redirect URI `https://crads-ai.com/api/auth/google/callback`)

Changing env vars requires a redeploy to take effect.
