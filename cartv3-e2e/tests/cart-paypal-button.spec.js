const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');

// GI: "Cart - Log In, Verify Functionality of the PayPal Button (Mike)"
// Verifies PayPal button opens PayPal popup for both standard and subscription
// products, on both the cart and checkout pages.

/**
 * Helper: click the PayPal button inside its cross-origin iframe,
 * verify the PayPal popup opens successfully, then close it.
 */
async function clickPayPalAndVerifyPopup(page, label = '') {
  const paypalFrame = page.frameLocator('#paypal-button iframe.component-frame.visible');
  // Explicit popup timeout: an unbounded waitForEvent sits silently until the 90s test
  // timeout and then reports only 'waiting for event "popup"', which looks like a hang and
  // says nothing about where it happened (badlands prod 2026-08-19). Fail fast, and name
  // the step so the failure identifies which of the four PayPal surfaces broke.
  const [paypalPopup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 20000 }).catch(() => {
      throw new Error(
        `PayPal button click opened no popup${label ? ` (${label})` : ''} at ${page.url()} — ` +
        `the button rendered but did not launch PayPal. Check that PayPal is enabled for this brand/env.`
      );
    }),
    paypalFrame.locator('[role="button"], .paypal-button').first().click(),
  ]);
  await expect(paypalPopup).toHaveURL(/paypal\.com/, { timeout: 15000 });
  await paypalPopup.close();
}

test.describe('Cart - PayPal Button', () => {
  test('PayPal button opens popup for standard and subscription on cart and checkout', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);

    // Login
    await loginPage.goto();
    await loginPage.login();

    // Clear the cart first
    await cartPage.clearCart();

    // =============================================
    // STANDARD PRODUCT
    // =============================================

    await cartPage.addProductByKey('loggedin_std_4');

    // --- Cart page: PayPal for standard product ---
    // Guard the logged-in render first: on prod the cart can come back in its logged-out
    // shell even after a successful login, and #paypal-button is hidden in that state
    // (so the assertion below would fail for the wrong reason). See waitForLoggedInCart.
    await cartPage.waitForLoggedInCart();
    // scrollIntoViewIfNeeded, NOT page.evaluate(window.scrollTo(...document.body...)):
    // right after waitForURL the URL already matches while the new document may still have
    // no <body>, so the raw evaluate threw "Cannot read properties of null (reading
    // 'scrollHeight')" on drmarty prod (2026-08-19). This waits for the element and scrolls
    // exactly as far as needed — which is all the scroll was ever for (forcing the lazy
    // PayPal iframe into view).
    await page.locator('#paypal-button').scrollIntoViewIfNeeded();
    await expect(cartPage.paypalButton).toBeVisible();
    await clickPayPalAndVerifyPopup(page, 'cart / standard');

    // --- Checkout page: PayPal for standard product ---
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    // scrollIntoViewIfNeeded, NOT page.evaluate(window.scrollTo(...document.body...)):
    // right after waitForURL the URL already matches while the new document may still have
    // no <body>, so the raw evaluate threw "Cannot read properties of null (reading
    // 'scrollHeight')" on drmarty prod (2026-08-19). This waits for the element and scrolls
    // exactly as far as needed — which is all the scroll was ever for (forcing the lazy
    // PayPal iframe into view).
    await page.locator('#paypal-button').scrollIntoViewIfNeeded();
    await expect(page.locator('#paypal-button')).toBeVisible();
    await clickPayPalAndVerifyPopup(page, 'checkout / standard');

    // =============================================
    // SUBSCRIPTION PRODUCT
    // =============================================

    // Go back to cart, remove standard product, add subscription
    await page.goto(`${brand.baseUrl}/cart`, { waitUntil: 'domcontentloaded' });
    await cartPage.waitForCartLoaded();
    await cartPage.removeFirstProduct();
    await cartPage.addProductByKey('loggedin_sub_1');

    // --- Cart page: PayPal for subscription product ---
    await cartPage.waitForLoggedInCart();
    // scrollIntoViewIfNeeded, NOT page.evaluate(window.scrollTo(...document.body...)):
    // right after waitForURL the URL already matches while the new document may still have
    // no <body>, so the raw evaluate threw "Cannot read properties of null (reading
    // 'scrollHeight')" on drmarty prod (2026-08-19). This waits for the element and scrolls
    // exactly as far as needed — which is all the scroll was ever for (forcing the lazy
    // PayPal iframe into view).
    await page.locator('#paypal-button').scrollIntoViewIfNeeded();
    await expect(cartPage.paypalButton).toBeVisible();
    await expect(page.getByText('Subscription Terms:')).toBeVisible();
    await clickPayPalAndVerifyPopup(page, 'cart / subscription');

    // --- Checkout page: PayPal for subscription product ---
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    // scrollIntoViewIfNeeded, NOT page.evaluate(window.scrollTo(...document.body...)):
    // right after waitForURL the URL already matches while the new document may still have
    // no <body>, so the raw evaluate threw "Cannot read properties of null (reading
    // 'scrollHeight')" on drmarty prod (2026-08-19). This waits for the element and scrolls
    // exactly as far as needed — which is all the scroll was ever for (forcing the lazy
    // PayPal iframe into view).
    await page.locator('#paypal-button').scrollIntoViewIfNeeded();
    await expect(page.locator('#paypal-button')).toBeVisible();
    await clickPayPalAndVerifyPopup(page, 'checkout / subscription');

    // Cleanup
    await page.goto(`${brand.baseUrl}/cart`, { waitUntil: 'domcontentloaded' });
    await cartPage.waitForCartLoaded();
    await cartPage.removeFirstProduct();
  });
});
