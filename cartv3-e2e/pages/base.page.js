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
}

module.exports = { BasePage };
