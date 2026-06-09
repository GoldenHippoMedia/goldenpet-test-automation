/**
 * Base page class that all page objects inherit from.
 * Handles site-wide concerns like popup dismissal.
 */
class BasePage {
  constructor(page, brand) {
    this.page = page;
    this.brand = brand;
  }

  // Navigates to a page and dismisses the initial popup via reload
  async navigate(pathKey) {
    await this.page.goto(this.brand.url(pathKey), { waitUntil: 'domcontentloaded' });
    await this.dismissPopupIfPresent();
  }

  // Closes marketing popups (Attentive SMS, Members-Only, TV Offer, etc.)
  // Call this after any navigation where popups may appear.
  //
  // Popup cleanup is BEST-EFFORT and must never fail a test. The target page can
  // still be settling (Angular hydration / a client-side redirect) when we evaluate,
  // which destroys the execution context mid-call ("Execution context was destroyed,
  // most likely because of a navigation"). So we retry once after the page settles
  // and otherwise swallow the error.
  async dismissPopupIfPresent() {
    await this.page.waitForTimeout(2000);

    const cleanup = () => {
      // Remove ALL Attentive elements (overlay, creative iframe, and any containers)
      document.querySelectorAll('[id*="attentive"]').forEach(el => el.remove());

      // Remove Members-Only Discounts popup
      const closeBtn = document.querySelector('[aria-label="Close this option"]');
      if (closeBtn) closeBtn.click();

      // Remove any other marketing modals/overlays with high z-index
      document.querySelectorAll('.modal-overlay, .popup-overlay').forEach(el => el.remove());
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.page.evaluate(cleanup);
        break;
      } catch (e) {
        const navRace = /context was destroyed|execution context|navigation/i.test(e.message || '');
        if (attempt === 0 && navRace) {
          // Page navigated under us — let it settle, then try once more.
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          await this.page.waitForTimeout(1000);
          continue;
        }
        // Best-effort: never fail the test on popup cleanup.
        break;
      }
    }

    await this.page.waitForTimeout(500);
  }

  // ----- site-wide transient toast -----
  // `<standard-toast data-qa="toast-message">` is ALWAYS in the DOM: empty when
  // idle, fills with text only WHILE a toast shows, then empties — and it RETAINS
  // its last message after dismissing. Toasts are transient, so start capturing
  // BEFORE the triggering click and poll for non-empty text that differs from any
  // stale message. (Same pattern proven on payments + account-details.)

  toast() {
    return this.page.locator('[data-qa="toast-message"]').first();
  }

  /** Current (possibly stale/lingering) toast text, trimmed. */
  async currentToastText() {
    return ((await this.toast().textContent().catch(() => '')) || '').trim();
  }

  /** Poll up to `timeout`ms for a non-empty toast whose text differs from `ignoreText`. */
  async captureToastText(timeout = 8000, ignoreText = null) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const t = await this.currentToastText();
      if (t && t !== ignoreText) return t;
      await this.page.waitForTimeout(100);
    }
    return null;
  }

  // ----- robust transient-toast capture (handles the "retains last message" quirk) -----
  // The "wait for text to CHANGE from stale" approach (captureToastText) fails when the
  // new toast repeats the lingering one (e.g. "Coupon not found" on /cart then the SAME
  // on /checkout — the text never "changes"). Instead, arm a MutationObserver right before
  // the triggering action so every toast that fires is recorded, then read them back.

  /** Arm an observer on the toast element. Call immediately before the triggering click. */
  async armToastCapture() {
    await this.page.evaluate(() => {
      window.__toastCap = [];
      const el = document.querySelector('[data-qa="toast-message"]');
      try { if (window.__toastObs) window.__toastObs.disconnect(); } catch (e) {}
      if (!el) return;
      const push = () => {
        const t = (el.textContent || '').trim();
        if (t && window.__toastCap[window.__toastCap.length - 1] !== t) window.__toastCap.push(t);
      };
      window.__toastObs = new MutationObserver(push);
      window.__toastObs.observe(el, { childList: true, subtree: true, characterData: true });
      push();
    });
  }

  /**
   * Read back captured toasts (after armToastCapture + the action). Returns the first
   * captured text matching `rx` (or, if no rx, the last non-empty toast). Polls so the
   * transient sequence has time to finish.
   */
  async captureToast(rx = null, timeout = 6000) {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeout) {
      const caps = await this.page.evaluate(() => {
        const el = document.querySelector('[data-qa="toast-message"]');
        const cur = ((el || {}).textContent || '').trim();
        const arr = window.__toastCap || [];
        if (cur && arr[arr.length - 1] !== cur) arr.push(cur);
        return arr.slice();
      });
      if (caps.length) last = caps[caps.length - 1];
      if (rx) { const hit = caps.find((t) => rx.test(t)); if (hit) return hit; }
      await this.page.waitForTimeout(120);
    }
    return rx ? null : last;
  }
}

module.exports = { BasePage };
