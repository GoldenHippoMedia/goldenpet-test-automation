const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { OrderHistoryPage } = require('../pages/order-history.page');
const { CartPage } = require('../pages/cart.page');
const { assertOrderIdFormat, assertMoneyMath } = require('../helpers/order-validations');

// Comprehensive Order History page test.
// GI source: "Order-list - List, Buy-It-Again, Re-Order" — that test was 3 thin
// asserts; this port extends coverage with per-card validation (date, payment,
// math, images), pagination smoke, and product-identity round-trip for both
// Buy It Again and Re-Order All. Not an order placement test (no @real-order).
//
// Selection strategy (deterministic, property-based — NOT positional/random):
//   - Buy It Again: pick the FIRST order card on page 1, then its FIRST product
//     row. Snapshot that row's product name BEFORE clicking, scope the click to
//     that row's button, then assert the PDP shows a matching product name.
//   - Re-Order All: pick the FIRST card on page 1 that actually HAS a Re-Order
//     All button (per product knowledge: only 2+ product orders expose it).
//     Snapshot all its products, click its button, assert /cart matches name +
//     qty + price for every product.
//
// Cleanup: afterEach empties the shared test account's cart so Re-Order All
// doesn't leave items lying around for subsequent runs.

test.describe('Account - Order History list + Buy It Again + Re-Order All', () => {
  test.slow();

  test.afterEach(async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    try {
      await cartPage.clearCart();
    } catch (e) {
      console.log('[afterEach] clearCart warning:', e.message);
    }
  });

  test('list renders, per-card data is valid, pagination works, Buy It Again + Re-Order All round-trip correctly', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const orderHistoryPage = new OrderHistoryPage(page, brand);
    const cartPage = new CartPage(page, brand);

    await loginPage.goto();
    await loginPage.login();

    // ============================================================
    // Section 1: List smoke
    // ============================================================
    await orderHistoryPage.goto();
    await expect(orderHistoryPage.heading).toBeVisible();
    await expect(orderHistoryPage.orderNumbers.first()).toBeVisible();
    assertOrderIdFormat(await orderHistoryPage.firstOrderId());

    // ============================================================
    // Section 2: Per-card validation (every visible card on page 1)
    //   - date format MM/DD/YYYY
    //   - payment method format ("Card Ending in 1234" or "PayPal")
    //   - math: total ≈ subtotal + tax + shipping (CAD orders handled)
    //   - images: every product image rendered (naturalWidth > 0, alt non-empty)
    // ============================================================
    const cardCount = await orderHistoryPage.orderCards.count();
    expect(cardCount, 'expected at least one order card to validate').toBeGreaterThan(0);

    for (let i = 0; i < cardCount; i++) {
      const card = orderHistoryPage.orderCards.nth(i);
      const snap = await orderHistoryPage.snapshotCard(card);
      const label = snap.orderId || `card[${i}]`;

      expect(snap.date, `${label}: date must match MM/DD/YYYY`).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(snap.paymentMethod, `${label}: payment method must match known format`).toMatch(/^(Card Ending in \d{4}|PayPal)$/);
      assertMoneyMath(snap, label);

      expect(snap.products.length, `${label}: card must list at least one product`).toBeGreaterThan(0);
      for (const product of snap.products) {
        expect(product.imageSrc, `${label} / "${product.name}": image must have a src`).toBeTruthy();
        expect(product.imageAlt, `${label} / "${product.name}": image must have non-empty alt`).toBeTruthy();
        expect(product.imageOk,  `${label} / "${product.name}": image must render (naturalWidth > 0)`).toBe(true);
      }
    }

    // ============================================================
    // Section 3: Pagination smoke (skip gracefully if only 1 page)
    // ============================================================
    const hasNextPage = await orderHistoryPage.nextPageButton.isVisible().catch(() => false);
    if (hasNextPage) {
      const page1FirstId = await orderHistoryPage.firstOrderId();
      await orderHistoryPage.nextPageButton.click();
      await expect
        .poll(async () => await orderHistoryPage.firstOrderId().catch(() => page1FirstId), { timeout: 15000 })
        .not.toBe(page1FirstId);
      console.log(`[order-history] Pagination smoke OK — page 1 first: ${page1FirstId}, page 2 first: ${await orderHistoryPage.firstOrderId()}`);
      // Return to page 1 for the remaining sections (Buy It Again + Re-Order All).
      await orderHistoryPage.goto();
    } else {
      console.log('[order-history] Only 1 page of orders — pagination smoke skipped');
    }

    // ============================================================
    // Section 4: Buy It Again — first order's first product row,
    // assert the PDP shows that same product (loose word match).
    // ============================================================
    const firstCard = orderHistoryPage.orderCards.first();
    const firstSnap = await orderHistoryPage.snapshotCard(firstCard);
    expect(firstSnap.products.length, 'first order card must have a product to click Buy It Again on').toBeGreaterThan(0);
    const targetRowProduct = firstSnap.products[0];
    console.log(`[order-history] Buy It Again — selected order ${firstSnap.orderId}, product "${targetRowProduct.name}"`);

    // The first Buy It Again button within the card maps 1:1 with the card's
    // FIRST product row (the order header has no Buy It Again button), so this is
    // implicitly row-scoped without needing a brittle row-DOM selector.
    await firstCard.locator('button').filter({ hasText: /buy it again/i }).first().click();
    await page.waitForURL(/\/product\//, { timeout: 15000 });

    const pdpTitle = page.locator('h1.product-name');
    await expect(pdpTitle).toBeVisible();
    const pdpName = (await pdpTitle.textContent()).trim();
    expect(
      sharesSignificantWords(pdpName, targetRowProduct.name, 1),
      `Buy It Again PDP product "${pdpName}" should share a significant word with order row "${targetRowProduct.name}"`
    ).toBe(true);
    await expect(page.getByText(/add to cart/i).first()).toBeVisible();

    // ============================================================
    // Section 5: Re-Order All — first card with the button on page 1.
    // Paginate once if not on page 1; skip only if truly absent.
    // ============================================================
    await orderHistoryPage.goto();
    let targetCard = await orderHistoryPage.firstReorderableCard();
    if (!targetCard) {
      const canPaginate = await orderHistoryPage.nextPageButton.isVisible().catch(() => false);
      if (canPaginate) {
        await orderHistoryPage.nextPageButton.click();
        await page.waitForTimeout(3000);
        targetCard = await orderHistoryPage.firstReorderableCard();
      }
    }
    test.skip(!targetCard, 'No order with a Re-Order All button exists on the current test account — skipping (matches GI exit-pass behavior for accounts without re-orderable multi-product orders)');

    const reorderSnap = await orderHistoryPage.snapshotCard(targetCard);
    expect(reorderSnap.products.length, 'Re-Order All card must have ≥2 products (per product knowledge)').toBeGreaterThanOrEqual(2);
    console.log(`[order-history] Re-Order All — selected order ${reorderSnap.orderId} with ${reorderSnap.products.length} products:`, reorderSnap.products.map((p) => `${p.name} (qty ${p.quantity}, $${p.linePrice})`));

    await targetCard.locator('button').filter({ hasText: /re-?order all/i }).first().click();
    await page.waitForURL(/\/cart/, { timeout: 15000 });
    await cartPage.waitForCartLoaded();

    const cartRowCount = await cartPage.productName.count();
    expect(cartRowCount, 'cart row count must equal order product count').toBe(reorderSnap.products.length);

    const cartRows = [];
    for (let i = 0; i < cartRowCount; i++) {
      const name = (await cartPage.productName.nth(i).textContent()).trim();
      const priceText = (await cartPage.productPrice.nth(i).textContent()).trim();
      const qtyText = (await cartPage.quantityValue.nth(i).textContent()).trim();
      cartRows.push({
        name,
        price: parseFloat(priceText.replace(/[^\d.]/g, '')),
        quantity: parseInt(qtyText, 10),
      });
    }
    console.log('[order-history] Cart rows after Re-Order All:', cartRows);

    // Match each order product to a cart row by loose name similarity, then assert qty + price.
    const remaining = [...cartRows];
    for (const op of reorderSnap.products) {
      const idx = remaining.findIndex((cr) => sharesSignificantWords(cr.name, op.name, 2));
      expect(
        idx,
        `no cart row matched order product "${op.name}". Remaining cart rows: ${remaining.map((r) => r.name).join(' | ')}`
      ).toBeGreaterThanOrEqual(0);
      const cr = remaining.splice(idx, 1)[0];

      expect(cr.quantity, `quantity mismatch for "${op.name}" (matched cart row "${cr.name}")`).toBe(op.quantity);

      // /order-history price is LINE TOTAL. Cart may display unit OR line.
      // Accept either: cart price === line total, OR cart × qty === line total (±$0.01).
      const lineTotalGuess = +(cr.price * cr.quantity).toFixed(2);
      const okAsLineTotal = Math.abs(cr.price - op.linePrice) <= 0.01;
      const okAsUnitPrice = Math.abs(lineTotalGuess - op.linePrice) <= 0.01;
      expect(
        okAsLineTotal || okAsUnitPrice,
        `price mismatch for "${op.name}": order line $${op.linePrice}, cart shows $${cr.price} × qty ${cr.quantity} (line $${lineTotalGuess})`
      ).toBe(true);
    }
  });
});

// Loose product-name match: two names "share significant words" if they have at least
// `minShared` common tokens of length >3, case-insensitive. Mirrors the spirit of
// helpers/order-validations.js::assertProductNamesMatch but returns a boolean for
// inline use within array matching (rather than asserting). minShared=1 is used for
// PDP vs order-row (PDP names are short, e.g. "ProPower Plus" → only 1 token >3 chars
// shared with "Dr. Marty ProPower Plus - 3 Jars"); minShared=2 for cart vs order-row.
function sharesSignificantWords(a, b, minShared = 2) {
  const tokens = (s) =>
    new Set(
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  const ta = tokens(a);
  const tb = tokens(b);
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared >= minShared;
}
