const { expect } = require('@playwright/test');

/**
 * Order Validation Helpers
 *
 * Reusable assertions for the 6 order test flows. Each function operates on
 * "order summary snapshots" — plain objects produced by `page.getOrderSummary()`
 * on CartPage, CheckoutPage, and OrderConfirmationPage.
 *
 * Snapshots have shape:
 *   { productName, quantity, itemPrice, subtotal, tax, shipping, total }
 * Any field that isn't displayed on a given page comes back as null and is skipped.
 */

/**
 * Verify the order ID matches the canonical Salesforce format.
 * Example valid: "ORD-000846587"
 */
function assertOrderIdFormat(orderId) {
  expect(orderId, 'Order ID should be present').toBeTruthy();
  expect(orderId, `Order ID "${orderId}" should match /^ORD-\\d{6,9}$/`).toMatch(/^ORD-\d{6,9}$/);
}

/**
 * Assert that two snapshots agree on the fields they both report.
 * Skips any field where either side is null/undefined.
 *
 * @param {object} a               — first snapshot
 * @param {object} b               — second snapshot
 * @param {string} aLabel          — label for `a` in failure messages, e.g. "cart"
 * @param {string} bLabel          — label for `b`, e.g. "confirmation"
 * @param {string[]} [fields]      — only compare these keys; defaults to all keys
 */
function assertSnapshotsAgree(a, b, aLabel, bLabel, fields) {
  const keys = fields || Object.keys(a);
  for (const key of keys) {
    const va = a?.[key];
    const vb = b?.[key];
    if (va == null || vb == null) continue;  // skip when either side doesn't report it
    expect(vb, `${key}: ${aLabel}=${va} vs ${bLabel}=${vb}`).toBe(va);
  }
}

/**
 * Loose product-name match across pages.
 *
 * Dr. Marty Pets renders the same product with different naming styles per page:
 *   cart:         "Nature's Blend Essential Wellness 16oz"
 *   confirmation: "Dr. Marty Nature's Blend Essential Wellness- 1 Bag"
 *
 * Strict equality would fail, but we still want to catch "wrong product flowed
 * through" bugs. This checks both names share at least 2 significant (4+ char) words.
 */
function assertProductNamesMatch(a, b, aLabel, bLabel) {
  if (!a || !b) return;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const wordsA = norm(a).split(' ').filter(w => w.length >= 4);
  const wordsB = norm(b).split(' ').filter(w => w.length >= 4);
  const shared = wordsA.filter(w => wordsB.includes(w));
  expect(
    shared.length >= 2,
    `Product names should reference the same product:\n  ${aLabel}: "${a}"\n  ${bLabel}: "${b}"\n  Shared significant words: [${shared.join(', ')}]`
  ).toBe(true);
}

/**
 * Math sanity: total = subtotal + tax + shipping.
 * Allows 1¢ tolerance to absorb floating-point rounding.
 */
function assertMoneyMath(snapshot, label = 'snapshot') {
  const { subtotal, tax, shipping, total } = snapshot;
  if (subtotal == null || total == null) return;
  const computedTotal = subtotal + (tax ?? 0) + (shipping ?? 0);
  expect(
    Math.abs(total - computedTotal) < 0.01,
    `${label}: total ($${total}) should equal subtotal ($${subtotal}) + tax ($${tax ?? 0}) + shipping ($${shipping ?? 0}) = $${computedTotal.toFixed(2)}`
  ).toBe(true);
}

/**
 * Assert the confirmation page reflects the customer/address that was submitted.
 *
 * @param {object} confirmation    — { customer: {name, email}, shippingAddress: string }
 * @param {object} submitted       — what we typed in: brand.testAddress shape
 */
function assertConfirmationMatchesSubmission(confirmation, submitted) {
  const { customer, shippingAddress } = confirmation;
  const expectedName = `${submitted.firstName} ${submitted.lastName}`;

  // Name — Dr. Marty shows "Golden Pet" or "Golden Pets" depending on the order;
  // we check the first name is present rather than requiring exact match.
  expect(customer.name, `customer name should contain "${submitted.firstName}"`)
    .toContain(submitted.firstName);

  // Email — exact match
  expect(customer.email, 'customer email should match submitted email')
    .toBe(submitted.email);

  // Shipping address — should contain each of street, city, state, zip
  expect(shippingAddress, `shipping address should contain street "${submitted.address1}"`)
    .toContain(submitted.address1);
  expect(shippingAddress, `shipping address should contain city "${submitted.city}"`)
    .toContain(submitted.city);
  expect(shippingAddress, `shipping address should contain state "${submitted.state}"`)
    .toContain(submitted.state);
  expect(shippingAddress, `shipping address should contain zip "${submitted.zip}"`)
    .toContain(submitted.zip);
}

/**
 * For California addresses (or any taxable state), tax should be > 0 on the confirmation.
 * Just sanity — we don't check exact rate (tax tables change).
 */
function assertTaxApplied(snapshot, label = 'confirmation') {
  expect(snapshot.tax, `${label}: tax should be calculated and > 0 for a taxable state`)
    .toBeGreaterThan(0);
}

/**
 * Shipping business rule: if subtotal >= $50 → shipping should be 0 (free).
 * If subtotal < $50 → shipping should be > 0 (fee applied).
 * Only asserts when shipping is reported (skip otherwise).
 */
function assertShippingThreshold(snapshot, label = 'snapshot') {
  const { subtotal, shipping } = snapshot;
  if (subtotal == null || shipping == null) return;
  if (subtotal >= 50) {
    expect(shipping, `${label}: order ≥$50 should ship free (got $${shipping})`).toBe(0);
  } else {
    expect(shipping, `${label}: order <$50 should have shipping fee (got $${shipping})`)
      .toBeGreaterThan(0);
  }
}

module.exports = {
  assertOrderIdFormat,
  assertSnapshotsAgree,
  assertProductNamesMatch,
  assertMoneyMath,
  assertConfirmationMatchesSubmission,
  assertTaxApplied,
  assertShippingThreshold,
};
