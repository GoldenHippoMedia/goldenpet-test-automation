const { BasePage } = require('./base.page');

class LoginPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Locators ---
    this.emailInput = page.locator('gh-input.email-input input');
    this.passwordInput = page.locator('gh-input.password-input input');
    this.submitButton = page.locator('[data-qa="login-btn"]');
    this.forgotPasswordLink = page.locator('.login__forgotPassword');
    this.errorToastMessage = page.locator('[data-qa="toast-message"]');
  }

  // --- Actions ---

  async goto() {
    await this.navigate('login');
  }

  /**
   * Fill credentials and submit. Waits for redirect to /my-account.
   * Use loginAndWait() if you need a custom redirect URL (e.g. /cart).
   */
  async login(email, password) {
    await this.loginAndWait(email, password, /my-account/);
  }

  /**
   * Fill credentials and submit, then wait for a custom URL pattern.
   * Use this when login redirects somewhere other than /my-account
   * (e.g. logging in from the cart page redirects back to /cart).
   */
  async loginAndWait(email, password, urlPattern) {
    await this.emailInput.waitFor({ state: 'visible' });
    await this.emailInput.fill(email || this.brand.email);
    await this.emailInput.press('Tab');
    await this.passwordInput.fill(password || this.brand.password);
    await this.passwordInput.press('Tab');
    await this.submitButton.waitFor({ state: 'visible' });
    await this.submitButton.click();
    await this.page.waitForURL(urlPattern, { timeout: 15000 });
  }
}

module.exports = { LoginPage };
