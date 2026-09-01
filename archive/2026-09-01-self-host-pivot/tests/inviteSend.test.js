'use strict';
// QA finding 41: a grant minted an invitation nothing delivered. The rock sent
// it from its own Resend key, a newborn rock has no key, so every invitation
// came back { sent: false } with the link for a human to carry. These pin the
// site-side sender that replaces it, and in particular the two ways a mail
// relay goes wrong: open to anyone, or silently open when misconfigured.
const test = require('node:test');
const assert = require('node:assert');
const { makeHandler, inviteText, accessLink } = require('../lib/inviteSend');

const SECRET = 'a-shared-secret-of-reasonable-length';

function fakeRes() {
  return {
    statusCode: 0, body: null, ended: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { this.ended = true; return this; },
  };
}

function fakeResend(behaviour = {}) {
  const sent = [];
  return {
    sent,
    emails: {
      async send(msg) {
        sent.push(msg);
        if (behaviour.throws) throw new Error('network is down');
        if (behaviour.error) return { error: { message: 'domain not verified' } };
        return { data: { id: 'msg_1' } };
      },
    },
  };
}

const req = (over = {}) => ({
  method: 'POST',
  headers: { authorization: `Bearer ${SECRET}` },
  body: { to: 'grantee@example.com', org: 'coogee-labs', orgDisplay: 'Coogee Labs', inviterName: 'Sam' },
  ...over,
});

test('it sends, and the mail names who invited you and to what', async () => {
  const resend = fakeResend();
  const res = fakeRes();
  await makeHandler({ resend, secret: SECRET, site: 'https://crads-ai.com' })(req(), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.sent, true);
  assert.strictEqual(res.body.link, 'https://crads-ai.com/access?org=coogee-labs');
  assert.strictEqual(resend.sent.length, 1);
  const msg = resend.sent[0];
  assert.strictEqual(msg.to, 'grantee@example.com');
  assert.match(msg.subject, /Coogee Labs/);
  assert.match(msg.text, /Sam has given you access to Coogee Labs/);
  assert.match(msg.text, /https:\/\/crads-ai\.com\/access\?org=coogee-labs/);
  // the address, not the link, is what proves it is you
  assert.match(msg.text, /has to be THIS email address/);
});

test('it fails CLOSED when the shared secret is unset', async () => {
  const resend = fakeResend();
  const res = fakeRes();
  await makeHandler({ resend, secret: '' })(req(), res);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(resend.sent.length, 0, 'an unconfigured relay must not send');
});

test('it refuses a caller that cannot prove it is the directory', async () => {
  for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: SECRET }, { authorization: 'Bearer ' + SECRET + 'x' }]) {
    const resend = fakeResend();
    const res = fakeRes();
    await makeHandler({ resend, secret: SECRET })(req({ headers }), res);
    assert.strictEqual(res.statusCode, 401, `should refuse ${JSON.stringify(headers)}`);
    assert.strictEqual(resend.sent.length, 0);
  }
});

test('it refuses a bad recipient or a bad community handle', async () => {
  const cases = [
    [{ to: 'not-an-email', org: 'coogee-labs' }, 'invalid_recipient'],
    [{ to: '', org: 'coogee-labs' }, 'invalid_recipient'],
    [{ to: 'a@b.com', org: 'Coogee Labs' }, 'invalid_org'],
    [{ to: 'a@b.com', org: 'x' }, 'invalid_org'],
    [{ to: 'a@b.com', org: '' }, 'invalid_org'],
  ];
  for (const [body, expected] of cases) {
    const resend = fakeResend();
    const res = fakeRes();
    await makeHandler({ resend, secret: SECRET })(req({ body }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, expected, JSON.stringify(body));
    assert.strictEqual(resend.sent.length, 0);
  }
});

test('a failed send still returns the link, because the grant is already real', async () => {
  for (const behaviour of [{ error: true }, { throws: true }]) {
    const res = fakeRes();
    await makeHandler({ resend: fakeResend(behaviour), secret: SECRET, site: 'https://crads-ai.com' })(req(), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.sent, false);
    assert.strictEqual(res.body.link, 'https://crads-ai.com/access?org=coogee-labs',
      'a human must always be able to carry the link by hand');
    assert.ok(res.body.why, 'and be told why it did not go');
  }
});

test('only POST', async () => {
  const res = fakeRes();
  await makeHandler({ resend: fakeResend(), secret: SECRET })(req({ method: 'GET' }), res);
  assert.strictEqual(res.statusCode, 405);
});

test('the handle is encoded into the link rather than concatenated', () => {
  assert.strictEqual(accessLink('a b', 'https://x.test'), 'https://x.test/access?org=a%20b');
});

test('the copy falls back to the handle when there is no display name', () => {
  const t = inviteText({ org: 'coogee-labs', orgDisplay: '', inviterName: '', link: 'L' });
  assert.match(t, /^coogee-labs has given you access to coogee-labs/);
});
