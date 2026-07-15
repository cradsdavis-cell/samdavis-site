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
