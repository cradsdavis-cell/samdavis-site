'use strict';
const { requireAuth } = require('./account');

function makeHandler({ kv }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const user = await requireAuth({ kv, req, res });
    if (!user) return;

    const body = req.body || {};
    if (body.name !== undefined) user.name = body.name || null;

    const tools = body.current_tools;
    const toolsArray = Array.isArray(tools) ? tools : (tools ? [tools] : []);
    user.onboarding = user.onboarding || { step: 4, completed: true, install_checklist: {}, context_worksheet: null };
    user.onboarding.context_worksheet = {
      business: body.business || '',
      current_pain: body.current_pain || '',
      current_tools: toolsArray,
      desired_outcome: body.desired_outcome || '',
      nervous_about: body.nervous_about || null,
      technical_level: body.technical_level || '',
      anything_else: body.anything_else || null,
    };

    await kv.setUser(user.email, user);
    return res.redirect(302, '/account/profile');
  };
}

module.exports = { makeHandler };
