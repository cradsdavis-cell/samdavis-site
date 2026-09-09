// lib/releaseAssets.js - what the wizard-app GitHub release currently ships.
// The download page used to hard-code "86 MB" / "36 MB"; every rebuild made
// that a small lie. Now the sizes come from the release itself, cached for an
// hour in the function instance, and the page simply omits the size line when
// GitHub does not answer in time. Never throws.
'use strict';

const RELEASE_API = 'https://api.github.com/repos/cradsdavis-cell/crads-ai-app/releases/tags/wizard-app';
const NAMES = { windows: 'crads-ai.exe', mac: 'crads-ai-mac.zip' };
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

let cache = { at: 0, value: null };

function mb(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return `${Math.round(bytes / 1e6)} MB`;
}

async function fetchRelease(fetchImpl) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(RELEASE_API, {
      signal: ctl.signal,
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'crads-ai.com download page' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const out = {};
    for (const [os, name] of Object.entries(NAMES)) {
      const a = (body.assets || []).find((x) => x.name === name);
      out[os] = a ? { size: mb(a.size), url: a.browser_download_url } : { size: null, url: null };
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// -> { windows: { size: '86 MB' | null, url }, mac: { size, url } } or nulls
async function releaseAssets({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (cache.value && now - cache.at < TTL_MS) return cache.value;
  const fresh = await fetchRelease(fetchImpl);
  if (fresh) cache = { at: now, value: fresh };
  return fresh || cache.value || { windows: { size: null, url: null }, mac: { size: null, url: null } };
}

function _resetCache() { cache = { at: 0, value: null }; }

module.exports = { releaseAssets, NAMES, RELEASE_API, _resetCache };
