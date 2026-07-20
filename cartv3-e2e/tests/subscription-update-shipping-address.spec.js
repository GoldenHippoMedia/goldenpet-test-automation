const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { SubscriptionEditPage } = require('../pages/subscription-edit.page');
const subApi = require('../helpers/subscription-api');
const CASES = require('../data/subscription-address-cases.json');

// NEW coverage — Ghost had no subscription shipping-address test. The editor's "Change"
// link (delivery section) opens the "Recipient Info" MODAL: a reused <address-form> with
// country / first+last name / street / additional / city / state / zip.
//
// Two layers, split by environment so we NEVER irreversibly mutate a real prod sub:
//  1. Full-form MUTATION test — UAT ONLY. Changes the whole recipient, asserts it persists
//     (UI reload + backend), then self-heals. Uses per-run UNIQUE values on the free-text
//     fields so a green assert proves a FRESH write landed (not a stale-state coincidence).
//  2. Read-only render/dropdown-swap SMOKE — PROD ONLY. Opens the form, asserts it renders
//     and the Country→State/Province swap works, then closes WITHOUT saving. Catches
//     prod-specific render/config bugs without touching data.
//
// Data-driven from data/subscription-address-cases.json (one mutation test() per country;
// run one with -g "United States" / -g "Canada"). The field-level validation matrix on
// this same component is covered by account-update-shipping-address.spec.js.
//
// KNOWN APP BUG (CART-9082): the Additional Address line (backend `line2`) can be SET but
// not CLEARED — emptying it drops the field from the PUT and the backend keeps the old
// value. So this spec asserts line2 SETS correctly and does NOT rely on clearing it back
// to empty. Remove these notes when CART-9082 ships.

// ===== 1) Full-form mutation test — UAT ONLY =====
for (const [country, data] of Object.entries(CASES)) {
  if (country === '_comment') continue;

  test.describe(`Subscriptions - Update Shipping Address (${country})`, () => {
    test.slow();

    let pageObj = null;
    let snapshot = null; // { sfId, original: <full recipient> }

    test('change the full delivery recipient, verify persistence, and restore', async ({ page, brand }) => {
      // Mutates + saves a real subscription. Self-heal restores it, but line2 can't be
      // reset (CART-9082), so keep this OFF prod — never irreversibly alter a real sub.
      test.skip(brand.env === 'prod', 'Mutation test is UAT-only; prod uses the read-only smoke.');

      const loginPage = new LoginPage(page, brand);
      const subPage = new SubscriptionEditPage(page, brand);
      pageObj = subPage;

      await loginPage.goto();
      await loginPage.login();
      await subPage.goto();

      const chosen = await subPage.pickEditableSubscription({ needDateInput: true });
      test.skip(!chosen, 'No editable subscription on this account.');
      const sfId = await subPage.getSelectedSfId();
      const ssc = await subPage.getSelectedSsc();
      test.info().annotations.push({ type: 'Subscription', description: `${ssc} (${sfId})` });

      test.skip(!(await subPage.hasShippingAddressForm()), 'This sub does not expose an editable delivery address.');

      // --- Snapshot the FULL original recipient (for the round-trip + self-heal) ---
      await subPage.openShippingAddressForm();
      const original = await subPage.getRecipient();
      expect(original.street, 'delivery street should be pre-filled').toBeTruthy();
      expect(original.country, 'delivery country should be pre-filled').toBeTruthy();
      snapshot = { sfId, original };

      // Per-run UNIQUE values on the free-text address fields so a green assert PROVES a
      // fresh write landed (it can't pass by coincidentally matching stale account state,
      // and it guards line2 specifically). Names stay fixed — the form rejects digits in
      // name fields. line2 is uniquified too (set works; we just never try to clear it).
      const runId = String(Date.now());
      const mutated = { ...data, street: `${data.street} ${runId}`, additional: `${data.additional} ${runId}` };

      await subPage.fillRecipient(mutated);

      // Country → State/Province dropdown swap (component behaviour, on the sub modal).
      const stateLabels = await subPage.getStateOptionLabels();
      expect(stateLabels, `${data.expectOptionPresent} should be offered for ${country}`).toContain(data.expectOptionPresent);
      expect(stateLabels, `${data.expectOptionAbsent} should NOT be offered for ${country}`).not.toContain(data.expectOptionAbsent);

      await subPage.commitRecipientModal();
      const writeResp = await subPage.clickUpdate();
      expect(writeResp.status(), 'shipping-address update write should be 2xx').toBeLessThan(300);
      await expect(subPage.toast()).toContainText(/updat|success/i, { timeout: 15000 });

      // --- UI round-trip: EVERY field persisted after a fresh reload ---
      await subPage.goto();
      await subPage.selectSubscription({ sfId });
      await subPage.openDeliveryPayment();
      await subPage.openFrequencySection();
      await subPage.openShippingAddressForm();
      const persisted = await subPage.getRecipient();
      expect(persisted.country, 'country persisted').toBe(mutated.country);
      expect(persisted.firstName, 'first name persisted').toBe(mutated.firstName);
      expect(persisted.lastName, 'last name persisted').toBe(mutated.lastName);
      expect(persisted.street, 'street persisted').toBe(mutated.street);
      expect(persisted.additional, 'additional line (line2) persisted').toBe(mutated.additional);
      expect(persisted.city, 'city persisted').toBe(mutated.city);
      expect(persisted.state, 'state persisted').toBe(mutated.state);
      expect(persisted.zip, 'zip persisted').toBe(mutated.zip);
      // Change-detection: the unique fields MUST differ from the original → proves a real
      // write landed rather than a stale-value match (this is what kills false positives).
      expect(persisted.street, 'street must differ from original — proves a real write').not.toBe(original.street);
      expect(persisted.additional, 'additional must differ from original — proves line2 actually wrote').not.toBe(original.additional);

      // --- Backend round-trip: the sub record carries the new (unique) values ---
      if (brand.testAccountId) {
        const subs = await subApi.fetchSubscriptions(page, { baseUrl: brand.baseUrl, accountId: brand.testAccountId });
        subApi.logSubscriptionShape(subs, `after full shipping-address update (${country})`);
        const rec = subApi.findBySfId(subs, sfId);
        expect(rec, 'sub should be present in the backend').toBeTruthy();
        expect(rec.active, 'sub should still be active').toBe(true);
        // Stringify the WHOLE record (name may live outside shippingAddress). Tokens are
        // unique per run, so a substring match is safe against false positives.
        const blob = JSON.stringify(rec);
        for (const token of [mutated.firstName, mutated.lastName, mutated.street, mutated.additional, mutated.city, mutated.zip]) {
          expect(blob.includes(token), `backend record should carry "${token}"`).toBe(true);
        }
      } else {
        console.warn('[update-shipping-address] brand.testAccountId not set — skipping backend GET assertion');
      }
    });

    test.afterEach(async () => {
      if (!pageObj || !snapshot) return;
      try {
        await pageObj.goto();
        await pageObj.selectSubscription({ sfId: snapshot.sfId });
        await pageObj.openDeliveryPayment();
        await pageObj.openFrequencySection();
        if (await pageObj.hasShippingAddressForm()) {
          await pageObj.openShippingAddressForm();
          const cur = await pageObj.getRecipient();
          // Restore if anything drifted from the snapshot (fillRecipient flips country
          // back FIRST, so the State/Province list is correct on restore).
          // NOTE (CART-9082): this restores every field EXCEPT clearing the Additional
          // Address line when the original was empty — the app can't clear line2 once set,
          // so a harmless leftover value remains. Remove this note when CART-9082 ships.
          if (cur.street !== snapshot.original.street || cur.country !== snapshot.original.country) {
            await pageObj.fillRecipient(snapshot.original);
            await pageObj.commitRecipientModal();
            await pageObj.clickUpdate();
          }
        }
      } catch (e) {
        console.warn(`[update-shipping-address] self-heal restore failed for ${snapshot.sfId}: ${e.message}`);
      }
    });
  });
}

// ===== 2) Read-only render + dropdown-swap smoke — PROD ONLY (no writes) =====
test.describe('Subscriptions - Delivery address form (read-only smoke)', () => {
  test.slow();

  test('address form renders and the country→state dropdown swaps (no save)', async ({ page, brand }) => {
    test.skip(brand.env !== 'prod', 'Read-only smoke runs on prod; UAT is covered by the full mutation test.');

    const loginPage = new LoginPage(page, brand);
    const subPage = new SubscriptionEditPage(page, brand);
    await loginPage.goto();
    await loginPage.login();
    await subPage.goto();

    const chosen = await subPage.pickEditableSubscription({ needDateInput: true });
    test.skip(!chosen, 'No editable subscription on this account.');
    test.skip(!(await subPage.hasShippingAddressForm()), 'This sub does not expose an editable delivery address.');

    await subPage.openShippingAddressForm();

    // Form renders.
    await expect(subPage.shipStreet, 'street input renders').toBeVisible();
    await expect(subPage.shipCountry, 'country select renders').toBeVisible();

    // Country offers US + Canada.
    const countries = await subPage.getCountryOptionLabels();
    expect(countries, 'US offered').toContain('United States');
    expect(countries, 'Canada offered').toContain('Canada');

    // Swap → US states (the list repopulates async, so poll).
    await subPage.fillRecipient({ country: 'US|United States' });
    await expect.poll(async () => (await subPage.getStateOptionLabels()).join('|'), { timeout: 8000 }).toContain('California');
    expect(await subPage.getStateOptionLabels(), 'no provinces under US').not.toContain('British Columbia');

    // Swap → Canadian provinces.
    await subPage.fillRecipient({ country: 'CA|Canada' });
    await expect.poll(async () => (await subPage.getStateOptionLabels()).join('|'), { timeout: 8000 }).toContain('British Columbia');
    expect(await subPage.getStateOptionLabels(), 'no US states under CAN').not.toContain('California');

    // Close WITHOUT saving — nothing is persisted (no modal commit, no panel Update).
    await subPage.closeRecipientModal();
  });
});
