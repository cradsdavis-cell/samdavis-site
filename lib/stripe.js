// lib/stripe.js — Stripe SDK wrapper
'use strict';

const Stripe = require('stripe');

function client() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-09-30.acacia' });
}

async function createCheckoutSession({ sku, priceId, slotIso, name, email, calEventTypeId, baseUrl }) {
  const stripe = client();
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    allow_promotion_codes: true,
    metadata: {
      sku,
      slot_iso: slotIso,
      name,
      cal_event_type_id: String(calEventTypeId),
    },
    success_url: `${baseUrl}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/book/${sku}?cancelled=1`,
  });
}

async function refundSession(sessionId) {
  const stripe = client();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return stripe.refunds.create({
    payment_intent: session.payment_intent,
    metadata: { reason: 'race_loss_refund', stripe_session_id: sessionId },
  });
}

async function retrievePaymentIntent(piId) {
  const stripe = client();
  return stripe.paymentIntents.retrieve(piId);
}

async function updatePaymentIntentMetadata(piId, metadata) {
  const stripe = client();
  return stripe.paymentIntents.update(piId, { metadata });
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = client();
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { client, createCheckoutSession, refundSession, retrievePaymentIntent, updatePaymentIntentMetadata, constructWebhookEvent };
