const { BasePage } = require('./base.page');

/**
 * Subscription editor — /subscription-edit (and the /subscription-cancellation/{sfId}
 * page reached from it). Backs the five subscription-management specs ported from the
 * Ghost Inspector "Subscriptions - *" tests.
 *
 * data-qa audited live 2026-06-17 (UAT, drmarty). The page is platform app-builder
 * (shared across brands), so these data-qa carry across non-GMD brands (DMP + BLR).
 *
 * RENDER MODEL:
 *  - The page loads a `select[data-qa="subscription-select"]` of every active sub
 *    (option text "Subscription #SSC-#####", option VALUE = the Salesforce id).
 *    Selecting one renders that sub's summary client-side (no extra fetch).
 *  - Summary row: SHIP NOW! / SKIP NEXT ORDER / DELIVERY AND PAYMENT, plus the
 *    LAST/NEXT order dates and the product/price/savings.
 *  - "Delivery and payment" (`delivery-payment-btn`) expands the edit panel
 *    (`<subscription-edit-confirmation-panel>`) with the quantity select, the
 *    "Delivery Frequency / Shipping" expander (`frequence-toggle` — note the spelling),
 *    `frequency-select`, the EDITABLE next-order-date input, `payment-select`,
 *    the order summary, and UPDATE / CANCEL Subscription Box buttons.
 *
 * UPDATE FLOW (verified): making any valid change (quantity / date / frequency /
 * payment) makes the confirmation panel's `update-btn` ENABLE — there is NO
 * "agree to terms" checkbox in the current UI (GI's `.checkbox > mat-icon` is gone),
 * and NO separate "Review and finalize" step. Click `update-btn` → PUT to the
 * subscriptions API → success toast.
 *
 * MUTATION ENDPOINT: every write (skip / ship / update / cancel) is a non-GET call
 * under `/account-service/proxy/subscription(s)/...`. The exact sub-path is logged by
 * `waitForSubscriptionWrite()` on first run; assertions key off method + status, not
 * the precise path (so they survive a path tweak).
 *
 * SELF-HEAL: skip and ship-now ADVANCE the next-order date by one cycle, and
 * update-date/qty mutate the sub. These specs run on prod too, so they snapshot the
 * sub's state and RESTORE it (afterEach safety net) — same discipline as the
 * account-update specs. Cancel is an irreversible soft-delete, so its spec uses a
 * throwaway sub instead (UAT-only).
 */
class SubscriptionEditPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Subscription selector + summary ---
    this.subscriptionSelect = page.locator('[data-qa="subscription-select"]');
    this.subscriptionName    = page.locator('[data-qa="subscription-name"]');
    this.subscriptionPrice   = page.locator('[data-qa="subscription-price"]');
    this.subscriptionSavings = page.locator('[data-qa="subscription-savings"]');
    this.subscriptionImage   = page.locator('[data-qa="subscription-image"]');
    this.lastOrderDate       = page.locator('[data-qa="last-order-date"]');
    // Two elements share data-qa="next-order-date": the summary DISPLAY (a <div>) and
    // the EDITABLE <input type="date"> inside the expanded frequency section.
    this.nextOrderDateDisplay = page.locator('div[data-qa="next-order-date"]').first();
    this.nextOrderDateInput   = page.locator('input[data-qa="next-order-date"]');

    // --- Summary action buttons ---
    this.shipNowBtn = page.locator('[data-qa="ship-next-order-now-btn"]').first();
    this.skipBtn    = page.locator('[data-qa="skip-next-order-btn"]').first();
    this.deliveryPaymentBtn = page.locator('[data-qa="delivery-payment-btn"]').first();

    // --- Edit / confirmation panel ---
    this.editPanel = page.locator('subscription-edit-confirmation-panel, .subscriptionEditConfirmationPanel');
    this.editCloseBtn   = page.locator('[data-qa="subscription-edit-close-btn"]');
    this.frequencyToggle = page.locator('[data-qa="frequence-toggle"]'); // sic: "frequence"
    this.frequencySelect = page.locator('[data-qa="frequency-select"]');
    // Quantity control has NO data-qa (GI's `quantity-select` is gone) — TODO: ask team.
    // It's a native <select id="quantityId"> with a blank first option then
    // "N - $X.XX / unit" options.
    this.quantitySelect = page.locator('select#quantityId');
    this.paymentSelect  = page.locator('[data-qa="payment-select"]');
    this.paymentOptionsLink = page.locator('[data-qa="payment-options-link"]');
    this.changeShippingLink = page.locator('[data-qa="change-shipping-address-link"]');
    this.shipToName    = page.locator('[data-qa="ship-to-name"]');
    this.shipToAddress = page.locator('[data-qa="ship-to-address"]');
    this.shipToZip     = page.locator('[data-qa="ship-to-zipcode"]');
    // Editable delivery-address fields. The changeShippingLink opens a SEPARATE
    // "Recipient Info" MODAL (not an inline panel section) holding the reused
    // <address-form> component with a SINGLE trailing-dash suffix — use EXACT data-qa,
    // never a `^=` prefix (that would also match checkout's billing fields elsewhere).
    this.shipCountry    = page.locator('[data-qa="ship-country-"]');       // <select> "US|United States"
    this.shipFirstName  = page.locator('[data-qa="first-name-"]');
    this.shipLastName   = page.locator('[data-qa="last-name-"]');
    this.shipStreet     = page.locator('[data-qa="ship-street-address-"]');
    this.shipAdditional = page.locator('[data-qa="ship-additional-address-line-"]');
    this.shipCity       = page.locator('[data-qa="ship-city-"]');
    this.shipState      = page.locator('[data-qa="ship-state-"]');         // <select> "CA|California"
    this.shipPostal     = page.locator('[data-qa="ship-postal-code-"]');
    // The Recipient Info modal's OWN "Update" button (NO data-qa). Clicking it COMMITS
    // the edited address into the panel's Shipping To display and closes the modal —
    // it does NOT persist; the sub is written only by the panel's update-btn afterward.
    // Distinguished from update-btn by its exact accessible name ("Update" vs the panel's
    // "Update Subscription Box"). Audited live 2026-07-08.
    // TODO: ask team to add data-qa to the Recipient Info modal's Update/Close buttons.
    this.shipModalUpdateBtn = page.getByRole('button', { name: 'Update', exact: true });
    this.updateBtn = page.locator('[data-qa="update-btn"]');
    // "Yes, I want to update my subscription!" agreement box. The panel's update-btn
    // ("Update Subscription Box") stays DISABLED until this is ticked, even after a valid
    // change. It's a CUSTOM control with NO data-qa: the OUTER element is itself a
    // <div role="button" class="checkbox"> wrapping a <mat-icon> that toggles
    // check_box_outline_blank ↔ check_box. Audited live 2026-07-08 — the earlier
    // `[data-qa="terms-checkbox"]` guess never existed in the DOM, so the old tick
    // silently no-op'd and update-btn never enabled.
    // TODO: ask team to add a data-qa to this agreement checkbox.
    this.agreeCheckbox = page.locator('div.checkbox[role="button"]', {
      hasText: /want to update my subscription/i,
    });
    // "Cancel Subscription Box" trigger lives in the edit panel; data-qa="cancel-btn"
    // is REUSED for the final confirm on the /subscription-cancellation page.
    this.cancelBoxBtn = page.locator('[data-qa="cancel-btn"]');

    // --- Order summary (in edit panel) ---
    this.subtotalOriginal = page.locator('[data-qa="subtotal-original"]');
    this.subtotalNew      = page.locator('[data-qa="subtotal-new"]');
    this.summaryTax       = page.locator('[data-qa="tax"]');
    this.summaryShipping  = page.locator('[data-qa="shipping"]');
    this.grandTotal       = page.locator('[data-qa="grand-total"]');

    // --- Skip modal ---
    this.skipModal     = page.locator('[data-qa="skip-next-order-modal"]');
    this.skipDate      = page.locator('[data-qa="skip-date"]');   // current scheduled date
    this.skipNextDate  = page.locator('[data-qa="next-date"]');   // date it will skip TO
    this.skipConfirmBtn = page.locator('[data-qa="skip-confirm-btn"]');
    this.skipCancelBtn  = page.locator('[data-qa="skip-cancel-btn"]');

    // --- Ship Now modal + success popup ---
    this.shipModal      = page.locator('[data-qa="ship-order-now-modal"]');
    this.shipConfirmBtn = page.locator('[data-qa="ship-confirm-btn"]');
    this.shipCancelBtn  = page.locator('[data-qa="ship-cancel-btn"]').first();
    // Post-confirm success popup ("You're all set!" / "Order Confirmed") — no stable
    // data-qa, so match by copy + close via the mat-icon close button. NOTE: the app copy
    // uses a TYPOGRAPHIC apostrophe (U+2019), not ASCII "'" — verified live 2026-07-14
    // (char code 8217). The class `[’']?` matches curly, straight, or none, so the
    // matcher survives either style (the old `'?` matched only ASCII and missed the popup).
    this.shipSuccessText = page.getByText(/you[’']?re all set|order confirmed/i).first();
    this.shipSuccessClose = page.locator('mat-icon:has-text("close")').first();

    // --- Cancellation page (/subscription-cancellation/{sfId}) ---
    this.cancelPageSubId   = page.locator('[data-qa="subscription-id"]');
    this.cancelPageNextShip = page.locator('[data-qa="next-ship-date"]');
    this.reasonToggles     = page.locator('[data-qa="reason-toggle"]');
  }

  async goto() {
    await this.navigate('subscriptionEdit');
    await this.waitForLoaded();
  }

  async waitForLoaded() {
    await this.subscriptionSelect.waitFor({ state: 'visible', timeout: 30000 });
  }

  // ----------------------------------------------------------------------------
  // Subscription selection
  // ----------------------------------------------------------------------------

  /** All sub options: [{ label: "Subscription #SSC-#####", value: "<sfId>", ssc: "SSC-#####" }]. */
  async listSubscriptions() {
    return this.subscriptionSelect.evaluate((sel) =>
      [...sel.options].map((o) => ({
        label: o.text.trim(),
        value: o.value,
        ssc: (o.text.match(/SSC-\d+/) || [null])[0],
      })),
    );
  }

  /** Select a sub by its Salesforce id (the <option> value) or by 0-based index. */
  async selectSubscription({ sfId = null, index = null } = {}) {
    if (sfId != null) await this.subscriptionSelect.selectOption(sfId);
    else if (index != null) await this.subscriptionSelect.selectOption({ index });
    else throw new Error('selectSubscription: pass sfId or index');
    await this.page.waitForTimeout(1200); // summary re-renders client-side
  }

  /** Salesforce id of the currently selected sub (the <select> value, e.g. a0WQL...). */
  async getSelectedSfId() {
    return this.subscriptionSelect.inputValue();
  }

  /** SSC-##### of the currently selected sub (parsed from the selected option label). */
  async getSelectedSsc() {
    const label = await this.subscriptionSelect.evaluate((s) => s.selectedOptions[0]?.text || '');
    return (label.match(/SSC-\d+/) || [null])[0];
  }

  /** Try to open the edit panel for the current sub; non-throwing, returns true if it opened. */
  async tryOpenDeliveryPayment(timeout = 6000) {
    try {
      await this.deliveryPaymentBtn.click({ timeout: 5000 });
      await this.updateBtn.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Try to expand the frequency section and reveal the editable date input; non-throwing. */
  async tryOpenFrequencyDateInput(timeout = 6000) {
    try {
      await this.frequencyToggle.click({ timeout: 5000 });
      await this.nextOrderDateInput.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Close the edit panel (best-effort). */
  async closeEdit() {
    await this.editCloseBtn.click({ timeout: 3000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /**
   * Walk the subscription dropdown and return the first sub that is actually EDITABLE for
   * the requested operation. Some subs (e.g. PayPal-funnel S&S) intentionally render
   * without full edit controls, so index 0 isn't safe to assume. On a match this leaves
   * that sub SELECTED with the edit panel OPEN (and, when needDateInput, the frequency
   * section expanded). Returns the sub descriptor {label, value, ssc} or null if none.
   *
   * @param {{needQuantityOptions?: boolean, needDateInput?: boolean, needShipNow?: boolean}} opts
   */
  async pickEditableSubscription({ needQuantityOptions = false, needDateInput = false, needShipNow = false, needPaymentSelect = false } = {}) {
    const subs = await this.listSubscriptions();
    for (let i = 0; i < subs.length; i++) {
      await this.selectSubscription({ index: i });

      // Ship Now availability is judged from the summary, before opening the panel.
      if (needShipNow && !(await this.isShipNowAvailable())) continue;

      if (!(await this.tryOpenDeliveryPayment())) continue;

      if (needQuantityOptions) {
        const qtys = await this.listQuantities().catch(() => []);
        if (qtys.length < 2) { await this.closeEdit(); continue; }
      }
      // Card subs expose payment-select; PayPal-funnel subs show paypal-method-display instead.
      if (needPaymentSelect && (await this.paymentSelect.count()) === 0) { await this.closeEdit(); continue; }
      if (needDateInput) {
        if (!(await this.tryOpenFrequencyDateInput())) { await this.closeEdit(); continue; }
      }
      console.log(`[subscription] picked editable sub ${subs[i].ssc} (index ${i}) for editing`);
      return subs[i];
    }
    return null;
  }

  // ----------------------------------------------------------------------------
  // Dates (display + edit)
  // ----------------------------------------------------------------------------

  /** Summary next-order date as shown, e.g. "21 Jun 2026". */
  async getNextOrderDateText() {
    return (await this.nextOrderDateDisplay.textContent() || '').trim();
  }

  async getLastOrderDateText() {
    return (await this.lastOrderDate.textContent() || '').trim();
  }

  // ----------------------------------------------------------------------------
  // Ship Now
  // ----------------------------------------------------------------------------

  /** Is the "Ship Now!" button present + enabled for the current sub? */
  async isShipNowAvailable() {
    if (!(await this.shipNowBtn.count())) return false;
    return this.shipNowBtn.isEnabled().catch(() => false);
  }

  async openShipNowModal() {
    await this.shipNowBtn.click();
    await this.shipModal.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Confirm "Yes, Ship Now" and return the captured subscription-write response. */
  async confirmShipNow() {
    const respP = this.waitForSubscriptionWrite();
    await this.shipConfirmBtn.click();
    const response = await respP;
    // Success popup ("You're all set!" / "Order Confirmed") appears after the write.
    await this.shipSuccessText.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    return response;
  }

  async closeShipSuccessPopup() {
    await this.shipSuccessClose.click().catch(() => {});
    await this.page.waitForTimeout(500);
  }

  async cancelShipNow() {
    await this.shipCancelBtn.click().catch(() => {});
  }

  // ----------------------------------------------------------------------------
  // Skip next order
  // ----------------------------------------------------------------------------

  async openSkipModal() {
    await this.skipBtn.click();
    await this.skipModal.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Dates the skip modal promises: { current, next } e.g. { "21 JUN 2026", "21 JUL 2026" }. */
  async getSkipModalDates() {
    return {
      current: (await this.skipDate.textContent().catch(() => '') || '').trim(),
      next: (await this.skipNextDate.textContent().catch(() => '') || '').trim(),
    };
  }

  /** Confirm the skip and return the captured subscription-write response. */
  async confirmSkip() {
    const respP = this.waitForSubscriptionWrite();
    await this.skipConfirmBtn.click();
    const response = await respP;
    await this.skipModal.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    return response;
  }

  async cancelSkip() {
    await this.skipCancelBtn.click().catch(() => {});
    await this.skipModal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  // ----------------------------------------------------------------------------
  // Edit panel (quantity / frequency / date / payment) + Update
  // ----------------------------------------------------------------------------

  async openDeliveryPayment() {
    await this.deliveryPaymentBtn.click();
    await this.updateBtn.waitFor({ state: 'visible', timeout: 15000 });
  }

  async openFrequencySection() {
    await this.frequencyToggle.click();
    await this.nextOrderDateInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * Currently selected quantity as an integer (parsed from "N - $X.XX / unit").
   * Returns NaN when this sub has no quantity control (e.g. PayPal-funnel S&S). The
   * `count()` guard is instant — WITHOUT it, `.evaluate()` on the absent `#quantityId`
   * waits until the test timeout and Playwright tears the page down.
   */
  async getQuantity() {
    if ((await this.quantitySelect.count()) === 0) return NaN;
    const text = await this.quantitySelect.evaluate((s) => s.selectedOptions[0]?.text || '');
    const m = text.match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  /**
   * Per-unit price of the currently selected quantity option, parsed from its
   * "N - $X.XX / unit" label (e.g. "3 - $27.21 / unit" → 27.21). Each option carries its
   * own per-unit price, so this correctly reflects bulk pricing. Returns NaN if absent.
   */
  async getSelectedQuantityUnitPrice() {
    if ((await this.quantitySelect.count()) === 0) return NaN;
    const text = await this.quantitySelect.evaluate((s) => s.selectedOptions[0]?.text || '');
    const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*\/\s*unit/i);
    return m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  }

  /** All selectable quantities as integers. Returns [] when there's no quantity control. */
  async listQuantities() {
    if ((await this.quantitySelect.count()) === 0) return [];
    return this.quantitySelect.evaluate((s) =>
      [...s.options].map((o) => (o.text.match(/^\s*(\d+)/) || [null, null])[1]).filter(Boolean).map(Number),
    );
  }

  /** Select the quantity whose option label starts with "<n> - " (e.g. "3 - $27.21 / unit"). */
  async setQuantity(n) {
    // Playwright's selectOption {label} is an EXACT match and the labels carry a price
    // suffix, so resolve the matching option's value in-page, then select by value.
    const value = await this.quantitySelect.evaluate(
      (s, n) => {
        const opt = [...s.options].find((o) => new RegExp(`^\\s*${n}\\s*-`).test(o.text));
        return opt ? opt.value : null;
      },
      n,
    );
    if (value == null) throw new Error(`setQuantity: no option for qty ${n}`);
    await this.quantitySelect.selectOption(value);
    await this.page.waitForTimeout(600);
  }

  async getFrequency() {
    return (await this.frequencySelect.evaluate((s) => s.selectedOptions[0]?.text || '')).trim();
  }

  /** Selectable frequency labels (e.g. ["Every week", "Every month", …]); drops the placeholder. */
  async listFrequencies() {
    if ((await this.frequencySelect.count()) === 0) return [];
    return this.frequencySelect.evaluate((s) =>
      [...s.options].map((o) => o.text.trim()).filter((t) => t && !/select frequency/i.test(t)),
    );
  }

  /** Set frequency by visible label, e.g. "Every 2 months". */
  async setFrequency(label) {
    await this.frequencySelect.selectOption({ label });
    await this.page.waitForTimeout(600);
  }

  /** Set the editable next-order-date input. Accepts a "YYYY-MM-DD" string. */
  async setNextOrderDateInput(yyyyMmDd) {
    await this.nextOrderDateInput.fill(yyyyMmDd);
    await this.page.waitForTimeout(600);
  }

  async getNextOrderDateInputValue() {
    return this.nextOrderDateInput.inputValue();
  }

  /** The date input's declared bounds: { min, max } (ISO "YYYY-MM-DD" strings, or null). */
  async getNextOrderDateBounds() {
    return this.nextOrderDateInput.evaluate((el) => ({ min: el.min || null, max: el.max || null }));
  }

  /** HTML5 validity of the date input for its current value (out-of-range detection). */
  async getNextOrderDateValidity() {
    return this.nextOrderDateInput.evaluate((el) => ({
      valid: el.validity.valid,
      rangeUnderflow: el.validity.rangeUnderflow, // value < min (past)
      rangeOverflow: el.validity.rangeOverflow,   // value > max (too far out)
    }));
  }

  /**
   * Acknowledge the agreement + click Update, returning the subscription-write response.
   * update-btn is gated by the "Yes, I want to update my subscription!" agreement box
   * (a valid change alone does NOT enable it), so tick that first, then click. The
   * checkbox scrolls into view at the bottom of the edit panel, below the Payment
   * section — click() auto-scrolls to it.
   */
  async clickUpdate() {
    await this.updateBtn.waitFor({ state: 'visible' });
    // Tick the agreement checkbox if the button is still disabled (idempotent — skip if a
    // prior step already ticked it). A real click on the custom div[role=button].checkbox
    // flips the mat-icon and enables update-btn.
    if (await this.updateBtn.isDisabled().catch(() => true)) {
      // Was `.catch(() => {})` on BOTH steps below, which swallowed the only two ways this
      // can go wrong. When the agreement box couldn't be clicked, update-btn stayed disabled
      // and the NEXT line's click() sat on it until the action/test timeout, reporting
      // "element is not enabled" with no hint that a checkbox was the cause
      // (drmarty UAT 2026-08-19). Keep it non-fatal — some callers legitimately arrive with
      // the box already ticked — but record what happened and let the enable-wait verdict
      // drive a real error message below.
      const tickErr = await this.agreeCheckbox
        .click({ timeout: 5000 })
        .then(() => null)
        .catch((e) => e.message);

      const enabled = await this.page
        .waitForFunction(
          () => {
            const b = document.querySelector('[data-qa="update-btn"]');
            return b && !b.disabled;
          },
          { timeout: 5000 },
        )
        .then(() => true)
        .catch(() => false);

      if (!enabled) {
        throw new Error(
          'update-btn stayed DISABLED after attempting to tick the "Yes, I want to update my ' +
          'subscription!" agreement box, so the change cannot be submitted. ' +
          (tickErr ? `Agreement-box click failed: ${tickErr}. ` : 'Agreement-box click reported success. ') +
          'The box has no data-qa (see CLAUDE.md) — if the app changed its markup or it is ' +
          'rendered off-screen/behind an overlay, this locator needs re-auditing. Failing here ' +
          'rather than letting click() burn the test timeout on a button that will never enable.'
        );
      }
    }
    const respP = this.waitForSubscriptionWrite();
    await this.updateBtn.click(); // auto-waits for the button to be enabled
    const response = await respP;
    return response;
  }

  /** Order summary in the edit panel. parseMoney is left to the caller. */
  async getSummary() {
    const t = async (loc) => (await loc.textContent().catch(() => '') || '').trim();
    return {
      subtotalOriginal: await t(this.subtotalOriginal),
      subtotalNew: await t(this.subtotalNew),
      tax: await t(this.summaryTax),
      shipping: await t(this.summaryShipping),
      grandTotal: await t(this.grandTotal),
    };
  }

  /**
   * Assert the edit-panel money math: grand total ≈ new subtotal + tax + shipping (±$0.01).
   * "Free"/blank shipping parses to 0. Returns the parsed summary for further assertions.
   * NOTE: assumes no discount line (test subs carry no coupon); if a coupon is ever added
   * to a test sub this will surface it (grand total would be lower) — that's intended.
   */
  async assertSummaryMath(expect) {
    const s = await this.getSummary();
    const n = (v) => {
      if (v == null || v === '') return 0;
      if (/free/i.test(v)) return 0;
      const m = String(v).match(/-?\$?\s*([\d,]+(?:\.\d+)?)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
    };
    const sub = n(s.subtotalNew || s.subtotalOriginal);
    const tax = n(s.tax);
    const ship = n(s.shipping);
    const grand = n(s.grandTotal);
    expect(
      Math.abs(grand - (sub + tax + ship)),
      `grand total ${s.grandTotal} should equal subtotal ${s.subtotalNew} + tax ${s.tax} + shipping ${s.shipping}`,
    ).toBeLessThan(0.01);
    return { sub, tax, ship, grand };
  }

  // ----------------------------------------------------------------------------
  // Payment method
  // ----------------------------------------------------------------------------

  /** The currently selected payment method's option value (a unique token, even when labels dup). */
  async getPaymentValue() {
    return this.paymentSelect.inputValue();
  }

  /** Selectable payment option VALUES (unique tokens), excluding the "Payment Details" placeholder. */
  async listPaymentValues() {
    if ((await this.paymentSelect.count()) === 0) return [];
    return this.paymentSelect.evaluate((s) =>
      [...s.options].filter((o) => o.value && !/payment details/i.test(o.text)).map((o) => o.value),
    );
  }

  async setPaymentByValue(value) {
    await this.paymentSelect.selectOption(value);
    await this.page.waitForTimeout(600);
  }

  // ----------------------------------------------------------------------------
  // Delivery address (edit)
  // ----------------------------------------------------------------------------

  /** True if the current sub exposes the "Change" delivery-address link (frequency section must be open). */
  async hasShippingAddressForm() {
    return (await this.changeShippingLink.count()) > 0;
  }

  /** Open the "Recipient Info" delivery-address MODAL via the "Change" link. */
  async openShippingAddressForm() {
    await this.changeShippingLink.click();
    await this.shipStreet.waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * All values in the open Recipient Info modal (call while the modal is open). Select
   * fields (country/state) return their option VALUE, e.g. "US|United States",
   * "CA|California" — the same "<code>|<name>" token the <select> exposes.
   */
  async getRecipient() {
    const v = async (loc) => loc.inputValue().catch(() => null);
    return {
      country: await v(this.shipCountry),
      firstName: await v(this.shipFirstName),
      lastName: await v(this.shipLastName),
      street: await v(this.shipStreet),
      additional: await v(this.shipAdditional),
      city: await v(this.shipCity),
      state: await v(this.shipState),
      zip: await v(this.shipPostal),
    };
  }

  /** Visible State/Province option labels — used to assert the country→state dropdown swap. */
  async getStateOptionLabels() {
    return this.shipState.evaluate((s) => [...s.options].map((o) => o.text.trim()));
  }

  /** Visible Country option labels. */
  async getCountryOptionLabels() {
    return this.shipCountry.evaluate((s) => [...s.options].map((o) => o.text.trim()));
  }

  /**
   * Fill any subset of the Recipient Info modal fields. Country is set FIRST (the
   * State/Province list repopulates from it), then State, then the text inputs. Select
   * values are the "<code>|<name>" tokens (e.g. "CA|Canada", "BC|British Columbia").
   * Does NOT commit — call commitRecipientModal() after (so the caller can assert the
   * dropdown swap while the modal is still open).
   */
  async fillRecipient({ country, firstName, lastName, street, additional, city, state, zip } = {}) {
    if (country != null) await this.shipCountry.selectOption(country);
    if (firstName != null) await this.shipFirstName.fill(firstName);
    if (lastName != null) await this.shipLastName.fill(lastName);
    if (street != null) await this.shipStreet.fill(street);
    if (additional != null) await this.shipAdditional.fill(additional);
    if (city != null) await this.shipCity.fill(city);
    if (state != null) {
      // The State/Province list repopulates from the country ASYNCHRONOUSLY (~1-2s live).
      // Wait for the target option to appear before selecting, else selectOption races
      // the swap and throws "no option". Verified live 2026-07-08: US→CAN swaps the list.
      await this.shipState
        .locator(`option[value="${state}"]`)
        .waitFor({ state: 'attached', timeout: 8000 })
        .catch(() => {});
      await this.shipState.selectOption(state);
    }
    if (zip != null) await this.shipPostal.fill(zip);
    await this.page.waitForTimeout(300);
  }

  /**
   * COMMIT the Recipient Info modal via its own "Update" button. That write only updates
   * the panel's Shipping To display and closes the modal (no network write) — the sub is
   * persisted later by clickUpdate() (the panel's "Update Subscription Box"). Waits for
   * the modal to close.
   */
  async commitRecipientModal() {
    await this.shipModalUpdateBtn.click();
    await this.shipStreet.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /**
   * Close the Recipient Info modal via its "Close" button WITHOUT committing — discards
   * any edits. Used by the read-only smoke so nothing is ever persisted. The modal's
   * "Close" (capital C, exact) is distinct from the panel's mat-icon "close".
   */
  async closeRecipientModal() {
    await this.page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
    await this.shipStreet.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  // ----------------------------------------------------------------------------
  // Cancel
  // ----------------------------------------------------------------------------

  /**
   * Click "Cancel Subscription Box" in the edit panel → navigates to
   * /subscription-cancellation/{sfId}. Requires the edit panel to be open.
   */
  async startCancel() {
    await this.cancelBoxBtn.first().click();
    await this.page.waitForURL(/\/subscription-cancellation\//, { timeout: 15000, waitUntil: 'commit' });
    await this.reasonToggles.first().waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * Expand a cancellation reason accordion. Defaults to the brand-configured reason
   * (brand.content.cancelReason) or "ANOTHER REASON - CANCEL NOW" — GI's choice and the
   * one that reveals the final confirm directly. Builder-authored copy, so matched by
   * regex; falls back to the last toggle if the text differs on a brand.
   */
  async selectCancelReason(rx = null) {
    const pattern = rx || new RegExp(this.brand.content?.cancelReason || 'another reason', 'i');
    const count = await this.reasonToggles.count();
    let target = null;
    for (let i = 0; i < count; i++) {
      const t = (await this.reasonToggles.nth(i).textContent().catch(() => '') || '');
      if (pattern.test(t)) { target = this.reasonToggles.nth(i); break; }
    }
    if (!target) target = this.reasonToggles.nth(count - 1); // fallback: last reason
    await target.click();
    await this.page.waitForTimeout(800);
  }

  /**
   * Confirm cancellation through the app's TWO-STEP flow (verified live 2026-07-16):
   *   1. Under the expanded reason, click "I still want to cancel"
   *      (`[data-qa="cancel-btn"]`) — this only OPENS a confirmation modal, no write.
   *   2. In the "ARE YOU SURE YOU WANT TO CANCEL YOUR SUBSCRIPTION?" modal, click
   *      "YES, PLEASE CANCEL SUBSCRIPTION" — THAT fires the subscription write and
   *      redirects to /my-account.
   * TODO: ask team to add data-qa to the modal's confirm/dismiss buttons — they have
   * none, so we fall back to their aria-labels ("Click to confirm cancel" /
   * "Click to close modal without cancelling").
   * Returns the subscription-write response.
   */
  async confirmCancel() {
    // Step 1 — open the confirmation modal.
    const stillCancel = this.page
      .locator('[data-qa="cancel-btn"]', { hasText: /still want to cancel|cancel/i })
      .last();
    await stillCancel.waitFor({ state: 'visible', timeout: 15000 });
    await stillCancel.click();

    // Step 2 — the modal's real confirm fires the write.
    const modalConfirm = this.page.locator('[aria-label="Click to confirm cancel"]');
    await modalConfirm.waitFor({ state: 'visible', timeout: 15000 });
    const respP = this.waitForSubscriptionWrite();
    await modalConfirm.click();
    return await respP;
  }

  // ----------------------------------------------------------------------------
  // Network
  // ----------------------------------------------------------------------------

  /**
   * Resolve on the next non-GET call to the subscriptions API (skip / ship / update /
   * cancel all go here). Logs the matched method + path + status so the exact sub-path
   * is captured on first run. Path-tolerant by design.
   */
  waitForSubscriptionWrite({ timeout = 30000 } = {}) {
    return this.page
      .waitForResponse(
        (r) =>
          /\/(account|commerce)-service\/proxy\/subscription/i.test(r.url()) &&
          r.request().method() !== 'GET',
        { timeout },
      )
      .then((resp) => {
        console.log(`[subscription] write ${resp.request().method()} ${new URL(resp.url()).pathname} → ${resp.status()}`);
        return resp;
      });
  }
}

module.exports = { SubscriptionEditPage };
