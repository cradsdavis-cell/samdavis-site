// lib/skus.js — single source of truth for SKU → Stripe price + Cal event type
'use strict';

const SKUS = {
  'single-session': {
    stripe_price_id: process.env.STRIPE_PRICE_SINGLE,
    cal_event_type_id: parseInt(process.env.CAL_EVENT_TYPE_SINGLE, 10),
    label: 'Single Coaching Session',
    duration_min: 60,
    price_aud: 150,
  },
  'coaching-block': {
    stripe_price_id: process.env.STRIPE_PRICE_BLOCK,
    cal_event_type_id: parseInt(process.env.CAL_EVENT_TYPE_BLOCK, 10),
    label: 'Coaching Block — Session 1',
    duration_min: 60,
    price_aud: 500,
  },
  'ea-basic-build': {
    stripe_price_id: process.env.STRIPE_PRICE_BUILD,
    cal_event_type_id: parseInt(process.env.CAL_EVENT_TYPE_BUILD, 10),
    label: 'EA Basic Build — Kickoff',
    duration_min: 120,
    price_aud: 2000,
  },
};

function getSku(slug) {
  const sku = SKUS[slug];
  if (!sku) throw new Error(`Unknown SKU: ${slug}`);
  return sku;
}

const DISCOVERY_EVENT_TYPE_ID = () => parseInt(process.env.CAL_EVENT_TYPE_DISCOVERY, 10);

module.exports = { SKUS, getSku, DISCOVERY_EVENT_TYPE_ID };
