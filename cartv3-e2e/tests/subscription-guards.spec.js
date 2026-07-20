const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');

// Cross-cutting, NON-DESTRUCTIVE guard tests for the subscription editor (no order
// placed, nothing mutated) — safe on UAT + prod. Industry-standard checks:
//   1. Auth guard: the editor is behind login (logged-out access redirects to /login).
//   2. Cancellation is a deliberate, confirmed action: reaching the cancellation page and
//      opening a reason does NOT cancel — only the final confirm does (retention back-out).

test.describe('Subscriptions - Guards', () => {
  test.slow();

  test('logged-out access to /subscription-edit redirects to login', async ({ page, brand }) => {
    // No login. Hitting the account-scoped editor must bounce to /login.
    await page.goto(brand.url('subscriptionEdit'), { waitUntil: 'commit' });
    await expect(page, 'logged-out subscription editor should redirect to /login').toHaveURL(/\/login/i, {
      timeout: 20000,
    });
  });

  test('visiting the cancellation page and opening a reason does NOT cancel (retention back-out)', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // Any sub whose edit panel opens will do (we only need to reach its cancel flow).
    const chosen = await subPage.pickEditableSubscription({});
    test.skip(!chosen, 'No subscription with an accessible edit panel on this account.');
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    // Enter the cancellation flow and open a reason — but never click the final confirm.
    await subPage.startCancel();
    await expect(subPage.cancelPageSubId, 'cancellation page should show the matching sub').toContainText(ssc, {
      timeout: 15000,
    });
    await subPage.selectCancelReason(); // reveals "I still want to cancel" — we do NOT click it

    // Back out without confirming.
    await subPage.goto();

    // The sub must still be active — UI (still listed) and backend (active:true).
    expect(
      (await subPage.listSubscriptions()).some((s) => s.ssc === ssc),
      'sub should still be listed (not cancelled) after backing out',
    ).toBe(true);

    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      expect(
        subApi.isActive(subs, { ssc, sfId }),
        'sub should remain active in the backend after a non-confirmed cancellation',
      ).toBe(true);
    } else {
      console.warn('[guards] brand.testAccountId not set — skipping backend active-check');
    }
  });
});
