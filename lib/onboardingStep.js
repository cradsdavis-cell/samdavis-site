'use strict';

async function handleOnboardingStep({ kv, user, body }) {
  const step = parseInt(body.step || '0', 10);
  const action = body.action;

  if (user.state !== 'onboarding-incomplete') {
    return { status: 302, redirectTo: '/account/' };
  }

  user.onboarding = user.onboarding || {
    step: 1, completed: false,
    install_checklist: { claude_code: false, vs_code: false, obsidian: false, cal_app: false, slack: false },
    context_worksheet: null,
  };

  // Forward-gate: the client sends `step`, but it must not exceed the server-tracked
  // cursor — otherwise a brand-new user could POST step=4 complete_onboarding and skip
  // the install checklist + context worksheet entirely. Mirrors the read-side clamp in
  // api/account/onboarding.js.
  const curStep = (user.onboarding && user.onboarding.step) || 1;
  if (step > curStep) {
    return { status: 400, redirectTo: '/account/onboarding?step=' + curStep, error: 'step_out_of_order' };
  }

  if (step === 1 && action === 'continue') {
    user.onboarding.step = Math.max(user.onboarding.step || 1, 2);
    await kv.setUser(user.email, user);
    return { status: 200, redirectTo: '/account/onboarding?step=2' };
  }

  if (step === 2 && action === 'save_install') {
    user.onboarding.install_checklist = {
      claude_code: !!body.claude_code,
      vs_code: !!body.vs_code,
      obsidian: !!body.obsidian,
      cal_app: !!body.cal_app,
      slack: !!body.slack,
    };
    await kv.setUser(user.email, user);
    return { status: 200, redirectTo: '/account/onboarding?step=2' };
  }

  if (step === 2 && action === 'continue') {
    user.onboarding.step = Math.max(user.onboarding.step || 1, 3);
    await kv.setUser(user.email, user);
    return { status: 200, redirectTo: '/account/onboarding?step=3' };
  }

  if (step === 3 && action === 'submit_worksheet') {
    const tools = body.current_tools;
    const current_tools = Array.isArray(tools) ? tools : (tools ? [tools] : []);
    user.onboarding.context_worksheet = {
      business: body.business || '',
      current_pain: body.current_pain || '',
      current_tools,
      desired_outcome: body.desired_outcome || '',
      nervous_about: body.nervous_about || '',
      technical_level: body.technical_level || '',
      anything_else: body.anything_else || '',
      submitted_at: new Date().toISOString(),
    };
    user.onboarding.step = Math.max(user.onboarding.step || 1, 4);
    await kv.setUser(user.email, user);
    return { status: 200, redirectTo: '/account/onboarding?step=4' };
  }

  if (step === 4 && action === 'complete_onboarding') {
    user.onboarding.completed = true;
    // Cohort (Group Block) buyers go to the cohort track, not the 1:1 ladder — otherwise
    // their packs/hero/state desync (pre-s1 shows the 1:1 preview pack, never the cohort pack).
    const lastType = ((user.engagements || []).slice(-1)[0] || {}).type;
    user.state = (lastType === 'group-block' || lastType === 'group-block-pay4') ? 'cohort-active' : 'pre-s1';
    user.state_updated_at = new Date().toISOString();
    await kv.setUser(user.email, user);
    return { status: 200, redirectTo: '/account/' };
  }

  return { status: 400, redirectTo: null, error: 'unknown action' };
}

module.exports = { handleOnboardingStep };
