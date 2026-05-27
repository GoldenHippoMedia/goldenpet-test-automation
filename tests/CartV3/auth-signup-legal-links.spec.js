const { test, expect } = require('../../fixtures/brand');
const { SignupPage } = require('../../pages/signup.page');

// GI: "Create Account - Legal Sign-Up Checkbox and Links"
// Verifies the Terms and Privacy Policy links on the signup page open the
// correct brand-specific legal pages. Does NOT submit the form or create an account.

test.describe('Auth - Signup Legal Links', () => {
  test('Terms and Privacy Policy links on signup page load correct pages', async ({ page, brand }) => {
    const signupPage = new SignupPage(page, brand);

    // --- Setup: fill form and check terms box (GI steps 2-6) ---
    await signupPage.goto();
    await signupPage.firstNameInput.fill('QA');
    await signupPage.lastNameInput.fill('Tester');
    await signupPage.emailInput.fill(`qa.tester.${Date.now()}@example.com`);
    await signupPage.checkAcceptTerms();

    // Verify "I Accept <brand> Terms and Privacy Policy" label is visible (GI step 7)
    await expect(signupPage.acceptTermsLabel).toBeVisible();

    // --- Terms link (GI steps 8-10) ---
    const [termsTab] = await Promise.all([
      page.context().waitForEvent('page'),
      signupPage.termsLink.click(),
    ]);
    await termsTab.waitForLoadState('domcontentloaded');
    await expect(termsTab).toHaveURL(/terms/);
    await expect(termsTab.locator('body')).toContainText('Terms');
    await termsTab.close();

    // --- Reload and re-fill before testing Privacy link (GI steps 12-13) ---
    await signupPage.goto();
    await signupPage.firstNameInput.fill('QA');
    await signupPage.lastNameInput.fill('Tester');
    await signupPage.emailInput.fill(`qa.tester.${Date.now()}@example.com`);
    await signupPage.checkAcceptTerms();

    // --- Privacy Policy link (GI steps 14-16) ---
    const [privacyTab] = await Promise.all([
      page.context().waitForEvent('page'),
      signupPage.privacyPolicyLink.click(),
    ]);
    await privacyTab.waitForLoadState('domcontentloaded');
    await expect(privacyTab).toHaveURL(/privacy/);
    await expect(privacyTab.locator('body')).toContainText('Privacy Policy');
    await privacyTab.close();
  });
});
