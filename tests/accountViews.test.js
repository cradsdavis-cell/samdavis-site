'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderBookChoices, renderBookPicker, renderUpcomingBooking, renderBookCta } = require('../lib/accountViews');
const { SKUS } = require('../lib/skus');

const user = { name: 'Jo Tse', email: 'jo@example.com' };

test('renderBookChoices lists the two slot-based SKUs with prices + links', () => {
  const html = renderBookChoices(user);
  assert.match(html, /Single Session/);
  assert.match(html, /Coaching Block/);
  assert.ok(html.includes('$' + SKUS['single-session'].price_aud.toLocaleString('en-US')));
  assert.ok(html.includes('$' + SKUS['coaching-block'].price_aud.toLocaleString('en-US')));
  assert.match(html, /\/account\/book\?sku=single-session/);
  assert.match(html, /\/account\/book\?sku=coaching-block/);
});

test('renderBookPicker injects SKU + locked identity (JSON-escaped email)', () => {
  const html = renderBookPicker(user, 'coaching-block');
  assert.match(html, /window\.SKU_SLUG='coaching-block'/);
  assert.match(html, /window\.IS_PAID=true/);
  assert.match(html, /window\.LOCK_IDENTITY=true/);
  assert.match(html, /"email":"jo@example.com"/);
  assert.match(html, /id="slot-picker"/);
  assert.match(html, /\/book\/_slot-picker\.js/);
});

test('renderBookPicker rejects unknown / non-slot SKUs', () => {
  assert.throws(() => renderBookPicker(user, 'group-block'));
  assert.throws(() => renderBookPicker(user, 'nonsense'));
});

test('renderUpcomingBooking shows the manage link + 24h policy', () => {
  const b = { uid: 'XYZ', status: 'accepted', start: '2026-06-19T02:30:00.000Z', eventType: { title: 'Coaching Block' } };
  const html = renderUpcomingBooking(b);
  assert.match(html, /https:\/\/cal\.com\/booking\/XYZ/);
  assert.match(html, /Reschedule or cancel/i);
  assert.match(html, /24h/);
});

test('renderBookCta links to the account book page', () => {
  assert.match(renderBookCta(), /href="\/account\/book"/);
  assert.match(renderBookCta(), /Book another session/i);
});

test('renderBookPicker escapes < in injected identity (no </script> breakout)', () => {
  const html = renderBookPicker({ name: '</script><b>x', email: 'e@x.com' }, 'single-session');
  assert.ok(!html.includes('</script><b>'), 'raw </script> must not appear in the inline script');
  assert.match(html, /\\u003c/);
});
