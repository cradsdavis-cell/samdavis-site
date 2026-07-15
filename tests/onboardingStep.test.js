'use strict';
process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok-yes';
const test = require('node:test');
const assert = require('node:assert');
const { handleOnboardingStep } = require('../lib/onboardingStep');
const { makeKv } = require('../lib/kv');

function fakeKvClient() {
  const store = new Map();
  return {
    get: async (k) => store.has(k) ? JSON.parse(store.get(k)) : null,
    set: async (k, v) => { store.set(k, JSON.stringify(v)); return 'OK'; },
    del: async (k) => { store.delete(k); return 1; },
    incr: async () => 1,
    expire: async () => 1,
    keys: async (p) => Array.from(store.keys()).filter(k => k.startsWith(p.replace('*', ''))),
  };
}

function makeUser(overrides = {}) {
  return Object.assign({
    email: 'alex@example.com',
    state: 'onboarding-incomplete',
    state_version: 1,
    engagements: [{ type: 'coaching-block' }],
    onboarding: {
      step: 1,
      completed: false,
      install_checklist: { claude_code: false, vs_code: false, obsidian: false, cal_app: false, slack: false },
      context_worksheet: null,
    },
  }, overrides);
}

test('step 1 continue advances to step 2', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser();
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: { step: '1', action: 'continue' },
  });
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.redirectTo, '/account/onboarding?step=2');
  const updated = await kv.getUser(user.email);
  assert.strictEqual(updated.onboarding.step, 2);
});

test('step 2 save_install persists checklist and stays on step 2', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser({ onboarding: Object.assign(makeUser().onboarding, { step: 2 }) });
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: { step: '2', action: 'save_install', claude_code: 'on', vs_code: 'on' },
  });
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.redirectTo, '/account/onboarding?step=2');
  const updated = await kv.getUser(user.email);
  assert.strictEqual(updated.onboarding.step, 2);
  assert.strictEqual(updated.onboarding.install_checklist.claude_code, true);
  assert.strictEqual(updated.onboarding.install_checklist.vs_code, true);
  assert.strictEqual(updated.onboarding.install_checklist.obsidian, false);
});

test('step 2 continue advances to step 3', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser({ onboarding: Object.assign(makeUser().onboarding, { step: 2 }) });
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: { step: '2', action: 'continue' },
  });
  assert.strictEqual(result.redirectTo, '/account/onboarding?step=3');
  const updated = await kv.getUser(user.email);
  assert.strictEqual(updated.onboarding.step, 3);
});

test('step 3 submit_worksheet saves context and advances to step 4', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser({ onboarding: Object.assign(makeUser().onboarding, { step: 3 }) });
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: {
      step: '3', action: 'submit_worksheet',
      business: 'social media micro-agency',
      current_pain: 'email triage every morning',
      current_tools: ['gmail', 'slack'],
      desired_outcome: 'reclaim 5 hrs/wk',
      nervous_about: '',
      technical_level: 'somewhat',
      anything_else: '',
    },
  });
  assert.strictEqual(result.redirectTo, '/account/onboarding?step=4');
  const updated = await kv.getUser(user.email);
  assert.strictEqual(updated.onboarding.step, 4);
  assert.ok(updated.onboarding.context_worksheet);
  assert.strictEqual(updated.onboarding.context_worksheet.business, 'social media micro-agency');
  assert.strictEqual(updated.onboarding.context_worksheet.technical_level, 'somewhat');
  assert.deepStrictEqual(updated.onboarding.context_worksheet.current_tools, ['gmail', 'slack']);
});

test('step 4 complete_onboarding transitions state to pre-s1', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser({ onboarding: Object.assign(makeUser().onboarding, { step: 4 }) });
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: { step: '4', action: 'complete_onboarding' },
  });
  assert.strictEqual(result.redirectTo, '/account/');
  const updated = await kv.getUser(user.email);
  assert.strictEqual(updated.state, 'pre-s1');
  assert.strictEqual(updated.state_version, 1);
  assert.strictEqual(updated.onboarding.completed, true);
});

test('rejects unknown action with 400', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser();
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: { step: '1', action: 'wat' },
  });
  assert.strictEqual(result.status, 400);
});

test('step-skip: brand-new user cannot POST step=4 complete past the server cursor', async () => {
  const kv = makeKv(fakeKvClient());
  const user = makeUser(); // onboarding.step === 1
  await kv.setUser(user.email, user);
  const result = await handleOnboardingStep({
    kv, user, body: { step: '4', action: 'complete_onboarding' },
  });
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.redirectTo, '/account/onboarding?step=1');
  const updated = await kv.getUser(user.email);
  assert.strictEqual(updated.state, 'onboarding-incomplete', 'state must not advance');
  assert.strictEqual(updated.onboarding.completed, false);
});
