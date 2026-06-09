const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

// GI: "Checkout-V2 - Coupon Validation (Shane)"
//
// Guest flow. The GI test only applied the VALID coupon (AUTOTEST1) and checked a
// "Discount/Coupon -$" line on checkout. This port hardens it:
//   - INVALID coupon shows the "Coupon not found" toast on BOTH /cart and /checkout
//     (per the team's note) AND the backend rejects it (apply-coupon -> 404);
//   - VALID coupon (AUTOTEST1) applies on /checkout: backend 200, a Discount line
//     appears, and the Total actually recomputes down by the discount amount;
//   - cleanup removes the coupon.
//
// Guest = a fresh browser context per test (Playwright default) with a cookie-scoped
// cart, so there is no shared-account residue; clearCoupon() is belt-and-suspenders.
//
// Coupon backend (live-verified 2026-06-08):
//   POST /commerce-service/proxy/cart/apply-coupon  -> 404 (invalid) / 200 (valid)
//   POST /commerce-service/proxy/cart/remove-coupon -> 200 (clear)

const INVALID_COUPON = 'FAKE123INVALID';
const VALID_COUPON = 'AUTOTEST1'; // ~$1.00 off (live-verified)
const NOT_FOUND_RX = /coupon not found/i;

test.describe('Checkout-V2 - Coupon Validation (guest)', () => {
  test('valid + invalid coupon behavior on both /cart and /checkout', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);

    await cartPage.addProductByKey('loggedout_std_1');

    // ---------- /cart ----------
    // The cart applies a valid coupon (total drops) but shows NO discount line /
    // clear button — those are checkout-only. So on /cart we assert 200 + total drop.
    await test.step('cart: invalid coupon rejected (toast "Coupon not found" + 404)', async () => {
      const { response, toastText } = await cartPage.applyCoupon(INVALID_COUPON);
      expect(response.status(), 'apply-coupon should reject an invalid code').toBe(404);
      expect(toastText, 'a toast should appear').toBeTruthy();
      expect(toastText).toMatch(NOT_FOUND_RX);
    });

    await test.step('cart: valid coupon accepted (200 + total recomputes down)', async () => {
      const subBefore = await cartPage.getSubtotalPrice();
      const totalBefore = await cartPage.getTotalPrice();
      const { response } = await cartPage.applyCoupon(VALID_COUPON);
      expect(response.status(), 'apply-coupon should accept a valid code').toBeLessThan(300);
      // total drops; subtotal unchanged (cart has no discount line to read)
      await expect.poll(() => cartPage.getTotalPrice(), { timeout: 8000 }).toBeLessThan(totalBefore);
      expect(await cartPage.getSubtotalPrice(), 'subtotal unchanged by coupon').toBeCloseTo(subBefore, 2);
    });

    // ---------- /checkout ----------
    // The valid coupon carries over from the cart — clear it so the two pages are
    // tested independently.
    await cartPage.checkoutAsGuestButton.click();
    await checkoutPage.waitForCheckoutLoaded();
    await checkoutPage.clearCoupon();

    await test.step('checkout: invalid coupon rejected (toast "Coupon not found" + 404)', async () => {
      const { response, toastText } = await checkoutPage.applyCoupon(INVALID_COUPON);
      expect(response.status(), 'apply-coupon should reject an invalid code').toBe(404);
      expect(toastText, 'a toast should appear').toBeTruthy();
      expect(toastText).toMatch(NOT_FOUND_RX);
    });

    await test.step('checkout: valid coupon accepted (200 + discount line + total recomputes)', async () => {
      const before = await checkoutPage.getOrderSummaryQa();
      const { response } = await checkoutPage.applyCoupon(VALID_COUPON);
      expect(response.status(), 'apply-coupon should accept a valid code').toBeLessThan(300);

      await expect(checkoutPage.orderDiscount, 'a Discount line should appear').toBeVisible();
      const discount = Math.abs(await checkoutPage.orderDiscount
        .textContent().then((t) => parseFloat(String(t).replace(/[^0-9.]/g, '')) || 0));
      expect(discount, 'discount should be a positive amount').toBeGreaterThan(0);

      const after = await checkoutPage.getOrderSummaryQa();
      expect(after.subtotal, 'subtotal unchanged by coupon').toBeCloseTo(before.subtotal, 2);
      expect(after.total, 'total should drop after the discount').toBeLessThan(before.total);
      expect(before.total - after.total, 'total drop should equal the discount').toBeCloseTo(discount, 2);
    });

    // --- cleanup ---
    await checkoutPage.clearCoupon();
  });
});
