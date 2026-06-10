const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

// GI: "Checkout-V2 - Validate Phone Number, CS Hours and Header Logo (Shane)"
//
// Guest /checkout header (#page-header). Visible in PayPal-first mode (no need to
// reveal the CC form).
//
// Live audit (2026-06-08): the header is <linkless-page-header id="page-header">
// with NO data-qa (TODO: ask team). It contains the brand logo
// (img[alt="Brand Logo"]), the CS phone number (drmarty: 1-800-670-1839 — rendered
// as text, not a tel: link), and two CS-hours lines (drmarty: "Mon-Fri 6am-5pm PST",
// "Sat-Sun 6am-4pm PST").
//
// Hardened beyond the GI text-presence checks: asserts the logo actually RENDERED
// (naturalWidth > 0), the brand's CS phone, and BOTH hours lines.
//
// The phone, weekday-hours pattern, and weekend-hours pattern are BRAND-SPECIFIC
// (timezone/schedule/number differ per brand) and read from site-config.json via
// brand.content.{csPhone,csHours}. PHONE_RX below is a brand-agnostic fallback only.
//
// NOTE: the GI also clicked Terms & Privacy ("Footer Links Check"); that link
// coverage already lives in cart-terms-and-privacy-links.spec.js (checkout block),
// so it is intentionally not duplicated here.
//
// Guest, read-only -> out of @real-order.

// Fallback when a brand has no csPhone configured — generic phone-number shape.
const PHONE_RX = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/;

test.describe('Checkout-V2 - Header: Phone, CS Hours, Logo (guest)', () => {
  test('header shows a rendered logo, a phone number, and both CS-hours lines', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);

    await cartPage.addProductByKey('loggedout_std_2');
    await cartPage.checkoutAsGuestButton.click();
    await checkoutPage.waitForCheckoutLoaded();

    await expect(checkoutPage.pageHeader, 'header region should be present').toBeVisible();

    // Logo present AND actually rendered (broken <img> would have naturalWidth 0).
    await expect(checkoutPage.headerLogo).toBeVisible();
    const logoRendered = await checkoutPage.headerLogo.evaluate((img) => img.complete && img.naturalWidth > 0);
    expect(logoRendered, 'header logo image should be loaded, not broken').toBe(true);

    // CS phone number (text, not a link). Brand-specific number from config; fall
    // back to a generic phone shape if the brand has no csPhone configured.
    const expectedPhone = brand.content.csPhone || PHONE_RX;
    await expect(checkoutPage.pageHeader, 'header should show a CS phone number').toContainText(expectedPhone);

    // Both CS-hours lines — brand-specific (timezone/schedule differ per brand).
    const csHours = brand.content.csHours || {};
    const weekdayRx = new RegExp(csHours.weekday || 'Mon-?Fri.*PST', 'i');
    const weekendRx = new RegExp(csHours.weekend || 'Sat-?Sun.*PST', 'i');
    await expect(checkoutPage.pageHeader.getByText(weekdayRx), 'weekday hours line').toBeVisible();
    await expect(checkoutPage.pageHeader.getByText(weekendRx), 'weekend hours line').toBeVisible();
  });
});
