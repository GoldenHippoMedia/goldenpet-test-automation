const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { PaymentDetailsPage } = require('../pages/payment-details.page');

// GI: "Manage Payments - Add Credit Card (Mike)"
//
// The GI source ONLY fills the Braintree form and stops — it never clicks Save
// or asserts anything (its own note: "The test credit card is not actually saved
// on the user account"). This port turns it into a real test: add a card, prove
// it persisted (UI list + count + backend POST), then delete that exact card.
//
// Scope (decodes GI's `/-int|au./` gate against the actual CAN/USA-only brand):
//   `-int` = the uat-INTegration environment, NOT "international". `au.` matches
//   nothing here. So the real intent is "UAT only, skip production" — which also
//   keeps us from submitting/storing card details on the production account.
//   Expressed idiomatically via ENVIRONMENT below.
//
// Identification & cleanup: a distinct 4242 card (brand.addCardTestCard) is used
// because last-4 "4242" is NOT among the cards already on the shared account
// (all 4111/0005). The new row is therefore uniquely findable for both the
// assertion and the afterEach delete. afterEach removes ALL 4242 rows (idempotent
// self-heal), so a prior failed run can't leave the card lingering.

test.describe('Manage Payments - Add Credit Card', () => {
  test.skip(
    process.env.ENVIRONMENT === 'prod',
    'Add Credit Card is a UAT-only check (GI ran only on the -int environment); we do not submit/store card details on production.'
  );

  test('adds a credit card and the backend persists it (then cleans up)', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const paymentPage = new PaymentDetailsPage(page, brand);

    const card = brand.addCardTestCard;
    expect(card.number, 'addCardTestCard must be configured for this env').toBeTruthy();
    const last4 = card.last4 || card.number.slice(-4);

    await loginPage.goto();
    await loginPage.login();

    await paymentPage.goto();

    // --- Self-heal: clear any stray 4242 card a prior failed run may have left ---
    const strays = await paymentPage.countCardsByLast4(last4);
    if (strays > 0) {
      console.log(`[payment-add-card] found ${strays} pre-existing ${last4} card(s) — clearing before test`);
      await paymentPage.removeAllCardsByLast4(last4);
    }

    const countBefore = await paymentPage.countCards();
    console.log(`[payment-add-card] saved methods before add: ${countBefore}`);

    // --- Add the card (returns the backend save POST) ---
    const saveResp = await paymentPage.addCard(card);

    // --- Assert: backend persisted it (server-side, not just an optimistic UI row) ---
    expect(saveResp.status(), 'add-card save POST should succeed').toBeLessThan(300);

    // --- Assert: the new card renders in My Card(s) with the correct last-4 ---
    // This is the definitive proof of "card added": before the add there were
    // zero 4242 rows (self-heal above guarantees it), so a single 4242 row now
    // means our card persisted to the saved-card list.
    const newRow = paymentPage.cardRowByLast4(last4);
    await expect(newRow, `a card ending in ${last4} should appear in My Card(s)`).toHaveCount(1);
    await expect(newRow.locator('[data-qa="card-details"]')).toContainText(last4);

    // --- Best-effort: success toast (logged so we can harden into an assertion) ---
    const toastText = await paymentPage.getToastText();
    if (toastText) {
      console.log(`[payment-add-card] toast after add: "${toastText}"`);
      expect(toastText, 'toast should not indicate an error').not.toMatch(/error|fail|invalid|declin/i);
    } else {
      console.log('[payment-add-card] no toast surfaced after add');
    }

    // Diagnostic only — the saved-card list WINDOWS its rendered rows (~49 of many
    // more), so a strict "total count + 1" is unreliable. The unique 4242-row
    // assertion above is the real signal; this just records the windowed count.
    console.log(`[payment-add-card] saved methods before=${countBefore}, after(windowed)=${await paymentPage.countCards()}`);

    // --- Delete flow, NEVERMIND (cancel) path: non-destructive ---
    // Open the remove modal on OUR card, click NEVERMIND, and confirm the modal
    // closes WITHOUT deleting the card.
    await paymentPage.openRemoveModalForLast4(last4);
    await expect(paymentPage.removeModalCancelBtn, 'remove modal should be open').toBeVisible();
    await paymentPage.cancelRemoveModal();
    await expect(paymentPage.removeModalCancelBtn, 'NEVERMIND should close the modal').toBeHidden();
    await expect(
      paymentPage.cardRowByLast4(last4),
      'NEVERMIND must cancel — the card must still be present'
    ).toHaveCount(1);

    // --- Delete flow, confirm path: removes the card + backend call + success toast ---
    await paymentPage.openRemoveModalForLast4(last4);
    const { response: deleteResp, toastText: deleteToast } = await paymentPage.confirmRemoveModal();

    // API: the backend delete call succeeded (server-side, like the add POST above).
    expect(deleteResp, 'a backend delete call should fire on confirm').toBeTruthy();
    expect(deleteResp.status(), 'delete call should succeed').toBeLessThan(300);

    // Green "successfully removed" toast (captured concurrently with the click,
    // ignoring the lingering add toast). Require REMOVAL wording — not generic
    // "success" — so a stale "added successfully" toast can't pass this.
    console.log(`[payment-add-card] toast after delete: ${deleteToast ? `"${deleteToast}"` : '(none surfaced)'}`);
    expect(deleteToast, 'a confirmation toast should appear after removing the card').toBeTruthy();
    expect(deleteToast, 'delete toast should indicate REMOVAL (not the add toast)').toMatch(/remov|delet/i);
    expect(deleteToast, 'delete toast should not indicate an error').not.toMatch(/error|fail|invalid/i);

    // The card is gone from My Card(s).
    await expect(
      paymentPage.cardRowByLast4(last4),
      'card should be gone after a confirmed remove'
    ).toHaveCount(0);
  });

  test.afterEach(async ({ page, brand }) => {
    // Remove the just-added card so it doesn't accumulate on the shared account.
    // Runs even on failure; only acts if the page is on /payment-details and a
    // 4242 row exists — never touches the pre-existing 4111/0005 cards.
    const card = brand.addCardTestCard;
    if (!card || !card.number) return;
    const last4 = card.last4 || card.number.slice(-4);

    if (!page.url().includes('/payment-details')) return;
    const paymentPage = new PaymentDetailsPage(page, brand);
    const remaining = await paymentPage.countCardsByLast4(last4).catch(() => 0);
    if (remaining > 0) {
      console.log(`[payment-add-card] cleanup: removing ${remaining} card(s) ending in ${last4}`);
      await paymentPage.removeAllCardsByLast4(last4);
      await expect(paymentPage.cardRowByLast4(last4)).toHaveCount(0);
    }
  });
});
