const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');
const { MyAccountPage } = require('../../pages/my-account.page');

// GI: "My Account Main - Has 3 Orders, Shows Subscriptions, and Validate Links (Jim)"
// Covers all body links on /my-account — Account Management section, My Recent Orders
// button, and My Subscriptions section. These are distinct from header.test.js which
// navigates to the same destinations via the header dropdown.
//
// Also covers: clicking an individual ORD- order link from My Recent Orders verifies
// the destination page shows the matching order ID.

test.describe('Account - My Account Main Page Links', () => {
  test.slow();

  test('all body links and sections on My Account Main navigate correctly', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const myAccountPage = new MyAccountPage(page, brand);

    await loginPage.goto();
    await loginPage.login();

    await myAccountPage.goto();
    await expect(myAccountPage.accountHeading).toBeVisible();

    // --- Account Management: Order History ---
    await myAccountPage.orderHistoryLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/order-history/);

    await myAccountPage.goto();

    // --- Account Management: Manage Pet Profile ---
    await myAccountPage.managePetProfileLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/pets/);

    await myAccountPage.goto();

    // --- Account Management: Manage Password ---
    await myAccountPage.managePasswordLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/reset-password/);

    await myAccountPage.goto();

    // --- Account Management: Edit Subscriptions ---
    await myAccountPage.editSubscriptionsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/subscription-edit/);

    await myAccountPage.goto();

    // --- Account Management: Manage Payment Methods ---
    await myAccountPage.managePaymentMethodsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/payment-details/);

    await myAccountPage.goto();

    // --- Account Management: Update Profile and Shipping Address ---
    await myAccountPage.updateProfileLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/account-details/);

    await myAccountPage.goto();

    // --- My Recent Orders: click first ORD- link, verify destination shows matching order ---
    await myAccountPage.firstOrderLink.waitFor({ state: 'visible' });
    const orderId = (await myAccountPage.firstOrderLink.textContent()).trim();
    const orderCard = myAccountPage.firstOrderLink.locator('xpath=ancestor::*[3]');
    const cardText = (await orderCard.textContent().catch(() => '')).trim();

    await myAccountPage.firstOrderLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/my-account$/);
    await expect(page.getByText(orderId).first()).toBeVisible();

    const lines = cardText.split('\n').map(l => l.trim()).filter(Boolean);
    const productName = lines.find(l => !l.includes('ORD-') && l.length > 3);
    if (productName) {
      await expect(page.getByText(productName).first()).toBeVisible();
    }

    await myAccountPage.goto();

    // --- My Recent Orders: REORDER AND VIEW ORDER DETAILS button ---
    await myAccountPage.reorderViewDetailsBtn.waitFor({ state: 'visible' });
    await myAccountPage.reorderViewDetailsBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/order-history/);

    await myAccountPage.goto();

    // --- My Subscriptions: click first SSC- link, verify destination shows matching subscription ---
    await myAccountPage.firstSubscriptionLink.waitFor({ state: 'visible' });
    const subscriptionLinkText = (await myAccountPage.firstSubscriptionLink.textContent()).trim();
    const sscId = subscriptionLinkText.match(/SSC-\d+/)?.[0] || subscriptionLinkText;
    await myAccountPage.firstSubscriptionLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/subscription-edit/);
    await expect(page.locator('select').first()).toContainText(sscId);

    await myAccountPage.goto();

    // --- My Subscriptions: MANAGE SUBSCRIPTIONS button ---
    await myAccountPage.manageSubscriptionsBtn.waitFor({ state: 'visible' });
    await myAccountPage.manageSubscriptionsBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/subscription-edit/);
  });
});
