const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { HeaderPage } = require('../pages/header.page');

test.describe(`Header Navigation - ${process.env.BRAND || 'drmarty'}`, () => {
  // This test navigates to 12+ pages sequentially — needs extra time
  test.slow();

  test('all header and account dropdown links navigate correctly', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const headerPage = new HeaderPage(page, brand);

    // Login
    await loginPage.goto();
    await loginPage.login();
    await expect(page).toHaveURL(/my-account/);

    // --- Shop (CMS page — URL check only) ---
    await headerPage.shopLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/products/);

    // --- Subscribe & Save (CMS page — URL check only) ---
    await headerPage.subscribeLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/subscribe-save/);

    // --- Reviews (CMS page — URL check only) ---
    await headerPage.reviewsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/reviews/);

    // --- FAQ (CMS page — URL check only) ---
    await headerPage.faqLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/faq/);

    // --- Contact (CMS page — URL check only) ---
    await headerPage.contactLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/contact/);

    // --- Store Locator (external link — assert href only, no navigation) ---
    await expect(headerPage.storeLocatorLink).toHaveAttribute('href', brand.storeLocatorUrl);

    // --- Account Dropdown: My Account Main ---
    await headerPage.openAccountDropdown();
    await headerPage.accountMainLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/my-account/);
    await expect(page.getByText('Account Management').first()).toBeVisible();

    // --- Account Dropdown: Pet Profile ---
    await headerPage.openAccountDropdown();
    await headerPage.petProfileLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/pets/);
    await expect(page).toHaveTitle(/Pet Profile/);

    // --- Account Dropdown: Profile and Settings ---
    await headerPage.openAccountDropdown();
    await headerPage.profileSettingsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/account-details/);
    await expect(page.locator('h1:has-text("Manage Account")')).toBeVisible();

    // --- Account Dropdown: Orders ---
    await headerPage.openAccountDropdown();
    await headerPage.ordersLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/order-history/);
    await expect(page.getByText('Order History').first()).toBeVisible();

    // --- Account Dropdown: Subscriptions ---
    await headerPage.openAccountDropdown();
    await headerPage.subscriptionsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/subscription-edit/);
    // The subscription editor has no heading. Assert a stable, desktop-visible
    // landmark: the [data-qa="subscription-select"] picker that renders for the
    // account's active subscription. (Do NOT use getByText('Skip next order') —
    // that control now lives only inside <mobile-sticky-footer-v2>, which is
    // `lg:hidden` / display:none at desktop viewport widths, so it is present-
    // but-hidden by design on the desktop viewport Playwright runs at.)
    await expect(page.locator('[data-qa="subscription-select"]')).toBeVisible();

    // --- Account Dropdown: Contact Us ---
    await headerPage.openAccountDropdown();
    await headerPage.contactUsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/contact/);

    // --- Cart Icon → Cart ---
    await headerPage.dismissPopupIfPresent();
    await headerPage.cartLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/cart/);

    // --- Logo → Home ---
    await headerPage.logoLink.click();
    await page.waitForLoadState('domcontentloaded');
    await headerPage.dismissPopupIfPresent();
    const homeUrlPattern = new RegExp(`${brand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\/?$`);
    await expect(page).toHaveURL(homeUrlPattern);
  });
});
