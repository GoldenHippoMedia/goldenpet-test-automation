const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { OrderConfirmationPage } = require('../pages/order-confirmation.page');
const {
  assertOrderIdFormat,
  assertSnapshotsAgree,
  assertProductNamesMatch,
  assertMoneyMath,
  assertTaxApplied,
  assertShippingThreshold,
} = require('../helpers/order-validations');

// GI: "Order - Standard Product, Checkout using PayPal (Guest)"
//
// Flow: Cart (logged out) → Checkout As Guest → PayPal popup login → Submit → Confirmation
// Runs on UAT only — uses Braintree sandbox PayPal credentials from .env.
// PAYPAL_SANDBOX_EMAIL and PAYPAL_SANDBOX_PASSWORD must be set in .env.

test.describe('Order - Guest Checkout with PayPal', () => {
  // Generous timeout — PayPal popup + upsell funnel can take 60–90s
  test.setTimeout(180000);

  test(
    'guest order: place PayPal order and validate data integrity across cart → checkout → confirmation',
    { tag: '@real-order' },
    async ({ page, brand }) => {
      const paypalEmail    = process.env.PAYPAL_SANDBOX_EMAIL;
      const paypalPassword = process.env.PAYPAL_SANDBOX_PASSWORD;

      if (!paypalEmail || !paypalPassword) {
        throw new Error(
          'PAYPAL_SANDBOX_EMAIL and PAYPAL_SANDBOX_PASSWORD must be set in .env to run this test'
        );
      }

      const cartPage         = new CartPage(page, brand);
      const checkoutPage     = new CheckoutPage(page, brand);
      const confirmationPage = new OrderConfirmationPage(page, brand);

      // 1. Load cart with a logged-out standard product
      await cartPage.addProductByKey('loggedout_std_1');

      // 2. Snapshot cart state
      const cartSnap = await cartPage.getOrderSummary();
      expect(cartSnap.productName, 'cart should have a product name').toBeTruthy();
      expect(cartSnap.quantity, 'cart should have a quantity').toBeGreaterThan(0);
      expect(cartSnap.subtotal, 'cart should have a subtotal').toBeGreaterThan(0);

      // 3. Proceed as guest — checkout loads in PayPal-first mode (no need to switch to CC form)
      await cartPage.checkoutAsGuestButton.click();
      await checkoutPage.waitForCheckoutLoaded();

      // 4. Snapshot checkout summary (tax will be "TBD" / null pre-PayPal since no address is filled yet)
      const checkoutSnap = await checkoutPage.getOrderSummary();

      // Cart → checkout: subtotal must agree
      assertSnapshotsAgree(cartSnap, checkoutSnap, 'cart', 'checkout', ['subtotal']);

      // 5. Click PayPal button and complete payment in the popup.
      //    Button lives inside a cross-origin iframe; Braintree renders TWO iframes with the
      //    same title — target the visible one via `.component-frame.visible`.
      const paypalFrame = page.frameLocator('#paypal-button iframe.component-frame.visible');

      const [paypalPopup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 30000 }),
        paypalFrame.locator('[role="button"], .paypal-button').first().click(),
      ]);

      // --- PayPal sandbox login flow ---
      await paypalPopup.waitForLoadState('domcontentloaded');

      // Step 1: Enter email and click Next
      // PayPal's login HTML drifts — accept multiple selectors for the Next button.
      // Use pressSequentially() — PayPal's React-controlled inputs ignore fill()
      // (same issue as Braintree hosted fields).
      await paypalPopup.locator('#email').waitFor({ state: 'visible', timeout: 20000 });
      await paypalPopup.locator('#email').click();
      await paypalPopup.locator('#email').pressSequentially(paypalEmail, { delay: 30 });
      await paypalPopup.locator('#btnNext, button:has-text("Next")').first().click();

      // Step 2: Enter password and log in
      await paypalPopup.locator('#password').waitFor({ state: 'visible', timeout: 15000 });
      await paypalPopup.locator('#password').click();
      await paypalPopup.locator('#password').pressSequentially(paypalPassword, { delay: 30 });
      await paypalPopup.locator('#btnLogin, button:has-text("Log In"), button:has-text("Log in")').first().click();

      // Step 3: Review and confirm payment.
      //    PayPal's review screen labels vary by account/locale — try the common selectors.
      const confirmBtn = paypalPopup.locator(
        '#payment-submit-btn, [data-testid="submit-button-initial"], #confirmButtonTop, #submitOrderButton, button:has-text("Continue"), button:has-text("Pay Now")'
      ).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 30000 });
      await confirmBtn.click();

      // Popup auto-closes after redirect back to merchant
      await paypalPopup.waitForEvent('close', { timeout: 30000 }).catch(() => {});

      // 6. Wait for /order-confirmation — polls and declines upsells if they render
      await checkoutPage.waitForOrderConfirmation();
      await confirmationPage.waitForConfirmationLoaded();

      // 7. Snapshot confirmation + customer/address
      const confirmSnap   = await confirmationPage.getOrderSummary();
      const customer      = await confirmationPage.getCustomerInfo();
      const shippingAddr  = await confirmationPage.getShippingAddress();
      const orderId       = await confirmationPage.getOrderId();

      console.log(`\n========================================`);
      console.log(`  ORDER PLACED: ${orderId}`);
      console.log(`  Total:        $${confirmSnap.total?.toFixed(2)}`);
      console.log(`  Payment:      PayPal`);
      console.log(`  Variant:      loggedout_std_1 (${brand.testProducts.loggedout_std_1})`);
      console.log(`  PayPal acct:  ${paypalEmail}`);
      console.log(`  Customer:     ${customer.raw}`);
      console.log(`  Ship to:      ${shippingAddr}`);
      console.log(`========================================\n`);

      test.info().annotations.push(
        { type: 'Order ID',        description: orderId },
        { type: 'Order Total',     description: `$${confirmSnap.total?.toFixed(2)}` },
        { type: 'Payment Method',  description: 'PayPal' },
        { type: 'Product Variant', description: `loggedout_std_1 (${brand.testProducts.loggedout_std_1})` },
        { type: 'PayPal Account',  description: paypalEmail },
      );

      // 8. Validations

      // Order ID format
      assertOrderIdFormat(orderId);

      // Cart → confirmation: quantity and subtotal flow through (strict equality)
      assertSnapshotsAgree(
        cartSnap, confirmSnap, 'cart', 'confirmation',
        ['quantity', 'subtotal']
      );

      // Product name flows through (loose match — display copy differs by page)
      assertProductNamesMatch(
        cartSnap.productName, confirmSnap.productName, 'cart', 'confirmation'
      );

      // Math sanity on confirmation
      assertMoneyMath(confirmSnap, 'confirmation');

      // Tax was applied (PayPal sandbox account ships to a US address — should trigger tax)
      assertTaxApplied(confirmSnap);

      // Shipping threshold business rule
      assertShippingThreshold(confirmSnap, 'confirmation');

      // Sanity: confirmation page shows a customer name and shipping address from PayPal
      expect(customer.name, 'confirmation should show customer name from PayPal').toBeTruthy();
      expect(customer.email, 'confirmation should show customer email from PayPal').toBeTruthy();
      expect(shippingAddr, 'confirmation should show shipping address from PayPal').toBeTruthy();
    }
  );
});
