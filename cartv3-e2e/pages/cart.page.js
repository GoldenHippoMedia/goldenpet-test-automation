const { BasePage } = require('./base.page');
const { parseMoney } = require('../helpers/parse-money');

class CartPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Cart Header ---
    this.cartHeader = page.locator('h1:has-text("Cart")');

    // --- Product List ---
    this.productName       = page.locator('[data-qa="product-name"]');
    this.productPrice      = page.locator('[data-qa="product-price"]');
    this.productQuantity   = page.locator('[data-qa="product-quantity"]');
    this.productDeleteLink = page.locator('[data-qa="product-delete-link"]');
    this.productDeleteBtn  = page.locator('[data-qa="product-delete-btn"]');

    // --- Quantity Controls ---
    this.quantityValue       = page.locator('[data-qa="quantity"]');
    this.quantityIncreaseBtn = page.locator('[data-qa="quantity-increase-btn"]');
    // The decrease button is the product-delete-btn span (minus icon) when qty > 1
    // It shares the same parent container as the quantity display
    this.quantityDecreaseBtn = page.locator('[data-qa="product-delete-btn"]');

    // --- Order Summary ---
    this.subtotalValue = page.locator('[data-qa="subtotal"]');
    this.taxValue      = page.locator('[data-qa="tax"]');
    this.shippingText = page.locator('[data-qa="shipping"]');
    this.totalValue    = page.locator('[data-qa="total"]');

    // --- Shipping Info (logged in) ---
    this.shippingAddress     = page.locator('[data-qa="shipping-address"]');
    this.shippingName        = page.locator('[data-qa="shipping-name"]');
    this.shippingStreet      = page.locator('[data-qa="shipping-street"]');
    this.shippingCombined    = page.locator('[data-qa="shipping-combined"]');
    this.shippingCountry     = page.locator('[data-qa="shipping-country"]');
    this.changeShippingLink       = page.locator('[data-qa="shipping-address-change-link"]');
    this.paymentMethod            = page.locator('[data-qa="saved-card"]');
    this.checkoutWithNewCardLink  = page.locator('button:has-text("Checkout with new card")'); // TODO: needs data-qa

    // --- Action Buttons (logged in) ---
    this.submitOrderButton   = page.locator('[data-qa="submit-order-btn"]');
    this.checkoutButton      = page.locator('[data-qa="checkout-btn"]');
    this.continueButton      = page.locator('[data-qa="continue-btn"]');
    this.caTermsCheckbox     = page.locator('[data-qa="ca-terms-checkbox"]');

    // --- Action Buttons (logged out — no data-qa yet) ---
    this.checkoutAsGuestButton = page.locator('#checkout-button');
    this.loginButton           = page.locator('button:text-is("Log In")');

    // --- PayPal (renders as a div with PayPal's iframe inside, not a <button>) ---
    this.paypalButton = page.locator('#paypal-button');

    // --- Coupon ---
    this.couponInput = page.locator('[data-qa="coupon-code"]');
    this.couponApply = page.locator('[data-qa="coupon-apply-btn"]');
    // Fillable inner input — resolves whether data-qa is on the <input> itself or
    // on a <gh-input> wrapper (checkout's coupon is a wrapper; cart's may be too).
    this.couponCodeInput = page
      .locator('[data-qa="coupon-code"] input')
      .or(page.locator('input[data-qa="coupon-code"]'));

    // --- Subscription terms (only when a subscription item is in the cart) ---
    this.subscriptionTerms = page.locator('[data-qa="subscription-terms-text"]');

    // --- Toast Messages ---
    this.toastMessage = page.locator('[data-qa="toast-message"]');

    // --- Footer Links ---
    this.termsLink          = page.locator('text=Terms & Conditions').first();
    this.privacyPolicyLink  = page.locator('text=Privacy Policy').first();
    this.privacyChoicesLink = page.locator('text=Your Privacy Choices').first();
    this.copyrightText      = page.locator('//*[contains(text(),"©")]');

    // --- Empty Cart ---
    this.emptyCartMessage = page.locator('text=Your cart is empty');
    this.noItemsMessage   = page.locator('text=YOU HAVE NO ITEMS IN YOUR CART');
  }

  async goto() {
    await this.navigate('cart');
  }

  /**
   * Add a product to cart using a raw variant ID string.
   * Usage: await cartPage.addProductToCart('a0N3w000016gxzeEAA');
   */
  async addProductToCart(variantId) {
    await this.page.goto(`${this.brand.baseUrl}/cart?product1=${variantId}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.dismissPopupIfPresent();
    await this.waitForCartLoaded();
  }

  /**
   * Add a product to cart using a GI data source column name.
   * Column names match the CSV: loggedin_std_1, loggedout_sub_1, etc.
   * Usage: await cartPage.addProductByKey('loggedin_std_2');
   */
  async addProductByKey(productKey) {
    const url = this.brand.cartUrl(productKey);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.dismissPopupIfPresent();
    await this.waitForCartLoaded();
  }

  /**
   * Wait for the cart's async product loading to finish.
   * The Angular app shows "Loading your cart..." then renders products.
   */
  async waitForCartLoaded() {
    await this.productName.first().waitFor({ state: 'visible', timeout: 30000 });
  }

  async increaseQuantity() {
    await this.quantityIncreaseBtn.first().click();
    await this.page.waitForTimeout(1500);
  }

  async decreaseQuantity() {
    // The minus button is the product-delete-btn (first one for first product)
    await this.quantityDecreaseBtn.first().click();
    await this.page.waitForTimeout(1500);
  }

  async removeFirstProduct() {
    await this.productDeleteLink.first().click();
    await this.page.waitForTimeout(1500);
  }

  async clearCart() {
    await this.goto();
    // Check if cart is already empty
    const isEmpty = await this.isCartEmpty();
    if (isEmpty) return;

    // Remove all items by clicking delete links repeatedly
    while (true) {
      const count = await this.productDeleteLink.count();
      if (count === 0) break;
      await this.productDeleteLink.first().click();
      await this.page.waitForTimeout(2000);
    }
  }

  async getItemTotalPrice() {
    const text = await this.productPrice.first().textContent();
    return parseFloat(text.replace('$', ''));
  }

  async getSubtotalPrice() {
    const text = await this.subtotalValue.textContent();
    const match = text.match(/\$[\d.]+/);
    return match ? parseFloat(match[0].replace('$', '')) : NaN;
  }

  async getTotalPrice() {
    const text = await this.totalValue.textContent();
    const match = text.match(/\$[\d.]+/);
    return match ? parseFloat(match[0].replace('$', '')) : NaN;
  }

  async getQuantity() {
    const text = await this.quantityValue.first().textContent();
    return parseInt(text.trim(), 10);
  }

  /**
   * Apply a coupon on /cart and capture the apply-coupon response + transient toast.
   * Endpoint: POST /commerce-service/proxy/cart/apply-coupon (404 invalid / 200 valid).
   * Returns { response, toastText }.
   *
   * @param {string} code
   * @param {{toastTimeout?: number}} [opts] toastTimeout ms to wait for the transient toast
   *   (default 6000). Pass 0 to SKIP the toast capture entirely — useful for callers that
   *   only need the response status (e.g. the Thank You order test), where applying
   *   AUTOTEST1 fires no matching toast and the wait is dead time.
   */
  async applyCoupon(code, { toastTimeout = 6000 } = {}) {
    await this.couponCodeInput.first().fill(code);
    if (toastTimeout > 0) await this.armToastCapture(); // arm BEFORE the click (toast is transient + retains last msg)
    const respP = this.page.waitForResponse(
      (r) => /\/commerce-service\/proxy\/cart\/apply-coupon/.test(r.url())
        && r.request().method() === 'POST',
      { timeout: 20000 }
    );
    await this.couponApply.click();
    const response = await respP;
    const toastText = toastTimeout > 0
      ? await this.captureToast(/coupon not found|applying|discount|success|added|removed/i, toastTimeout)
      : null;
    console.log(`[cart] apply-coupon "${code}" → status ${response.status()} toast="${toastText}"`);
    return { response, toastText };
  }

  async isCartEmpty() {
    return await this.emptyCartMessage.or(this.noItemsMessage).isVisible().catch(() => false);
  }

  /**
   * Snapshot of the cart for cross-page consistency assertions.
   * Returns { productName, quantity, itemPrice, subtotal, tax, shipping, total }.
   * Any field that isn't displayed (e.g. tax on a guest cart) comes back as null.
   * Uses short timeouts so missing fields return null fast instead of stalling.
   */
  async getOrderSummary() {
    const safeText = async (loc) => {
      try { return await loc.textContent({ timeout: 2000 }); }
      catch { return null; }
    };

    const productName = (await safeText(this.productName.first()) || '').trim() || null;
    const quantity    = await this.getQuantity().catch(() => null);
    const itemPrice   = parseMoney(await safeText(this.productPrice.first()));
    const subtotal    = parseMoney(await safeText(this.subtotalValue));
    const tax         = parseMoney(await safeText(this.taxValue));
    const shipping    = parseMoney(await safeText(this.shippingText));
    const total       = parseMoney(await safeText(this.totalValue));

    return { productName, quantity, itemPrice, subtotal, tax, shipping, total };
  }
}

module.exports = { CartPage };
