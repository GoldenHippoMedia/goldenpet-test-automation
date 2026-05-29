const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');
const { CartPage } = require('../../pages/cart.page');
const { CheckoutPage } = require('../../pages/checkout.page');
const { OrderConfirmationPage } = require('../../pages/order-confirmation.page');
const {
  assertOrderIdFormat,
  assertSnapshotsAgree,
  assertProductNamesMatch,
  assertMoneyMath,
  assertTaxApplied,
} = require('../../helpers/order-validations');
// NOTE: assertShippingThreshold intentionally not used — logged-in customers
// get free shipping regardless of subtotal (account benefit overrides the
// $50 guest threshold), so the helper would false-fail.

// GI: "Order - Log In, Add a Standard product, From the Checkout Page Submit
//      the Order using a Saved Credit Card (Mike)"
//
// Flow: Login → Cart → click "change" link → /checkout → Submit Order (saved CC pre-selected)
//       → Confirmation
//
// Runs on UAT only — places a real order using the default saved credit card.

test.describe('Order - Logged-In Checkout with Saved Credit Card', () => {
  // Generous timeout — upsell funnel can take 30-60s
  test.setTimeout(180000);

  test(
    'logged-in order: submit from /checkout with saved CC and validate confirmation',
    { tag: '@real-order' },
    async ({ page, brand }) => {
      const loginPage        = new LoginPage(page, brand);
      const cartPage         = new CartPage(page, brand);
      const checkoutPage     = new CheckoutPage(page, brand);
      const confirmationPage = new OrderConfirmationPage(page, brand);

      // 1. Login
      await loginPage.goto();
      await loginPage.login();

      // 2. Add product to cart — randomize between 2 variants to dodge duplicate-order rejections
      const productKey = Math.random() < 0.5 ? 'loggedin_std_1' : 'loggedin_std_2';
      await cartPage.addProductByKey(productKey);

      // 3. Snapshot cart for cross-page assertions
      const cartSnap = await cartPage.getOrderSummary();
      expect(cartSnap.productName, 'cart should have a product name').toBeTruthy();
      expect(cartSnap.quantity, 'cart should have a quantity').toBeGreaterThan(0);
      expect(cartSnap.subtotal, 'cart should have a subtotal').toBeGreaterThan(0);

      // 4. Navigate from cart to /checkout via the "change" shipping link.
      //    This is the same path used by cart-paypal-button.test.js and lands on /checkout
      //    with the user's saved address + default CC pre-selected.
      await cartPage.changeShippingLink.click();
      await page.waitForURL(/\/checkout/, { timeout: 15000, waitUntil: 'commit' });

      // 5. Wait for the checkout page to be interactive. For logged-in users with a saved card,
      //    the Submit Order button should render without needing to toggle "Or pay with credit card".
      const submitOrderBtn = page.locator('[data-qa="submit-order-btn"]');
      await submitOrderBtn.waitFor({ state: 'visible', timeout: 30000 });

      // 6. Snapshot checkout summary (subtotal/tax/shipping/total)
      const checkoutSnap = await checkoutPage.getOrderSummary();

      // Cart → checkout: subtotal must agree
      assertSnapshotsAgree(cartSnap, checkoutSnap, 'cart', 'checkout', ['subtotal']);

      // 7. Click Submit Order on /checkout
      await submitOrderBtn.click();

      // 8. Wait for /order-confirmation, declining upsells along the way
      await checkoutPage.waitForOrderConfirmation();
      await confirmationPage.waitForConfirmationLoaded();

      // 9. Snapshot confirmation
      const confirmSnap   = await confirmationPage.getOrderSummary();
      const customer      = await confirmationPage.getCustomerInfo();
      const shippingAddr  = await confirmationPage.getShippingAddress();
      const orderId       = await confirmationPage.getOrderId();

      console.log(`\n========================================`);
      console.log(`  ORDER PLACED: ${orderId}`);
      console.log(`  Total:        $${confirmSnap.total?.toFixed(2)}`);
      console.log(`  Payment:      Saved Credit Card (logged-in /checkout)`);
      console.log(`  Variant:      ${productKey} (${brand.testProducts[productKey]})`);
      console.log(`  Customer:     ${customer.raw}`);
      console.log(`  Ship to:      ${shippingAddr}`);
      console.log(`========================================\n`);

      test.info().annotations.push(
        { type: 'Order ID',        description: orderId },
        { type: 'Order Total',     description: `$${confirmSnap.total?.toFixed(2)}` },
        { type: 'Payment Method',  description: 'Saved Credit Card (logged-in /checkout)' },
        { type: 'Product Variant', description: `${productKey} (${brand.testProducts[productKey]})` },
      );

      // 10. Validations

      // Order ID format
      assertOrderIdFormat(orderId);

      // Cart → confirmation: quantity and subtotal flow through
      assertSnapshotsAgree(
        cartSnap, confirmSnap, 'cart', 'confirmation',
        ['quantity', 'subtotal']
      );

      // Checkout → confirmation: money math agrees
      assertSnapshotsAgree(
        checkoutSnap, confirmSnap, 'checkout', 'confirmation',
        ['subtotal', 'tax', 'shipping', 'total']
      );

      // Product name flows through (loose match — display copy differs by page)
      assertProductNamesMatch(
        cartSnap.productName, confirmSnap.productName, 'cart', 'confirmation'
      );

      // Math sanity on confirmation
      assertMoneyMath(confirmSnap, 'confirmation');

      // Tax applied (saved address is in CA — should trigger tax calc)
      assertTaxApplied(confirmSnap);

      // Sanity: confirmation page shows customer + shipping address from the account
      expect(customer.name, 'confirmation should show customer name').toBeTruthy();
      expect(customer.email, 'confirmation should show customer email').toBeTruthy();
      expect(shippingAddr, 'confirmation should show shipping address').toBeTruthy();
    }
  );
});
