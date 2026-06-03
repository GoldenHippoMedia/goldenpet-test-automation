const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { PetsPage } = require('../pages/pets.page');

// Client-side validation on the Add Pet Profile form (/pets/create).
//
// Catches release regressions where required-field validation or the breed
// autocomplete check stops working — the kind of bug that lets users submit
// garbage in production. Verifies BOTH that submission is blocked (no POST
// fires) AND that the specific inline error messages render per field.
//
// Note: the Save button is always enabled (the form blocks on click via
// validation, it does NOT disable Save), so we assert on error messages and
// the absence of a POST — not on button enabled-state.
//
// Server-side validation (API returns 400 on bad payload) is NOT covered —
// that's the future api-tests/ suite's job.

const REQUIRED_FIELDS = ['Name', 'Sex', 'Breed', 'Birthday', 'Weight'];

test.describe('Pet Profiles - Form Validation', () => {
  test('blocks invalid submissions and shows the right inline errors', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const petsPage = new PetsPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await petsPage.goto();
    await petsPage.expectLoaded();
    await petsPage.clickAddProfile();

    // Watch for any POST to the pets endpoint — none should fire while invalid.
    let postCount = 0;
    page.on('request', req => {
      if (req.method() === 'POST' && /\/account-service\/proxy\/pets\/profile\//.test(req.url())) {
        postCount++;
      }
    });

    // === Case 1: empty form → Save blocked, every required-field error shown ===
    await petsPage.saveBtn.click();
    await page.waitForTimeout(500);

    expect(postCount, 'empty-form Save must not fire a POST').toBe(0);
    expect(page.url(), 'empty-form Save should not navigate away from the form').toContain('/pets/create');

    for (const field of REQUIRED_FIELDS) {
      await expect(
        petsPage.fieldRequiredError(field),
        `"${field} is required" error should be visible on empty submit`
      ).toBeVisible();
    }

    // === Case 2: fill name → its error clears; bad breed → "Invalid value" ===
    await petsPage.nameInput.fill('ValidationTest');
    await expect(
      petsPage.fieldRequiredError('Name'),
      '"Name is required" should clear once the name is filled'
    ).toHaveCount(0);

    // Type a breed but do NOT select from the autocomplete dropdown
    await petsPage.breedInput.click();
    await petsPage.breedInput.fill('NotARealBreed');
    await petsPage.weightInput.click(); // blur the breed field
    await expect(
      petsPage.invalidValueError,
      'typing breed without selecting from the dropdown should show "Invalid value"'
    ).toBeVisible({ timeout: 5000 });

    await petsPage.saveBtn.click();
    await page.waitForTimeout(500);
    expect(postCount, 'invalid-breed Save must not fire a POST').toBe(0);

    // === Case 3: fill everything validly → all errors clear ===
    await petsPage.breedInput.click();
    await petsPage.breedInput.fill('Mixed');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await petsPage.birthdayInput.fill('01/01/2011');
    await petsPage.weightInput.fill('20');
    await petsPage.maleRadio.click({ force: true });
    await petsPage.noHealthIssuesBtn.click();

    // Every required-field error and the "Invalid value" error should be gone.
    await expect(
      petsPage.invalidValueError,
      '"Invalid value" should clear after selecting a valid breed'
    ).toHaveCount(0);
    for (const field of REQUIRED_FIELDS) {
      await expect(
        petsPage.fieldRequiredError(field),
        `"${field} is required" should be gone once the form is valid`
      ).toHaveCount(0);
    }

    // Intentionally do NOT click Save — this test asserts validation only, so we
    // don't create a real profile that would need cleanup. (Happy-path submission
    // is covered by pets-create-profile.spec.js.)
  });
});
