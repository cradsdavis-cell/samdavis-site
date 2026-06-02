// lib/cohorts.js — active Group Block cohort config
// Per coaching co-primary spec § 4.7. Sam manually updates `remaining` after
// each booking (or flips activeCohort to null when full / between cohorts).
// When that happens, also update group/index.html to flip to the no-cohort
// interest-form fallback (static site — no client-side render of this file).
'use strict';

const activeCohort = {
  id: 'jun-10-2026',
  startDate: '2026-06-10',
  sessionDates: [
    '2026-06-10 14:00',
    '2026-06-17 14:00',
    '2026-06-24 14:00',
    '2026-07-01 14:00',
  ],
  seats: 3,
  remaining: 3,
  stripePriceFull: 'STRIPE_PRICE_GROUP_JUN10_FULL',
  stripePricePay4: 'STRIPE_PRICE_GROUP_JUN10_PAY4_FIRST',
};

module.exports = { activeCohort };
