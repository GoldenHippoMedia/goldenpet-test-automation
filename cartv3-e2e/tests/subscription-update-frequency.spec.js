const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');

// NEW coverage — Ghost had NO delivery-frequency test. The subscription editor lets you
// change the delivery cadence (`frequency-select`: Every week … Every year). This mirrors
// the quantity/date update specs: operate on an existing sub, self-heal (snapshot the
// frequency → change → assert → restore), no order placed. Gated UAT-only (env-matrix note below).
//
// Asserts: the update WRITE call is 2xx, the success toast, a reload/UI round-trip that
// the new cadence persisted, and a backend GET round-trip that `frequency` actually
// changed server-side (and the sub is still active).

test.describe('Subscriptions - Update Delivery Frequency', () => {
  test.slow();

  // Prod runs NON-DESTRUCTIVE subscription checks only (guards + the shipping-address
  // read-only smoke). This spec mutates a real sub via self-heal, so it is UAT-only: the
  // write logic is identical on prod, and a failed prod self-heal could leave a real sub
  // on the wrong cadence. Same gate for drmarty + badlands. See CLAUDE.md "Subscription Management".
  test.skip(process.env.ENVIRONMENT === 'prod', 'UAT-only: mutating self-heal spec; prod subscription coverage is non-destructive only.');

  let pageObj = null;
  let snapshot = null; // { sfId, origFreqLabel }

  test('change delivery frequency, verify persistence, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // needDateInput opens the panel + frequency section (where frequency-select lives).
    const chosen = await subPage.pickEditableSubscription({ needDateInput: true });
    test.skip(!chosen, 'No subscription with an editable delivery frequency on this account.');
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    const origFreqLabel = await subPage.getFrequency();
    snapshot = { sfId, origFreqLabel };

    const options = await subPage.listFrequencies();
    const target = options.find((f) => f !== origFreqLabel);
    expect(target, `sub ${ssc} needs >=2 frequency options (got ${JSON.stringify(options)})`).toBeTruthy();

    // Capture the original backend frequency so we can prove it actually changed.
    let origBackendFreq = null;
    if (brand.testAccountId) {
      const before = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      origBackendFreq = subApi.findBySfId(before, sfId)?.frequency ?? null;
    }

    // --- Mutate ---
    await subPage.setFrequency(target);
    // Order-summary math holds after the change (grand = subtotal + tax + shipping).
    await subPage.assertSummaryMath(expect);
    const writeResp = await subPage.clickUpdate();
    expect(writeResp.status(), 'frequency update write should be 2xx').toBeLessThan(300);
    await expect(subPage.toast()).toContainText(/updat|success/i, { timeout: 15000 });

    // --- UI round-trip ---
    await subPage.goto();
    await subPage.selectSubscription({ sfId });
    await subPage.openDeliveryPayment();
    await subPage.openFrequencySection();
    expect(await subPage.getFrequency(), 'new frequency should persist after reload').toBe(target);

    // --- Backend round-trip ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after frequency update');
      const rec = subApi.findBySfId(subs, sfId);
      expect(rec, 'sub should be present in the backend').toBeTruthy();
      expect(rec.active, 'sub should still be active').toBe(true);
      if (origBackendFreq != null) {
        expect(rec.frequency, `backend frequency should have changed from "${origBackendFreq}"`).not.toBe(origBackendFreq);
      }
    } else {
      console.warn('[update-frequency] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  test.afterEach(async () => {
    if (!pageObj || !snapshot) return;
    try {
      await pageObj.goto();
      await pageObj.selectSubscription({ sfId: snapshot.sfId });
      await pageObj.openDeliveryPayment();
      await pageObj.openFrequencySection();
      if ((await pageObj.getFrequency()) !== snapshot.origFreqLabel) {
        await pageObj.setFrequency(snapshot.origFreqLabel);
        await pageObj.clickUpdate();
      }
    } catch (e) {
      console.warn(`[update-frequency] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
    }
  });
});
