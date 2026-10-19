// lib/timeZone.js — the booker's own time zone, carried from the browser.
'use strict';

const SAM_TIME_ZONE = 'Australia/Sydney';

// Returns the IANA zone if the runtime knows it, else Sydney. The value
// arrives from a public form, so anything Intl refuses falls back.
function cleanTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return SAM_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz }).resolvedOptions().timeZone;
  } catch (_) {
    return SAM_TIME_ZONE;
  }
}

module.exports = { cleanTimeZone, SAM_TIME_ZONE };
