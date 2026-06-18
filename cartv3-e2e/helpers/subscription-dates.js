/**
 * Small date helpers for the subscription specs.
 *
 * The /subscription-edit page exposes the next-order date two ways:
 *   - DISPLAY  : a <div data-qa="next-order-date"> like "21 Jun 2026" (DD Mon YYYY).
 *   - EDITABLE : an <input type="date" data-qa="next-order-date"> whose value is the
 *                HTML5 ISO form "YYYY-MM-DD".
 *
 * Specs use the input's ISO value as the source of truth for setting/restoring dates
 * (no locale parsing needed) and compare DISPLAY strings via `normalizeDateText` when
 * asserting the skip/ship date advanced.
 */

/** Add `n` days to an ISO "YYYY-MM-DD" string; returns ISO "YYYY-MM-DD" (UTC-safe). */
function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** Uppercase + collapse whitespace so "21 Jun 2026" and "21 JUN 2026" compare equal. */
function normalizeDateText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** True if two display date strings refer to the same day (case/space-insensitive). */
function sameDisplayDate(a, b) {
  return normalizeDateText(a) === normalizeDateText(b);
}

module.exports = { addDaysIso, normalizeDateText, sameDisplayDate };
