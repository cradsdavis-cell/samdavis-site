'use strict';

function makeKv(client) {
  return {
    async getUser(email) { return client.get(`user:${email}`); },
    async setUser(email, record) { return client.set(`user:${email}`, record); },
    async listUsers() {
      const keys = await client.keys('user:*');
      const users = await Promise.all(keys.map(k => client.get(k)));
      return users.filter(Boolean);
    },
    async deleteUser(email) { return client.del(`user:${email}`); },
    async setAuthToken(token, data, ttlSeconds) {
      await client.set(`auth_token:${token}`, data);
      if (ttlSeconds) await client.expire(`auth_token:${token}`, ttlSeconds);
    },
    async getAuthToken(token) { return client.get(`auth_token:${token}`); },
    async deleteAuthToken(token) { return client.del(`auth_token:${token}`); },
    async incrementThrottle(email) {
      const count = await client.incr(`auth_throttle:${email}`);
      if (count === 1) await client.expire(`auth_throttle:${email}`, 900);
      return count;
    },
    // ---- session registry (arc A3, 2026-08-10). The fourth key family. -----
    // Sessions were stateless JWTs, so "what is signed in to my account?" had
    // no answer and revoking one machine was impossible — only the global
    // state_version lever existed. One row per live sign-in; TTL matches the
    // cookie so the registry can never outlive the session it describes.
    async setSession(email, sid, data, ttlSeconds) {
      await client.set(`session:${email}:${sid}`, data);
      if (ttlSeconds) await client.expire(`session:${email}:${sid}`, ttlSeconds);
    },
    async getSession(email, sid) { return client.get(`session:${email}:${sid}`); },
    async listSessions(email) {
      const keys = await client.keys(`session:${email}:*`);
      const rows = await Promise.all(keys.map(k => client.get(k)));
      return rows.filter(Boolean);
    },
    async deleteSession(email, sid) { return client.del(`session:${email}:${sid}`); },
    // ---- invitation addresses (2026-08-13, the access matrix) -------------
    // WHY THIS FAMILY EXISTS. The directory stores every grant as
    // sha256(address) and never an address, which is correct for a public-ish
    // mirror. The consequence only shows on a PENDING grant: the owner invited
    // somebody who does not have an account here yet, so there is no account to
    // resolve the hash against, and the access page could only say "an account
    // not on this site" about an invitation the owner had just sent themselves.
    // Truthful, useless, and faintly alarming.
    //
    // The site knew the address at the moment it staged the invitation. This is
    // that address, kept where addresses already live. It is a DISPLAY aid and
    // nothing else: it grants nothing, proves nothing, and the mineral still
    // decides everything. 30 days, matching the proof TTL in the worker, so a
    // hint cannot outlive the invitation it describes.
    async setInvite(mineralId, hash, data, ttlSeconds = 30 * 24 * 3600) {
      await client.set(`invite:${mineralId}:${hash}`, data);
      if (ttlSeconds) await client.expire(`invite:${mineralId}:${hash}`, ttlSeconds);
    },
    async listInvites() {
      const keys = await client.keys('invite:*');
      const rows = await Promise.all(keys.map(async (k) => {
        const v = await client.get(k);
        if (!v) return null;
        const [, mineralId, hash] = k.split(':');
        return { mineral_id: mineralId, hash, ...v };
      }));
      return rows.filter(Boolean);
    },
  };
}

function defaultKv() {
  // ioredis takes a redis:// URL (Redis Cloud / Aiven / self-hosted).
  // Wrapped in an adapter so makeKv() stays insulated: get/set auto-(de)serialize JSON,
  // keys/del/incr/expire pass through unchanged.
  const Redis = require('ioredis');
  const raw = new Redis(process.env.REDIS_URL);
  const client = {
    get: async (k) => { const v = await raw.get(k); return v ? JSON.parse(v) : null; },
    set: async (k, v) => raw.set(k, JSON.stringify(v)),
    del: (k) => raw.del(k),
    incr: (k) => raw.incr(k),
    expire: (k, s) => raw.expire(k, s),
    keys: (pattern) => raw.keys(pattern),
  };
  return makeKv(client);
}

module.exports = { makeKv, defaultKv };
