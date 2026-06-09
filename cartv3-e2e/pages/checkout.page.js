const { BasePage } = require('./base.page');
const { parseMoney } = require('../helpers/parse-money');

/**
 * CheckoutPage — /checkout
 *
 * The checkout page has two display modes:
 *   1. PayPal-first (default): only Order Summary + PayPal buttons visible
 *   2. Credit card mode: full form (Customer Info, Delivery, Payment) visible
 *      — entered by clicking "Or pay with credit card"
 *
 * CC fields are Braintree Hosted Fields rendered inside cross-origin iframes.
 * State dropdown values use the format "CA|California" (code|label).
 *
 * Selectors: no data-qa on checkout form fields — uses placeholder text + position.
 */
class CheckoutPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Toggle to CC form ---
    this.payWithCreditCardLink = page.locator('text=Or pay with credit card');

    // --- Customer Information ---
    // Scoped to <main> to exclude the footer newsletter form, which also has
    // input[placeholder="First Name"]. Footer uses "Email Address"; this form uses "Email".
    this.custFirstName = page.locator('main input[placeholder="First Name"]');
    this.custLastName  = page.locator('main input[placeholder="Last Name"]');
    this.custPhone     = page.locator('main input[placeholder="Phone"]').first();
    this.custEmail     = page.locator('main input[placeholder="Email"]');

    // --- Delivery Information (lowercase "n" in name — unique to this section) ---
    this.delivCountry   = page.locator('select').first();   // defaults to United States
    this.delivFirstName = page.locator('input[placeholder="First name"]');
    this.delivLastName  = page.locator('input[placeholder="Last name"]');
    this.delivStreet    = page.locator('input[placeholder="Street Address"]');
    this.delivCity      = page.locator('input[placeholder="City"]');
    this.delivState     = page.locator('select').nth(1);    // State dropdown (2nd select)
    this.delivZip       = page.locator('input[placeholder="Zip/Postal Code"]');
    this.delivPhone     = page.locator('input[placeholder="Phone"]').nth(1);

    // --- Payment: Braintree Hosted Field iframes ---
    // Each field is a separate cross-origin iframe. Each iframe also contains
    // hidden autofill inputs (tabindex="-1", aria-hidden="true") — exclude them.
    this.cardNumberInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - Credit Card Number"]')
      .locator('input:not([tabindex="-1"])');
    this.cardNameInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - Cardholder Name"]')
      .locator('input:not([tabindex="-1"])');
    this.cardExpiryInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - Expiration Date"]')
      .locator('input:not([tabindex="-1"])');
    this.cardCvvInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - CVV"]')
      .locator('input:not([tabindex="-1"])');

    // --- PayPal button (checkout page Order Summary panel) ---
    // Braintree renders PayPal buttons inside an iframe — handled by waitForEvent('popup')
    this.paypalCheckoutBtn = page.frameLocator('iframe[id*="paypal"], iframe[name*="paypal"]').first()
      .locator('div[role="button"], button').first();

    // --- Order Summary (right panel) ---
    this.couponInput    = page.locator('input[placeholder="Coupon Code"]');
    this.couponApplyBtn = page.locator('button:has-text("APPLY")');
    // Order Summary money fields — label text → next sibling.
    // Use normalize-space() because Angular wraps text in <!----> comments creating extra whitespace.
    // "Sales Tax:" appears as "TBD" before delivery address is filled, then becomes a value.
    this.summarySubtotal = page.locator('xpath=//*[normalize-space(text())="Subtotal:"]/following-sibling::*[1]');
    this.summaryTax      = page.locator('xpath=//*[normalize-space(text())="Sales Tax:"]/following-sibling::*[1]');
    this.summaryShipping = page.locator('xpath=//*[normalize-space(text())="Shipping:"]/following-sibling::*[1]');
    this.summaryTotal    = page.locator('xpath=//*[normalize-space(text())="Total:"]/following-sibling::*[1]');

    // --- Submit ---
    // No data-qa — use button text
    this.submitOrderBtn = page.getByRole('button', { name: /click to submit order/i });

    // --- Footer legal links ---
    this.termsLink   = page.locator('a:has-text("Terms & Conditions")').first();
    this.privacyLink = page.locator('a:has-text("Privacy Policy")').first();

    // --- Order confirmation ---
    this.orderIdLocator = page.locator('//*[starts-with(text(),"ORD-")]').first();

    // =====================================================================
    // data-qa locators (added 2026-06-08 — checkout validation/display batch)
    // The team has added clean data-qa across /checkout since this page object
    // was first written (the placeholder/xpath locators above remain for the
    // order-placement specs). Prefer these for new work.
    //
    // INSTANCE SUFFIX GOTCHA: the reused <address-form> component tags its inputs
    // with an instance suffix. The Delivery (shipping) form uses "--shipping"
    // (double dash); the Billing form — revealed by the "Use a different billing
    // address" toggle — uses "-" (single trailing dash). These are DISTINCT exact
    // data-qa strings, so [data-qa="ship-state-"] (billing) never matches
    // [data-qa="ship-state--shipping"] (shipping). NEVER use a ^= prefix match here.
    // =====================================================================

    // --- Customer Information (data-qa) ---
    this.customerInfoForm = page.locator('[data-qa="customer-info-form"]');
    this.cFirstName = page.locator('[data-qa="first-name"]');
    this.cLastName  = page.locator('[data-qa="last-name"]');
    this.cPhone     = page.locator('[data-qa="phone"]');
    this.cEmail     = page.locator('[data-qa="email"]');

    // --- Delivery (shipping) address-form — "--shipping" suffix ---
    this.shippingAddressForm = page.locator('[data-qa="address-form"]').first();
    this.shipCountry    = page.locator('[data-qa="ship-country--shipping"]');
    this.shipFirstName  = page.locator('[data-qa="first-name--shipping"]');
    this.shipLastName   = page.locator('[data-qa="last-name--shipping"]');
    this.shipStreet     = page.locator('[data-qa="ship-street-address--shipping"]');
    this.shipAdditional = page.locator('[data-qa="ship-additional-address-line--shipping"]');
    this.shipCity       = page.locator('[data-qa="ship-city--shipping"]');
    this.shipState      = page.locator('[data-qa="ship-state--shipping"]');
    this.shipPostal     = page.locator('[data-qa="ship-postal-code--shipping"]');
    this.shipPhone      = page.locator('[data-qa="phone--shipping"]');

    // --- "Use a different billing address" toggle + billing form ("-" suffix) ---
    // The checkbox is visually hidden — click the wrapping <label>, not the input.
    this.billingToggle      = page.locator('[data-qa="billing-address-toggle"]'); // hidden checkbox (read state only)
    this.billingToggleLabel = page.locator('label', { hasText: 'Use a different billing address' });
    this.billingForm = page.locator('[data-qa="address-form"]').nth(1); // 2nd address-form when billing is on
    this.billCountry    = page.locator('[data-qa="ship-country-"]');
    this.billFirstName  = page.locator('[data-qa="first-name-"]');
    this.billLastName   = page.locator('[data-qa="last-name-"]');
    this.billStreet     = page.locator('[data-qa="ship-street-address-"]');
    this.billAdditional = page.locator('[data-qa="ship-additional-address-line-"]');
    this.billCity       = page.locator('[data-qa="ship-city-"]');
    this.billState      = page.locator('[data-qa="ship-state-"]');
    this.billPostal     = page.locator('[data-qa="ship-postal-code-"]');

    // --- Order Summary (data-qa now exists — preferred over the xpath locators above) ---
    this.orderSubtotal = page.locator('[data-qa="subtotal"]');
    this.orderTax      = page.locator('[data-qa="tax"]');
    this.orderShipping = page.locator('[data-qa="shipping"]');
    this.orderTotal    = page.locator('[data-qa="total"]');
    this.orderDiscount = page.locator('[data-qa="discount"]'); // only present once a valid coupon applies

    // --- Coupon (checkout). NOTE: different data-qa from the CART page
    //     (cart uses coupon-code / coupon-apply-btn). The input is a <gh-input>
    //     wrapper, so target its inner <input>. ---
    this.couponInputQa = page.locator('[data-qa="coupon-input"] input');
    this.couponApplyQa = page.locator('[data-qa="coupon-apply"]');
    this.couponClear   = page.locator('[data-qa="coupon-clear"]'); // appears after a valid coupon applies

    // --- Subscription terms (logged-in, when a subscription item is in the cart) ---
    this.subscriptionTerms = page.locator('[data-qa="subscription-terms-text"]');

    // --- Legal disclaimer (Terms & Conditions + Privacy Policy links) ---
    this.legalText = page.locator('[data-qa="legal-text"]');

    // --- Submit (data-qa) + toast ---
    this.submitOrderBtnQa = page.locator('[data-qa="submit-order-btn"]');
    this.toastMessage = page.locator('[data-qa="toast-message"]');

    // --- Header (#9). <linkless-page-header id="page-header"> has NO data-qa.
    //     TODO: ask team to add data-qa to the header logo / phone / CS hours. ---
    this.pageHeader  = page.locator('#page-header');
    this.headerLogo  = page.locator('#page-header img[alt="Brand Logo"]');
    this.headerPhone = page.locator('#page-header a[href^="tel:"], #page-header').first();
  }

  /** Wait for the checkout page to be ready (PayPal-first mode). */
  async waitForCheckoutLoaded() {
    // Use waitUntil: 'commit' — Angular SPAs can hang the 'load' event indefinitely
    await this.page.waitForURL(/\/checkout/, { timeout: 20000, waitUntil: 'commit' });
    await this.payWithCreditCardLink.waitFor({ state: 'visible', timeout: 20000 });
  }

  /** Switch from PayPal-first view to the full credit card form. */
  async switchToCreditCardForm() {
    await this.payWithCreditCardLink.click();
    // Wait for custEmail — unique to this form (footer uses "Email Address", not "Email")
    // avoids false-positive from footer newsletter's "First Name" field
    await this.custEmail.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Fill the Customer Information section.
   * @param {{ firstName, lastName, email, phone? }} info
   */
  async fillCustomerInfo({ firstName, lastName, email, phone } = {}) {
    await this.custFirstName.fill(firstName);
    await this.custLastName.fill(lastName);
    await this.custEmail.fill(email);
    if (phone) await this.custPhone.fill(phone);
  }

  /**
   * Fill the Delivery Information section.
   * state should be the full state name, e.g. "California" — matched by label.
   * @param {{ firstName, lastName, street, city, state, zip, phone? }} addr
   */
  async fillDeliveryAddress({ firstName, lastName, street, city, state, zip, phone } = {}) {
    // Country already defaults to United States
    await this.delivFirstName.fill(firstName);
    await this.delivLastName.fill(lastName);
    await this.delivStreet.fill(street);
    await this.delivCity.fill(city);
    await this.delivState.selectOption({ label: state });
    await this.delivZip.fill(zip);
    if (phone) await this.delivPhone.fill(phone);
  }

  /**
   * Fill the Braintree Hosted Field CC inputs.
   * Uses pressSequentially() so Braintree's keydown/input event listeners fire correctly.
   * fill() sets the value directly without triggering Braintree's field validation.
   *
   * Note: Braintree auto-formats the expiry — typing "/" conflicts with the auto-inserted
   * slash and intermittently produces invalid values like "12//26". Strip non-digits from
   * expiry and let Braintree format it (typing "1226" → field displays "12 / 26").
   * @param {{ number, name, expiry, cvv }} card
   */
  async fillCreditCard({ number, name, expiry, cvv } = {}) {
    const expiryDigits = String(expiry).replace(/\D/g, '');

    await this.cardNumberInput.click();
    await this.cardNumberInput.pressSequentially(number, { delay: 50 });
    await this.cardNameInput.click();
    await this.cardNameInput.pressSequentially(name, { delay: 50 });
    await this.cardExpiryInput.click();
    await this.cardExpiryInput.pressSequentially(expiryDigits, { delay: 50 });
    await this.cardCvvInput.click();
    await this.cardCvvInput.pressSequentially(cvv, { delay: 50 });
  }

  /** Click Submit Order. */
  async submitOrder() {
    await this.submitOrderBtn.click();
  }

  /**
   * After clicking Submit Order, wait until we land on /order-confirmation.
   * Opportunistically clicks "I'm not interested" whenever an upsell/downsell page
   * appears. Handles all three scenarios uniformly:
   *   1. Funnel renders fully — clicks through each "not interested"
   *   2. Funnel skipped — page goes straight to /order-confirmation
   *   3. Mixed (some upsells render, some don't) — handled per-poll
   *
   * Polls every 1s; if a decline button is visible, clicks it and waits 2s for nav.
   * Throws if /order-confirmation isn't reached within the timeout.
   */
  async waitForOrderConfirmation({ timeout = 90000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.page.url().includes('/order-confirmation')) return;

      const notInterested = this.page.locator("text=I'm not interested").first();
      const visible = await notInterested.isVisible().catch(() => false);
      if (visible) {
        await notInterested.click().catch(() => {});
        await this.page.waitForTimeout(2000);
      } else {
        await this.page.waitForTimeout(1000);
      }
    }
    throw new Error(
      `Did not reach /order-confirmation within ${timeout}ms (last URL: ${this.page.url()})`
    );
  }

  /**
   * Extract and return the order ID from the confirmation page.
   * Logs to console. Caller is responsible for attaching to test annotations.
   * Returns null if no ORD- element found.
   */
  async extractOrderId() {
    const visible = await this.orderIdLocator.isVisible().catch(() => false);
    if (!visible) return null;
    const orderId = (await this.orderIdLocator.textContent()).trim();
    console.log(`\n========================================`);
    console.log(`  ORDER PLACED: ${orderId}`);
    console.log(`========================================\n`);
    return orderId;
  }

  /**
   * Snapshot of the checkout Order Summary panel for cross-page assertions.
   * Returns { subtotal, tax, shipping, total } as numbers or null.
   * Tax comes back as null until a delivery address is filled (shows "TBD" before).
   *
   * Uses a short timeout per field so a missing label (XPath mismatch) returns null
   * instead of stalling on the default 30s auto-wait.
   */
  async getOrderSummary() {
    const safeText = async (loc) => {
      try { return await loc.textContent({ timeout: 2000 }); }
      catch { return null; }
    };
    return {
      subtotal: parseMoney(await safeText(this.summarySubtotal)),
      tax:      parseMoney(await safeText(this.summaryTax)),
      shipping: parseMoney(await safeText(this.summaryShipping)),
      total:    parseMoney(await safeText(this.summaryTotal)),
    };
  }

  // =====================================================================
  // data-qa-based helpers (2026-06-08 batch) — validation / display / coupon
  // =====================================================================

  /**
   * Reveal the credit-card form on a GUEST checkout (PayPal-first by default).
   * Clicks "Or pay with credit card" and waits for the data-qa email input.
   * Idempotent — no-ops if the form is already showing.
   */
  async revealCreditCardForm() {
    if (await this.cEmail.isVisible().catch(() => false)) return;
    await this.payWithCreditCardLink.click();
    await this.cEmail.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Wait until the <select> identified by exact `dataQa` contains an option with `value`. */
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

  /** Trimmed labels of every <option> in a <select> locator. */
  async optionLabels(selectLocator) {
    return (await selectLocator.locator('option').allTextContents()).map((s) => s.trim());
  }

  /** Labels of every option in the Delivery State/Province dropdown. */
  async shipStateOptionLabels() {
    return this.optionLabels(this.shipState);
  }

  /** Labels of every option in the Delivery Country dropdown (e.g. "United States"). */
  async countryOptionLabels() {
    return this.optionLabels(this.shipCountry);
  }

  /**
   * Trimmed `value` of every real COUNTRY option in the Delivery Country <select>
   * (e.g. "US|United States", "CA|Canada"). Filtered to the "<CODE>|<Name>" format
   * so the leading placeholder option ("-Select a Country-", whose value is NOT a
   * country code) is dropped. Used by the prod-only "country restricted to US + CAN"
   * exclusivity check (country-options-restricted.spec.js).
   */
  async countryOptionValues() {
    const values = await this.shipCountry
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => o.value));
    return values.map((v) => v.trim()).filter((v) => /^[A-Z]{2}\|/.test(v));
  }

  /**
   * Fill the Delivery (shipping) address via data-qa. Undefined fields untouched.
   * Changing country repopulates the State/Province <select> — waits for the
   * target option before selecting it.
   * @param {{country, firstName, lastName, street, additional, city, state, zip, phone}} a
   */
  async fillShippingAddressQa(a = {}) {
    if (a.country !== undefined) {
      await this.shipCountry.selectOption(a.country);
      if (a.state !== undefined) await this._waitForSelectOption('ship-state--shipping', a.state);
    }
    if (a.firstName  !== undefined) await this.shipFirstName.fill(a.firstName);
    if (a.lastName   !== undefined) await this.shipLastName.fill(a.lastName);
    if (a.street     !== undefined) await this.shipStreet.fill(a.street);
    if (a.additional !== undefined) await this.shipAdditional.fill(a.additional);
    if (a.city       !== undefined) await this.shipCity.fill(a.city);
    if (a.state      !== undefined) await this.shipState.selectOption(a.state);
    if (a.zip        !== undefined) await this.shipPostal.fill(a.zip);
    if (a.phone      !== undefined) await this.shipPhone.fill(a.phone);
  }

  /** Read the "Use a different billing address" checkbox state. */
  async isDifferentBillingOn() {
    return this.billingToggle.evaluate((el) => el.checked).catch(() => false);
  }

  /**
   * Toggle "Use a different billing address" on/off (idempotent). Clicks the
   * visible <label> (the checkbox is hidden) and waits for the billing form
   * (a 2nd address-form) to appear/detach.
   */
  async setDifferentBilling(on) {
    if ((await this.isDifferentBillingOn()) !== on) {
      await this.billingToggleLabel.click();
    }
    if (on) await this.billStreet.waitFor({ state: 'visible', timeout: 10000 });
    else    await this.billStreet.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  /**
   * Apply a coupon on /checkout and capture, concurrently:
   *   - the POST /commerce-service/proxy/cart/apply-coupon response (404 invalid / 200 valid)
   *   - the transient toast (waits for text to change from any stale message).
   * Returns { response, toastText }.
   */
  async applyCoupon(code) {
    await this.couponInputQa.fill(code);
    await this.armToastCapture(); // arm BEFORE the click (toast is transient + retains last msg)
    const respP = this.page.waitForResponse(
      (r) => /\/commerce-service\/proxy\/cart\/apply-coupon/.test(r.url())
        && r.request().method() === 'POST',
      { timeout: 20000 }
    );
    await this.couponApplyQa.click();
    const response = await respP;
    const toastText = await this.captureToast(/coupon not found|applying|discount|success|added|removed/i, 6000);
    console.log(`[checkout] apply-coupon "${code}" → status ${response.status()} toast="${toastText}"`);
    return { response, toastText };
  }

  /** Remove an applied coupon (cleanup). No-op if no coupon is applied. */
  async clearCoupon() {
    if (await this.couponClear.isVisible().catch(() => false)) {
      const respP = this.page.waitForResponse(
        (r) => /\/commerce-service\/proxy\/cart\/remove-coupon/.test(r.url()),
        { timeout: 15000 }
      ).catch(() => null);
      await this.couponClear.click();
      await respP;
      await this.orderDiscount.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  }

  /** Order Summary snapshot via data-qa (preferred over the xpath getOrderSummary). */
  async getOrderSummaryQa() {
    const safeText = async (loc) => {
      try { return await loc.textContent({ timeout: 2000 }); }
      catch { return null; }
    };
    return {
      subtotal: parseMoney(await safeText(this.orderSubtotal)),
      tax:      parseMoney(await safeText(this.orderTax)),
      shipping: parseMoney(await safeText(this.orderShipping)),
      total:    parseMoney(await safeText(this.orderTotal)),
      discount: parseMoney(await safeText(this.orderDiscount)),
    };
  }

  /** Read-only display text of the Customer Information section (logged-in checkout). */
  async getCustomerInfoDisplayText() {
    return ((await this.customerInfoForm.innerText().catch(() => '')) || '').trim();
  }

  /** Read-only display text of the Delivery Information section (logged-in checkout). */
  async getDeliveryDisplayText() {
    return ((await this.shippingAddressForm.innerText().catch(() => '')) || '').trim();
  }
}

module.exports = { CheckoutPage };
