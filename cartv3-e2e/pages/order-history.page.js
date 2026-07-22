const { BasePage } = require('./base.page');
const { parseMoney } = require('../helpers/parse-money');

// /order-history page (My Account → Orders).
// Live DOM notes (no data-qa on cards yet — flagged to team):
//   - Page heading: h6 "Order History" (use getByText, not getByRole('heading')).
//   - Each order is a <ul.orders__rowWrap> (NOT article.orders__container —
//     that's a single page-level wrapper around ALL orders).
//   - Order # appears as a <b>ORD-…</b>; date appears next to it as plain text.
//   - Product rows inside a card: div.inline-flex.flex-col with a child <b> (product name),
//     a <p>$X.XX (line total — price × qty, NOT unit price), a <p>"Quantity: N",
//     an <img>, and a <button> containing <p>Buy it Again!</p>.
//   - Order-level summary appears as <p> text nodes: "Total $X.XX",
//     "Subtotal $X.XX", "Sales Tax $X.XX", "Shipping $X.XX". CAD orders include
//     " CAD" suffix and a "(w/GST)" qualifier on Total which we strip before parsing.
//   - "Re-Order All" appears as a <p>"Re-Order All" inside a <button>. NOTE: it is
//     NOT exclusive to multi-product orders — observed on a single-product order
//     too (real trigger unclear, possibly coupon usage) — so don't assume a
//     product-count gate when locating/asserting on this button.
//   - Pagination: button[aria-label="Click to go to next page"].
class OrderHistoryPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    this.heading           = page.getByText('Order History').first();
    this.orderCards        = page.locator('ul.orders__rowWrap');
    this.orderNumbers      = page.locator('b').filter({ hasText: /ORD-\d+/ });
    this.buyItAgainButtons = page.locator('button').filter({ hasText: /buy it again/i });
    this.reorderAllButtons = page.locator('button').filter({ hasText: /re-?order all/i });
    this.nextPageButton    = page.locator('button[aria-label="Click to go to next page"]');
  }

  async goto() {
    await this.navigate('orderHistory');
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
    // Cards render async via Angular — wait for at least one to appear.
    await this.orderCards.first().waitFor({ state: 'visible', timeout: 15000 });
  }

  async firstOrderId() {
    return (await this.orderNumbers.first().textContent()).trim();
  }

  // Snapshot a single order card. Returns:
  //   {
  //     orderId,
  //     date,                  // raw display, e.g. "06/02/2026"
  //     paymentMethod,         // e.g. "Card Ending in 1111" or "PayPal"
  //     subtotal, tax, shipping, total,  // numbers (CAD ' CAD' suffix stripped)
  //     products: [{ name, quantity, linePrice, imageSrc, imageAlt, imageOk }]
  //   }
  // imageOk = true if naturalWidth > 0 && complete (rendered, not 404'd).
  async snapshotCard(card) {
    const raw = await card.evaluate((root) => {
      const orderId = root.querySelector('b')?.textContent.trim() || null;

      // Pull all <p> text nodes from the card; date/totals/payment method are
      // siblings, not in product rows. We exclude product-row <p>s by scoping
      // to direct-descendant container text.
      const allPs = [...root.querySelectorAll('p')].map((p) => p.textContent.trim());

      // Date: first <p> matching MM/DD/YYYY format.
      const date = allPs.find((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t)) || null;

      // Totals: text contains label + dollar value.
      const findValue = (label) => {
        const re = new RegExp(`${label}[^\\d-]*([-]?\\$[\\d,.]+(?:\\s*CAD)?)`, 'i');
        for (const t of allPs) {
          const m = t.match(re);
          if (m) return m[1];
        }
        return null;
      };
      const totalText    = findValue('Total');         // may include "(w/GST)" stripped via regex above
      const subtotalText = findValue('Subtotal');
      const taxText      = findValue('Sales Tax');
      const shippingText = findValue('Shipping');

      // Payment method: appears as a <p> right after the "Payment Method" label.
      let paymentMethod = null;
      for (let i = 0; i < allPs.length; i++) {
        if (/^Payment Method$/i.test(allPs[i])) {
          paymentMethod = allPs[i + 1] || null;
          break;
        }
      }
      // Fallback: any <p> matching the known payment formats.
      if (!paymentMethod) {
        paymentMethod = allPs.find((t) => /^(Card Ending in \d{4}|PayPal)$/.test(t)) || null;
      }

      // Product rows: <div.inline-flex.flex-col> elements that contain a "Quantity: N"
      // text node. The order-header block and shipping-address block also use the
      // .inline-flex.flex-col class — filtering by the Quantity marker uniquely
      // identifies real product rows.
      const rows = [...root.querySelectorAll('div.inline-flex.flex-col')];
      const products = rows
        .map((row) => {
          const ps = [...row.querySelectorAll('p')].map((p) => p.textContent.trim());
          const qtyMatch = ps.map((t) => t.match(/Quantity:\s*(\d+)/)).find(Boolean);
          if (!qtyMatch) return null; // not a product row
          const name = row.querySelector('b')?.textContent.trim();
          if (!name) return null;
          // Some orders (seen on prod) include non-product promo lines rendered
          // as product-shaped rows — a "FREE SHIPPING" line carries a Quantity
          // marker and a <b> name but no product image. Skip these known
          // non-catalog labels so the image/identity checks only run on real
          // products. Anchored to the full name so real products that merely
          // contain these words aren't dropped.
          if (/^(free\s+shipping|shipping|discount|free\s+gift)$/i.test(name)) return null;
          const priceText = ps.find((t) => /^[-]?\$[\d,.]+(?:\s*CAD)?$/.test(t)) || null;
          const img = row.querySelector('img');
          return {
            name,
            quantity: parseInt(qtyMatch[1], 10),
            priceText,
            imageSrc: img?.getAttribute('src') || null,
            imageAlt: img?.getAttribute('alt') || null,
            imageOk: !!(img && img.naturalWidth > 0 && img.complete),
          };
        })
        .filter(Boolean);

      return {
        orderId,
        date,
        paymentMethod,
        totalText,
        subtotalText,
        taxText,
        shippingText,
        products,
      };
    });

    // Strip " CAD" suffix before parseMoney so the math helper sees plain numbers.
    const stripCad = (s) => (s == null ? null : s.replace(/\s*CAD\s*$/i, ''));

    return {
      orderId:       raw.orderId,
      date:          raw.date,
      paymentMethod: raw.paymentMethod,
      subtotal:      parseMoney(stripCad(raw.subtotalText)),
      tax:           parseMoney(stripCad(raw.taxText)),
      shipping:      parseMoney(stripCad(raw.shippingText)),
      total:         parseMoney(stripCad(raw.totalText)),
      products: raw.products.map((p) => ({
        name:      p.name,
        quantity:  p.quantity,
        linePrice: parseMoney(stripCad(p.priceText)),
        imageSrc:  p.imageSrc,
        imageAlt:  p.imageAlt,
        imageOk:   p.imageOk,
      })),
    };
  }

  // Finds the first order card on the current page that has a Re-Order All button.
  // Returns the card Locator or null.
  async firstReorderableCard() {
    const count = await this.orderCards.count();
    for (let i = 0; i < count; i++) {
      const card = this.orderCards.nth(i);
      const hasReorder = await card.locator('button').filter({ hasText: /re-?order all/i }).count();
      if (hasReorder > 0) return card;
    }
    return null;
  }

  // Returns Locators for every order card on the current page that has a
  // Re-Order All button (may be empty). Used to pick a random candidate
  // instead of always exercising the same (first) one.
  async reorderableCards() {
    const count = await this.orderCards.count();
    const cards = [];
    for (let i = 0; i < count; i++) {
      const card = this.orderCards.nth(i);
      const hasReorder = await card.locator('button').filter({ hasText: /re-?order all/i }).count();
      if (hasReorder > 0) cards.push(card);
    }
    return cards;
  }
}

module.exports = { OrderHistoryPage };
