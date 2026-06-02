// lib/testimonials.js — single source of truth for client testimonial URLs
// Per coaching co-primary spec § 3.3.
// Sam curates additions as client LinkedIn posts land.
'use strict';

/**
 * @typedef {Object} Testimonial
 * @property {string} url - public LinkedIn post URL
 * @property {string} clientName
 * @property {string} role
 * @property {string} addedDate - YYYY-MM-DD
 */

/** @type {Testimonial[]} */
const testimonials = [
  // Empty on first ship. Sam curates additions as client posts land.
  // Thresholds:
  //   - strip renders on /offer when length >= 3
  //   - /testimonials page surfaces in nav when length >= 6
];

module.exports = { testimonials };
