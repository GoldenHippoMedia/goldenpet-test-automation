const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { PetsPage } = require('../pages/pets.page');
const { removePetProfile, uniquePetName } = require('../helpers/pet-profile-api');

// GI: "Pet Profiles - Create New Profile"
// Logged-in user creates a new pet profile through the UI.
//
// Each run RANDOMIZES the profile inputs so the suite organically covers
// both Dog/Cat × Male/Female and both "no health issues" vs "some health
// issues" code paths over many runs. Inputs picked this run are logged so
// any failure is reproducible.
//
// Asserts:
//   1. POST API: status 200, response payload echoes EVERY submitted field
//      (name, breed, profileType, sex, healthConditions array)
//   2. UI toast: "saved" message visible
//   3. UI card on /pets: every submitted field renders correctly
//      (name, breed, birthday, sex label, health issues display)
//
// afterEach: API soft-delete (PUT {active:false}) cleans up the test account.

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

function randomProfileInputs() {
  const type = Math.random() < 0.5 ? 'Dog' : 'Cat';
  const sex  = Math.random() < 0.5 ? 'Male' : 'Female';
  // 40% no health issues, 60% pick 2-3 random tiles — exercises both code paths.
  const healthIssues = Math.random() < 0.4
    ? 'none'
    : pickRandom(ALL_HEALTH_ISSUES, 2 + Math.floor(Math.random() * 2)); // 2 or 3
  // Random weight 10-99 lbs (integers) — keeps assertions simple and covers
  // the full input range without venturing into edge cases.
  const weight = String(10 + Math.floor(Math.random() * 90));
  return {
    name: uniquePetName(),
    type,
    sex,
    breed: 'Mixed', // breed value pool is huge; stick to "Mixed" — it exists for both Dog and Cat
    birthday: '01/01/2011',
    weight,
    healthIssues,
  };
}

test.describe('Pet Profiles - Create New Profile', () => {
  let createdPetId = null;

  test.afterEach(async ({ page, brand }) => {
    if (createdPetId) {
      await removePetProfile(page, { baseUrl: brand.baseUrl, petId: createdPetId });
      createdPetId = null;
    }
  });

  test('creates a profile via the UI and backend persists every submitted field', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const petsPage = new PetsPage(page, brand);

    const inputs = randomProfileInputs();
    console.log('[pets-create] randomized inputs:', JSON.stringify(inputs));

    await loginPage.goto();
    await loginPage.login();

    await petsPage.goto();
    await petsPage.expectLoaded();
    await petsPage.clickAddProfile();
    await petsPage.fillFormNoSubmit(inputs);

    // --- API + UI: assert POST that fires when breed Enter submits the form ---
    const [createResp] = await Promise.all([
      page.waitForResponse(
        r => /\/account-service\/proxy\/pets\/profile\//.test(r.url())
          && r.request().method() === 'POST',
        { timeout: 15000 }
      ),
      petsPage.commitBreedAndSubmit(),
    ]);

    expect(createResp.status(), 'create POST should return 200').toBe(200);

    // Request body: every submitted field present
    const sentBody = createResp.request().postDataJSON();
    expect(sentBody.name).toBe(inputs.name);
    expect(sentBody.profileType).toBe(inputs.type);
    expect(sentBody.sex).toBe(inputs.sex);
    expect(sentBody.breed).toBe(inputs.breed);
    expect(sentBody.birthday, 'request body birthday').toBe('2011-01-01');
    expect(sentBody.weight?.current, 'request body weight.current').toBe(Number(inputs.weight));
    expect(sentBody.healthConditions || [], 'healthConditions array must match selections').toEqual(
      inputs.healthIssues === 'none' ? [] : inputs.healthIssues
    );

    // Response body: backend echoes what was saved (every field shown on /pets card)
    const created = await createResp.json();
    createdPetId = created.id;
    // Pet Profiles are a Salesforce custom object; the 3-char key prefix is
    // org-specific (UAT sandbox "a1D", prod "a1K"), so assert the general
    // 18-char custom-object id shape (leading "a") rather than a hardcoded prefix.
    expect(created.id, 'response should include a Salesforce pet id (a-prefixed 18-char)').toMatch(/^a[A-Za-z0-9]{17}$/);
    expect(created.name).toBe(inputs.name);
    expect(created.profileType).toBe(inputs.type);
    expect(created.sex).toBe(inputs.sex);
    expect(created.breed).toBe(inputs.breed);
    expect(created.birthday, 'response birthday').toContain('2011-01-01');
    expect(created.weight?.current, 'response weight.current').toBe(Number(inputs.weight));
    // Backend returns healthConditions sorted alphabetically (different from the
    // click-order the UI sends), and `null` (not `[]`) when none are selected.
    // Normalize both sides to a sorted array for set-equality comparison.
    const expectedConditions = inputs.healthIssues === 'none' ? [] : inputs.healthIssues;
    expect((created.healthConditions || []).slice().sort(), 'response healthConditions (set equality)')
      .toEqual([...expectedConditions].sort());

    // --- UI: toast appears ---
    await expect(petsPage.toast).toContainText(/saved/i);

    // --- UI: app auto-redirects to /pets after save — wait for it, no manual reload ---
    await page.waitForURL(/\/pets$/, { timeout: 10000 });
    await expect(petsPage.profileCard(inputs.name)).toBeVisible();

    const cardText = await petsPage.getCardText(inputs.name);
    expect(cardText, 'card should show submitted name').toContain(inputs.name);
    expect(cardText, 'card should show submitted breed').toContain(`Breed: ${inputs.breed}`);
    expect(cardText, 'card should show submitted birthday').toContain('Birthday: 01/01/2011');

    const expectedSexLabel = inputs.sex === 'Male' ? 'Good Boy' : 'Good Girl';
    expect(cardText, `card should show sex label "${expectedSexLabel}"`).toContain(expectedSexLabel);

    if (inputs.healthIssues === 'none') {
      expect(cardText, 'card should show "Health Issues: None"').toContain('Health Issues: None');
    } else {
      // Card renders conditions as comma-separated; assert each selected one is present.
      for (const condition of inputs.healthIssues) {
        expect(cardText, `card should list health issue "${condition}"`).toContain(condition);
      }
    }
  });
});
