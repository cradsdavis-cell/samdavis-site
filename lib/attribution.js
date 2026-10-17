// lib/attribution.js: where a booking came from (2026-10-17).
//
// Two independent signals, kept apart on purpose:
//   heard_from   what the booker says, from an optional dropdown on the
//                Stripe Checkout page ("How did you hear about this?")
//   utm_source   what the link says: the utm_source tag on the booking page
//                URL itself (README, "Link tags"). Read from that one URL
//                only; nothing is stored in the browser to carry it there.
// Both ride on the Checkout Session metadata and land on the Cal booking
// metadata, beside ref, where the cockpit's Pipeline sync can read them.
'use strict';

// Stripe dropdown values must be alphanumeric; labels are what the booker
// sees. Order is the order on the page.
const HEARD_FROM_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'impactcollab', label: 'Impact Collab' },
  { value: 'whatsapp', label: 'A WhatsApp group' },
  { value: 'friend', label: 'A friend or client' },
  { value: 'event', label: 'An event' },
  { value: 'email', label: 'Email from Sam' },
  { value: 'search', label: 'Search' },
  { value: 'other', label: 'Other' },
];
const HEARD_FROM_VALUES = new Set(HEARD_FROM_OPTIONS.map((o) => o.value));

// Stripe shows no optional marker itself, so the label carries it (as with
// "Who sent you?").
function heardFromField() {
  return {
    key: 'heard_from',
    label: { type: 'custom', custom: 'How did you hear about this? (optional)' },
    type: 'dropdown',
    optional: true,
    dropdown: { options: HEARD_FROM_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  };
}

// The dropdown answer from a completed Checkout Session, or '' if none.
// Anything outside the list is dropped rather than trusted.
function heardFromValue(session) {
  const fields = (session && session.custom_fields) || [];
  const f = fields.find((x) => x && x.key === 'heard_from');
  const v = f && f.dropdown && f.dropdown.value;
  return v && HEARD_FROM_VALUES.has(String(v)) ? String(v) : '';
}

// A utm_source tag as it arrives (any case, any junk) to a short slug:
// lowercase, letters, digits, dash and underscore, 40 characters at most.
function cleanUtmSource(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 40);
}

module.exports = { HEARD_FROM_OPTIONS, heardFromField, heardFromValue, cleanUtmSource };
