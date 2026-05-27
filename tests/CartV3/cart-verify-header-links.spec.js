const { test, expect } = require('../../fixtures/brand');
const { CartPage } = require('../../pages/cart.page');
const { HeaderPage } = require('../../pages/header.page');

// GI: "Cart - Verify Header Links (Mike)"
// Validates logo and Shop links from the cart page navigate correctly.

test.describe('Cart - Verify Header Links', () => {
  test('logo and shop links navigate correctly from cart page', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    const headerPage = new HeaderPage(page, brand);

    await cartPage.goto();

    // Click logo — verify it navigates to homepage
    await headerPage.logoLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(new RegExp(`${brand.baseUrl.replace(/https?:\/\//, '')}/?$`));

    // Go back to cart
    await cartPage.goto();

    // Click Shop link — verify products page loads
    await headerPage.shopLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/products|shop/);
  });
});
