const { BasePage } = require('./base.page');

class SignupPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    this.firstNameInput      = page.locator('[data-qa="first-name"]');
    this.lastNameInput       = page.locator('[data-qa="last-name"]');
    this.emailInput          = page.locator('[data-qa="email"]');
    // sr-only input — use checkAcceptTerms() method, never click() directly
    this.acceptTermsCheckbox = page.locator('#acceptTerms').first();
    this.acceptTermsLabel    = page.locator('p:has-text("I Accept")');
    this.termsLink           = page.locator('a:has-text("Terms")').first();
    this.privacyPolicyLink   = page.locator('a:has-text("Privacy Policy")').first();
  }

  async goto() {
    await this.navigate('register');
  }

  // Angular Material sr-only checkbox — JS click bypasses mat-icon pointer-events interception
  async checkAcceptTerms() {
    await this.acceptTermsCheckbox.evaluate(el => el.click());
  }
}

module.exports = { SignupPage };
