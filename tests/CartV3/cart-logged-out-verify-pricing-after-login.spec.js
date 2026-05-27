const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');
const { CartPage } = require('../../pages/cart.page');

// GI: "Cart - While Logged Out, Add a Standard Product, Verify Pricing is
//      Updated from Standard to My Account Pricing After Login (Mike)"
// Adds a product while logged out, captures standard prices, logs in,
// then verifies prices dropped to member pricing.

test.describe('Cart - Member Pricing After Login', () => {
  test('prices update from standard to member pricing after login', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    const loginPage = new LoginPage(page, brand);

    // Clear cart first (while logged out)
    await cartPage.clearCart();

    // Add a standard product while logged out
    await cartPage.addProductByKey('loggedout_std_1');

    // Capture standard (logged-out) prices
    const stdItemTotal = await cartPage.getItemTotalPrice();
    const stdSubtotal = await cartPage.getSubtotalPrice();
    const stdTotal = await cartPage.getTotalPrice();

    expect(stdItemTotal).toBeGreaterThan(0);

    // Click Login button from the cart page
    await cartPage.loginButton.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/login/);

    // Fill credentials and submit — wait for URL to leave /login
    await loginPage.emailInput.waitFor({ state: 'visible' });
    await loginPage.emailInput.fill(loginPage.brand.email);
    await loginPage.emailInput.press('Tab');
    await loginPage.passwordInput.fill(loginPage.brand.password);
    await loginPage.passwordInput.press('Tab');
    await loginPage.submitButton.click();

    // Wait for redirect away from login page and cart to load with member pricing
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
    await cartPage.waitForCartLoaded();
    await cartPage.dismissPopupIfPresent();

    // Verify only 1 product in cart (guard against parallel test interference)
    const productCount = await cartPage.productName.count();
    if (productCount > 1) {
      // Another test added a product — skip price comparison (matches GI behavior)
      return;
    }

    // Verify item is still visible
    await expect(cartPage.productPrice.first()).toBeVisible();

    // Capture member (logged-in) prices
    const memberItemTotal = await cartPage.getItemTotalPrice();
    const memberSubtotal = await cartPage.getSubtotalPrice();
    const memberTotal = await cartPage.getTotalPrice();

    // Member pricing should be less than standard pricing
    expect(stdItemTotal).toBeGreaterThan(memberItemTotal);
    expect(stdSubtotal).toBeGreaterThan(memberSubtotal);
    expect(stdTotal).toBeGreaterThan(memberTotal);

    // Cleanup
    await cartPage.removeFirstProduct();
  });
});
