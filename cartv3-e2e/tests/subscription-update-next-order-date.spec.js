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
// Self-heals (snapshot the ISO value -> set a new date -> assert -> restore); no order
// placed. Gated UAT-only (see the env-matrix note below).

test.describe('Subscriptions - Update Next Order Date', () => {
  test.slow();

  // Prod runs NON-DESTRUCTIVE subscription checks only (guards + the shipping-address
  // read-only smoke). This spec mutates a real sub via self-heal, so it is UAT-only: the
  // write logic is identical on prod, and a failed prod self-heal could leave a real sub
  // mis-scheduled. Same gate for drmarty + badlands. See CLAUDE.md "Subscription Management".
  test.skip(process.env.ENVIRONMENT === 'prod', 'UAT-only: mutating self-heal spec; prod subscription coverage is non-destructive only.');

  let pageObj = null;
  let snapshot = null; // { sfId, origIso }

  test('change the next order date, verify persistence, and restore', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    // Walk the dropdown for the first sub with an editable next-order date (some subs
    // lack edit controls). On success the edit panel + frequency section are already open.
    const chosen = await subPage.pickEditableSubscription({ needDateInput: true });
    test.skip(!chosen, 'No subscription with an editable next-order date on this account.');
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

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

    // --- Backend round-trip: sub still active AND the new date persisted ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after date update');
      const rec = subApi.findBySfId(subs, sfId);
      expect(rec, 'sub should be present in the backend').toBeTruthy();
      expect(rec.active, 'sub should still be active').toBe(true);
      expect(
        subApi.nextOrderDatePart(rec),
        `backend nextOrderDateTime date-part should equal the date we set (${newIso})`,
      ).toBe(newIso);
    } else {
      console.warn('[update-next-order-date] brand.testAccountId not set — skipping backend GET assertion');
    }
  });

  // NEGATIVE / validation coverage — the next-order date is an <input type="date"> with
  // declared min (no earlier than ~tomorrow) and max (~6 months out). A subscription
  // shipment can't be scheduled in the past, so out-of-range dates must be rejected.
  // Nothing is submitted here, so there's no state to restore (snapshot left null →
  // afterEach no-ops).
  test('rejects out-of-range next order dates (past / today / beyond max)', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    pageObj = subPage;
    snapshot = null; // nothing to self-heal — never submits

    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    const chosen = await subPage.pickEditableSubscription({ needDateInput: true });
    test.skip(!chosen, 'No subscription with an editable next-order date on this account.');

    // 1) The control declares sane bounds: min not in the past, max after min.
    const { min, max } = await subPage.getNextOrderDateBounds();
    const todayIso = new Date().toISOString().slice(0, 10);
    expect(min, 'date input should declare a min').toBeTruthy();
    expect(max, 'date input should declare a max').toBeTruthy();
    expect(min >= todayIso, `min (${min}) must not be in the past (today ${todayIso})`).toBe(true);
    expect(max > min, `max (${max}) must be after min (${min})`).toBe(true);

    // 2) A PAST date (one day before min — i.e. today or earlier) is flagged out-of-range,
    //    and Update cannot be triggered for it (stays disabled even after acknowledging terms).
    await subPage.setNextOrderDateInput(addDaysIso(min, -1));
    expect(
      (await subPage.getNextOrderDateValidity()).rangeUnderflow,
      'a date before min should be flagged rangeUnderflow',
    ).toBe(true);
    await subPage.agreeCheckbox.click({ timeout: 5000 }).catch(() => {});
    await expect(subPage.updateBtn, 'Update must stay disabled for a past date').toBeDisabled();

    // 3) A date BEYOND max is likewise rejected.
    await subPage.setNextOrderDateInput(addDaysIso(max, 1));
    expect(
      (await subPage.getNextOrderDateValidity()).rangeOverflow,
      'a date after max should be flagged rangeOverflow',
    ).toBe(true);
    await expect(subPage.updateBtn, 'Update must stay disabled for a date beyond max').toBeDisabled();
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
