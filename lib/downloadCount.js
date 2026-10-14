// lib/downloadCount.js - counts clicks on /download/windows and /download/mac.
//
// WHY THE SITE COUNTS. GitHub keeps a download_count per release asset, but the
// rolling "wizard-app" release deletes and re-uploads its assets on every
// build, so that number resets to zero each time. The 302 here is the one
// place every download passes through, so the tally lives in the site KV.
//
// The count must never cost the visitor their download: bots are skipped, a
// KV error is swallowed, and a slow KV is abandoned after timeoutMs so the
// redirect still goes out.
'use strict';

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|monitor/i;

function sydneyDay(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
}

async function countDownload({ kv, platform, userAgent, now = new Date(), timeoutMs = 400 }) {
  if (BOT_UA.test(userAgent || '')) return false;
  let timer;
  try {
    const work = Promise.resolve().then(() => kv().countDownload(platform, sydneyDay(now)));
    work.catch(() => {});
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs, 'timeout'); });
    const result = await Promise.race([work.then(() => 'ok'), timeout]);
    return result === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { countDownload, sydneyDay, BOT_UA };
