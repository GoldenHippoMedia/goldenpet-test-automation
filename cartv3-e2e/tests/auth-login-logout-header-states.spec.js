const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { HeaderPage } = require('../pages/header.page');
const { CartPage } = require('../pages/cart.page');

// GI: "Login and Out Check Headers and Cart (Jim)"
// Verifies: logged-out header state → login via header link → "Hi," greeting →
// add cart item (Angular side) → logout → logged-out header restored.

test.describe('Auth - Login/Logout Header States', () => {
  test('header reflects logged-out state, login via header link, logout restores logged-out state', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const headerPage = new HeaderPage(page, brand);
    const cartPage = new CartPage(page, brand);

    // Start on homepage and verify logged-out header state
    await page.goto(brand.baseUrl, { waitUntil: 'domcontentloaded' });
    await headerPage.dismissPopupIfPresent();
    await expect(headerPage.loginLink).toBeVisible();

    // Login via the header "Log In" link (not direct /login URL).
    // Redirect goes back to homepage (not /my-account) when logging in from the CMS header.
    await headerPage.loginLink.click();
    await expect(page).toHaveURL(/login/);
    await loginPage.loginAndWait(null, null, url => !url.toString().includes('/login'));

    // Verify logged-in state: "Hi, ..." greeting in header
    await expect(headerPage.hiGreeting).toBeVisible();

    // Navigate to cart with a product (verify header on Angular app side too)
    await cartPage.addProductByKey('loggedin_std_1');
    await expect(headerPage.hiGreeting).toBeVisible();

    // Logout via account dropdown
    await headerPage.logout();

    // Verify logged-out state is restored
    await expect(headerPage.loginLink).toBeVisible();
  });
});
