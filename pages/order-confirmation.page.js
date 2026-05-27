const { BasePage } = require('./base.page');
const { parseMoney } = require('../helpers/parse-money');

/**
 * OrderConfirmationPage — /order-confirmation
 *
 * The page displays:
 *   - Heading "Woohoo! We're working on your order, <name>"
 *   - Order details (Order Number, Order Date, Customer, Shipping Address, Shipping Method)
 *   - Items list (product image + name + Qty + price)
 *   - Order summary (Subtotal, Taxes, Shipping, Total)
 *
 * No data-qa attributes on detail rows — selectors use label-text + following-sibling.
 * "Customer:" value is formatted "Full Name (email@example.com)" — parsed by getCustomerInfo().
 * Shipping is shown as "Free" (not "$0.00") when applicable.
 */
class OrderConfirmationPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Heading ---
    this.heading = page.locator('text=/Woohoo!.*working on your order/i');

    // --- Order detail rows ---
    // Each label ("Order Number:", "Customer:", etc.) is followed by its value
    // as the next sibling element. Use normalize-space() — Angular wraps text in
    // <!----> comment nodes which surrounds the text with whitespace, so the literal
    // text node is " Total: " (with spaces) not "Total:". normalize-space() handles this.
    this.orderNumberValue     = page.locator('xpath=//*[normalize-space(text())="Order Number:"]/following-sibling::*[1]');
    this.orderDateValue       = page.locator('xpath=//*[normalize-space(text())="Order Date:"]/following-sibling::*[1]');
    this.customerValue        = page.locator('xpath=//*[normalize-space(text())="Customer:"]/following-sibling::*[1]');
    this.shippingAddressValue = page.locator('xpath=//*[normalize-space(text())="Shipping Address:"]/following-sibling::*[1]');
    this.shippingMethodValue  = page.locator('xpath=//*[normalize-space(text())="Shipping Method:"]/following-sibling::*[1]');

    // --- Order summary rows ---
    this.subtotalValue = page.locator('xpath=//*[normalize-space(text())="Subtotal:"]/following-sibling::*[1]');
    this.taxesValue    = page.locator('xpath=//*[normalize-space(text())="Taxes:"]/following-sibling::*[1]');
    this.shippingValue = page.locator('xpath=//*[normalize-space(text())="Shipping:"]/following-sibling::*[1]');
    this.totalValue    = page.locator('xpath=//*[normalize-space(text())="Total:"]/following-sibling::*[1]');

    // --- Items list ---
    // Each row has product image, name, "Qty:", quantity number, and price.
    // We scope to the items section to avoid matching footer lists.
    this.itemsSection = page.locator('xpath=//*[.//*[text()="Your Items"]]').last();
    this.firstItemRow = page.locator('xpath=//*[text()="Your Items"]/ancestor::*[2]//li').first();
  }

  /** Wait for the confirmation page to be ready and dismiss post-purchase popups. */
  async waitForConfirmationLoaded() {
    // waitUntil: 'commit' — Angular pages can have hanging load events
    await this.page.waitForURL(/\/order-confirmation/, { timeout: 30000, waitUntil: 'commit' });
    await this.orderNumberValue.waitFor({ state: 'visible', timeout: 20000 });
    // Popups can render after the page loads — dismiss now and once more after a brief pause
    await this.dismissConfirmationPopups();
    await this.page.waitForTimeout(1500);
    await this.dismissConfirmationPopups();
  }

  /**
   * Dismiss the popups that render on the /order-confirmation page:
   *   1. Attentive / marketing overlay (via BasePage helper)
   *   2. "How did you hear about us?" dialog — click "None Of The Above" or × close
   *   3. CSAT survey — close button if present
   * All operations are safe no-ops when their target isn't on the page.
   */
  async dismissConfirmationPopups() {
    // 1. Attentive / marketing popup
    await this.dismissPopupIfPresent().catch(() => {});

    // 2. "How did you hear about us?" dialog — prefer "None Of The Above" if present
    const noneOfAbove = this.page.locator('button:has-text("None Of The Above")').first();
    if (await noneOfAbove.isVisible().catch(() => false)) {
      await noneOfAbove.click().catch(() => {});
      await this.page.waitForTimeout(500);
    }

    // 3. Any dialog with an × close button (catches the "how did you hear" dialog if it
    //    re-renders, and other generic modals)
    const dialogClose = this.page
      .locator('dialog button:has-text("×"), [role="dialog"] button[aria-label*="close" i]')
      .first();
    if (await dialogClose.isVisible().catch(() => false)) {
      await dialogClose.click().catch(() => {});
      await this.page.waitForTimeout(500);
    }

    // 4. CSAT survey — usually has a × close or is dismissible via Escape key
    const csatHeading = this.page.locator('text=/how satisfied are you/i').first();
    if (await csatHeading.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(500);
    }
  }

  async getOrderId() {
    return (await this.orderNumberValue.textContent()).trim();
  }

  async getOrderDate() {
    return (await this.orderDateValue.textContent()).trim();
  }

  /**
   * Customer field is formatted "Full Name (email@example.com)".
   * Returns { name, email, raw } — raw is the original string.
   */
  async getCustomerInfo() {
    const raw = (await this.customerValue.textContent()).trim();
    const match = raw.match(/^(.+?)\s*\((.+)\)\s*$/);
    return {
      name:  match ? match[1].trim() : null,
      email: match ? match[2].trim() : null,
      raw,
    };
  }

  async getShippingAddress() {
    return (await this.shippingAddressValue.textContent()).trim().replace(/\s+/g, ' ');
  }

  async getShippingMethod() {
    return (await this.shippingMethodValue.textContent()).trim();
  }

  /**
   * Parse the first item row. Returns { productName, quantity, price }.
   * Quantity is parsed from "Qty:" label followed by the number.
   */
  async getFirstItem() {
    const rowText = (await this.firstItemRow.textContent()).replace(/\s+/g, ' ').trim();

    // Product name appears multiple times in the row (image alt + text); take the first non-empty form
    // We can also get it from the image alt text:
    const productName = await this.firstItemRow.locator('img').first().getAttribute('alt');

    const qtyMatch   = rowText.match(/Qty:\s*(\d+)/i);
    const priceMatch = rowText.match(/\$\s*([\d,]+\.\d{2})/);

    return {
      productName: productName ? productName.trim() : null,
      quantity:    qtyMatch ? parseInt(qtyMatch[1], 10) : null,
      price:       priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null,
    };
  }

  /**
   * Return the consolidated order summary in a shape comparable with
   * CartPage.getOrderSummary() and CheckoutPage.getOrderSummary().
   * Uses short per-field timeouts so missing labels return null instead of stalling.
   */
  async getOrderSummary() {
    const safeText = async (loc) => {
      try { return await loc.first().textContent({ timeout: 3000 }); }
      catch { return null; }
    };

    const item = await this.getFirstItem().catch(() => ({ productName: null, quantity: null, price: null }));
    return {
      productName: item.productName,
      quantity:    item.quantity,
      itemPrice:   item.price,
      subtotal:    parseMoney(await safeText(this.subtotalValue)),
      tax:         parseMoney(await safeText(this.taxesValue)),
      shipping:    parseMoney(await safeText(this.shippingValue)),
      total:       parseMoney(await safeText(this.totalValue)),
    };
  }
}

module.exports = { OrderConfirmationPage };
