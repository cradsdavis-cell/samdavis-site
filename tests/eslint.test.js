// eslint.test.js — the bug net runs with the tests, not when someone remembers.
//
// This repo is where the shape reached production: /app/billing shipped with a
// `const` reassigned four lines later, throwing on EVERY request. 348 tests were
// green, because they read that file's source and never executed it, and my own
// deploy check read a 302 anonymously and called it healthy (the auth wall
// answers before any broken code runs).
//
// ERRORS ONLY. Every rule in eslint.config.mjs is a defect rather than a
// preference, so a failure here means something is broken, not untidy. Warnings
// are reported by `npm run lint` and deliberately do not fail the suite.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('no file has an undefined reference, a const reassignment or dead code', async () => {
  const { ESLint } = require('eslint');
  const results = await new ESLint().lintFiles(['.']);
  const bad = results.filter((r) => r.errorCount > 0);
  const detail = bad.flatMap((r) => r.messages
    .filter((m) => m.severity === 2)
    .map((m) => `  ${r.filePath}:${m.line}:${m.column}  ${m.message}  (${m.ruleId})`)).join('\n');
  assert.equal(bad.length, 0, bad.length ? `eslint found real defects:\n${detail}` : '');
});
