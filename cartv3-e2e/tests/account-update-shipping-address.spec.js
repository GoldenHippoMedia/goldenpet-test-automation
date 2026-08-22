const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

const CASES = require('../data/shipping-address-cases.json');

// GI: "Profile and Settings - Update Shipping Address fields under Manage Account"
//     (CAN + US — two separate GI tests).
//
// Data-driven: one test() per country in data/shipping-address-cases.json. Adding a
// country = adding a JSON entry, no test code. Run one case with -g "<Country>"
// (the npm scripts cartv3:account:shipping-{us,can}:uat do exactly that).
//
// The two GI tests differ only by country, which is why they share ONE parameterized
// page-object method (setShippingAddress). The meaningful behavioural difference is
// the Country -> State/Province dropdown swap (US states ⇄ CA provinces on the same
// <select>) and the postal format — both asserted below.
//
// Hardened beyond the thin GI steps (same pattern as the customer-info port):
//   - snapshots the account's CURRENT address first and restores it (the restore is
//     CRITICAL — it flips the country back to US so later runs aren't left Canadian);
//   - asserts the backend PUT status AND its shippingAddress request body;
//   - asserts the success toast;
//   - reloads + re-reads to prove persistence;
//   - required-field validation (empty street -> inline error + Save disabled).
//
// Runs on UAT + prod; snapshot/restore keeps the live record net-zero.

// "US|United States" -> { code: 'US', name: 'United States' }
function splitOption(value) {
  const [code, ...rest] = String(value).split('|');
  return { code, name: rest.join('|') };
}

// Stable comparison key for a server-side address (ignores extra keys the GET adds).
const addrKey = (a) =>
  a ? [a.line1, a.line2 || '', a.city, a.regionCode, a.countryCode, a.postalCode].join('|') : '';

test.describe('Profile & Settings - Update Shipping Address', () => {
  // One shared account — run countries sequentially so they don't fight the record.
  test.describe.configure({ mode: 'serial' });

  let currentOriginal = null;
  let currentName = null;

  for (const [countryName, data] of Object.entries(CASES)) {
    if (countryName.startsWith('_')) continue; // skip the JSON _comment key

    test(countryName, async ({ page, brand }) => {
      currentOriginal = null;
      currentName = countryName;
      const log = (...a) => console.log(`[shipping:${countryName}]`, ...a);

      const loginPage = new LoginPage(page, brand);
      const account = new AccountDetailsPage(page, brand);

      await loginPage.goto();
      await loginPage.login();
      await account.goto();

      // --- snapshot originals for a guaranteed restore ---
      const original = await account.getShippingAddress();
      currentOriginal = original;
      log('originals:', original);
      expect(original.street, 'should read a non-empty current street').toBeTruthy();

      // Backend baseline — used to prove a shipping edit doesn't touch customer info.
      const before = await account.fetchAccount();

      // --- Country -> State/Province dropdown swap (the meaningful CAN/US difference) ---
      await test.step(`country switch repopulates State/Province (${countryName})`, async () => {
        await account.enterShippingEditMode();
        await account.shipCountrySelect.selectOption(data.country);
        await account._waitForStateOption(data.state);
        const labels = await account.stateOptionLabels();
        expect(labels, `${data.expectOptionPresent} should be selectable for ${countryName}`)
          .toContain(data.expectOptionPresent);
        expect(labels, `${data.expectOptionAbsent} should NOT be selectable for ${countryName}`)
          .not.toContain(data.expectOptionAbsent);
      });

      // --- required-field validation: each REQUIRED field, cleared individually,
      //     must show the inline error AND disable Save. Street + Zip/Postal are required
      //     on every brand; Additional/Country/State are optional on every brand.
      //
      //     City is BRAND *and ENV* dependent for now (`brand.shippingCityRequired`, which
      //     the fixture resolves per env — a release reaches UAT before prod):
      //       drmarty  — required in BOTH envs (verified 2026-08-19). Matches billing and
      //                  /checkout, which always required it.
      //       badlands — required on UAT, NOT yet on prod (both verified 2026-08-19); prod
      //                  gets it next release. TODO (when fixed): collapse the config to
      //                  plain `true` — this file needs no change either way.
      //     Street's error assertion passes on BOTH brands, so this is a real per-brand
      //     validation difference, not a missing .invalid-message selector. ---
      const cityRequired = brand.shippingCityRequired;
      await test.step(
        `required-field validation (Street + Zip/Postal${cityRequired ? ' + City' : ''} required; others optional)`,
        async () => {
        const requiredFields = [
          { label: 'Street',     input: account.shipStreetInput, value: original.street },
          ...(cityRequired
            ? [{ label: 'City',  input: account.shipCityInput,   value: original.city }]
            : []),
          { label: 'Zip/Postal', input: account.shipPostalInput, value: original.zip },
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

        // Optional fields: clearing them must NOT block Save.
        const optionalFields = [
          { label: 'Additional', input: account.shipAdditionalInput, value: original.additional },
          ...(cityRequired
            ? []
            : [{ label: 'City',  input: account.shipCityInput,       value: original.city }]),
        ];
        for (const f of optionalFields) {
          await f.input.fill('');
          await expect(account.saveBtn, `${f.label} is optional — Save should stay enabled when empty`).toBeEnabled();
          await f.input.fill(f.value); // restore
        }
      });

      // --- fill the full address + save ---
      await account.setShippingAddress(data);
      const { response, requestBody, toastText } = await account.save();

      const c = splitOption(data.country);
      const s = splitOption(data.state);

      // backend: status + the shippingAddress payload pins the persisted contract
      expect(response.status(), 'save PUT should succeed').toBeLessThan(300);
      expect(requestBody, 'save PUT should carry a JSON body').toBeTruthy();
      const sa = requestBody.shippingAddress;
      expect(sa, 'payload should include shippingAddress').toBeTruthy();
      expect(sa.line1).toBe(data.street);
      expect(sa.line2).toBe(data.additional);
      expect(sa.city).toBe(data.city);
      expect(sa.countryCode).toBe(c.code);
      expect(sa.country).toBe(c.name);
      expect(sa.regionCode).toBe(s.code);
      expect(sa.region).toBe(s.name);
      expect(sa.postalCode).toBe(data.zip);

      // toast (accept both copy variants seen across envs)
      expect(toastText, 'a success toast should appear after save').toBeTruthy();
      expect(toastText).toMatch(/successfully updated account|your profile has been updated/i);

      // --- API round-trip: the persisted account record reflects the new address ---
      const persistedAcct = await account.fetchAccount();
      expect(persistedAcct.shippingAddress.line1).toBe(data.street);
      expect(persistedAcct.shippingAddress.city).toBe(data.city);
      expect(persistedAcct.shippingAddress.regionCode).toBe(s.code);
      expect(persistedAcct.shippingAddress.countryCode).toBe(c.code);
      expect(persistedAcct.shippingAddress.postalCode).toBe(data.zip);

      // --- cross-section integrity: a shipping edit must NOT alter customer info ---
      expect(persistedAcct.firstName, 'first name must be untouched by a shipping edit').toBe(before.firstName);
      expect(persistedAcct.lastName, 'last name must be untouched by a shipping edit').toBe(before.lastName);

      // --- UI round-trip: reload, re-read, prove persistence ---
      await account.goto();
      const persisted = await account.getShippingAddress();
      expect(persisted.country).toBe(data.country);
      expect(persisted.street).toBe(data.street);
      expect(persisted.additional).toBe(data.additional);
      expect(persisted.city).toBe(data.city);
      expect(persisted.state).toBe(data.state);
      expect(persisted.zip).toBe(data.zip);

      // --- restore + verify (happy path; afterEach is the failure safety net) ---
      await account.setShippingAddress(original);
      const restore = await account.save();
      expect(restore.response.status(), 'restore PUT should succeed').toBeLessThan(300);

      await account.goto();
      const restored = await account.getShippingAddress();
      expect(restored.country, 'shipping country must be restored').toBe(original.country);
      expect(restored.street, 'shipping street must be restored').toBe(original.street);
      expect(restored.state, 'shipping state must be restored').toBe(original.state);
      expect(restored.zip, 'shipping zip must be restored').toBe(original.zip);

      currentOriginal = null; // restored cleanly — afterEach has nothing to fix
    });
  }

  test.afterEach(async ({ page, brand }) => {
    // Safety net: if the body threw before the in-test restore, force originals back.
    // Critical for the Canada case — it must not leave the account on a CA address.
    if (!currentOriginal) return;
    if (!page.url().includes('/account-details')) return;
    const account = new AccountDetailsPage(page, brand);
    const cur = await account.getShippingAddress().catch(() => null);
    if (!cur) return;
    if (
      cur.country !== currentOriginal.country ||
      cur.street !== currentOriginal.street ||
      cur.state !== currentOriginal.state ||
      cur.zip !== currentOriginal.zip
    ) {
      console.log(`[shipping:${currentName}] afterEach restoring originals`);
      await account.setShippingAddress(currentOriginal).catch(() => {});
      await account.save().catch(() => {});
    }
    currentOriginal = null;
  });
});
