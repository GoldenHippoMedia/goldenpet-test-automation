const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { PetsPage } = require('../pages/pets.page');
const { createPetProfile, removePetProfile, uniquePetName } = require('../helpers/pet-profile-api');

// GI: "Pet Profiles - Edit Existing Profile"
// Logged-in user edits an existing pet profile through the UI.
//
// Setup is via the API (createPetProfile) so the UI flow under test is the
// EDIT, not the create. Per-field coverage: each editable field (name, sex,
// weight, health issues) is changed and verified end-to-end. Immutable-by-this-
// test fields (breed, birthday) are asserted preserved.
//
// Randomization: setup sex, target sex (flipped from setup), target weight, and
// target health issues all vary per run. Inputs logged so any failure is repro.

const ALL_HEALTH_ISSUES = [
  'Anxiousness', 'Bad Breath', 'Chews Paws', 'Constipation', 'Ear Issues',
  'Food Allergies', 'Gluten Sensitivity', 'Grain Sensitivity', 'Hyperactivity',
  'Itchiness', 'Joint Issues', 'Low Energy', 'Messy Poop', 'Passes Gas',
  'Seasonal Allergies', 'Skin & Coat Issues', 'Tear Stains', 'Urinary Problems',
  'Vomiting',
];

function pickRandom(arr, n) {
  const copy = [...arr];
  const picks = [];
  for (let i = 0; i < n && copy.length; i++) {
    picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return picks;
}

test.describe('Pet Profiles - Edit Existing Profile', () => {
  let petId = null;
  const originalName = uniquePetName();
  const editedName   = `Edited-${originalName}`;

  // Setup uses a random sex so flipping it covers both directions over runs.
  const SETUP_SEX = Math.random() < 0.5 ? 'Male' : 'Female';
  const NEW_SEX   = SETUP_SEX === 'Male' ? 'Female' : 'Male';
  const NEW_WEIGHT_NUM = 15 + Math.floor(Math.random() * 65); // 15-79
  const NEW_WEIGHT     = String(NEW_WEIGHT_NUM);
  // Always pick 2-3 health issues on edit — setup left it at none, so this
  // guarantees a visible "none → some" change that the card assertion catches.
  const NEW_HEALTH_ISSUES = pickRandom(ALL_HEALTH_ISSUES, 2 + Math.floor(Math.random() * 2));

  test.beforeEach(async ({ page, brand }) => {
    test.skip(!brand.testAccountId, 'brand.testAccountId not configured');

    console.log('[pets-edit] randomized targets:', JSON.stringify({
      setupSex: SETUP_SEX, newSex: NEW_SEX, newWeight: NEW_WEIGHT, newHealth: NEW_HEALTH_ISSUES,
    }));

    // UI login first so the browser session passes Cloudflare. Subsequent API
    // calls run via page.evaluate(fetch) to inherit that trusted context.
    const loginPage = new LoginPage(page, brand);
    await loginPage.goto();
    await loginPage.login();

    const created = await createPetProfile(page, {
      baseUrl: brand.baseUrl,
      accountId: brand.testAccountId,
      name: originalName,
      overrides: { sex: SETUP_SEX },
    });
    petId = created.id;
  });

  test.afterEach(async ({ page, brand }) => {
    if (petId) {
      await removePetProfile(page, { baseUrl: brand.baseUrl, petId });
      petId = null;
    }
  });

  test('edits every field via the UI and backend persists each change', async ({ page, brand }) => {
    const petsPage = new PetsPage(page, brand);

    await petsPage.goto();
    await petsPage.expectLoaded();
    await expect(petsPage.profileCard(originalName)).toBeVisible();

    // Click the pencil-icon edit button → form at /pets/edit/{petId}
    await petsPage.editButton(originalName).click();
    await page.waitForURL(new RegExp(`/pets/edit/${petId}`), { timeout: 10000 });
    await expect(page).toHaveTitle(/Edit Pet Profile/i);
    await petsPage.nameInput.waitFor({ state: 'visible' });

    // --- Edit every editable field (flipped/randomized vs setup) ---
    await petsPage.nameInput.fill(editedName);
    const newSexRadio = NEW_SEX === 'Female' ? petsPage.femaleRadio : petsPage.maleRadio;
    await newSexRadio.click({ force: true });
    await petsPage.weightInput.fill(NEW_WEIGHT);

    // Health issues: API setup left this at []. Pick the randomized 2-3 tiles.
    await petsPage.selectHealthIssues(NEW_HEALTH_ISSUES);

    // --- API + UI: capture the PUT that fires on Save ---
    const [editResp] = await Promise.all([
      page.waitForResponse(
        r => /\/account-service\/proxy\/pets\/profile\//.test(r.url())
          && r.request().method() === 'PUT',
        { timeout: 15000 }
      ),
      petsPage.saveBtn.click(),
    ]);

    expect(editResp.status(), 'edit PUT should return 200').toBe(200);

    // Request body: every edited field present + immutable fields preserved
    const sentBody = editResp.request().postDataJSON();
    expect(sentBody.id,                            'request body id').toBe(petId);
    expect(sentBody.name,                          'request body name').toBe(editedName);
    expect(sentBody.sex,                           'request body sex').toBe(NEW_SEX);
    expect(sentBody.weight?.current,               'request body weight.current').toBe(NEW_WEIGHT_NUM);
    expect(sentBody.healthConditions,              'request body healthConditions').toEqual(NEW_HEALTH_ISSUES);
    // Untouched-by-this-test fields should NOT be silently wiped
    expect(sentBody.breed,                         'breed should be preserved across edit').toBe('Mixed');
    expect(sentBody.profileType,                   'profileType should be preserved across edit').toBe('Dog');
    expect(sentBody.birthday,                      'birthday should be preserved across edit').toBe('2011-01-01');

    // Response body: backend echoed every new value
    const updated = await editResp.json();
    expect(updated.name,                           'response name').toBe(editedName);
    expect(updated.sex,                            'response sex').toBe(NEW_SEX);
    expect(updated.weight?.current,                'response weight.current').toBe(NEW_WEIGHT_NUM);
    // Backend returns healthConditions sorted alphabetically (different from the
    // click-order the UI sends), and `null` (not `[]`) when none are selected.
    // Normalize to sorted array for set-equality comparison.
    expect((updated.healthConditions || []).slice().sort(), 'response healthConditions (set equality)')
      .toEqual([...NEW_HEALTH_ISSUES].sort());
    expect(updated.breed,                          'response breed (preserved)').toBe('Mixed');
    expect(updated.birthday,                       'response birthday (preserved)').toContain('2011-01-01');

    // --- UI: toast + /pets list reflects every change ---
    await expect(petsPage.toast).toContainText(/saved/i);

    // App auto-redirects to /pets after save — wait for it, no manual reload
    await page.waitForURL(/\/pets$/, { timeout: 10000 });

    // New card visible; old name fully gone (exact-match scoping)
    await expect(petsPage.profileCard(editedName)).toBeVisible();
    await expect(petsPage.profileCard(originalName)).toHaveCount(0);

    // Card text contains every edited value
    const cardText = await petsPage.getCardText(editedName);
    const newSexLabel = NEW_SEX === 'Female' ? 'Good Girl' : 'Good Boy';
    const oldSexLabel = NEW_SEX === 'Female' ? 'Good Boy'  : 'Good Girl';
    expect(cardText, `card should show new sex label "${newSexLabel}"`).toContain(newSexLabel);
    expect(cardText, `card should NOT show old sex label "${oldSexLabel}"`).not.toContain(oldSexLabel);
    for (const condition of NEW_HEALTH_ISSUES) {
      expect(cardText, `card should list "${condition}"`).toContain(condition);
    }
    expect(cardText, 'card should still show preserved breed').toContain('Breed: Mixed');
    expect(cardText, 'card should still show preserved birthday').toContain('Birthday: 01/01/2011');
  });
});
