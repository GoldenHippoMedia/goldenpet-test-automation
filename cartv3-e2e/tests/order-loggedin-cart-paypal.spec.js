const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { OrderConfirmationPage } = require('../pages/order-confirmation.page');
const {
  assertOrderIdFormat,
  assertSnapshotsAgree,
  assertProductNamesMatch,
  assertMoneyMath,
  assertTaxApplied,
} = require('../helpers/order-validations');
// NOTE: assertShippingThreshold is intentionally NOT imported.
// The <$50 → shipping fee rule applies to guest pricing only. Logged-in customers
// get free shipping as an account benefit regardless of subtotal, so the threshold
// assertion would false-fail for orders under $50.

// GI: "Order - Log In, Add a Standard product, Checkout using PayPal (EXCLUDE PROD) (Mike)"
//
// Flow: Login → Cart (logged-in) → Click PayPal button on cart → PayPal popup login
//       → Popup closes → (cart auto-submits OR click Submit Order) → Confirmation
//
// Runs on UAT only ("EXCLUDE PROD") — places a real Braintree sandbox PayPal order.
// PAYPAL_SANDBOX_EMAIL / PAYPAL_SANDBOX_PASSWORD must be set in .env.

test.describe('Order - Logged-In Cart with PayPal', () => {
  // Generous timeout — PayPal popup + upsell funnel can take 60–90s
  test.setTimeout(180000);

  test(
    'logged-in order: PayPal from cart page and validate confirmation',
    { tag: '@real-order' },
    async ({ page, brand }) => {
      const paypalEmail    = process.env.PAYPAL_SANDBOX_EMAIL;
      const paypalPassword = process.env.PAYPAL_SANDBOX_PASSWORD;

      if (!paypalEmail || !paypalPassword) {
        throw new Error(
          'PAYPAL_SANDBOX_EMAIL and PAYPAL_SANDBOX_PASSWORD must be set in .env to run this test'
        );
      }

      const loginPage        = new LoginPage(page, brand);
      const cartPage         = new CartPage(page, brand);
      const checkoutPage     = new CheckoutPage(page, brand);
      const confirmationPage = new OrderConfirmationPage(page, brand);

      // 1. Login
      await loginPage.goto();
      await loginPage.login();

      // 2. Add product to cart — randomize between 2 variants to dodge duplicate-order rejections
      const productKey = Math.random() < 0.5 ? 'loggedin_std_2' : 'loggedin_std_3';
      await cartPage.addProductByKey(productKey);

      // 3. Snapshot cart state for cross-page assertions
      const cartSnap = await cartPage.getOrderSummary();
      expect(cartSnap.productName, 'cart should have a product name').toBeTruthy();
      expect(cartSnap.quantity, 'cart should have a quantity').toBeGreaterThan(0);
      expect(cartSnap.subtotal, 'cart should have a subtotal').toBeGreaterThan(0);

      // 4. Click PayPal button on the cart page and complete auth in the popup.
      //    NOTE: GI's step to tick `[data-qa="ca-terms-checkbox"]` was dropped here —
      //    that checkbox no longer renders on the live cart (legacy element).
      //    Button is inside a cross-origin iframe; Braintree renders two iframes with the
      //    same title — target the visible one via `.component-frame.visible`.
      const paypalFrame = page.frameLocator('#paypal-button iframe.component-frame.visible');

      const [paypalPopup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 30000 }),
        paypalFrame.locator('[role="button"], .paypal-button').first().click(),
      ]);

      // --- PayPal sandbox login flow (same pattern as guest-paypal test) ---
      await paypalPopup.waitForLoadState('domcontentloaded');

      // Step 1: Email → Next
      await paypalPopup.locator('#email').waitFor({ state: 'visible', timeout: 20000 });
      await paypalPopup.locator('#email').click();
      await paypalPopup.locator('#email').pressSequentially(paypalEmail, { delay: 30 });
      await paypalPopup.locator('#btnNext, button:has-text("Next")').first().click();

      // Step 2: Password → Log In (pressSequentially — PayPal ignores fill())
      await paypalPopup.locator('#password').waitFor({ state: 'visible', timeout: 15000 });
      await paypalPopup.locator('#password').click();
      await paypalPopup.locator('#password').pressSequentially(paypalPassword, { delay: 30 });
      await paypalPopup.locator('#btnLogin, button:has-text("Log In"), button:has-text("Log in")').first().click();

      // Step 3: Review screen → confirm. Multiple selectors because PayPal labels drift.
      const confirmBtn = paypalPopup.locator(
        '#payment-submit-btn, [data-testid="submit-button-initial"], #confirmButtonTop, #submitOrderButton, button:has-text("Continue"), button:has-text("Pay Now")'
      ).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 30000 });
      await confirmBtn.click();

      // Popup auto-closes after PayPal redirects back to merchant
      await paypalPopup.waitForEvent('close', { timeout: 30000 }).catch(() => {});

      // 6. After PayPal closes, the cart auto-submits the order — no manual Submit Order
      //    click required (despite what the legacy GI test did). The page navigates from
      //    /cart → /upsell (funnel) → /order-confirmation. Just wait for the confirmation
      //    URL and decline upsells along the way.

      // 7. Wait for /order-confirmation, declining upsells along the way.
      //    waitForOrderConfirmation() works from any starting page — it just polls the URL.
      await checkoutPage.waitForOrderConfirmation();
      await confirmationPage.waitForConfirmationLoaded();

      // 8. Snapshot confirmation
      const confirmSnap   = await confirmationPage.getOrderSummary();
      const customer      = await confirmationPage.getCustomerInfo();
      const shippingAddr  = await confirmationPage.getShippingAddress();
      const orderId       = await confirmationPage.getOrderId();

      console.log(`\n========================================`);
      console.log(`  ORDER PLACED: ${orderId}`);
      console.log(`  Total:        $${confirmSnap.total?.toFixed(2)}`);
      console.log(`  Payment:      PayPal (logged-in cart)`);
      console.log(`  Variant:      ${productKey} (${brand.testProducts[productKey]})`);
      console.log(`  PayPal acct:  ${paypalEmail}`);
      console.log(`  Customer:     ${customer.raw}`);
      console.log(`  Ship to:      ${shippingAddr}`);
      console.log(`========================================\n`);

      test.info().annotations.push(
        { type: 'Order ID',        description: orderId },
        { type: 'Order Total',     description: `$${confirmSnap.total?.toFixed(2)}` },
        { type: 'Payment Method',  description: 'PayPal (logged-in cart)' },
        { type: 'Product Variant', description: `${productKey} (${brand.testProducts[productKey]})` },
        { type: 'PayPal Account',  description: paypalEmail },
      );

      // 9. Validations

      // Order ID format
      assertOrderIdFormat(orderId);

      // Cart → confirmation: quantity and subtotal flow through
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

      // Tax applied (PayPal returns a US address)
      assertTaxApplied(confirmSnap);

      // Sanity: confirmation page shows customer + shipping data from PayPal
      expect(customer.name, 'confirmation should show customer name from PayPal').toBeTruthy();
      expect(customer.email, 'confirmation should show customer email from PayPal').toBeTruthy();
      expect(shippingAddr, 'confirmation should show shipping address from PayPal').toBeTruthy();
    }
  );
});
