const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');

// GI: "Subscriptions - Update Quantity (Mike) (EXCLUDE PROD)".
//
// GI placed a fresh sub, changed its quantity, then cancelled it (hence EXCLUDE PROD —
// it placed a real order). This port instead operates on an EXISTING active sub and
// SELF-HEALS (snapshot qty -> change -> assert -> restore), so it runs on UAT *and*
// prod without placing an order or leaving the shared account mutated — same discipline
// as the account-update-* specs.
//
// Depth added over GI: asserts the update WRITE call returns 2xx (waitForSubscriptionWrite),
// the success toast, a reload/UI round-trip that the new qty persisted, and a backend GET
// round-trip that the sub is still active.

test.describe('Subscriptions - Update Quantity', () => {
  test.slow();

  // Restorable snapshot shared with afterEach self-heal.
  let pageObj = null;
  let snapshot = null; // { sfId, origQty }

  test('change subscription quantity, verify persistence, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // Operate on the first (newest) sub for determinism.
    await subPage.selectSubscription({ index: 0 });
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    await subPage.openDeliveryPayment();
    const origQty = await subPage.getQuantity();
    snapshot = { sfId, origQty };

    const options = await subPage.listQuantities();
    const target = options.find((q) => q !== origQty);
    expect(target, `sub ${ssc} needs >=2 quantity options to test (got ${JSON.stringify(options)})`).toBeTruthy();

    // --- Mutate: set a different quantity and Update ---
    await subPage.setQuantity(target);
    const writeResp = await subPage.clickUpdate();
    expect(writeResp.status(), 'quantity update write should be 2xx').toBeLessThan(300);
    // Success toast (tolerant copy — "Successfully updated..." / "...updated").
    await expect(subPage.toast()).toContainText(/updat|success/i, { timeout: 15000 });

    // --- UI round-trip: reload, reselect, confirm the new qty stuck ---
    await subPage.goto();
    await subPage.selectSubscription({ sfId });
    await subPage.openDeliveryPayment();
    expect(await subPage.getQuantity(), 'new quantity should persist after reload').toBe(target);

    // --- Backend round-trip: the sub is still in the active list ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after qty update'); // first-run: reveals the qty field name
      expect(subApi.isPresent(subs, { sfId, ssc }), 'sub should still be active in the backend').toBeTruthy();
    } else {
      console.warn('[update-quantity] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  // Self-heal: always restore the original quantity so the shared account ends net-zero.
  test.afterEach(async () => {
    if (!pageObj || !snapshot) return;
    try {
      await pageObj.goto();
      await pageObj.selectSubscription({ sfId: snapshot.sfId });
      await pageObj.openDeliveryPayment();
      if ((await pageObj.getQuantity()) !== snapshot.origQty) {
        await pageObj.setQuantity(snapshot.origQty);
        await pageObj.clickUpdate();
      }
    } catch (e) {
      console.warn(`[update-quantity] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
    }
  });
});
