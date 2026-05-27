const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');
const { CartPage } = require('../../pages/cart.page');

// GI: "Cart - Log In, Verify Functionality of the PayPal Button (Mike)"
// Verifies PayPal button opens PayPal popup for both standard and subscription
// products, on both the cart and checkout pages.

/**
 * Helper: click the PayPal button inside its cross-origin iframe,
 * verify the PayPal popup opens successfully, then close it.
 */
async function clickPayPalAndVerifyPopup(page) {
  const paypalFrame = page.frameLocator('#paypal-button iframe.component-frame.visible');
  const [paypalPopup] = await Promise.all([
    page.waitForEvent('popup'),
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
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(cartPage.paypalButton).toBeVisible();
    await clickPayPalAndVerifyPopup(page);

    // --- Checkout page: PayPal for standard product ---
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('#paypal-button')).toBeVisible();
    await clickPayPalAndVerifyPopup(page);

    // =============================================
    // SUBSCRIPTION PRODUCT
    // =============================================

    // Go back to cart, remove standard product, add subscription
    await page.goto(`${brand.baseUrl}/cart`, { waitUntil: 'domcontentloaded' });
    await cartPage.waitForCartLoaded();
    await cartPage.removeFirstProduct();
    await cartPage.addProductByKey('loggedin_sub_1');

    // --- Cart page: PayPal for subscription product ---
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(cartPage.paypalButton).toBeVisible();
    await expect(page.getByText('Subscription Terms:')).toBeVisible();
    await clickPayPalAndVerifyPopup(page);

    // --- Checkout page: PayPal for subscription product ---
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('#paypal-button')).toBeVisible();
    await clickPayPalAndVerifyPopup(page);

    // Cleanup
    await page.goto(`${brand.baseUrl}/cart`, { waitUntil: 'domcontentloaded' });
    await cartPage.waitForCartLoaded();
    await cartPage.removeFirstProduct();
  });
});
