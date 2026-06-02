const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');

// GI: "Cart - While Logged Out, Verify Shipping Text, Test LOGIN &
//      CHECKOUT AS GUEST Buttons (Mike)"
// Adds a product while logged out, verifies shipping text, tests Login
// and Checkout As Guest buttons.

test.describe('Cart - Logged Out Buttons and Shipping Text', () => {
  test('shipping text shown and Login / Checkout As Guest buttons work', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);

    // Add a standard product while logged out
    await cartPage.addProductByKey('loggedout_std_1');

    // Verify "Calculated on Next Page" shipping text
    await expect(cartPage.shippingText).toContainText('Calculated on Next Page');

    // Click Login button on the cart page — verify it navigates to login page
    await cartPage.loginButton.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/login/);

    // Go back to cart and wait for product to reload
    await cartPage.addProductByKey('loggedout_std_1');

    // Click Checkout As Guest — verify it navigates to checkout
    await cartPage.checkoutAsGuestButton.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    await expect(page).toHaveURL(/checkout/);
  });
});
