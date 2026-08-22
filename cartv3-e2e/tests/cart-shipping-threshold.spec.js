const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { parseMoney } = require('../helpers/parse-money');

// GI: "Cart - (Shipping Threshold) Add Products with Added Shipping and
//      Free Shipping (Mike)"
// Adds a product under the free-shipping threshold (should have a shipping fee at
// checkout), then a product that pushes the cart OVER the threshold (should get free
// shipping). Runs logged OUT and uses Checkout As Guest — the free-shipping THRESHOLD
// is a guest/logged-out rule. Logged-in accounts always get free shipping (membership
// benefit), so this is intentionally a guest-path test. Threshold: DMP $50+, Badlands $49+.

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

    // --- Product that pushes the cart OVER the free-shipping threshold (→ free) ---
    // Use the flagship standard product (loggedin_std_1), priced above every brand's
    // free-shipping threshold on its own (DMP $50+, Badlands $49+). loggedin_std_3 is a
    // low-priced treat SKU on some brands (Badlands: $19.99), so it can't be relied on
    // to clear the threshold. (Re-verify DMP after this change — should still pass.)
    await cartPage.addProductByKey('loggedin_std_1');

    // Verify shipping says "Calculated on Next Page" on the cart.
    // (Logged for diagnosis: a " $4.95 " reading here on 2026-08-19 turned out to be
    // [data-qa="shipping"] on /CHECKOUT — the add-to-cart nav had aborted and left the
    // page there. Fixed in CartPage._gotoAddToCart; the assertion stays strict.)
    console.log(
      `[shipping-threshold] cart shipping after crossing threshold: ` +
      `"${((await cartPage.shippingText.textContent()) || '').trim()}" @ ${page.url()}`
    );
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
