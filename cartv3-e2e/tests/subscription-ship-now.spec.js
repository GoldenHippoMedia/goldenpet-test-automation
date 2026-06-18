const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');
const { sameDisplayDate } = require('../helpers/subscription-dates');

// GI: "Subscriptions - Ship Now Button (Scott)" (the non-GMD variant; the GMD
// `/sub-history` variant is intentionally out of scope — that brand is retired).
//
// GI ran this on prod too because it operates on an EXISTING sub (no fresh order placed)
// and only acts if a "Ship Now!" button is available, else exits-pass. We keep that:
// find an existing sub whose Ship Now is available (skip the test if none), ship it,
// assert the success popup + that the next-order date advanced, then SELF-HEAL the date.
//
// ⚠️ PROD NOTE: "Ship Now" triggers an immediate subscription shipment — i.e. it DOES
// create a real order on prod (fulfillment is suppressed for the QA HQ address per the
// backend automation, which is why this is allowed on prod). It is the one spec here
// that places an order on prod. If that ever becomes undesirable, gate with
// `test.skip(brand.env === 'prod')`.
//
// Depth added over GI: asserts the ship WRITE call returns 2xx, the "You're all set!" /
// "Order Confirmed" success popup renders, the next-order date advanced to a different
// day, and the backend still lists the sub as active.

test.describe('Subscriptions - Ship Now', () => {
  test.slow();

  let pageObj = null;
  let snapshot = null; // { sfId, origIso }

  test('ship the next order now, verify confirmation + advanced date, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // Find the first sub whose "Ship Now!" is available. The button is only offered for
    // certain subscription states, so scan the dropdown; skip-pass if none qualify
    // (mirrors GI's exit-pass when no Ship Now button exists).
    const subs = await subPage.listSubscriptions();
    let chosen = null;
    for (let i = 0; i < subs.length; i++) {
      await subPage.selectSubscription({ index: i });
      if (await subPage.isShipNowAvailable()) { chosen = subs[i]; break; }
    }
    test.skip(!chosen, 'No subscription on this account currently offers "Ship Now!" — nothing to exercise.');

    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    // Snapshot the original date (ISO) for restore + the display for the advance assertion.
    await subPage.openDeliveryPayment();
    await subPage.openFrequencySection();
    const origIso = await subPage.getNextOrderDateInputValue();
    expect(origIso, 'next-order-date input should expose an ISO value').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    snapshot = { sfId, origIso };
    await subPage.editCloseBtn.click().catch(() => {});
    const origNextDisplay = await subPage.getNextOrderDateText();

    // --- Ship Now ---
    await subPage.openShipNowModal();
    const writeResp = await subPage.confirmShipNow();
    expect(writeResp.status(), 'ship-now write should be 2xx').toBeLessThan(300);
    await expect(subPage.shipSuccessText, 'success popup should confirm the order').toBeVisible({ timeout: 20000 });
    await subPage.closeShipSuccessPopup();

    // --- The next-order date should have advanced to a different day ---
    await expect
      .poll(async () => sameDisplayDate(await subPage.getNextOrderDateText(), origNextDisplay), { timeout: 15000 })
      .toBeFalsy();

    // --- Backend round-trip ---
    if (brand.testAccountId) {
      const all = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(all, 'after ship-now');
      expect(subApi.isPresent(all, { sfId, ssc }), 'sub should still be active after ship-now').toBeTruthy();
    } else {
      console.warn('[ship-now] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  // Self-heal: ship-now advanced the date — set it back to the original.
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
      console.warn(`[ship-now] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
    }
  });
});
