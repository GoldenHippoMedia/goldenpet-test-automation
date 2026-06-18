const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');

// GI: "Subscriptions - Cancel Subscription (Scott) (EXCLUDE PROD)".
//
// Cancel is an IRREVERSIBLE soft-delete (the SF active flag flips off), so — unlike the
// skip/update/ship specs — it can't self-heal an existing sub. It therefore creates a
// THROWAWAY subscription, cancels THAT, and asserts the cancellation. Because it places
// a real subscription order (which charges the card), it stays **UAT-only** and
// `@real-order`, exactly like GI's EXCLUDE-PROD gate.
//
// Flow: place a sub order -> find the newly-created sub -> Cancel Subscription Box ->
// /subscription-cancellation -> pick a reason -> "I still want to cancel" -> assert the
// sub drops out of the active list (UI) and the backend GET (active:false).
//
// Depth over GI (which only asserted the sub vanished from the list): also asserts the
// cancel WRITE call returns 2xx and the backend GET no longer lists the sub as active.

test.describe('Subscriptions - Cancel Subscription', () => {
  test.slow();

  // UAT-only: placing a real subscription order charges the card on prod. (GI: EXCLUDE PROD.)
  test.skip(
    process.env.ENVIRONMENT === 'prod',
    'Cancel places a real subscription order (charges the card) — UAT only (Braintree sandbox), matching GI EXCLUDE PROD.',
  );

  let pageObj = null;
  let createdSfId = null;

  test('cancel a freshly-placed subscription and verify it is removed', { tag: '@real-order' }, async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();

    // Snapshot existing subs so we can identify the one we're about to create.
    await subPage.goto();
    const beforeSscs = new Set((await subPage.listSubscriptions()).map((s) => s.ssc).filter(Boolean));

    // --- Place a subscription order (the disposable sub to cancel) ---
    await cartPage.addProductByKey('loggedin_sub_2');
    await cartPage.submitOrderButton.click();
    await checkoutPage.waitForOrderConfirmation();
    await expect(page).toHaveURL(/order-confirmation/);

    // --- Find the newly-created sub (the SSC not present before), polling for it to surface ---
    let created = null;
    await expect
      .poll(async () => {
        await subPage.goto();
        const list = await subPage.listSubscriptions();
        created = list.find((s) => s.ssc && !beforeSscs.has(s.ssc)) || null;
        return !!created;
      }, { timeout: 60000, message: 'newly-created subscription should appear in /subscription-edit' })
      .toBeTruthy();

    createdSfId = created.value;
    const ssc = created.ssc;
    test.info().annotations.push({ type: 'Subscription (to cancel)', description: `${ssc} (${createdSfId})` });

    // --- Cancel it ---
    await subPage.selectSubscription({ sfId: createdSfId });
    await subPage.openDeliveryPayment();
    await subPage.startCancel();

    // Cancellation page shows the matching subscription id.
    await expect(subPage.cancelPageSubId).toContainText(ssc, { timeout: 15000 });

    await subPage.selectCancelReason(); // "ANOTHER REASON - CANCEL NOW" (brand-configurable)
    const writeResp = await subPage.confirmCancel();
    expect(writeResp.status(), 'cancel write should be 2xx').toBeLessThan(300);

    // --- UI round-trip: the sub is gone from the active list ---
    await expect
      .poll(async () => {
        await subPage.goto();
        return (await subPage.listSubscriptions()).some((s) => s.ssc === ssc);
      }, { timeout: 30000, message: 'cancelled sub should disappear from the active list' })
      .toBeFalsy();

    // --- Backend round-trip: not in the active GET ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after cancel');
      expect(subApi.isPresent(subs, { ssc, sfId: createdSfId }), 'cancelled sub should not be active in the backend').toBeFalsy();
    } else {
      console.warn('[cancel] brand.testAccountId not set — skipping backend GET assertion');
    }

    createdSfId = null; // cancelled cleanly — afterEach has nothing to do
  });

  // Safety net: if the test failed AFTER creating the sub but BEFORE cancelling it, try
  // to cancel it via the UI so the shared account doesn't accumulate active test subs.
  test.afterEach(async () => {
    if (!pageObj || !createdSfId) return;
    try {
      await pageObj.goto();
      const still = (await pageObj.listSubscriptions()).find((s) => s.value === createdSfId);
      if (!still) return;
      await pageObj.selectSubscription({ sfId: createdSfId });
      await pageObj.openDeliveryPayment();
      await pageObj.startCancel();
      await pageObj.selectCancelReason();
      await pageObj.confirmCancel();
    } catch (e) {
      console.warn(`[cancel] afterEach safety cancel failed for ${createdSfId}: ${e.message}`);
    }
  });
});
