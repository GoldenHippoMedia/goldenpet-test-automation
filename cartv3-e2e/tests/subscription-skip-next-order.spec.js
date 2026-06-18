const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');
const { sameDisplayDate } = require('../helpers/subscription-dates');

// GI: "Subscriptions - Skip Next Order (Mike) (EXCLUDE PROD)".
//
// GI placed a fresh sub, skipped its next order, then cancelled it (EXCLUDE PROD — it
// placed a real order). This port operates on an EXISTING sub and SELF-HEALS, so it runs
// on UAT + prod with no order placed: skip advances the next-order date by one cycle,
// then we restore the original date via the date-input update flow.
//
// Depth added over GI (which only asserted "date changed"): asserts the post-skip summary
// date EQUALS the date the confirm modal promised (`next-date`), the skip WRITE call
// returns 2xx, and the backend still lists the sub as active.

test.describe('Subscriptions - Skip Next Order', () => {
  test.slow();

  let pageObj = null;
  let snapshot = null; // { sfId, origIso }

  test('skip the next order, verify the promised date applied, and restore', async ({ page, brand }) => {
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

    // Capture the original date as ISO (from the editable input) so we can restore it,
    // then collapse the panel back to the summary where the Skip button lives.
    await subPage.openDeliveryPayment();
    await subPage.openFrequencySection();
    const origIso = await subPage.getNextOrderDateInputValue();
    expect(origIso, 'next-order-date input should expose an ISO value').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    snapshot = { sfId, origIso };
    await subPage.editCloseBtn.click().catch(() => {});

    const origNextDisplay = await subPage.getNextOrderDateText();

    // --- Open the skip modal and read the promised dates ---
    await subPage.openSkipModal();
    const { current, next } = await subPage.getSkipModalDates();
    expect(sameDisplayDate(current, origNextDisplay), 'modal "current" date should match the summary next-order date').toBeTruthy();
    expect(sameDisplayDate(current, next), 'skip should move the date to a DIFFERENT day').toBeFalsy();

    // --- Confirm the skip ---
    const writeResp = await subPage.confirmSkip();
    expect(writeResp.status(), 'skip write should be 2xx').toBeLessThan(300);

    // --- The summary next-order date should now equal what the modal promised ---
    await expect
      .poll(async () => sameDisplayDate(await subPage.getNextOrderDateText(), next), { timeout: 15000 })
      .toBeTruthy();

    // --- Backend round-trip ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after skip');
      expect(subApi.isPresent(subs, { sfId, ssc }), 'sub should still be active after skip').toBeTruthy();
    } else {
      console.warn('[skip-next-order] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  // Self-heal: skip pushed the date forward a cycle — set it back to the original.
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
      console.warn(`[skip-next-order] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
    }
  });
});
