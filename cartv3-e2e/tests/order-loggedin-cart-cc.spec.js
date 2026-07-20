const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

// GI: "Cart - Log In, Add Product then Submit Standard Order Using Default
//      Credit Card (Mike)"
//
// WARNING: This test places a REAL order with a real credit card.
// Do not schedule for production unless you want actual charges.
// The product selection is randomized to avoid duplicate-order errors.

test.describe('Cart - Submit Standard Order', () => {
  test.slow();

  test('submit order with default credit card and verify confirmation', { tag: ['@real-order', '@prod-order'] }, async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);

    // Login
    await loginPage.goto();
    await loginPage.login();

    // Randomize product selection to avoid duplicate-order errors (mirrors GI)
    const randomNum = Math.floor(Math.random() * 100);
    const productKey = randomNum % 2 === 0 ? 'loggedin_std_4' : 'loggedin_std_3';
    await cartPage.addProductByKey(productKey);

    // NOTE: GI's step to tick `[data-qa="ca-terms-checkbox"]` was dropped —
    // that checkbox no longer renders on the live cart (legacy element).
    // Subscription Terms copy still appears for S&S items but it's informational, not a checkbox.

    // Click Submit Order. After submit, the app shows an "Order Received!
    // Fetching something special for you…" interstitial on /cart before
    // navigating into the post-purchase funnel (/offer → /upsell → /downsell →
    // /order-confirmation). That interstitial can exceed a fixed 10s wait on
    // prod, so ride the funnel via the shared helper — it polls up to 90s,
    // declines every upsell, and returns only once /order-confirmation loads.
    await cartPage.submitOrderButton.click();
    await checkoutPage.waitForOrderConfirmation();

    // Helper only returns on /order-confirmation (otherwise it throws)
    await expect(page).toHaveURL(/order-confirmation/);

    // Extract, log, and attach the order number to the report
    const orderId = await checkoutPage.extractOrderId();
    if (orderId) {
      test.info().annotations.push({ type: 'Order ID', description: orderId });
    }
  });
});
