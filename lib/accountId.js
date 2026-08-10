'use strict';
// lib/accountId.js — the account's permanent name (ownership ruling 5,
// 2026-08-10).
//
// Everything in the product keys people by sha256(their email): directory
// edges, box registrations, event rows. That works until an email changes, at
// which point every mineral that account owns silently orphans and there is no
// way back — the minerals still point at a hash nobody can produce any more.
// Account merging is impossible for the same reason.
//
// So an account gets an id at birth and keeps it forever. The email becomes a
// label: how you sign in, and how a human reads a row. Ownership and access
// records key on the ID.
//
// Backfill-on-read, not a migration: accounts predating this (Sam's, the
// coaching clients') get an id the first time they are loaded, written back
// once. `ensureAccountId` is safe to call on every read and returns the same
// value forever after.
const crypto = require('crypto');

const ID_RE = /^acc_[0-9a-f]{24}$/;

function newAccountId() {
  return 'acc_' + crypto.randomBytes(12).toString('hex');
}

/**
 * The id for this user record, minting and persisting one if absent.
 * @param {object} kv    the kv interface (needs setUser)
 * @param {object} user  the user record, mutated in place
 * @returns {Promise<string>} the account id
 */
async function ensureAccountId(kv, user) {
  if (!user || !user.email) return '';
  if (ID_RE.test(String(user.id || ''))) return user.id;
  user.id = newAccountId();
  // Best-effort persist: an id that fails to save is re-minted next read, which
  // is wrong but not harmful until something has been keyed to it — and nothing
  // is keyed until a mineral registers, which happens long after the first read.
  try { await kv.setUser(user.email, user); } catch { /* next read retries */ }
  return user.id;
}

module.exports = { ensureAccountId, newAccountId, ID_RE };
