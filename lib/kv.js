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
    async getCohort(cohortId) { return client.get(`cohort:${cohortId}`); },
    async setCohort(cohortId, record) { return client.set(`cohort:${cohortId}`, record); },
  };
}

function defaultKv() {
  const { kv } = require('@vercel/kv');
  return makeKv(kv);
}

module.exports = { makeKv, defaultKv };
