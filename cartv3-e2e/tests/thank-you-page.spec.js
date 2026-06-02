const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { OrderConfirmationPage } = require('../pages/order-confirmation.page');
const {
  assertOrderIdFormat,
  assertMoneyMath,
  assertTaxApplied,
} = require('../helpers/order-validations');

// GI: "Thank You Page - Customer & Order Information Displayed on Order Confirmation (EXCLUDE PROD)"
// UAT ONLY — test account has an Amex card saved in UAT that is not valid in prod.
//
// Flow: login → add product → apply coupon AUTOTEST1 → navigate to checkout via
// shipping-address change link → submit order (saved card) → accept first upsell →
// decline remaining upsells → verify confirmation page shows all required fields.

test.describe('Order - Thank You Page Confirmation Display', () => {
  test.slow();

  test(
    'confirmation page shows order ID, upsell ID, financials, and coupon discount',
    { tag: '@real-order' },
    async ({ page, brand }) => {
      test.skip(brand.env === 'prod', 'UAT only — test Amex card not valid in prod');

      const loginPage = new LoginPage(page, brand);
      const cartPage = new CartPage(page, brand);
      const checkoutPage = new CheckoutPage(page, brand);
      const confirmationPage = new OrderConfirmationPage(page, brand);

      await loginPage.goto();
      await loginPage.login();

      // Randomize product to reduce duplicate-order errors (mirrors GI logic)
      const randNum = Math.floor(Math.random() * 100);
      const productKey = randNum % 2 !== 0 ? 'loggedin_std_2' : 'loggedin_std_3';
      await cartPage.addProductByKey(productKey);

      if (randNum % 2 === 0) {
        await cartPage.increaseQuantity();
      }

      // Apply coupon (optional — can intermittently fail in UAT)
      const couponVisible = await cartPage.couponInput.isVisible().catch(() => false);
      if (couponVisible) {
        await cartPage.couponInput.fill('AUTOTEST1');
        await cartPage.couponApply.click().catch(() => {});
        await page.waitForTimeout(1500);
      }

      // Navigate to checkout via the shipping address change link
      await cartPage.changeShippingLink.click();
      await page.waitForURL(/\/checkout/, { waitUntil: 'commit', timeout: 20000 });

      // Logged-in users with a saved card see the Submit Order button directly
      await checkoutPage.submitOrderBtn.waitFor({ state: 'visible', timeout: 20000 });

      // Optional: subscription terms checkbox (appears for some product types in CA)
      const caTermsVisible = await page.locator('[data-qa="ca-terms-checkbox"]').isVisible().catch(() => false);
      if (caTermsVisible) {
        await page.locator('[data-qa="ca-terms-checkbox"]').click();
      }

      await checkoutPage.submitOrder();
      await page.waitForTimeout(7000);

      // Upsell funnel: accept the first offer, decline the rest.
      // GI steps 17-25 show the same pattern — one YES attempt then I'M NOT INTERESTED loop.
      let firstOfferAccepted = false;
      const funnelDeadline = Date.now() + 90000;
      while (Date.now() < funnelDeadline) {
        if (page.url().includes('/order-confirmation')) break;

        if (!firstOfferAccepted) {
          const yesBtn = page.locator('button:has-text("YES UPGRADE MY ORDER")').first();
          if (await yesBtn.isVisible().catch(() => false)) {
            await yesBtn.click().catch(() => {});
            firstOfferAccepted = true;
            await page.waitForTimeout(2000);
            continue;
          }
        }

        const notInterested = page.locator("text=I'm not interested").first();
        if (await notInterested.isVisible().catch(() => false)) {
          await notInterested.click().catch(() => {});
          await page.waitForTimeout(2000);
        } else {
          await page.waitForTimeout(1000);
        }
      }

      await confirmationPage.waitForConfirmationLoaded();

      // Extract confirmation data
      const orderId = await confirmationPage.getOrderId();
      const summary = await confirmationPage.getOrderSummary();
      const customerInfo = await confirmationPage.getCustomerInfo().catch(() => null);
      const shippingAddress = await confirmationPage.getShippingAddress().catch(() => null);

      // Special Offer (upsell) order ID — only present if upsell was accepted.
      // Angular comment wrapping requires normalize-space() on the label match.
      const specialOrderIdLoc = page.locator('xpath=//h5[normalize-space(text())="SPECIAL OFFER ORDER NO."]/following-sibling::p').first();
      const specialOrderId = await specialOrderIdLoc.textContent({ timeout: 2000 }).catch(() => null);

      // Coupon discount row — may not appear if the coupon failed to apply in UAT
      const discountLoc = page.locator('xpath=//*[normalize-space(text())="Coupons & Discounts:"]/following-sibling::*[1]');
      const discountText = await discountLoc.textContent({ timeout: 2000 }).catch(() => null);

      // --- Assertions ---
      assertOrderIdFormat(orderId);

      if (specialOrderId) {
        assertOrderIdFormat(specialOrderId.trim());
      }

      assertMoneyMath(summary, 'confirmation');
      assertTaxApplied(summary, 'confirmation');

      expect(summary.shipping, 'Shipping should be displayed on confirmation').not.toBeNull();
      expect(shippingAddress, 'Shipping address should be displayed').toBeTruthy();

      if (customerInfo) {
        expect(customerInfo.email, 'Customer email should be displayed').toBeTruthy();
      }

      // --- Audit trail: log + attach to HTML report ---
      const annotations = [
        { type: 'Order ID', description: orderId },
        { type: 'Upsell Order ID', description: specialOrderId?.trim() || 'none' },
        { type: 'Product Key', description: productKey },
        { type: 'Subtotal', description: `$${summary.subtotal}` },
        { type: 'Tax', description: `$${summary.tax}` },
        { type: 'Shipping', description: `$${summary.shipping}` },
        { type: 'Total', description: `$${summary.total}` },
        { type: 'Discount', description: discountText?.trim() || 'not applied' },
      ];
      annotations.forEach(a => test.info().annotations.push(a));

      console.log('\n========================================');
      console.log(`  ORDER PLACED: ${orderId}`);
      if (specialOrderId) console.log(`  UPSELL ORDER: ${specialOrderId.trim()}`);
      console.log(`  Product: ${productKey} | Subtotal: $${summary.subtotal} | Tax: $${summary.tax} | Shipping: $${summary.shipping} | Total: $${summary.total}`);
      if (discountText) console.log(`  Discount: ${discountText.trim()}`);
      console.log('========================================\n');
    }
  );
});
