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
  async dismissPopupIfPresent() {
    await this.page.waitForTimeout(2000);
    await this.page.evaluate(() => {
      // Remove ALL Attentive elements (overlay, creative iframe, and any containers)
      document.querySelectorAll('[id*="attentive"]').forEach(el => el.remove());

      // Remove Members-Only Discounts popup
      const closeBtn = document.querySelector('[aria-label="Close this option"]');
      if (closeBtn) closeBtn.click();

      // Remove any other marketing modals/overlays with high z-index
      document.querySelectorAll('.modal-overlay, .popup-overlay').forEach(el => el.remove());
    });
    await this.page.waitForTimeout(500);
  }
}

module.exports = { BasePage };
