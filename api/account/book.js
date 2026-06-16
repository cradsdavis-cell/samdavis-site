'use strict';
const { requireAuth, renderShell } = require('../../lib/account');
const { isAdmin } = require('../../lib/auth');
const { defaultKv } = require('../../lib/kv');
const { renderBookChoices, renderBookPicker } = require('../../lib/accountViews');

module.exports = async function handler(req, res) {
  const user = await requireAuth({ kv: defaultKv(), req, res });
  if (!user) return;

  const sku = req.query && req.query.sku ? String(req.query.sku) : '';
  let mainContent;
  try {
    mainContent = sku ? renderBookPicker(user, sku) : renderBookChoices(user);
  } catch {
    // unknown/non-slot sku → fall back to the choices page
    mainContent = renderBookChoices(user);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderShell({
    title: 'Book',
    activeRoute: 'book',
    isAdmin: isAdmin(user.email),
    mainContent,
    head: '<link rel="stylesheet" href="/book/_styles.css">',
  }));
};
