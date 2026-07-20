const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');
const { sameDisplayDate } = require('../helpers/subscription-dates');

// GI: "Subscriptions - Ship Now Button (Scott)" (the non-GMD variant; the GMD
// `/sub-history` variant is intentionally out of scope — that brand is retired).
//
// Operates on an EXISTING sub and only acts if a "Ship Now!" button is available, else
// exits-pass: find such a sub (skip the test if none), ship it, assert the success popup +
// that the next-order date advanced, then SELF-HEAL the date.
//
// ⚠️ UAT-ONLY: "Ship Now" triggers an immediate subscription shipment — i.e. it places a
// REAL order. On UAT that's Braintree sandbox (safe). It is gated OFF prod (test.skip below)
// under the env policy that prod subscription coverage is NON-DESTRUCTIVE only. Brand-agnostic
// gate (drmarty + badlands): even though DMP's QA HQ address suppresses fulfillment and orders
// auto-refund, badlands' nets are unconfirmed — so for brand consistency + safety NEITHER brand
// ships on prod. See CLAUDE.md "Subscription Management" env matrix.
//
// Depth added over GI: asserts the ship WRITE call returns 2xx, the "You're all set!" /
// "Order Confirmed" success popup renders, the next-order date advanced to a different
// day, and the backend still lists the sub as active.

test.describe('Subscriptions - Ship Now', () => {
  test.slow();

  // Prod runs NON-DESTRUCTIVE subscription checks only (guards + the shipping-address
  // read-only smoke). Ship Now places a REAL order, so it is UAT-only (Braintree sandbox).
  // Same gate for drmarty + badlands (BLR's refund/suppression nets are unconfirmed). See
  // CLAUDE.md "Subscription Management".
  test.skip(process.env.ENVIRONMENT === 'prod', 'UAT-only: Ship Now places a real order; prod subscription coverage is non-destructive only.');

  let pageObj = null;
  let snapshot = null; // { sfId, origIso }

  test('ship the next order now, verify confirmation + advanced date, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // Find a sub that BOTH offers "Ship Now!" AND has an editable date (needed to restore
    // it afterward). Scan the dropdown; skip-pass if none qualify (mirrors GI's exit-pass
    // when no Ship Now button exists).
    const chosen = await subPage.pickEditableSubscription({ needShipNow: true, needDateInput: true });
    test.skip(!chosen, 'No subscription offering "Ship Now!" with an editable date on this account.');

    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    // Panel + frequency section already open — snapshot the date (ISO for restore + the
    // display for the advance assertion), then collapse back to the summary.
    const origIso = await subPage.getNextOrderDateInputValue();
    expect(origIso, 'next-order-date input should expose an ISO value').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    snapshot = { sfId, origIso };
    await subPage.closeEdit();
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

    // --- Backend round-trip: sub still active AND the next-order date advanced ---
    if (brand.testAccountId) {
      const all = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(all, 'after ship-now');
      const rec = subApi.findBySfId(all, sfId);
      expect(rec, 'sub should be present in the backend').toBeTruthy();
      expect(rec.active, 'sub should still be active after ship-now').toBe(true);
      expect(
        subApi.nextOrderDatePart(rec),
        `backend next-order date should have advanced after ship-now (was ${snapshot.origIso})`,
      ).not.toBe(snapshot.origIso);
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
