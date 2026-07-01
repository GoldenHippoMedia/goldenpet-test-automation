const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

// GI: "Cart - Log In, Verify Fields and Links of the Cart (Mike)"
// Logs in, captures shipping address from account details, adds product to cart,
// verifies address displayed, payment method populated, and change link
// navigates to checkout.

test.describe('Cart - Verify Fields and Links (Logged In)', () => {
  test('shipping address, payment method, and change link work', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);
    const accountDetailsPage = new AccountDetailsPage(page, brand);

    // Login
    await loginPage.goto();
    await loginPage.login();
    await expect(page).toHaveURL(/my-account/);

    // Go to account details and capture the shipping street address
    await accountDetailsPage.goto();
    const savedStreetAddress = await accountDetailsPage.getStreetAddress();

    // Add a product to the cart
    await cartPage.addProductByKey('loggedin_std_2');

    // Verify shipping address on cart matches the saved address. Compare on street
    // LINE 1 only — some brands' cart summary (e.g. Badlands) render line 1 without the
    // line-2 / suite portion, while getStreetAddress() returns the full street string.
    if (savedStreetAddress) {
      const streetLine1 = savedStreetAddress.split(',')[0].trim();
      await expect(cartPage.shippingStreet).toContainText(streetLine1);
    }

    // Verify payment method select [data-qa="saved-card"] is populated
    await expect(cartPage.paymentMethod).not.toHaveValue('');

    // Click "change" shipping link [data-qa="shipping-address-change-link"] — navigates to checkout
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 10000 });
    await expect(page).toHaveURL(/checkout/);

    // Go back to cart
    await cartPage.addProductByKey('loggedin_std_2');

    // Click "Checkout with new card" link (no data-qa yet) — navigates to checkout
    await cartPage.checkoutWithNewCardLink.click();
    await page.waitForURL(/checkout/, { timeout: 10000 });
    await expect(page).toHaveURL(/checkout/);
  });
});
