const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { HeaderPage } = require('../pages/header.page');

// GI: "No items in cart, login, user is redirected to Account Main (Jim)"
// Guards against a past regression where logging in with no cart items
// caused a broken or stuck redirect. Verifies login via the CMS header
// link (not direct /login URL) completes successfully and lands somewhere
// valid (not stuck on /login).

test.describe('Auth - Empty Cart Login Redirect', () => {
  test('logging in with no cart items redirects away from login page', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const headerPage = new HeaderPage(page, brand);

    // Start on homepage with no cart items
    await page.goto(brand.baseUrl, { waitUntil: 'domcontentloaded' });
    await headerPage.dismissPopupIfPresent();

    // Login via the CMS header link (different entry point from login.test.js)
    await headerPage.loginLink.click();
    await expect(page).toHaveURL(/login/);

    // Arriving via the SPA header link, the Angular login form can still be hydrating/
    // re-mounting when we start typing (which wipes the entered values → submit stays
    // disabled). That is now handled where it belongs: loginPage.fillCredentials() (called
    // by loginAndWait below) verifies the typed values stuck and refills if they didn't.
    //
    // Deliberately NO waitForLoadState('networkidle') here. It can NEVER settle on these
    // pages — the live-chat widget holds connections open — so it always burned its full
    // 30s timeout. Stacked on the popup-dismiss sleeps and two UAT page loads, that left
    // too little of the 90s budget for the login itself and this spec timed out with the
    // form untouched (drmarty UAT 2026-08-19). Don't reintroduce it; if this spec needs
    // stabilising again, add a CONDITION (wait for a specific element/response), not a
    // blanket network wait.
    await headerPage.dismissPopupIfPresent();

    // Submit credentials and wait for any redirect away from /login
    await loginPage.loginAndWait(null, null, url => !url.toString().includes('/login'));

    // Verify redirect completed — should land at homepage or /my-account, NOT stuck on /login
    await expect(page).not.toHaveURL(/\/login/);
  });
});
