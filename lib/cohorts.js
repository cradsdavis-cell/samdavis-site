// lib/cohorts.js — active Group Block cohort config
// Per coaching co-primary spec § 4.7. Sam manually updates `remaining` after
// each booking (or flips activeCohort to null when full / between cohorts).
// When that happens, also update group/index.html to flip to the no-cohort
// interest-form fallback (static site — no client-side render of this file).
'use strict';

// No dated cohort on sale right now — collecting interest via discovery calls
// (see /group + /book/group-block, both in register-interest mode). When a cohort
// is confirmed, repopulate this object with the locked dates/seats and flip the
// two pages back to book mode.
const activeCohort = null;

module.exports = { activeCohort };
