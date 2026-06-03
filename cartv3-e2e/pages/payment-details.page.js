const { BasePage } = require('./base.page');

/**
 * PaymentDetailsPage — /payment-details (under My Account, logged-in)
 *
 * Two regions:
 *   1. "Credit Card" form — Braintree Hosted Fields (cross-origin iframes,
 *      SAME iframe titles as /checkout) + an "ADD CARD" button.
 *   2. "My Card(s)" list — one row per saved payment method. Each row shows a
 *      type label ("Card Number" / "PayPal Token"), a masked number with the
 *      REAL last-4, a default-payment radio, and a "Remove Card" delete button.
 *
 * Selectors are live-verified (2026-06-03). Unlike the GI source — whose
 * `#cardType` select / non-iframe `#cardNumber` selectors are stale/gone — this
 * page now exposes clean data-qa hooks: add-card-btn, card-list, card-details,
 * delete-card-btn.
 *
 * The ADD CARD button is DISABLED until the Braintree form validates, so fill
 * all four fields before expecting it to be clickable.
 */
class PaymentDetailsPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Credit Card form: Braintree Hosted Field iframes ---
    // Identical iframe titles to /checkout. Each iframe also holds hidden
    // autofill inputs (tabindex="-1") — exclude them with :not([tabindex="-1"]).
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

    this.addCardBtn = page.locator('[data-qa="add-card-btn"]');

    // Shared site-wide toast (same selector as login/pets). May or may not fire
    // on add — used best-effort by getToastText().
    this.toast = page.locator('[data-qa="toast-message"]');

    // --- My Card(s) list ---
    this.cardRows = page.locator('[data-qa="card-list"]');

    // --- Remove-confirmation modal (Material dialog; no data-qa, stable aria) ---
    this.removeModalConfirmBtn = page.locator('button[aria-label="Click to confirm remove payment method"]'); // "YES, REMOVE THIS PAYMENT METHOD"
    this.removeModalCancelBtn = page.locator('button[aria-label="Click to cancel remove payment method"]');   // "NEVERMIND"
  }

  /**
   * Capture the toast message text.
   *
   * The `<standard-toast>` `[data-qa="toast-message"]` element is ALWAYS in the
   * DOM and reports as "visible" — it's just EMPTY when no toast is active and
   * fills with text only while one is showing (then empties again). So we can't
   * gate on visibility; we poll for non-empty text. Toasts are transient, so the
   * caller should start this BEFORE the triggering click (it polls fast enough
   * to catch a multi-second toast). Returns the trimmed text, or null on timeout.
   */
  async _captureToastText(timeout = 8000, ignoreText = null) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const t = ((await this.toast.first().textContent().catch(() => '')) || '').trim();
      // The toast element RETAINS its last message after dismissing, so a prior
      // action's toast (e.g. the add toast) can still be present. Ignore it and
      // wait for the text to change to this action's message.
      if (t && t !== ignoreText) return t;
      await this.page.waitForTimeout(100);
    }
    return null;
  }

  /** Current toast text (may be a stale/lingering message), trimmed. */
  async _currentToastText() {
    return ((await this.toast.first().textContent().catch(() => '')) || '').trim();
  }

  /** Best-effort toast read for a just-performed action (e.g. add). */
  async getToastText() {
    return this._captureToastText(4000);
  }

  /** Navigate to /payment-details and wait for the form to render. */
  async goto() {
    await this.navigate('paymentDetails');
    await this.addCardBtn.waitFor({ state: 'visible', timeout: 20000 });
  }

  /** Total number of saved payment methods currently rendered. */
  async countCards() {
    return this.cardRows.count();
  }

  /**
   * Locator for the saved-card row(s) whose masked number ends in `last4`.
   * The masked text is "**** **** **** 4242"; the digits only ever appear as
   * the last-4, so filtering the row by `hasText: last4` is unambiguous.
   */
  cardRowByLast4(last4) {
    return this.cardRows.filter({ hasText: last4 });
  }

  /** Count of saved-card rows whose masked number ends in `last4`. */
  async countCardsByLast4(last4) {
    return this.cardRowByLast4(last4).count();
  }

  /**
   * Type into one Braintree Hosted Field iframe input.
   * Waits for the input to be ready (the iframes initialize AFTER the rest of the
   * page, so typing too early silently drops the first keystrokes), clears any
   * existing value, then pressSequentially() — Braintree listens for keydown/input,
   * so fill() bypasses its validation.
   */
  async _typeIntoFrame(locator, value) {
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.click();
    await locator.press('ControlOrMeta+a');
    await locator.press('Backspace');
    await locator.pressSequentially(String(value), { delay: 60 });
  }

  /**
   * Fill the Braintree Hosted Field CC inputs.
   * Strips the "/" from the expiry (Braintree auto-inserts it; typing "/" yields
   * "12//30"). Verifies the card number actually registered and retries once —
   * dropped keystrokes against a not-yet-ready hosted field are the classic cause
   * of an "ADD CARD never enables" hang.
   * @param {{ number, name, expiry, cvv }} card
   */
  async fillCreditCard({ number, name, expiry, cvv } = {}) {
    const expiryDigits = String(expiry).replace(/\D/g, '');
    const wantDigits = String(number).replace(/\D/g, '');

    await this._typeIntoFrame(this.cardNumberInput, number);

    // Verify the number landed; retry once if the hosted field dropped digits.
    const gotDigits = (await this.cardNumberInput.inputValue().catch(() => '')).replace(/\D/g, '');
    if (gotDigits.length !== wantDigits.length) {
      console.log(`[payment-add-card] card number captured "${gotDigits}" (expected ${wantDigits.length} digits) — retrying`);
      await this._typeIntoFrame(this.cardNumberInput, number);
    }

    await this._typeIntoFrame(this.cardNameInput, name);
    await this._typeIntoFrame(this.cardExpiryInput, expiryDigits);
    await this._typeIntoFrame(this.cardCvvInput, cvv);
  }

  /**
   * Fill the form, wait for ADD CARD to enable, then click it.
   * Returns the network response of the backend save call (the POST captured by
   * the predicate) so the test can assert it persisted server-side.
   *
   * The exact save endpoint isn't documented yet — it's a client-side call under
   * the app's "/proxy/" API. The predicate matches any POST to a /proxy/ path and
   * the test logs the matched URL so we can pin it precisely after the first run.
   * Braintree's own tokenization POST goes to braintreegateway.com (not /proxy/),
   * so it's naturally excluded.
   * @param {{ number, name, expiry, cvv }} card
   */
  async addCard(card) {
    await this.fillCreditCard(card);
    await this.addCardBtn.waitFor({ state: 'visible' });

    // Form validity gates the button — wait for Braintree to mark it enabled.
    // A clear failure here (vs. hanging into the global test timeout) tells us the
    // hosted fields didn't all register; the catch logs what each field captured.
    try {
      await this.page.waitForFunction(
        () => {
          const b = document.querySelector('[data-qa="add-card-btn"]');
          return b && !b.disabled;
        },
        { timeout: 15000 }
      );
    } catch (e) {
      const num = (await this.cardNumberInput.inputValue().catch(() => '?')).replace(/\s/g, '');
      const exp = await this.cardExpiryInput.inputValue().catch(() => '?');
      const cvv = await this.cardCvvInput.inputValue().catch(() => '?');
      throw new Error(
        `ADD CARD never became enabled — Braintree form is invalid. Captured: number="${num}", expiry="${exp}", cvv="${cvv}". The hosted fields likely didn't fully register the typed values.`
      );
    }

    const [response] = await Promise.all([
      this.page.waitForResponse(
        r => r.request().method() === 'POST'
          && /\/payment-service\/proxy\/.*payment-option/.test(r.url()),
        { timeout: 20000 }
      ),
      this.addCardBtn.click(),
    ]);

    // Log so we can pin the exact endpoint after the first headed run.
    console.log(`[payment-add-card] save POST → ${response.request().method()} ${response.url()} (status ${response.status()})`);
    return response;
  }

  /**
   * Open the remove-confirmation modal for the first saved card ending in `last4`
   * and wait for it to render (NEVERMIND/confirm buttons visible).
   */
  async openRemoveModalForLast4(last4) {
    await this.cardRowByLast4(last4).first().locator('[data-qa="delete-card-btn"]').click();
    await this.removeModalCancelBtn.waitFor({ state: 'visible', timeout: 10000 });
  }

  /** Click NEVERMIND and wait for the modal to close (non-destructive cancel). */
  async cancelRemoveModal() {
    await this.removeModalCancelBtn.click();
    await this.removeModalCancelBtn.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /**
   * Click "YES, REMOVE THIS PAYMENT METHOD" and wait for the modal to close.
   * Captures (concurrently with the click, since both are transient):
   *   - the backend delete call's response (any non-GET /proxy/ request), and
   *   - the success toast text.
   * Returns { response, toastText } (either may be null if not observed).
   */
  async confirmRemoveModal() {
    // Snapshot any lingering toast text (e.g. the add toast) so we don't mistake
    // it for the removal toast — capture waits for the text to CHANGE.
    const staleToast = await this._currentToastText();
    const toastP = this._captureToastText(8000, staleToast);
    const respP = this.page
      .waitForResponse(
        r => r.request().method() === 'DELETE'
          && /\/account-service\/proxy\/payment-options\//.test(r.url()),
        { timeout: 20000 }
      )
      .catch(() => null);

    await this.removeModalConfirmBtn.click();

    const [toastText, response] = await Promise.all([toastP, respP]);
    if (response) {
      console.log(`[payment-add-card] delete call → ${response.request().method()} ${response.url()} (status ${response.status()})`);
    }
    await this.removeModalConfirmBtn.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    return { response, toastText };
  }

  /**
   * Remove ALL saved cards whose masked number ends in `last4` (idempotent /
   * self-healing — clears any stragglers a prior failed run left behind).
   * Goes through the confirmation modal (open → YES) for each.
   */
  async removeAllCardsByLast4(last4) {
    // Re-query each iteration: the list re-renders after every deletion.
    for (let guard = 0; guard < 20; guard++) {
      const before = await this.cardRowByLast4(last4).count();
      if (before === 0) return;

      await this.openRemoveModalForLast4(last4);
      await this.confirmRemoveModal();

      // Wait for the count of OUR (last4) rows to drop. We can't watch the total
      // rendered count — the list windows ~49 rows, so an off-window card can
      // backfill a deleted slot and keep the total flat. The last4 set is unique
      // to us, so it shrinks deterministically.
      await this._waitForLast4Count(last4, before - 1);
    }
    throw new Error(`removeAllCardsByLast4(${last4}) exceeded its iteration guard — cards not clearing`);
  }

  /** Poll until the number of saved-card rows ending in `last4` is <= target. */
  async _waitForLast4Count(last4, target, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if ((await this.cardRowByLast4(last4).count()) <= target) return;
      await this.page.waitForTimeout(300);
    }
    throw new Error(`Timed out waiting for "${last4}" card rows to drop to ${target}`);
  }
}

module.exports = { PaymentDetailsPage };
