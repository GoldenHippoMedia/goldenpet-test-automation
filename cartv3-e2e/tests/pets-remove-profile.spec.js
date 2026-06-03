const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { PetsPage } = require('../pages/pets.page');
const { createPetProfile, removePetProfile, uniquePetName } = require('../helpers/pet-profile-api');

// GI: "Pet Profiles - Remove Existing Profile"
// Logged-in user removes a pet profile through the UI.
//
// Setup is via API (createPetProfile). The test exercises the UI REMOVE
// + confirm dialog and asserts the backing PUT.
//
// IMPORTANT: REMOVE is a SOFT DELETE (PUT {id, active:false}) — records
// persist in the DB. We pin that contract by asserting the request body
// shape, so any future flip to hard-delete or field rename fails loudly
// at release time.

test.describe('Pet Profiles - Remove Existing Profile', () => {
  let petId = null;
  const petName = uniquePetName();

  test.beforeEach(async ({ page, brand }) => {
    test.skip(!brand.testAccountId, 'brand.testAccountId not configured');

    // UI login first so the browser session passes Cloudflare. Subsequent API
    // calls run via page.evaluate(fetch) to inherit that trusted context.
    const loginPage = new LoginPage(page, brand);
    await loginPage.goto();
    await loginPage.login();

    const created = await createPetProfile(page, {
      baseUrl: brand.baseUrl,
      accountId: brand.testAccountId,
      name: petName,
    });
    petId = created.id;
  });

  test.afterEach(async ({ page, brand }) => {
    // The test itself removes — but if anything failed before the click,
    // clean up so we don't leak records on the shared account.
    if (petId) {
      await removePetProfile(page, { baseUrl: brand.baseUrl, petId });
      petId = null;
    }
  });

  test('remove modal: renders pet name, Contact Us routes to /contact, then removes (soft-delete)', async ({ page, brand }) => {
    const petsPage = new PetsPage(page, brand);

    await petsPage.goto();
    await petsPage.expectLoaded();
    await expect(petsPage.profileCard(petName)).toBeVisible();

    // === Part 1: open modal, verify copy + Contact Us routing ===
    // Contact Us is checked FIRST because the actual removal (Part 2) destroys
    // the profile — so the modal can only be re-opened while the pet still exists.
    await petsPage.removeButton(petName).click();
    await petsPage.confirmRemoveBtn.waitFor({ state: 'visible' });

    // UI: confirmation modal renders the correct pet name in its copy
    // ("This will remove {petName}'s information from your account.")
    await expect(petsPage.removeDialog, 'remove modal should name the pet being removed')
      .toContainText(`This will remove ${petName}'s information from your account`);

    // UI: "Contact Us" → same-tab navigation to /contact
    await petsPage.contactUsBtn.click();
    await page.waitForURL(/\/contact/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/contact/);

    // === Part 2: back to /pets, actually remove the profile ===
    await petsPage.goto();
    await petsPage.expectLoaded();
    await expect(petsPage.profileCard(petName), 'profile should still exist (Contact Us did not remove it)')
      .toBeVisible();

    await petsPage.removeButton(petName).click();
    await petsPage.confirmRemoveBtn.waitFor({ state: 'visible' });

    // API + UI: assert PUT {active:false} fires
    const [removeResp] = await Promise.all([
      page.waitForResponse(
        r => /\/account-service\/proxy\/pets\/profile\//.test(r.url())
          && r.request().method() === 'PUT',
        { timeout: 15000 }
      ),
      petsPage.confirmRemoveBtn.click(),
    ]);

    expect(removeResp.status(), 'remove PUT should return 200').toBe(200);

    // Pin the soft-delete contract: body must be exactly {id, active:false}
    const sentBody = removeResp.request().postDataJSON();
    expect(sentBody.id, 'request body id should match the pet being removed').toBe(petId);
    expect(sentBody.active, 'remove must send active:false (soft delete contract)').toBe(false);

    // Mark as already removed so afterEach doesn't double-call
    petId = null;

    // UI: card is no longer in the list
    await expect(petsPage.profileCard(petName)).toHaveCount(0);
  });
});
