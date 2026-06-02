const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

// GI: "Special Rules - DrMartyPets - Country Selections in Manage Account (Mike)"
// DrMartyPets only — the Shipping Address country dropdown on /account-details
// must offer United States and Canada.

test.describe('Special Rules - DrMartyPets Country Selections in Manage Account', () => {
  test(
    'Shipping Address country dropdown includes US and Canada',
    async ({ page, brand }) => {
      test.skip(brand.name !== 'drmarty', 'DrMartyPets only');

      const loginPage = new LoginPage(page, brand);
      const accountDetailsPage = new AccountDetailsPage(page, brand);

      await loginPage.goto();
      await loginPage.login();

      await accountDetailsPage.goto();

      // Click Edit in the Shipping Address section to reveal the input fields
      const editLink = page.locator(
        "xpath=//section[@data-qa='address-form']//p[normalize-space(text())='Edit']"
      );
      await editLink.click();

      // Country select becomes visible after clicking Edit
      const countrySelect = page.locator('[data-qa="ship-country-shipping"]');
      await countrySelect.waitFor({ state: 'visible', timeout: 10000 });

      // Assert United States is available
      await expect(
        page.locator('xpath=//*[@data-qa="ship-country-shipping"]/option[@value="US|United States"]')
      ).toBeAttached();

      // Assert Canada is available
      await expect(
        page.locator('xpath=//*[@data-qa="ship-country-shipping"]/option[@value="CA|Canada"]')
      ).toBeAttached();
    }
  );
});
