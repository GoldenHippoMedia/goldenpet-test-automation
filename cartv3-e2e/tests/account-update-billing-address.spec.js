const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

const CASES = require('../data/billing-address-cases.json');

// NO Ghost Inspector source — net-new coverage for the "Different Billing Address"
// toggle on /account-details (Manage Account), discovered during the Profile &
// Settings audit. The GI Profile & Settings tests only covered customer info +
// shipping; this closes the billing gap.
//
// Data-driven: one test() per country in data/billing-address-cases.json (run one
// with -g "<Country>"; npm scripts cartv3:account:billing-{us,can}:uat do that).
//
// Behaviour pinned from the live DOM + API (2026-06-04/05):
//   - The toggle is a hidden checkbox inside a clickable <label> ("Different
//     Billing Address"); default OFF.
//   - Toggling on reveals a REUSED <address-form data-qa="billing-address-form">
//     whose inputs use a distinct "-billing" suffix (ship-*-billing) — no selector
//     collision with shipping — and whose Country->State/Province dropdown swaps
//     the same way shipping's does.
//   - The save PUT /account-service/proxy/account/{id} carries a `billingAddress`
//     block (same shape as shippingAddress) while the toggle is on, and the backend
//     PERSISTS it (verified via a follow-up account GET).
//   - IMPORTANT: the toggle's on/off state is NOT persisted — the account record has
//     no "use different billing" flag, and the page always loads with the toggle OFF
//     even when a distinct billingAddress exists. So the reliable persistence/
//     round-trip + cleanup contract is the account GET's `billingAddress`, NOT the
//     toggle's reload state. (Toggle not re-surfacing a saved billing looks like a UX
//     bug — flagged in CLAUDE.md.)
//
// The "clean" state for the shared account is billingAddress == shippingAddress.
// Each test snapshots, mutates, and restores to that, keying every check off the
// backend record. Self-healing keeps it net-zero after a crash. Runs UAT + prod.

const splitOption = (v) => { const [code, ...rest] = String(v).split('|'); return { code, name: rest.join('|') }; };

// Stable comparison key for a server-side address object.
const addrKey = (a) =>
  a ? [a.line1, a.line2 || '', a.city, a.regionCode, a.countryCode, a.postalCode].join('|') : '';

// Convert a server address into the UI shape setBillingAddress expects.
const toUiAddress = (a) => ({
  country: `${a.countryCode}|${a.country}`,
  street: a.line1,
  additional: a.line2 || '',
  city: a.city,
  state: `${a.regionCode}|${a.region}`,
  zip: a.postalCode,
});

test.describe('Profile & Settings - Different Billing Address', () => {
  test.describe.configure({ mode: 'serial' });

  let dirty = false;
  let currentName = null;

  for (const [countryName, data] of Object.entries(CASES)) {
    if (countryName.startsWith('_')) continue; // skip the JSON _comment key

    test(countryName, async ({ page, brand }) => {
      dirty = false;
      currentName = countryName;
      const log = (...a) => console.log(`[billing:${countryName}]`, ...a);

      const loginPage = new LoginPage(page, brand);
      const account = new AccountDetailsPage(page, brand);

      await loginPage.goto();
      await loginPage.login();
      await account.goto();

      // --- snapshot persisted state; self-heal if a prior run left billing != shipping ---
      const acct = await account.fetchAccount();
      const shipping = acct.shippingAddress;
      log('shipping snapshot:', addrKey(shipping), '| billing:', addrKey(acct.billingAddress));
      if (addrKey(acct.billingAddress) !== addrKey(shipping)) {
        log('pre-existing distinct billing — neutralizing to shipping first');
        await account.setDifferentBilling(true);
        await account.setBillingAddress(toUiAddress(shipping));
        await account.save();
        await account.goto();
      }

      await account.setDifferentBilling(true);
      dirty = true;

      // --- Country -> State/Province dropdown swap on the BILLING form ---
      await test.step(`billing country switch repopulates State/Province (${countryName})`, async () => {
        await account.enterBillingEditMode();
        await account.billCountrySelect.selectOption(data.country);
        await account._waitForSelectOption('ship-state-billing', data.state);
        const labels = await account.billingStateOptionLabels();
        expect(labels, `${data.expectOptionPresent} should be selectable for ${countryName}`)
          .toContain(data.expectOptionPresent);
        expect(labels, `${data.expectOptionAbsent} should NOT be selectable for ${countryName}`)
          .not.toContain(data.expectOptionAbsent);
      });

      // --- required-field validation on the billing sub-form: each REQUIRED field,
      //     cleared individually, must show the inline error AND disable Save.
      //     Billing required = Street + City + Zip/Postal (audit-confirmed 2026-06-05).
      //     NOTE: this differs from SHIPPING, where City is OPTIONAL — the reused
      //     <address-form> validates City differently per instance. Additional /
      //     Country / State are optional on billing. ---
      await test.step('required-field validation (billing: Street + City + Zip/Postal required; Additional optional)', async () => {
        const requiredFields = [
          { label: 'billing Street',     input: account.billStreetInput, value: shipping.line1 },
          { label: 'billing City',       input: account.billCityInput,   value: shipping.city },
          { label: 'billing Zip/Postal', input: account.billPostalInput, value: shipping.postalCode },
        ];
        for (const f of requiredFields) {
          await f.input.fill('');
          await expect(
            account.invalidMessage('This field is required').first(),
            `${f.label} empty should surface the inline required error`
          ).toBeVisible();
          await expect(account.saveBtn, `Save should disable while ${f.label} is empty`).toBeDisabled();
          await f.input.fill(f.value); // restore validity before testing the next field
          await expect(account.saveBtn, `Save should re-enable once ${f.label} is valid`).toBeEnabled();
        }

        // Optional billing field: clearing Additional must NOT block Save.
        await account.billAdditionalInput.fill('');
        await expect(account.saveBtn, 'billing Additional is optional — Save should stay enabled').toBeEnabled();
        await account.billAdditionalInput.fill(shipping.line2 || ''); // restore
      });

      // --- fill the distinct billing address + save ---
      await account.setBillingAddress(data);
      const { response, requestBody, toastText } = await account.save();

      const c = splitOption(data.country);
      const s = splitOption(data.state);

      // backend: status + the billingAddress payload pins the contract being sent
      expect(response.status(), 'save PUT should succeed').toBeLessThan(300);
      expect(requestBody, 'save PUT should carry a JSON body').toBeTruthy();
      const ba = requestBody.billingAddress;
      expect(ba, 'payload should include billingAddress when the toggle is on').toBeTruthy();
      expect(ba.line1).toBe(data.street);
      expect(ba.line2).toBe(data.additional);
      expect(ba.city).toBe(data.city);
      expect(ba.countryCode).toBe(c.code);
      expect(ba.country).toBe(c.name);
      expect(ba.regionCode).toBe(s.code);
      expect(ba.region).toBe(s.name);
      expect(ba.postalCode).toBe(data.zip);
      expect(ba.line1, 'billing must differ from shipping in the payload').not.toBe(requestBody.shippingAddress.line1);

      // toast
      expect(toastText, 'a success toast should appear after save').toBeTruthy();
      expect(toastText).toMatch(/successfully updated account|your profile has been updated/i);

      // --- round-trip via the backend GET (toggle state isn't persisted; this is) ---
      const after = await account.fetchAccount();
      expect(after.billingAddress, 'account record should hold a billingAddress').toBeTruthy();
      expect(after.billingAddress.line1).toBe(data.street);
      expect(after.billingAddress.line2).toBe(data.additional);
      expect(after.billingAddress.city).toBe(data.city);
      expect(after.billingAddress.regionCode).toBe(s.code);
      expect(after.billingAddress.countryCode).toBe(c.code);
      expect(after.billingAddress.postalCode).toBe(data.zip);
      expect(
        addrKey(after.billingAddress),
        'persisted billing must differ from persisted shipping'
      ).not.toBe(addrKey(after.shippingAddress));

      // cross-section integrity: editing billing must NOT alter the shipping address
      expect(
        addrKey(after.shippingAddress),
        'shipping address must be untouched by a billing edit'
      ).toBe(addrKey(shipping));

      // Document (don't fail on) the observed UI quirk: the toggle does not persist.
      await account.goto();
      log(`toggle state after reload (not persisted by app): ${await account.isDifferentBillingOn()}`);

      // --- restore: set billing back to shipping; verify backend equal ---
      await account.setDifferentBilling(true);
      await account.setBillingAddress(toUiAddress(shipping));
      const restore = await account.save();
      expect(restore.response.status(), 'restore PUT should succeed').toBeLessThan(300);

      const restored = await account.fetchAccount();
      expect(
        addrKey(restored.billingAddress),
        'billing must be restored to equal shipping'
      ).toBe(addrKey(restored.shippingAddress));

      dirty = false; // restored cleanly — afterEach has nothing to fix
    });
  }

  test.afterEach(async ({ page, brand }) => {
    if (!dirty) return;
    if (!page.url().includes('/account-details')) return;
    const account = new AccountDetailsPage(page, brand);
    const acct = await account.fetchAccount().catch(() => null);
    if (acct && addrKey(acct.billingAddress) !== addrKey(acct.shippingAddress)) {
      console.log(`[billing:${currentName}] afterEach neutralizing billing back to shipping`);
      await account.setDifferentBilling(true).catch(() => {});
      await account.setBillingAddress(toUiAddress(acct.shippingAddress)).catch(() => {});
      await account.save().catch(() => {});
    }
    dirty = false;
  });
});
