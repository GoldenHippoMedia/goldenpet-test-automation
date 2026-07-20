const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');

// NEW coverage — Ghost had no payment-method test. The editor lets you switch the card /
// PayPal method a subscription bills to (`payment-select`). Mirrors the other update
// specs: switch to a different saved method on an existing sub, verify it persists, then
// self-heal back to the original. No order placed. Gated UAT-only (env-matrix note below).
//
// The shared test account has many saved methods with DUPLICATE labels ("Card ending in
// 1111", "PayPal: …"), so we select/assert by the option's unique VALUE (token), not its
// text — that keeps the assertion deterministic despite the dup labels.

test.describe('Subscriptions - Update Payment Method', () => {
  test.slow();

  // Prod runs NON-DESTRUCTIVE subscription checks only (guards + the shipping-address
  // read-only smoke). This spec mutates a real sub via self-heal, so it is UAT-only: the
  // write logic is identical on prod, and a failed prod self-heal could leave a real sub
  // billing the wrong method. Same gate for drmarty + badlands. See CLAUDE.md "Subscription Management".
  test.skip(process.env.ENVIRONMENT === 'prod', 'UAT-only: mutating self-heal spec; prod subscription coverage is non-destructive only.');

  let pageObj = null;
  let snapshot = null; // { sfId, origPayValue }

  test('switch the subscription payment method, verify persistence, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // Need a card sub (has payment-select; PayPal-funnel subs show a static display instead).
    const chosen = await subPage.pickEditableSubscription({ needPaymentSelect: true });
    test.skip(!chosen, 'No subscription with a switchable payment method on this account.');
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    const origPayValue = await subPage.getPaymentValue();
    snapshot = { sfId, origPayValue };

    const values = await subPage.listPaymentValues();
    const target = values.find((v) => v !== origPayValue);
    test.skip(!target, 'Account has only one saved payment method — nothing to switch to.');

    // --- Mutate ---
    await subPage.setPaymentByValue(target);
    const writeResp = await subPage.clickUpdate();
    expect(writeResp.status(), 'payment update write should be 2xx').toBeLessThan(300);
    await expect(subPage.toast()).toContainText(/updat|success/i, { timeout: 15000 });

    // --- UI round-trip ---
    await subPage.goto();
    await subPage.selectSubscription({ sfId });
    await subPage.openDeliveryPayment();
    expect(await subPage.getPaymentValue(), 'new payment method should persist after reload').toBe(target);

    // --- Backend round-trip ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after payment update');
      const rec = subApi.findBySfId(subs, sfId);
      expect(rec, 'sub should be present in the backend').toBeTruthy();
      expect(rec.active, 'sub should still be active').toBe(true);
    } else {
      console.warn('[update-payment] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  test.afterEach(async () => {
    if (!pageObj || !snapshot) return;
    try {
      await pageObj.goto();
      await pageObj.selectSubscription({ sfId: snapshot.sfId });
      await pageObj.openDeliveryPayment();
      if ((await pageObj.getPaymentValue()) !== snapshot.origPayValue) {
        await pageObj.setPaymentByValue(snapshot.origPayValue);
        await pageObj.clickUpdate();
      }
    } catch (e) {
      console.warn(`[update-payment] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
    }
  });
});
