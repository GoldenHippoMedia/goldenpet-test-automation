const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

// GI: "Profile and Settings - Update Customer Information fields under Manage Account"
//
// The GI source edits First/Last/Phone, saves, asserts an optional success toast,
// reloads, re-reads the values, then resets them. This port keeps that intent and
// hardens it into a real, self-healing test:
//   - snapshots the account's CURRENT values first and restores them at the end
//     (and via afterEach on failure) so the shared tester+auto account is net-zero;
//   - asserts the backend PUT status AND its request body (the persisted contract);
//   - asserts the success toast;
//   - reloads and re-reads to prove PERSISTENCE (not just optimistic UI);
//   - adds a required-field validation check (empty field → inline error +
//     Save disabled + no PUT) that GI never covered;
//   - never mutates the EMAIL field — it's the login identity for this account.
//
// Runs on UAT + prod (GI's exit regex matches the drmartypets brand on both); the
// snapshot/restore keeps it safe to run against the live production record.

// Stable comparison key for a server-side address (ignores extra keys the GET adds).
const addrKey = (a) =>
  a ? [a.line1, a.line2 || '', a.city, a.regionCode, a.countryCode, a.postalCode].join('|') : '';

test.describe('Profile & Settings - Update Customer Information', () => {
  // One shared account — keep ordering deterministic.
  test.describe.configure({ mode: 'serial' });

  let originalInfo = null;

  test('updates name + phone, persists to backend, validates, then restores', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const account = new AccountDetailsPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await account.goto();

    // --- snapshot originals for a guaranteed restore (net-zero on shared account) ---
    originalInfo = await account.getCustomerInfo();
    console.log('[customer-info] originals:', originalInfo);
    expect(originalInfo.firstName, 'should read a non-empty current first name').toBeTruthy();
    expect(originalInfo.email, 'should read the current email (left untouched)').toBeTruthy();

    // Backend baseline — used to prove a customer-info edit doesn't touch the addresses.
    const before = await account.fetchAccount();

    const updated = { firstName: 'QaFirst', lastName: 'QaLast', phone: '18888765309' };

    // --- form validation: each REQUIRED field, cleared individually, must show the
    //     inline error AND disable Save (no PUT fires). Required = First + Last name.
    //     Phone and Email are OPTIONAL (audit-confirmed 2026-06-05) — clearing them
    //     does NOT block Save, so they're intentionally not asserted as required. ---
    await test.step('required-field validation (First + Last required; Phone/Email optional)', async () => {
      await account.enterCustomerEditMode();
      const requiredFields = [
        { label: 'First Name', input: account.firstNameInput, value: originalInfo.firstName },
        { label: 'Last Name',  input: account.lastNameInput,  value: originalInfo.lastName },
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

      // Optional field: clearing Phone must NOT block Save (and shows no required error).
      // (Email is optional too but is the login identity, so we don't clear it.)
      await account.phoneInput.fill('');
      await expect(account.saveBtn, 'Phone is optional — Save should stay enabled when empty').toBeEnabled();
      await account.phoneInput.fill(originalInfo.phone); // restore
    });

    // --- unsaved edits must be discarded on reload (no optimistic persistence) ---
    await test.step('unsaved edits do not persist after reload', async () => {
      await account.enterCustomerEditMode();
      await account.firstNameInput.fill('DISCARDME');
      await account.goto(); // navigate away WITHOUT clicking Save
      const afterReload = await account.getCustomerInfo();
      expect(afterReload.firstName, 'an unsaved First Name edit must not persist').toBe(originalInfo.firstName);
    });

    // --- mutate + save ---
    await account.setCustomerInfo(updated);
    const { response, requestBody, toastText } = await account.save();

    // backend: status + the PUT payload pins the persisted contract
    expect(response.status(), 'save PUT should succeed').toBeLessThan(300);
    expect(requestBody, 'save PUT should carry a JSON body').toBeTruthy();
    expect(requestBody.firstName).toBe(updated.firstName);
    expect(requestBody.lastName).toBe(updated.lastName);
    expect(requestBody.phone).toBe(updated.phone);
    expect(requestBody.id, 'payload account id should match the test account').toBe(brand.testAccountId);

    // toast (accept both copy variants seen across envs)
    expect(toastText, 'a success toast should appear after save').toBeTruthy();
    expect(toastText).toMatch(/successfully updated account|your profile has been updated/i);

    // --- API round-trip: the persisted account record reflects the change ---
    const persistedAcct = await account.fetchAccount();
    expect(persistedAcct.firstName).toBe(updated.firstName);
    expect(persistedAcct.lastName).toBe(updated.lastName);
    expect(persistedAcct.phone).toBe(updated.phone);
    expect(persistedAcct.email, 'email must be unchanged in the backend record').toBe(originalInfo.email);

    // --- cross-section integrity: a customer-info edit must NOT alter the saved
    //     addresses (one shared Save persists the whole record). ---
    expect(
      addrKey(persistedAcct.shippingAddress),
      'shipping address must be untouched by a customer-info edit'
    ).toBe(addrKey(before.shippingAddress));
    expect(
      addrKey(persistedAcct.billingAddress),
      'billing address must be untouched by a customer-info edit'
    ).toBe(addrKey(before.billingAddress));

    // --- UI round-trip: reload, re-read, prove persistence (not optimistic UI) ---
    await account.goto();
    const persisted = await account.getCustomerInfo();
    expect(persisted.firstName).toBe(updated.firstName);
    expect(persisted.lastName).toBe(updated.lastName);
    expect(persisted.phone).toBe(updated.phone);
    expect(persisted.email, 'email must remain untouched (login identity)').toBe(originalInfo.email);

    // --- restore + verify (happy path; afterEach is the failure safety net) ---
    await account.setCustomerInfo(originalInfo);
    const restore = await account.save();
    expect(restore.response.status(), 'restore PUT should succeed').toBeLessThan(300);

    await account.goto();
    const restored = await account.getCustomerInfo();
    expect(restored.firstName).toBe(originalInfo.firstName);
    expect(restored.lastName).toBe(originalInfo.lastName);
    expect(restored.phone).toBe(originalInfo.phone);

    originalInfo = null; // restored cleanly — tell afterEach there's nothing to fix
  });

  // Encoding regression: names with an accent, an apostrophe, and a hyphen must
  // round-trip through the form + API + Salesforce unchanged (no accent-stripping
  // or quote-escaping). Live-verified 2026-06-05 that these persist exactly.
  test('preserves special characters in name (accent, apostrophe, hyphen)', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const account = new AccountDetailsPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await account.goto();

    originalInfo = await account.getCustomerInfo();
    const special = { firstName: "Tëst-O'Brien", lastName: "D'Amoré" };

    await account.setCustomerInfo(special);
    const { response, requestBody } = await account.save();

    // PUT body carries the exact characters
    expect(response.status(), 'save PUT should succeed').toBeLessThan(300);
    expect(requestBody.firstName).toBe(special.firstName);
    expect(requestBody.lastName).toBe(special.lastName);

    // backend GET round-trip preserves them exactly (no stripping/escaping)
    const persisted = await account.fetchAccount();
    expect(persisted.firstName, 'accented/apostrophe first name must persist verbatim').toBe(special.firstName);
    expect(persisted.lastName, 'accented/apostrophe last name must persist verbatim').toBe(special.lastName);

    // restore
    await account.setCustomerInfo({ firstName: originalInfo.firstName, lastName: originalInfo.lastName });
    const restore = await account.save();
    expect(restore.response.status(), 'restore PUT should succeed').toBeLessThan(300);
    const restored = await account.fetchAccount();
    expect(restored.firstName).toBe(originalInfo.firstName);
    expect(restored.lastName).toBe(originalInfo.lastName);

    originalInfo = null;
  });

  test.afterEach(async ({ page, brand }) => {
    // Safety net: if the body threw before the in-test restore, force originals back.
    if (!originalInfo) return;
    if (!page.url().includes('/account-details')) return;
    const account = new AccountDetailsPage(page, brand);
    const cur = await account.getCustomerInfo().catch(() => null);
    if (!cur) return;
    if (
      cur.firstName !== originalInfo.firstName ||
      cur.lastName !== originalInfo.lastName ||
      cur.phone !== originalInfo.phone
    ) {
      console.log('[customer-info] afterEach restoring originals');
      await account.setCustomerInfo(originalInfo).catch(() => {});
      await account.save().catch(() => {});
    }
    originalInfo = null;
  });
});
