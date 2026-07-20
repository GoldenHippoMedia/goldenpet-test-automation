const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');
const { parseMoney } = require('../helpers/parse-money');

// GI: "Subscriptions - Update Quantity (Mike) (EXCLUDE PROD)".
//
// GI placed a fresh sub, changed its quantity, then cancelled it (hence EXCLUDE PROD —
// it placed a real order). This port instead operates on an EXISTING active sub and
// SELF-HEALS (snapshot qty -> change -> assert -> restore) without placing an order or
// leaving the shared account mutated — same discipline as the account-update-* specs.
// Gated UAT-only (see the env-matrix note below).
//
// Depth added over GI: asserts the update WRITE call returns 2xx (waitForSubscriptionWrite),
// the success toast, a reload/UI round-trip that the new qty persisted, and a backend GET
// round-trip that the sub is still active.

test.describe('Subscriptions - Update Quantity', () => {
  test.slow();

  // Prod runs NON-DESTRUCTIVE subscription checks only (guards + the shipping-address
  // read-only smoke). This spec mutates a real sub via self-heal, so it is UAT-only: the
  // write logic is identical on prod, and a failed prod self-heal could leave a real sub
  // with the wrong quantity. Same gate for drmarty + badlands. See CLAUDE.md "Subscription Management".
  test.skip(process.env.ENVIRONMENT === 'prod', 'UAT-only: mutating self-heal spec; prod subscription coverage is non-destructive only.');

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

    // Some subs (e.g. PayPal-funnel S&S) intentionally render without edit controls, so
    // index 0 isn't safe to assume — walk the dropdown for the first with an editable
    // quantity. On success the edit panel is already open.
    const chosen = await subPage.pickEditableSubscription({ needQuantityOptions: true });
    test.skip(!chosen, 'No subscription with an editable quantity (>=2 options) on this account.');
    const sfId = await subPage.getSelectedSfId();
    const ssc = await subPage.getSelectedSsc();
    test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

    const origQty = await subPage.getQuantity();
    snapshot = { sfId, origQty };

    const options = await subPage.listQuantities();
    const target = options.find((q) => q !== origQty);
    expect(target, `sub ${ssc} needs >=2 quantity options to test (got ${JSON.stringify(options)})`).toBeTruthy();
    // Industry-standard guard: offered quantities are always >= 1 (never 0 / negative).
    expect(Math.min(...options) >= 1, `all quantity options should be >= 1 (got ${JSON.stringify(options)})`).toBe(true);

    // --- Mutate: set a different quantity and Update ---
    await subPage.setQuantity(target);
    // The panel's "New Subtotal" reflects the new quantity — capture it so we can prove
    // the BACKEND persisted that exact subtotal (orderItems carries no quantity field;
    // subtotal is the reliable backend signal of a quantity change).
    const expectedSubtotal = parseMoney((await subPage.getSummary()).subtotalNew);
    // Independent recompute: New Subtotal vs the option's LIST unit price × new qty. A sub
    // can legitimately carry a coupon / S&S discount, so the CHARGED subtotal may be BELOW
    // list — tolerate that (soft-log) and rely on the backend-subtotal-persistence assert
    // below as the authoritative correctness check. Only an OVERCHARGE (subtotal ABOVE
    // list × qty) is a real mispricing bug → fail. (Confirmed live 2026-07-20: a DMP UAT sub
    // carried a 15% coupon, so list × qty > charged subtotal — expected, not a defect.)
    const unitPrice = await subPage.getSelectedQuantityUnitPrice();
    expect(unitPrice, 'selected quantity option should expose a "$X.XX / unit" price').toBeGreaterThan(0);
    const listSubtotal = unitPrice * target;
    if (expectedSubtotal - listSubtotal > 0.01) {
      expect(
        expectedSubtotal - listSubtotal,
        `New Subtotal (${expectedSubtotal}) exceeds list unit price ${unitPrice} × qty ${target} — overcharge`,
      ).toBeLessThan(0.01);
    } else if (listSubtotal - expectedSubtotal > 0.01) {
      console.warn(
        `[update-quantity] ${ssc}: New Subtotal ${expectedSubtotal} is below list ${listSubtotal} (unit ${unitPrice} × ${target}) — sub carries a discount/coupon; strict list-price recompute skipped (backend-subtotal persistence still asserted).`,
      );
    }
    // Order-summary math holds after the change (grand = subtotal + tax + shipping).
    await subPage.assertSummaryMath(expect);
    const writeResp = await subPage.clickUpdate();
    expect(writeResp.status(), 'quantity update write should be 2xx').toBeLessThan(300);
    // Success toast (tolerant copy — "Successfully updated..." / "...updated").
    await expect(subPage.toast()).toContainText(/updat|success/i, { timeout: 15000 });

    // --- UI round-trip: reload, reselect, confirm the new qty stuck ---
    await subPage.goto();
    await subPage.selectSubscription({ sfId });
    await subPage.openDeliveryPayment();
    expect(await subPage.getQuantity(), 'new quantity should persist after reload').toBe(target);

    // --- Backend round-trip: sub still active AND the new subtotal persisted ---
    if (brand.testAccountId) {
      const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
      subApi.logSubscriptionShape(subs, 'after qty update');
      const rec = subApi.findBySfId(subs, sfId);
      expect(rec, 'sub should be present in the backend').toBeTruthy();
      expect(rec.active, 'sub should still be active').toBe(true);
      if (expectedSubtotal != null && typeof rec.subtotal === 'number') {
        expect(
          Math.abs(rec.subtotal - expectedSubtotal),
          `backend subtotal (${rec.subtotal}) should match the new quantity's subtotal (${expectedSubtotal})`,
        ).toBeLessThan(0.01);
      }
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
