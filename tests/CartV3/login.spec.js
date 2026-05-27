const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');

test.describe(`Login - ${process.env.BRAND}`, () => {
  test('successful login with valid credentials', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);

    // Navigate to login page
    await loginPage.goto();

    // Verify we're on the login page
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.submitButton).toBeVisible();

    // Login and verify redirect to account page
    await loginPage.login();
    await expect(page).toHaveURL(/my-account/);
    await expect(page.getByText('Account Management')).toBeVisible();
    await expect(page.getByText('My Recent Orders')).toBeVisible();
  });
});
