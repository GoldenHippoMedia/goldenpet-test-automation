const { BasePage } = require('./base.page');
const { parseMoney } = require('../helpers/parse-money');

class CartPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Cart Header ---
    this.cartHeader = page.locator('h1:has-text("Cart")');

    // --- Product List ---
    // One <cart-line> per line item (audited 2026-08-04: each contains exactly one
    // product-name + product-price + product-delete-link). Scope per-row reads to
    // this instead of positionally indexing the page-wide locators below — the
    // per-field counts DIFFER across rows (a subscription row renders no
    // [data-qa="quantity"] stepper), so global .nth(i) pairs the wrong values together.
    this.productRows       = page.locator('cart-line');
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

    // --- Upsell loading spinner (platform component, shared across brands) ---
    // Full-screen z-9999 overlay (<text-loading-spinner> → aside.upsellSpinnerOverlay)
    // that intercepts pointer events on the cart while it's up. If we click Remove /
    // qty controls before it clears, the click is swallowed and Playwright retries
    // until the element detaches → timeout. Wait it out before those clicks.
    this.upsellSpinnerOverlay = page.locator('aside.upsellSpinnerOverlay');

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
   * Navigate to a `/cart?product1=<id>` add-to-cart deep link.
   *
   * On prod this navigation frequently rejects with `net::ERR_ABORTED`. An abort has TWO
   * possible meanings and they need opposite handling:
   *   a) the app consumed the ?product1= query and client-side-redirected to a bare /cart
   *      before the original navigation settled — harmless, we're on the cart;
   *   b) the navigation was cancelled outright and we are STILL ON THE PREVIOUS PAGE.
   *
   * v1 of this helper assumed (a) and swallowed every abort. When (b) happened mid-spec
   * the page stayed on /checkout, and because /checkout ALSO renders
   * [data-qa="product-name"], waitForCartLoaded() returned a false green — the spec then
   * burned its full 90s waiting for a cart-only button on the checkout page
   * (drmarty prod 2026-08-19: cart-shipping-threshold + cart-verify-fields-and-links).
   *
   * So: tolerate the abort, but VERIFY we landed, retry the navigation if we didn't, and
   * hard-gate on the URL before any element wait. cartUrl() always builds a `/cart?...`
   * path for every brand, so the /cart check is brand-safe.
   */
  async _gotoAddToCart(url, { attempts = 2 } = {}) {
    const onCart = () => /\/cart(\?|\/|$)/.test(this.page.url());

    for (let attempt = 1; attempt <= attempts; attempt++) {
      let aborted = false;
      await this.page.goto(url, { waitUntil: 'commit' }).catch((e) => {
        if (!/ERR_ABORTED/i.test(e.message || '')) throw e;
        aborted = true;
      });

      if (!aborted || onCart()) break;

      console.log(
        `[cart] add-to-cart nav aborted and left us on ${this.page.url()} ` +
        `(attempt ${attempt}/${attempts}) — re-navigating: ${url}`
      );
      await this.page.waitForTimeout(1000);
    }

    // Hard gate: never run element waits until we're demonstrably on the cart, or a
    // wrong-page state turns into a confusing timeout on a missing cart control.
    await this.page.waitForURL(/\/cart(\?|\/|$)/, { timeout: 20000 });
    await this.dismissPopupIfPresent();
    await this.waitForCartLoaded();
  }

  /**
   * Add a product to cart using a raw variant ID string.
   * Usage: await cartPage.addProductToCart('a0N3w000016gxzeEAA');
   */
  async addProductToCart(variantId) {
    await this._gotoAddToCart(`${this.brand.baseUrl}/cart?product1=${variantId}`);
  }

  /**
   * Add a product to cart using a GI data source column name.
   * Column names match the CSV: loggedin_std_1, loggedout_sub_1, etc.
   * Usage: await cartPage.addProductByKey('loggedin_std_2');
   */
  async addProductByKey(productKey) {
    await this._gotoAddToCart(this.brand.cartUrl(productKey));
  }

  /**
   * Wait for the cart's async product loading to finish.
   * The Angular app shows "Loading your cart..." then renders products.
   *
   * NOT page-discriminating: /checkout renders [data-qa="product-name"] too, so this
   * resolves happily on the checkout page. Callers that navigated must confirm the URL
   * separately (see _gotoAddToCart) rather than treating this as "we're on the cart".
   */
  async waitForCartLoaded() {
    await this.productName.first().waitFor({ state: 'visible', timeout: 30000 });
  }

  /**
   * Assert the cart rendered in its LOGGED-IN form, reloading if it didn't.
   *
   * Seen on drmarty prod (2026-08-19, cart-paypal-button): login had succeeded — we'd
   * already waited for /my-account — but a later `/cart?product1=` navigation rendered
   * the LOGGED-OUT cart shell (header "Create Account | Log In", body "Checkout as
   * Guest" + "LOG IN"), and `#paypal-button` sat present-but-hidden in that state, so
   * the spec timed out on a visibility check that could never pass.
   *
   * A reload re-requests /cart with the auth cookie, so if this is a render/caching
   * race the reload clears it. If it is NOT a race — a genuine prod session bug — the
   * retry log below fires on every attempt and the thrown message says so explicitly,
   * which is the signal to escalate rather than keep hardening the test.
   *
   * Call this after any navigation to /cart in a logged-in spec, before asserting on
   * controls that only render for an authenticated cart.
   */
  async waitForLoggedInCart({ reloads = 2 } = {}) {
    const loggedInControl = this.submitOrderButton.or(this.changeShippingLink).first();

    for (let attempt = 0; attempt <= reloads; attempt++) {
      const ok = await loggedInControl
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (ok) return;

      if (attempt === reloads) break;
      console.log(
        `[cart] rendered the LOGGED-OUT cart while authenticated — reloading (${attempt + 1}/${reloads})`
      );
      await this.page.reload({ waitUntil: 'commit' });
      await this.dismissPopupIfPresent();
      await this.waitForCartLoaded();
    }

    throw new Error(
      `Cart kept rendering in logged-out state after ${reloads} reloads, despite a successful login ` +
      `(no [data-qa="submit-order-btn"] / shipping-address-change-link). ` +
      `This is a prod session/caching defect, not a test timing issue — file it.`
    );
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

  /**
   * Wait for the upsell loading spinner overlay to clear before interacting with the
   * cart. The overlay (z-9999, full-screen) intercepts pointer events, so Remove / qty
   * clicks are swallowed while it's up. Brand-agnostic: resolves immediately on
   * pages/brands where it never renders (a non-existent element counts as "hidden").
   */
  async waitForUpsellSpinnerGone(timeout = 15000) {
    await this.upsellSpinnerOverlay
      .first()
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {});
  }

  async removeFirstProduct() {
    await this.waitForUpsellSpinnerGone();
    await this.productDeleteLink.first().click();
    await this.page.waitForTimeout(1500);
  }

  /** Poll until the cart has fewer than `before` rows. Returns false on timeout. */
  async _waitForRowCountBelow(before, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await this.productDeleteLink.count()) < before) return true;
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  async clearCart() {
    await this.goto();
    // Check if cart is already empty
    const isEmpty = await this.isCartEmpty();
    if (isEmpty) return;

    // Remove rows one at a time, waiting for the row count to actually DROP instead of
    // sleeping a flat 2s per item. The flat sleep was pure dead time — on prod it pushed
    // checkout-prepopulate's afterEach past the test timeout — and it was also unsafe:
    // a removal slower than 2s left the row in place and the loop re-clicked it.
    let count = await this.productDeleteLink.count();
    while (count > 0) {
      await this.waitForUpsellSpinnerGone();
      await this.productDeleteLink.first().click();
      if (!(await this._waitForRowCountBelow(count))) {
        throw new Error(`clearCart: row count stayed at ${count} 15s after clicking Remove`);
      }
      count = await this.productDeleteLink.count();
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
