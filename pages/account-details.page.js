const { BasePage } = require('./base.page');

class AccountDetailsPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Sections ---
    this.customerInfoForm    = page.locator('[data-qa="customer-info-form"]');
    this.shippingAddressForm = page.locator('[data-qa="shipping-address-form"]');
    this.addressForm         = page.locator('[data-qa="address-form"]');

    // --- Buttons ---
    this.paymentSettingsBtn = page.locator('[data-qa="payment-settings-btn"]');
    this.saveBtn            = page.locator('[data-qa="save-btn"]');
  }

  async goto() {
    await this.navigate('accountDetails');
  }

  /**
   * Get the street address displayed in the Shipping Address section.
   * The address is shown as read-only <p> tags (not inputs).
   * Returns the first address line (e.g. "23251 Mulholland Drive").
   */
  async getStreetAddress() {
    await this.shippingAddressForm.waitFor({ state: 'visible', timeout: 15000 });
    // Get all <p> tags inside the shipping address form,
    // skip the "Shipping Address" and "Edit" labels
    const allParagraphs = this.shippingAddressForm.locator('p');
    const count = await allParagraphs.count();
    for (let i = 0; i < count; i++) {
      const text = (await allParagraphs.nth(i).textContent()).trim();
      // The street address line contains a number (e.g. "23251 Mulholland Drive")
      if (/^\d/.test(text)) {
        return text;
      }
    }
    return '';
  }
}

module.exports = { AccountDetailsPage };
