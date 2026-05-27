const { BasePage } = require('./base.page');
const { parseMoney } = require('../helpers/parse-money');

/**
 * CheckoutPage — /checkout
 *
 * The checkout page has two display modes:
 *   1. PayPal-first (default): only Order Summary + PayPal buttons visible
 *   2. Credit card mode: full form (Customer Info, Delivery, Payment) visible
 *      — entered by clicking "Or pay with credit card"
 *
 * CC fields are Braintree Hosted Fields rendered inside cross-origin iframes.
 * State dropdown values use the format "CA|California" (code|label).
 *
 * Selectors: no data-qa on checkout form fields — uses placeholder text + position.
 */
class CheckoutPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Toggle to CC form ---
    this.payWithCreditCardLink = page.locator('text=Or pay with credit card');

    // --- Customer Information ---
    // Scoped to <main> to exclude the footer newsletter form, which also has
    // input[placeholder="First Name"]. Footer uses "Email Address"; this form uses "Email".
    this.custFirstName = page.locator('main input[placeholder="First Name"]');
    this.custLastName  = page.locator('main input[placeholder="Last Name"]');
    this.custPhone     = page.locator('main input[placeholder="Phone"]').first();
    this.custEmail     = page.locator('main input[placeholder="Email"]');

    // --- Delivery Information (lowercase "n" in name — unique to this section) ---
    this.delivCountry   = page.locator('select').first();   // defaults to United States
    this.delivFirstName = page.locator('input[placeholder="First name"]');
    this.delivLastName  = page.locator('input[placeholder="Last name"]');
    this.delivStreet    = page.locator('input[placeholder="Street Address"]');
    this.delivCity      = page.locator('input[placeholder="City"]');
    this.delivState     = page.locator('select').nth(1);    // State dropdown (2nd select)
    this.delivZip       = page.locator('input[placeholder="Zip/Postal Code"]');
    this.delivPhone     = page.locator('input[placeholder="Phone"]').nth(1);

    // --- Payment: Braintree Hosted Field iframes ---
    // Each field is a separate cross-origin iframe. Each iframe also contains
    // hidden autofill inputs (tabindex="-1", aria-hidden="true") — exclude them.
    this.cardNumberInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - Credit Card Number"]')
      .locator('input:not([tabindex="-1"])');
    this.cardNameInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - Cardholder Name"]')
      .locator('input:not([tabindex="-1"])');
    this.cardExpiryInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - Expiration Date"]')
      .locator('input:not([tabindex="-1"])');
    this.cardCvvInput = page
      .frameLocator('iframe[title="Secure Credit Card Frame - CVV"]')
      .locator('input:not([tabindex="-1"])');

    // --- PayPal button (checkout page Order Summary panel) ---
    // Braintree renders PayPal buttons inside an iframe — handled by waitForEvent('popup')
    this.paypalCheckoutBtn = page.frameLocator('iframe[id*="paypal"], iframe[name*="paypal"]').first()
      .locator('div[role="button"], button').first();

    // --- Order Summary (right panel) ---
    this.couponInput    = page.locator('input[placeholder="Coupon Code"]');
    this.couponApplyBtn = page.locator('button:has-text("APPLY")');
    // Order Summary money fields — label text → next sibling.
    // Use normalize-space() because Angular wraps text in <!----> comments creating extra whitespace.
    // "Sales Tax:" appears as "TBD" before delivery address is filled, then becomes a value.
    this.summarySubtotal = page.locator('xpath=//*[normalize-space(text())="Subtotal:"]/following-sibling::*[1]');
    this.summaryTax      = page.locator('xpath=//*[normalize-space(text())="Sales Tax:"]/following-sibling::*[1]');
    this.summaryShipping = page.locator('xpath=//*[normalize-space(text())="Shipping:"]/following-sibling::*[1]');
    this.summaryTotal    = page.locator('xpath=//*[normalize-space(text())="Total:"]/following-sibling::*[1]');

    // --- Submit ---
    // No data-qa — use button text
    this.submitOrderBtn = page.getByRole('button', { name: /click to submit order/i });

    // --- Footer legal links ---
    this.termsLink   = page.locator('a:has-text("Terms & Conditions")').first();
    this.privacyLink = page.locator('a:has-text("Privacy Policy")').first();

    // --- Order confirmation ---
    this.orderIdLocator = page.locator('//*[starts-with(text(),"ORD-")]').first();
  }

  /** Wait for the checkout page to be ready (PayPal-first mode). */
  async waitForCheckoutLoaded() {
    // Use waitUntil: 'commit' — Angular SPAs can hang the 'load' event indefinitely
    await this.page.waitForURL(/\/checkout/, { timeout: 20000, waitUntil: 'commit' });
    await this.payWithCreditCardLink.waitFor({ state: 'visible', timeout: 20000 });
  }

  /** Switch from PayPal-first view to the full credit card form. */
  async switchToCreditCardForm() {
    await this.payWithCreditCardLink.click();
    // Wait for custEmail — unique to this form (footer uses "Email Address", not "Email")
    // avoids false-positive from footer newsletter's "First Name" field
    await this.custEmail.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Fill the Customer Information section.
   * @param {{ firstName, lastName, email, phone? }} info
   */
  async fillCustomerInfo({ firstName, lastName, email, phone } = {}) {
    await this.custFirstName.fill(firstName);
    await this.custLastName.fill(lastName);
    await this.custEmail.fill(email);
    if (phone) await this.custPhone.fill(phone);
  }

  /**
   * Fill the Delivery Information section.
   * state should be the full state name, e.g. "California" — matched by label.
   * @param {{ firstName, lastName, street, city, state, zip, phone? }} addr
   */
  async fillDeliveryAddress({ firstName, lastName, street, city, state, zip, phone } = {}) {
    // Country already defaults to United States
    await this.delivFirstName.fill(firstName);
    await this.delivLastName.fill(lastName);
    await this.delivStreet.fill(street);
    await this.delivCity.fill(city);
    await this.delivState.selectOption({ label: state });
    await this.delivZip.fill(zip);
    if (phone) await this.delivPhone.fill(phone);
  }

  /**
   * Fill the Braintree Hosted Field CC inputs.
   * Uses pressSequentially() so Braintree's keydown/input event listeners fire correctly.
   * fill() sets the value directly without triggering Braintree's field validation.
   *
   * Note: Braintree auto-formats the expiry — typing "/" conflicts with the auto-inserted
   * slash and intermittently produces invalid values like "12//26". Strip non-digits from
   * expiry and let Braintree format it (typing "1226" → field displays "12 / 26").
   * @param {{ number, name, expiry, cvv }} card
   */
  async fillCreditCard({ number, name, expiry, cvv } = {}) {
    const expiryDigits = String(expiry).replace(/\D/g, '');

    await this.cardNumberInput.click();
    await this.cardNumberInput.pressSequentially(number, { delay: 50 });
    await this.cardNameInput.click();
    await this.cardNameInput.pressSequentially(name, { delay: 50 });
    await this.cardExpiryInput.click();
    await this.cardExpiryInput.pressSequentially(expiryDigits, { delay: 50 });
    await this.cardCvvInput.click();
    await this.cardCvvInput.pressSequentially(cvv, { delay: 50 });
  }

  /** Click Submit Order. */
  async submitOrder() {
    await this.submitOrderBtn.click();
  }

  /**
   * After clicking Submit Order, wait until we land on /order-confirmation.
   * Opportunistically clicks "I'm not interested" whenever an upsell/downsell page
   * appears. Handles all three scenarios uniformly:
   *   1. Funnel renders fully — clicks through each "not interested"
   *   2. Funnel skipped — page goes straight to /order-confirmation
   *   3. Mixed (some upsells render, some don't) — handled per-poll
   *
   * Polls every 1s; if a decline button is visible, clicks it and waits 2s for nav.
   * Throws if /order-confirmation isn't reached within the timeout.
   */
  async waitForOrderConfirmation({ timeout = 90000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.page.url().includes('/order-confirmation')) return;

      const notInterested = this.page.locator("text=I'm not interested").first();
      const visible = await notInterested.isVisible().catch(() => false);
      if (visible) {
        await notInterested.click().catch(() => {});
        await this.page.waitForTimeout(2000);
      } else {
        await this.page.waitForTimeout(1000);
      }
    }
    throw new Error(
      `Did not reach /order-confirmation within ${timeout}ms (last URL: ${this.page.url()})`
    );
  }

  /**
   * Extract and return the order ID from the confirmation page.
   * Logs to console. Caller is responsible for attaching to test annotations.
   * Returns null if no ORD- element found.
   */
  async extractOrderId() {
    const visible = await this.orderIdLocator.isVisible().catch(() => false);
    if (!visible) return null;
    const orderId = (await this.orderIdLocator.textContent()).trim();
    console.log(`\n========================================`);
    console.log(`  ORDER PLACED: ${orderId}`);
    console.log(`========================================\n`);
    return orderId;
  }

  /**
   * Snapshot of the checkout Order Summary panel for cross-page assertions.
   * Returns { subtotal, tax, shipping, total } as numbers or null.
   * Tax comes back as null until a delivery address is filled (shows "TBD" before).
   *
   * Uses a short timeout per field so a missing label (XPath mismatch) returns null
   * instead of stalling on the default 30s auto-wait.
   */
  async getOrderSummary() {
    const safeText = async (loc) => {
      try { return await loc.textContent({ timeout: 2000 }); }
      catch { return null; }
    };
    return {
      subtotal: parseMoney(await safeText(this.summarySubtotal)),
      tax:      parseMoney(await safeText(this.summaryTax)),
      shipping: parseMoney(await safeText(this.summaryShipping)),
      total:    parseMoney(await safeText(this.summaryTotal)),
    };
  }
}

module.exports = { CheckoutPage };
