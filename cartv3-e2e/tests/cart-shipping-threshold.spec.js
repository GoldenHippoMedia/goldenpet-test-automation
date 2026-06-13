const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { parseMoney } = require('../helpers/parse-money');

// GI: "Cart - (Shipping Threshold) Add Products with Added Shipping and
//      Free Shipping (Mike)"
// Adds product under $50 (should have shipping fee on checkout),
// then product over $50 (should have free shipping on checkout).
// Both tests run logged out and use Checkout As Guest.

test.describe('Cart - Shipping Threshold', () => {
  test('products under threshold have shipping fee, over threshold get free shipping', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    const shippingFeeVariant = brand.testProducts.loggedout_add_shipping_fee;
    // Free-shipping display value is brand/locale-specific (drmarty shows "FREE!" on
    // checkout for an over-threshold cart; a CAD/other-locale brand may differ).
    const freeShippingText = brand.content.freeShippingText || 'FREE!';

    // Skip if no shipping-fee product is configured for this brand
    test.skip(!shippingFeeVariant || shippingFeeVariant === 'N/A', 'No shipping-fee product configured');

    // The [data-qa="shipping"] locator works on both cart and checkout pages
    const shippingValue = page.locator('[data-qa="shipping"]');

    // --- Product UNDER $50 (should have shipping fee) ---
    await cartPage.addProductToCart(shippingFeeVariant);

    // Verify shipping says "Calculated on Next Page" on the cart
    await expect(cartPage.shippingText).toContainText('Calculated on Next Page');

    // Go to checkout as guest
    await cartPage.checkoutAsGuestButton.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });

    // Verify shipping fee is NOT free on checkout
    await expect(shippingValue).toBeVisible();
    await expect(shippingValue).not.toContainText(freeShippingText);
    await expect(shippingValue).not.toContainText('FREE');

    // --- Product OVER $50 (should have free shipping) ---
    await cartPage.addProductByKey('loggedin_std_3');

    // Verify shipping says "Calculated on Next Page" on the cart
    await expect(cartPage.shippingText).toContainText('Calculated on Next Page');

    // Go to checkout as guest
    await cartPage.checkoutAsGuestButton.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });

    // Verify shipping is free on checkout. The label is env/locale-specific —
    // prod renders "$0.00" (class free-text), UAT may render "FREE!" — so assert
    // the value parses to $0 either way rather than matching the literal word.
    await expect(shippingValue).toBeVisible();
    await expect.poll(async () => parseMoney(await shippingValue.textContent())).toBe(0);
  });
});
