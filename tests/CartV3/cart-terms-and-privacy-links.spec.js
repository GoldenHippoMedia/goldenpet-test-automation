const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');
const { CartPage } = require('../../pages/cart.page');

// GI: "Cart - Log In, Verify Terms and Conditions & Privacy Policy
//      Links (Mike)"
// Logs in, adds a product, then verifies Terms & Conditions, Privacy Policy,
// Your Privacy Choices links on both the Cart and Checkout pages,
// and copyright text appears in the footer.

test.describe('Cart - Terms and Privacy Links', () => {
  test('Terms & Conditions, Privacy Policy, and Privacy Choices links work on cart and checkout', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);

    // Login and add a product
    await loginPage.goto();
    await loginPage.login();
    await cartPage.addProductByKey('loggedin_std_1');

    // --- CART PAGE CHECKS ---

    // Click Terms & Conditions — opens in new tab
    const [termsPage] = await Promise.all([
      page.context().waitForEvent('page'),
      cartPage.termsLink.click(),
    ]);
    await termsPage.waitForLoadState('domcontentloaded');
    await expect(termsPage).toHaveURL(/terms/);
    await termsPage.close();

    // Click Privacy Policy — opens in new tab
    const [privacyPage] = await Promise.all([
      page.context().waitForEvent('page'),
      cartPage.privacyPolicyLink.click(),
    ]);
    await privacyPage.waitForLoadState('domcontentloaded');
    await expect(privacyPage).toHaveURL(/privacy/);
    await privacyPage.close();

    // Scroll to footer and click Your Privacy Choices — navigates in same page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await cartPage.privacyChoicesLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/your-privacy-choices/);
    await expect(page.getByText('Requests must be made by or on behalf of a current resident of California')).toBeVisible();

    // Go back to cart and verify copyright in footer
    await cartPage.goto();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(cartPage.copyrightText.first()).toBeVisible();

    // --- CHECKOUT PAGE CHECKS ---

    // Navigate to checkout by clicking the "change" link on the cart page
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    // Scroll down to find the terms/privacy links above the submit button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Click Terms & Conditions on checkout — opens in new tab
    const [checkoutTermsPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.locator('text=Terms & Conditions').first().click(),
    ]);
    await checkoutTermsPage.waitForLoadState('domcontentloaded');
    await expect(checkoutTermsPage).toHaveURL(/terms/);
    await checkoutTermsPage.close();

    // Click Privacy Policy on checkout — opens in new tab
    const [checkoutPrivacyPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.locator('text=Privacy Policy').first().click(),
    ]);
    await checkoutPrivacyPage.waitForLoadState('domcontentloaded');
    await expect(checkoutPrivacyPage).toHaveURL(/privacy/);
    await checkoutPrivacyPage.close();
  });
});
