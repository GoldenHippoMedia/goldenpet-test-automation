const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');

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

    console.log('[member-pricing] standard:', { stdItemTotal, stdSubtotal, stdTotal });

    // Click Login button from the cart page
    await cartPage.loginButton.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/login/);

    // Fill credentials and submit — wait for URL to leave /login. Use loginAndWait rather
    // than fillCredentials + click: only loginAndWait retries fill→enable→click→navigate as
    // one unit, which is what survives the form re-mounting mid-click (see LoginPage).
    await loginPage.loginAndWait(null, null, url => !url.toString().includes('/login'));

    // Re-request /cart with the auth cookie. Logging in from the cart returns us to a
    // cart the SPA still has rendered at STANDARD pricing, and waitForCartLoaded() only
    // waits for a product name to be visible — which the stale logged-out render already
    // satisfies. Snapshotting here read the standard prices a second time and compared
    // them to themselves (drmarty prod 2026-08-19: 59.95 vs 59.95, a false failure while
    // member pricing was applying correctly in the browser).
    await page.reload({ waitUntil: 'commit' });
    await cartPage.dismissPopupIfPresent();
    await cartPage.waitForCartLoaded();
    await cartPage.waitForLoggedInCart();

    // Verify only 1 product in cart (guard against parallel test interference)
    const productCount = await cartPage.productName.count();
    if (productCount > 1) {
      // Another test added a product — skip price comparison (matches GI behavior)
      return;
    }

    // Verify item is still visible
    await expect(cartPage.productPrice.first()).toBeVisible();

    // Now wait for member pricing to actually be APPLIED rather than assuming it already
    // is. Polling the item price is the load-bearing assertion of this spec: if it never
    // drops below the standard price, member pricing genuinely isn't applying.
    await expect
      .poll(() => cartPage.getItemTotalPrice(), {
        message: `item price never dropped below the standard $${stdItemTotal} after login — member pricing did not apply`,
        timeout: 30000,
        intervals: [500, 1000, 2000],
      })
      .toBeLessThan(stdItemTotal);

    // Capture member (logged-in) prices
    const memberItemTotal = await cartPage.getItemTotalPrice();
    const memberSubtotal = await cartPage.getSubtotalPrice();
    const memberTotal = await cartPage.getTotalPrice();
    console.log('[member-pricing] member:', { memberItemTotal, memberSubtotal, memberTotal });

    // Member pricing should be less than standard pricing
    expect(stdItemTotal).toBeGreaterThan(memberItemTotal);
    expect(stdSubtotal).toBeGreaterThan(memberSubtotal);
    expect(stdTotal).toBeGreaterThan(memberTotal);

    // Cleanup
    await cartPage.removeFirstProduct();
  });
});
