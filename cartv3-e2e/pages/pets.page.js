const { BasePage } = require('./base.page');

/**
 * /pets — Pet Profiles page (Angular SPA, no page heading; verify via document.title).
 *
 * Form notes:
 *   - "Add a pet profile!" button (empty state) / "Add another pet!" (populated state)
 *     navigate to /pets/create — the form is a separate route, not a modal.
 *   - Breed is a Material autocomplete: typing alone yields "Invalid value" — you must
 *     type then select from the dropdown (ArrowDown + Enter, or click the option).
 *   - "No health issues" is a plain text button (no data-qa).
 *
 * List notes:
 *   - Card markup has NO data-qa attributes (gap to flag with the team).
 *   - Cards are scoped here by pet-name <div class="text-2xl ...">; edit is the pencil
 *     icon button in the card's top-right; REMOVE is a plain button inside the card.
 *   - "Remove" is a SOFT delete (PUT {id, active:false}) — records are not purged.
 */
class PetsPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Empty/populated state navigation buttons ---
    // Text-based — no data-qa on either. Empty state shows the first; populated shows the second.
    this.addProfileBtn = page.locator(
      'button:has-text("Add a pet profile"), button:has-text("Add another pet")'
    );

    // --- Form fields (on /pets/create) ---
    this.nameInput     = page.locator('[data-qa="profile-name"]');
    this.breedInput    = page.locator('[data-qa="breed"]');
    this.birthdayInput = page.locator('[data-qa="birthday"]');
    this.weightInput   = page.locator('[data-qa="current-weight"]');
    this.saveBtn       = page.locator('[data-qa="save-btn"]');
    this.cancelBtn     = page.locator('[data-qa="cancel-btn"]');

    // Radios (no data-qa on the inputs themselves — scope by value attribute)
    this.dogRadio    = page.locator('input[type="radio"][value="Dog"]');
    this.catRadio    = page.locator('input[type="radio"][value="Cat"]');
    this.maleRadio   = page.locator('input[type="radio"][value="Male"]');
    this.femaleRadio = page.locator('input[type="radio"][value="Female"]');

    // Health-issue controls (no data-qa)
    // "No health issues" is a plain <button>; the per-condition tiles are <div> elements
    // (NOT buttons) inside a `section.grid`. Selected tiles get class `bg-brandSecondary2`.
    this.noHealthIssuesBtn = page.locator('button', { hasText: /^No health issues$/i });
    this.healthIssueTiles = page.locator('section.grid > div.cursor-pointer');

    // --- Toast ---
    this.toast = page.locator('[data-qa="toast-message"]');
  }

  async goto() {
    await this.navigate('pets');
  }

  /**
   * Verify /pets loaded. Page has no heading — title is the only reliable signal.
   */
  async expectLoaded() {
    const { expect } = require('@playwright/test');
    await expect(this.page).toHaveTitle(/Pet Profile/i);
  }

  // --- Form validation error messages (shown after an invalid Save attempt) ---
  // Inline required-field errors render as "<Field> is required". The breed
  // autocomplete shows "Invalid value" when text is typed but no option selected.
  fieldRequiredError(fieldLabel) {
    return this.page.getByText(`${fieldLabel} is required`, { exact: false });
  }

  get invalidValueError() {
    return this.page.getByText(/invalid value/i);
  }

  /**
   * Click the Add/Add-Another button. Navigates to /pets/create.
   */
  async clickAddProfile() {
    await this.addProfileBtn.first().click();
    await this.page.waitForURL(/\/pets\/create/, { timeout: 10000 });
    await this.nameInput.waitFor({ state: 'visible' });
  }

  /**
   * Click a single health-issue tile by its display label (e.g. "Anxiousness").
   * Tiles are <div class="cursor-pointer"> elements (not buttons). The tile's raw
   * textContent has surrounding whitespace from Angular's rendering, so an anchored
   * regex like /^Anxiousness$/ won't match. Use XPath normalize-space() — same
   * pattern as profileCard().
   */
  async selectHealthIssue(label) {
    const escaped = String(label).replace(/"/g, '\\"');
    await this.page
      .locator(`xpath=//section[contains(@class,"grid")]/div[contains(@class,"cursor-pointer") and normalize-space()="${escaped}"]`)
      .click();
  }

  /**
   * Click multiple health-issue tiles.
   */
  async selectHealthIssues(labels) {
    for (const label of labels) {
      await this.selectHealthIssue(label);
    }
  }

  /**
   * Fill the create/edit form. Sex/type default to Dog/Male for determinism.
   * Breed defaults to "Mixed" — passed through the autocomplete (type + Enter).
   *
   * healthIssues:
   *   - 'none'        → click the "No health issues" button (default)
   *   - string[]      → click each named tile
   *
   * NOTE: pressing Enter to commit the breed autocomplete will ALSO submit the
   * form (Material autocomplete behavior). To avoid that, this method fills
   * breed LAST and uses ArrowDown+Enter — callers should NOT click Save
   * separately after fillForm, since the form may already be in-flight. Use
   * fillFormNoSubmit() if you need to stop before save.
   */
  async fillForm({ name, type = 'Dog', sex = 'Male', breed = 'Mixed', birthday = '01/01/2011', weight = '20', healthIssues = 'none' }) {
    await this.fillFormNoSubmit({ name, type, sex, breed, birthday, weight, healthIssues });
  }

  /**
   * Same as fillForm but stops BEFORE committing breed (so Save can be clicked
   * explicitly inside a Promise.all([waitForResponse, click]) block). Breed is
   * typed into the autocomplete input but NOT confirmed via Enter.
   *
   * Caller is responsible for: pressing ArrowDown+Enter on breed, then clicking
   * Save — or calling commitBreed() and then clicking Save.
   */
  async fillFormNoSubmit({ name, type = 'Dog', sex = 'Male', breed = 'Mixed', birthday = '01/01/2011', weight = '20', healthIssues = 'none' }) {
    await this.nameInput.fill(name);

    if (type === 'Cat') {
      await this.catRadio.click({ force: true });
    } else {
      await this.dogRadio.click({ force: true });
    }

    if (sex === 'Female') {
      await this.femaleRadio.click({ force: true });
    } else {
      await this.maleRadio.click({ force: true });
    }

    await this.birthdayInput.fill(birthday);
    await this.weightInput.fill(weight);

    if (healthIssues === 'none') {
      await this.noHealthIssuesBtn.click();
    } else if (Array.isArray(healthIssues) && healthIssues.length > 0) {
      await this.selectHealthIssues(healthIssues);
    }

    // Breed last — typed but not yet committed via Enter.
    await this.breedInput.click();
    await this.breedInput.fill(breed);
  }

  /**
   * Commit the breed autocomplete selection via ArrowDown + Enter.
   * Note: this will also submit the form (Material autocomplete + Enter
   * propagates to form submit). Use inside Promise.all with waitForResponse.
   */
  async commitBreedAndSubmit() {
    await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
  }

  /**
   * Locator for a profile card scoped by the pet's display name (EXACT match).
   *
   * Uses XPath normalize-space() so e.g. `profileCard("Foo")` does NOT match a
   * sibling card named "Edited-Foo" — important for the edit test's "old name
   * absent" assertion. Angular renders the name with surrounding whitespace and
   * comment nodes, so substring `hasText` over-matches and anchored regex
   * under-matches; normalize-space handles both correctly.
   */
  profileCard(petName) {
    const escaped = String(petName).replace(/"/g, '\\"');
    return this.page
      .locator(`xpath=//div[contains(@class,"text-2xl") and normalize-space()="${escaped}"]`)
      .locator('xpath=ancestor::div[contains(@class,"rounded") and contains(@class,"bg-")][1]');
  }

  /**
   * The pencil-icon edit button inside a given pet's card.
   */
  editButton(petName) {
    return this.profileCard(petName).locator('button.absolute.top-3.right-3');
  }

  /**
   * The REMOVE button inside a given pet's card.
   * Button text is " REMOVE " (whitespace-padded), so use a substring match —
   * NOT an anchored /^REMOVE$/ regex, which won't match the padding. Within a
   * single card, REMOVE is the only button containing that word.
   */
  removeButton(petName) {
    return this.profileCard(petName).locator('button', { hasText: 'REMOVE' });
  }

  /**
   * The "Yes, Please Remove" confirmation button in the remove dialog.
   */
  get confirmRemoveBtn() {
    return this.page.locator('button', { hasText: /Yes,\s*Please Remove/i });
  }

  /**
   * The "Contact Us" button in the remove dialog. Navigates same-tab to /contact.
   * Button text is " Contact Us " (whitespace-padded) → substring match, not anchored.
   */
  get contactUsBtn() {
    return this.page.locator('button', { hasText: 'Contact Us' });
  }

  /**
   * The remove-confirmation dialog container. Anchored on its heading text so
   * assertions can check the body copy (which interpolates the pet name:
   * "This will remove {petName}'s information from your account.").
   */
  get removeDialog() {
    return this.page
      .locator('div.flex.flex-col', { hasText: 'Are you sure you want to remove this profile?' })
      .last();
  }

  /**
   * Return the normalized text content of a pet's card on the /pets list page.
   * Card format (whitespace-collapsed):
   *   "edit {Name} Age: {N} Breed: {Breed} Birthday: {mm/dd/yyyy} Health Issues: {csv|None} {Good Boy|Good Girl} ..."
   *
   * Useful for asserting every submitted field round-trips to the list display.
   */
  async getCardText(petName) {
    const raw = await this.profileCard(petName).textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = { PetsPage };
