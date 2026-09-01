'use strict';
// safeNext.js — where a bounced sign-in is allowed to send you afterwards.
//
// WHY THIS EXISTS. /access?org=<handle> is the far end of an invitation link,
// and requireAuth sent an unauthenticated visitor to /account/login carrying
// nothing. The comment in api/app/access.js said "then back here"; nothing
// implemented it. So the grantee signed in and landed on the account page, with
// no sign of what they were part-way through, and the invitation they had been
// emailed was simply gone (QA finding 46, 2026-08-11).
//
// The fix is a `next` parameter, and a `next` parameter is an open redirect
// unless something refuses everything that can leave the origin. That is this
// file, and it is deliberately the ONLY place that decision is made: five
// call sites now honour a caller-supplied destination, and five copies of a
// URL guard is five chances to get one wrong.
//
// THE RULE: a single leading slash, then anything printable. That admits
// /app and /access?org=x and refuses //evil.example, https://evil.example,
// javascript:, and the backslash variants that some browsers normalise into
// protocol-relative URLs. Everything it refuses becomes '' and the caller
// falls back to its own default, so a hostile `next` degrades to the ordinary
// sign-in it was trying to hijack.

const MAX_LENGTH = 512;
const LOGIN = '/account/login';

/**
 * Returns the value if it is a safe same-origin path, or '' if it is not.
 * Never throws: callers use `safeNext(x) || '/account'`.
 */
function safeNext(value) {
  if (typeof value !== 'string') return '';
  if (!value || value.length > MAX_LENGTH) return '';

  // A control character in a Location header is header injection. Reject the
  // whole value rather than stripping, because a value containing CR was not
  // written by anyone we want to obey.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) return '';

  // Browsers differ on whether a backslash is a path separator. Test against a
  // normalised copy so `/\evil.example` is judged as `//evil.example` would be,
  // but return the ORIGINAL: normalising and returning would let the guard
  // rewrite a path into something the caller never asked for.
  const probe = value.replace(/\\/g, '/');
  if (!probe.startsWith('/')) return '';   // relative, or an absolute URL with a scheme
  if (probe.startsWith('//')) return '';   // protocol-relative

  // Bouncing back to the sign-in page from the sign-in page is a loop, not a
  // destination.
  const path = probe.split(/[?#]/)[0];
  if (path === LOGIN || path === LOGIN + '/') return '';

  return value;
}

/**
 * The URL to send an unauthenticated visitor to, carrying where they were
 * trying to go. Falls back to the bare login page when there is nothing safe
 * to return to, which is exactly the behaviour that existed before.
 */
function loginUrlFor(currentUrl) {
  const next = safeNext(currentUrl);
  return next ? `${LOGIN}?next=${encodeURIComponent(next)}` : LOGIN;
}

module.exports = { safeNext, loginUrlFor, MAX_LENGTH };
