const { BasePage } = require('./base.page');

/**
 * AccountDetailsPage — /account-details ("Manage Account", h1 "Manage Account")
 *
 * Two editable sections, each revealed by clicking its own "Edit" link (which
 * swaps the read-only <p> display for inputs):
 *   1. Customer Information — first/last name, phone, email.
 *   2. Shipping Address — country, street, additional line, city, state/province,
 *      zip/postal. (data-qa="address-form"; "shipping-address-form" is the
 *      display wrapper.)
 *
 * Both sections are persisted by a SINGLE shared "SAVE ACCOUNT INFO" button
 * (`save-btn`) — one click saves the whole page via
 *   PUT /account-service/proxy/account/{accountId}   (→ 200)
 * then the app re-fetches GET /account-service/proxy/account?accountId={id}.
 *
 * Selectors are live-verified (2026-06-04). All form fields expose clean data-qa.
 * The only gaps (logged as TODOs in CLAUDE.md): the per-section "Edit" links and
 * the inline ".invalid-message" validation text have NO data-qa.
 *
 * Validation is REQUIRED-FIELD ONLY: clearing a required field renders an inline
 * "This field is required" message, DISABLES the Save button, and blocks the PUT.
 * There is no client-side postal/phone FORMAT validation (letters in zip / a short
 * phone are accepted by the form).
 *
 * Country↔State coupling: changing `ship-country-shipping` repopulates the SAME
 * `ship-state-shipping` <select> (US states ⇄ CA provinces, etc.) — one
 * parameterized method handles every country; only the chosen values differ.
 *
 * Select option value format is "<code>|<name>" (e.g. "US|United States",
 * "CA|California", "BC|British Columbia"). The backend stores these split apart:
 *   shippingAddress.countryCode/country and .regionCode/region.
 */
class AccountDetailsPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Section containers ---
    this.customerInfoForm    = page.locator('[data-qa="customer-info-form"]');
    this.shippingAddressForm = page.locator('[data-qa="shipping-address-form"]'); // display wrapper
    this.addressForm         = page.locator('[data-qa="address-form"]');          // editable shipping section

    // --- Customer Information inputs (render only in edit mode) ---
    this.firstNameInput = page.locator('[data-qa="first-name"]');
    this.lastNameInput  = page.locator('[data-qa="last-name"]');
    this.phoneInput     = page.locator('[data-qa="phone"]');
    this.emailInput     = page.locator('[data-qa="email"]');

    // --- Shipping Address fields (render only in edit mode) ---
    this.shipCountrySelect   = page.locator('[data-qa="ship-country-shipping"]');
    this.shipStreetInput     = page.locator('[data-qa="ship-street-address-shipping"]');
    this.shipAdditionalInput = page.locator('[data-qa="ship-additional-address-line-shipping"]');
    this.shipCityInput       = page.locator('[data-qa="ship-city-shipping"]');
    this.shipStateSelect     = page.locator('[data-qa="ship-state-shipping"]');
    this.shipPostalInput     = page.locator('[data-qa="ship-postal-code-shipping"]');

    // --- "Different Billing Address" toggle + billing sub-form ---
    // The toggle is a VISUALLY-HIDDEN checkbox (opacity 0, 0×0) inside a clickable
    // <label> — click the label, not the input. Toggling on reveals a REUSED
    // <address-form data-qa="billing-address-form"> whose inner <section> also
    // carries data-qa="address-form" (so two exist when billing is on), but whose
    // INPUTS use a distinct "-billing" suffix (no collision with shipping).
    this.billingToggle      = page.locator('[data-qa="billing-address-toggle"]'); // hidden checkbox (read state only)
    this.billingToggleLabel = page.locator('label.accountDetails__toggleControl', { hasText: 'Different Billing Address' });
    this.billingForm        = page.locator('[data-qa="billing-address-form"]');   // conditionally rendered
    this.billCountrySelect   = page.locator('[data-qa="ship-country-billing"]');
    this.billStreetInput     = page.locator('[data-qa="ship-street-address-billing"]');
    this.billAdditionalInput = page.locator('[data-qa="ship-additional-address-line-billing"]');
    this.billCityInput       = page.locator('[data-qa="ship-city-billing"]');
    this.billStateSelect     = page.locator('[data-qa="ship-state-billing"]');
    this.billPostalInput     = page.locator('[data-qa="ship-postal-code-billing"]');

    // --- Buttons / shared ---
    this.paymentSettingsBtn = page.locator('[data-qa="payment-settings-btn"]');
    this.saveBtn            = page.locator('[data-qa="save-btn"]');
    this.toast              = page.locator('[data-qa="toast-message"]');

    // --- Edit links — NO data-qa (TODO: ask team). Scoped to each section. ---
    this.customerEditLink = this.customerInfoForm.getByText('Edit', { exact: true });
    this.shippingEditLink = this.addressForm.first().getByText('Edit', { exact: true });
    this.billingEditLink  = this.billingForm.getByText('Edit', { exact: true });

    // --- Inline validation message — NO data-qa (TODO). ".invalid-message" wraps
    //     the red "This field is required" text. ---
    this.invalidMessages = page.locator('.invalid-message');
  }

  async goto() {
    await this.navigate('accountDetails');
    await this.customerInfoForm.waitFor({ state: 'visible', timeout: 20000 });
  }

  // ----- edit-mode toggles (guarded so a re-click can't toggle edit back off) -----

  async enterCustomerEditMode() {
    if (!(await this.firstNameInput.isVisible().catch(() => false))) {
      await this.customerEditLink.first().click();
    }
    await this.firstNameInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  async enterShippingEditMode() {
    if (!(await this.shipStreetInput.isVisible().catch(() => false))) {
      await this.shippingEditLink.first().click();
    }
    await this.shipStreetInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  // ----- readers (enter edit mode, return current input values) -----

  async getCustomerInfo() {
    await this.enterCustomerEditMode();
    return {
      firstName: await this.firstNameInput.inputValue(),
      lastName:  await this.lastNameInput.inputValue(),
      phone:     await this.phoneInput.inputValue(),
      email:     await this.emailInput.inputValue(),
    };
  }

  async getShippingAddress() {
    await this.enterShippingEditMode();
    return {
      country:    await this.shipCountrySelect.inputValue(),
      street:     await this.shipStreetInput.inputValue(),
      additional: await this.shipAdditionalInput.inputValue(),
      city:       await this.shipCityInput.inputValue(),
      state:      await this.shipStateSelect.inputValue(),
      zip:        await this.shipPostalInput.inputValue(),
    };
  }

  // ----- writers (undefined fields are left untouched) -----

  async setCustomerInfo({ firstName, lastName, phone } = {}) {
    await this.enterCustomerEditMode();
    if (firstName !== undefined) await this.firstNameInput.fill(firstName);
    if (lastName  !== undefined) await this.lastNameInput.fill(lastName);
    if (phone     !== undefined) await this.phoneInput.fill(phone);
  }

  async setShippingAddress({ country, street, additional, city, state, zip } = {}) {
    await this.enterShippingEditMode();
    if (country !== undefined) {
      await this.shipCountrySelect.selectOption(country);
      // The State/Province list repopulates after the country changes — wait for
      // the target option to exist before selecting it (race on the new list).
      if (state !== undefined) await this._waitForStateOption(state);
    }
    if (street     !== undefined) await this.shipStreetInput.fill(street);
    if (additional !== undefined) await this.shipAdditionalInput.fill(additional);
    if (city       !== undefined) await this.shipCityInput.fill(city);
    if (state      !== undefined) await this.shipStateSelect.selectOption(state);
    if (zip        !== undefined) await this.shipPostalInput.fill(zip);
  }

  /** Wait until the shipping State/Province <select> contains an option with `value`. */
  async _waitForStateOption(value) {
    await this._waitForSelectOption('ship-state-shipping', value);
  }

  /** Wait until the <select> identified by `dataQa` contains an option with `value`. */
  async _waitForSelectOption(dataQa, value) {
    await this.page.waitForFunction(
      ({ dq, val }) => {
        const s = document.querySelector(`[data-qa="${dq}"]`);
        return !!s && [...s.options].some((o) => o.value === val);
      },
      { dq: dataQa, val: value },
      { timeout: 10000 }
    );
  }

  // ----- Different Billing Address (toggle + reused billing sub-form) -----

  /** Read the toggle's checked state (the input is hidden; read it directly). */
  async isDifferentBillingOn() {
    return this.billingToggle.evaluate((el) => el.checked).catch(() => false);
  }

  /**
   * Set the "Different Billing Address" toggle on/off (idempotent). Clicks the
   * visible <label> (the checkbox itself is hidden) and waits for the billing
   * sub-form to appear/detach accordingly.
   */
  async setDifferentBilling(on) {
    if ((await this.isDifferentBillingOn()) !== on) {
      await this.billingToggleLabel.click();
    }
    if (on) {
      await this.billingForm.waitFor({ state: 'visible', timeout: 10000 });
    } else {
      await this.billingForm.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  }

  /** Ensure billing is on, then reveal the billing inputs (its own Edit link). */
  async enterBillingEditMode() {
    await this.setDifferentBilling(true);
    if (!(await this.billStreetInput.isVisible().catch(() => false))) {
      await this.billingEditLink.first().click();
    }
    await this.billStreetInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  async getBillingAddress() {
    await this.enterBillingEditMode();
    return {
      country:    await this.billCountrySelect.inputValue(),
      street:     await this.billStreetInput.inputValue(),
      additional: await this.billAdditionalInput.inputValue(),
      city:       await this.billCityInput.inputValue(),
      state:      await this.billStateSelect.inputValue(),
      zip:        await this.billPostalInput.inputValue(),
    };
  }

  async setBillingAddress({ country, street, additional, city, state, zip } = {}) {
    await this.enterBillingEditMode();
    if (country !== undefined) {
      await this.billCountrySelect.selectOption(country);
      if (state !== undefined) await this._waitForSelectOption('ship-state-billing', state);
    }
    if (street     !== undefined) await this.billStreetInput.fill(street);
    if (additional !== undefined) await this.billAdditionalInput.fill(additional);
    if (city       !== undefined) await this.billCityInput.fill(city);
    if (state      !== undefined) await this.billStateSelect.selectOption(state);
    if (zip        !== undefined) await this.billPostalInput.fill(zip);
  }

  /** Trimmed labels of every <option> in the given <select> locator. */
  async optionLabels(selectLocator) {
    return (await selectLocator.locator('option').allTextContents()).map((s) => s.trim());
  }

  /**
   * Labels of every option in the SHIPPING State/Province dropdown. Used to
   * assert the Country→State/Province swap (e.g. provinces present for Canada,
   * US states absent).
   */
  async stateOptionLabels() {
    return this.optionLabels(this.shipStateSelect);
  }

  /** Labels of every option in the BILLING State/Province dropdown. */
  async billingStateOptionLabels() {
    return this.optionLabels(this.billStateSelect);
  }

  // ----- toast (element is ALWAYS in the DOM; empty when idle, and RETAINS its
  //       last message after dismissing — same quirk as the payments toast) -----

  /** Poll for a non-empty toast whose text differs from `ignoreText`. */
  async _captureToastText(timeout = 8000, ignoreText = null) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const t = ((await this.toast.first().textContent().catch(() => '')) || '').trim();
      if (t && t !== ignoreText) return t;
      await this.page.waitForTimeout(100);
    }
    return null;
  }

  /** Current (possibly stale/lingering) toast text, trimmed. */
  async currentToastText() {
    return ((await this.toast.first().textContent().catch(() => '')) || '').trim();
  }

  // ----- save -----

  /**
   * Click "SAVE ACCOUNT INFO" and capture, concurrently:
   *   - the backend PUT /account-service/proxy/account/{id} response,
   *   - its parsed request body (the persisted contract), and
   *   - the success toast (waiting for the text to CHANGE from any stale message).
   * Returns { response, requestBody, toastText }.
   */
  async save() {
    const stale = await this.currentToastText();
    const respP = this.page.waitForResponse(
      (r) => r.request().method() === 'PUT'
        && /\/account-service\/proxy\/account\//.test(r.url()),
      { timeout: 20000 }
    );
    const toastP = this._captureToastText(8000, stale);

    await this.saveBtn.click();

    const [response, toastText] = await Promise.all([respP, toastP]);
    let requestBody = null;
    try { requestBody = JSON.parse(response.request().postData() || 'null'); } catch (_) {}
    console.log(`[account-details] save PUT → ${response.url()} (status ${response.status()}) toast="${toastText}"`);
    return { response, requestBody, toastText };
  }

  // ----- backend read (source of truth for persistence + cleanup) -----

  /**
   * Fetch the persisted account record via the app's account API.
   * Runs fetch() INSIDE the page (page.evaluate) so it inherits the browser's
   * trusted session — Cloudflare 403s Playwright's APIRequestContext (different TLS
   * fingerprint), same gotcha as helpers/pet-profile-api.js. Replays the CSRF/session
   * headers the Angular HttpClient interceptor adds.
   * Returns the account JSON (includes shippingAddress + billingAddress).
   */
  async fetchAccount() {
    const accountId = this.brand.testAccountId;
    return this.page.evaluate(async (id) => {
      const cookie = (n) => (document.cookie.match(new RegExp('(^| )' + n + '=([^;]+)')) || [])[2];
      const headers = {
        'x-csrf-token': cookie('gh-token') || '',
        'x-sid': cookie('SessionId') || '',
        'x-locale': 'US',
        'x-language': 'en',
      };
      const r = await fetch(`/account-service/proxy/account?accountId=${id}`, { headers, credentials: 'include' });
      if (!r.ok) throw new Error(`account GET failed: ${r.status}`);
      return r.json();
    }, accountId);
  }

  // ----- validation helpers -----

  /** Inline validation message(s) matching `text` (e.g. "This field is required"). */
  invalidMessage(text) {
    return this.invalidMessages.filter({ hasText: text });
  }

  /**
   * Get the street address shown in the Shipping Address section (display mode).
   * Read-only <p> tags; returns the first line that starts with a digit
   * (e.g. "23251 Mulholland Drive"). Used by cart-verify-fields-and-links.spec.js.
   */
  async getStreetAddress() {
    await this.shippingAddressForm.waitFor({ state: 'visible', timeout: 15000 });
    const allParagraphs = this.shippingAddressForm.locator('p');
    const count = await allParagraphs.count();
    for (let i = 0; i < count; i++) {
      const text = (await allParagraphs.nth(i).textContent()).trim();
      if (/^\d/.test(text)) {
        return text;
      }
    }
    return '';
  }
}

module.exports = { AccountDetailsPage };
