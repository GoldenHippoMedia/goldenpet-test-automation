const { test, expect } = require('../../fixtures/brand');
const { LoginPage } = require('../../pages/login.page');
const { CartPage } = require('../../pages/cart.page');

// GI: "Cart - Log In, Add Product then Submit Standard Order Using Default
//      Credit Card (Mike)"
//
// WARNING: This test places a REAL order with a real credit card.
// Do not schedule for production unless you want actual charges.
// The product selection is randomized to avoid duplicate-order errors.

test.describe('Cart - Submit Standard Order', () => {
  test.slow();

  test('submit order with default credit card and verify confirmation', { tag: '@real-order' }, async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);

    // Login
    await loginPage.goto();
    await loginPage.login();

    // Randomize product selection to avoid duplicate-order errors (mirrors GI)
    const randomNum = Math.floor(Math.random() * 100);
    const productKey = randomNum % 2 === 0 ? 'loggedin_std_4' : 'loggedin_std_3';
    await cartPage.addProductByKey(productKey);

    // If random was even, increase qty to further differentiate
    if (randomNum % 2 === 0) {
      await cartPage.increaseQuantity();
    }

    // Check CA terms checkbox if present (needed for CA subscription shipping)
    const caTermsVisible = await cartPage.caTermsCheckbox.isVisible().catch(() => false);
    if (caTermsVisible) {
      await cartPage.caTermsCheckbox.click();
    }

    // Click Submit Order
    await cartPage.submitOrderButton.click();
    await page.waitForTimeout(10000);

    // After submission, should land on either upsell or order-confirmation
    const currentUrl = page.url();
    const isOnUpsell = currentUrl.includes('/upsell');
    const isOnConfirmation = currentUrl.includes('/order-confirmation');

    if (!isOnUpsell && !isOnConfirmation) {
      throw new Error('Order submission failed — still on cart page');
    }

    // Decline all upsells (up to 8 upsell/downsell pages)
    if (isOnUpsell) {
      for (let i = 0; i < 8; i++) {
        if (!page.url().includes('/upsell')) break;

        const notInterested = page.locator('text=I\'m not interested').first();
        const visible = await notInterested.isVisible().catch(() => false);
        if (visible) {
          await notInterested.click();
          await page.waitForTimeout(3000);
        } else {
          break;
        }
      }
    }

    // Verify we're on the order confirmation page
    await expect(page).toHaveURL(/order-confirmation/, { timeout: 30000 });

    // Extract and log the order number
    const orderElement = page.locator('//*[starts-with(text(),"ORD-")]').first();
    const orderVisible = await orderElement.isVisible().catch(() => false);
    if (orderVisible) {
      const orderId = (await orderElement.textContent()).trim();
      // Attach order ID to the test report — visible in the HTML report and terminal
      test.info().annotations.push({ type: 'Order ID', description: orderId });
      console.log(`\n========================================`);
      console.log(`  ORDER PLACED: ${orderId}`);
      console.log(`========================================\n`);
    }
  });
});
