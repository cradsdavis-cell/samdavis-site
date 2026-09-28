// lib/stripe.js — Stripe SDK wrapper
'use strict';

const Stripe = require('stripe');

function client() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-09-30.acacia' });
}

// One-off payment only (v4, 2026-09-09: the subscription-mode retainer is retired).
// A SKU with no Stripe price object yet (the roadmap, until STRIPE_PRICE_ROADMAP
// is set) is charged with inline price_data: amount + product name, created by
// Stripe per session. Everything else uses its price id as before.
function lineItemFor({ priceId, priceAud, productName }) {
  if (priceId) return { price: priceId, quantity: 1 };
  if (!(Number.isInteger(priceAud) && priceAud > 0) || !productName) {
    throw new Error('No Stripe price id and no inline price for this SKU');
  }
  return {
    price_data: { currency: 'aud', unit_amount: priceAud * 100, product_data: { name: productName } },
    quantity: 1,
  };
}

// A discount code typed on crads-ai.com's own booking form (2026-09-28).
// Stripe's hosted page rejected valid codes typed into it from an automated
// browser (its bot checks), so the code is resolved and applied server-side.
// Returns the promotion code id, or null when there is no active code by
// that name. Codes are matched case-insensitively by Stripe.
async function findPromotionCode(code) {
  const stripe = client();
  const list = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
  return (list.data && list.data[0] && list.data[0].id) || null;
}

async function createCheckoutSession({ sku, priceId, priceAud, productName, slotIso, name, email, calEventTypeId, baseUrl, termsVersion, termsAcceptedAt, promotionCodeId }) {
  const stripe = client();
  const params = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [lineItemFor({ priceId, priceAud, productName })],
    customer_email: email,
    allow_promotion_codes: true,
    metadata: {
      sku,
      slot_iso: slotIso || '',
      name,
      cal_event_type_id: String(calEventTypeId),
      terms_version: termsVersion || '',
      terms_accepted_at: termsAcceptedAt || '',
    },
    // Copied onto the PaymentIntent too, so the agreement shows on the
    // payment itself in the Stripe dashboard, where a dispute is handled.
    payment_intent_data: {
      metadata: { terms_version: termsVersion || '', terms_accepted_at: termsAcceptedAt || '' },
    },
    success_url: `${baseUrl}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/book/${sku}?cancelled=1`,
  };
  // Stripe refuses discounts and allow_promotion_codes together. A code from
  // our own form is applied up front; otherwise the hosted page offers a field.
  if (promotionCodeId) {
    delete params.allow_promotion_codes;
    params.discounts = [{ promotion_code: promotionCodeId }];
  }
  // Auto-generate a finalised invoice PDF per payment so the customer's
  // success email carries both the receipt and an invoice. Not registered
  // for GST, so this is an invoice (not a tax invoice): ABN shown as a custom
  // field, GST status in the footer.
  params.invoice_creation = {
    enabled: true,
    invoice_data: {
      custom_fields: [{ name: 'ABN', value: '26 929 349 775' }],
      footer: 'No GST has been charged. Samuel Davis (Crads-AI) is not registered for GST; all amounts are GST-exclusive. This is an invoice, not a tax invoice.',
    },
  };
  return stripe.checkout.sessions.create(params);
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

module.exports = { client, lineItemFor, findPromotionCode, createCheckoutSession, refundSession, retrievePaymentIntent, updatePaymentIntentMetadata, constructWebhookEvent };
