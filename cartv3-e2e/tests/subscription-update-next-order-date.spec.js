const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');
const { addDaysIso } = require('../helpers/subscription-dates');

// GI: "Subscriptions - Next Order Date (Mike) (EXCLUDE PROD)" — which was UNFINISHED in
// Ghost (marked 🚧, exited with `pass` at step 15 before the date was ever set, and its
// `input[data-qa='next-order-date']` write never ran). This port FINISHES it.
//
// Live audit (2026-06-17) confirmed the feature is real: expanding Delivery & Payment ->
// "Delivery Frequency / Shipping" reveals an EDITABLE <input type="date"
// data-qa="next-order-date"> (distinct from the summary display <div> of the same
// data-qa). Setting it + Update writes the new date.
//
// Runs UAT + prod via self-heal (snapshot the ISO value -> set a new date -> assert ->
// restore). No order placed.

test.describe('Subscriptions - Update Next Order Date', () => {
  test.slow();

  let pageObj = null;
  let snapshot = null; // { sfId, origIso }

  test('change the next order date, verify persistence, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    await subPage.selectSubscription({ index: 0 });
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    await subPage.openDeliveryPayment();
    await subPage.openFrequencySection();

    // The date input value is ISO "YYYY-MM-DD" — use it as the source of truth (no
    // locale parsing) for both the new date and the restore.
    const origIso = await subPage.getNextOrderDateInputValue();
    expect(origIso, 'next-order-date input should expose an ISO value').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    snapshot = { sfId, origIso };

    // Pick a new date a week later (well within any min/max the picker allows).
    const newIso = addDaysIso(origIso, 7);

    // --- Mutate ---
    await subPage.setNextOrderDateInput(newIso);
    const writeResp = await subPage.clickUpdate();
    expect(writeResp.status(), 'next-order-date update write should be 2xx').toBeLessThan(300);
    await expect(subPage.toast()).toContainText(/updat|success/i, { timeout: 15000 });

    // --- UI round-trip ---
    await subPage.goto();
    await subPage.selectSubscription({ sfId });
    await subPage.openDeliveryPayment();
    await subPage.openFrequencySection();
    expect(await subPage.getNextOrderDateInputValue(), 'new next-order date should persist').toBe(newIso);

    // --- Backend round-trip ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after date update'); // first-run: reveals the date field name
      expect(subApi.isPresent(subs, { sfId, ssc }), 'sub should still be active in the backend').toBeTruthy();
    } else {
      console.warn('[update-next-order-date] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  test.afterEach(async () => {
    if (!pageObj || !snapshot) return;
    try {
      await pageObj.goto();
      await pageObj.selectSubscription({ sfId: snapshot.sfId });
      await pageObj.openDeliveryPayment();
      await pageObj.openFrequencySection();
      if ((await pageObj.getNextOrderDateInputValue()) !== snapshot.origIso) {
        await pageObj.setNextOrderDateInput(snapshot.origIso);
        await pageObj.clickUpdate();
      }
    } catch (e) {
      console.warn(`[update-next-order-date] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
    }
  });
});
