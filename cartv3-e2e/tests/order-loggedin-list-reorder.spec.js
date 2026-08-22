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

    // Let the product images finish loading BEFORE snapshotting. snapshotCard reads
    // `naturalWidth > 0 && complete` synchronously, with nothing waiting on the image — so a
    // card captured while its image is still in flight reports imageOk:false and the
    // assertion below fails on a picture that renders perfectly well. That made this a coin
    // flip: it passed on one drmarty prod run and failed on the next with the same order
    // (ORD-173132400, "Dental Chews Small", 2026-08-19).
    //
    // Bounded, and deliberately NOT fatal on timeout: if an image genuinely 404s it never
    // completes, and the per-product assertion below is what must report that — this wait
    // only removes the race, it does not weaken the check.
    await page
      .waitForFunction(
        () => {
          const imgs = [...document.querySelectorAll('img')].filter((i) => i.getAttribute('src'));
          return imgs.length > 0 && imgs.every((i) => i.complete);
        },
        { timeout: 15000 },
      )
      .catch(() => console.log('[order-history] product images did not all settle in 15s — asserting on whatever loaded'));

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
    // PDP path is brand-specific: DMP uses /product/<slug>, Badlands uses /p/<slug>.
    await page.waitForURL(/\/(product|p)\//, { timeout: 15000 });

    // PDP title is brand-specific: DMP renders h1.product-name; Badlands' PDP uses
    // the os-* product widget with a data-qa (a <p data-qa="os-product-name">).
    const pdpTitle = page.locator('h1.product-name, [data-qa="os-product-name"]').first();
    await expect(pdpTitle).toBeVisible();
    const pdpName = (await pdpTitle.textContent()).trim();
    expect(
      sharesSignificantWords(pdpName, targetRowProduct.name, 1),
      `Buy It Again PDP product "${pdpName}" should share a significant word with order row "${targetRowProduct.name}"`
    ).toBe(true);
    await expect(page.getByText(/add to cart/i).first()).toBeVisible();

    // ============================================================
    // Section 5: Re-Order All.
    //
    // SELECTION IS DETERMINISTIC BY DESIGN. A regression gate must return the same
    // verdict for the same app + data. Picking a candidate at random made this spec
    // pass or fail on the draw — an order carrying a $0.00 free/promo line does not
    // re-order (CART-9257), so identical code gave green or red depending on chance.
    // That is disqualifying for a gate: an unreproducible red gets ignored.
    //
    // Rule: exercise the FIRST candidate whose line items are ALL priced > $0.
    //   - Deterministic given the account state, and self-maintaining as new orders
    //     land — no hardcoded ORD- id that ages off the page.
    //   - The excluded shape is NOT silently dropped: every exclusion is logged with
    //     its ticket reference, and that shape has its own known-issue test below.
    // Overrides: REORDER_ORDER_ID=<ORD-…> pins one order (reproduce a specific run);
    //            REORDER_RANDOM=1 restores random selection (exploratory sweeps).
    // ============================================================
    await orderHistoryPage.goto();
    // Pass the gate's eligibility rule so pagination looks for a USABLE order rather than
    // just any order with the button — see collectReorderCandidates.
    const gateEligible = (snap) => {
      const fullyPriced = snap.products.every((p) => p.linePrice > 0);
      const keys = snap.products.map((p) => `${p.name}|${p.linePrice}|${p.quantity}`);
      return fullyPriced && new Set(keys).size === keys.length;
    };
    const { candidates: candidatePool, pageNum } = await collectReorderCandidates(page, orderHistoryPage, gateEligible);

    // Survey every candidate ONCE so the choice is made on DATA, not on position.
    const surveyed = [];
    for (let i = 0; i < candidatePool.length; i++) {
      surveyed.push({ index: i, snap: await orderHistoryPage.snapshotCard(candidatePool[i]) });
    }
    const isFullyPriced = (c) => c.snap.products.every((p) => p.linePrice > 0);
    const withFreeLine = surveyed.filter((c) => !isFullyPriced(c));
    if (withFreeLine.length) {
      console.log(`[order-history] excluding ${withFreeLine.length} candidate(s) carrying a $0.00 line item from the gate (known issue CART-9257): ${withFreeLine.map((c) => c.snap.orderId).join(', ')}`);
    }

    // Same treatment for CART-9124 as for CART-9257 above — this asymmetry was the single
    // biggest source of unreproducible reds in this spec. An order with DUPLICATE identical
    // line items re-orders into an EMPTY cart (CART-9124), so while that bug is open such an
    // order can never pass the gate. It was NOT excluded, so whenever the account's history
    // shifted and the first fully-priced candidate happened to be one of those, the gate went
    // red on an already-ticketed app bug and looked like a fresh regression
    // (badlands UAT 2026-08-19: ORD-000876209, the same subscription line twice).
    // Excluded here, characterized by the CART-9124 known-issue test below.
    // WHEN CART-9124 IS FIXED: delete this filter and the known-issue test.
    const hasDuplicateLines = (c) => {
      const keys = c.snap.products.map((p) => `${p.name}|${p.linePrice}|${p.quantity}`);
      return new Set(keys).size !== keys.length;
    };
    const withDuplicateLines = surveyed.filter(hasDuplicateLines);
    if (withDuplicateLines.length) {
      console.log(`[order-history] excluding ${withDuplicateLines.length} candidate(s) with DUPLICATE identical line items from the gate (known issue CART-9124): ${withDuplicateLines.map((c) => c.snap.orderId).join(', ')}`);
    }

    // A candidate must clear BOTH known-issue shapes to be a valid gate target.
    const isGateEligible = (c) => isFullyPriced(c) && !hasDuplicateLines(c);

    // ---- PREFLIGHT CENSUS -------------------------------------------------------------
    // This spec picks its target from LIVE shared-account data, so "why did it skip?" is a
    // question about the ACCOUNT, not the code — and a bare skip line answers neither. State
    // the census and, when it can't run, the exact data to add. Today's session burned
    // several UAT+prod runs inferring that drmarty prod simply had no multi-product order;
    // this block would have said so on the first run.
    const eligible = surveyed.filter(isGateEligible);
    console.log(
      `[order-history] preflight — brand=${brand.name} env=${brand.env}\n` +
      `  candidates with Re-Order All: ${surveyed.length}${pageNum > 1 ? ` (from page ${pageNum})` : ''}\n` +
      `  gate-eligible:                ${eligible.length}\n` +
      `  excluded CART-9257 ($0 line): ${withFreeLine.length}${withFreeLine.length ? ` [${withFreeLine.map((c) => c.snap.orderId).join(', ')}]` : ''}\n` +
      `  excluded CART-9124 (dup line):${withDuplicateLines.length}${withDuplicateLines.length ? ` [${withDuplicateLines.map((c) => c.snap.orderId).join(', ')}]` : ''}`
    );
    if (eligible.length === 0) {
      // Distinguish the two causes — they need different owners. No candidates at all is a
      // TEST-DATA gap (someone must place an order); candidates that all hit known bugs is a
      // BUG-BLOCKED gap (tracked, nothing to do until the ticket lands).
      console.log(
        surveyed.length === 0
          ? `[order-history] CANNOT RUN — TEST-DATA GAP on ${brand.name}/${brand.env}: no order carries a ` +
            `Re-Order All button (it only renders on multi-product orders; every recent order here is ` +
            `single-product).\n  REQUIRED DATA: place 1 order with 2+ DISTINCT products, each > $0, none ` +
            `repeated. Avoid a $0.00/free line (CART-9257) and the same product twice (CART-9124).\n` +
            `  Reference: badlands prod ORD-173141003 is exactly the right shape.`
          : `[order-history] CANNOT RUN — BUG-BLOCKED on ${brand.name}/${brand.env}: all ${surveyed.length} ` +
            `candidate(s) hit an open ticket (CART-9257 / CART-9124). Nothing to fix here; coverage returns ` +
            `when those land. The known-issue tests below characterize them.`
      );
    }
    // -----------------------------------------------------------------------------------

    let chosen;
    const pinnedOrderId = process.env.REORDER_ORDER_ID;
    if (pinnedOrderId) {
      chosen = surveyed.find((c) => c.snap.orderId === pinnedOrderId);
      expect(
        chosen,
        `REORDER_ORDER_ID=${pinnedOrderId} is not among the Re-Order All candidates on this page (it may have no Re-Order All button, or live on a later page). Candidates: ${surveyed.map((c) => c.snap.orderId).join(', ')}`
      ).toBeTruthy();
      console.log(`[order-history] Re-Order All — PINNED to ${pinnedOrderId} via REORDER_ORDER_ID`);
    } else if (process.env.REORDER_RANDOM === '1') {
      const pool = surveyed.filter(isGateEligible);
      test.skip(pool.length === 0, 'REORDER_RANDOM=1 but every candidate hits a known issue ($0.00 line — CART-9257, or duplicate identical lines — CART-9124)');
      chosen = pool[Math.floor(Math.random() * pool.length)];
      console.log(`[order-history] Re-Order All — RANDOM (REORDER_RANDOM=1) selected ${chosen.snap.orderId}`);
    } else {
      chosen = surveyed.find(isGateEligible);
      test.skip(
        !chosen,
        surveyed.length === 0
          ? `TEST-DATA GAP (${brand.name}/${brand.env}): no order with a Re-Order All button exists on this account. Place 1 order with 2+ distinct products, each > $0, none repeated — see the preflight block above.`
          : `BUG-BLOCKED (${brand.name}/${brand.env}): every candidate hits a known issue — $0.00 line item (CART-9257) or duplicate identical line items (CART-9124). Candidates: ${surveyed.map((c) => c.snap.orderId).join(', ')}`
      );
    }
    const targetIndex = chosen.index;

    // Clear the cart BEFORE clicking Re-Order All. The shared test account's cart
    // isn't guaranteed empty going in (a prior run elsewhere in the suite may have
    // crashed before its own afterEach cleanup) — without this, a stray leftover
    // item is indistinguishable from a real Re-Order All product-mapping bug.
    // clearCart() + goto() reload /order-history back to page 1, so re-paginate to
    // page 2 first if that's where the chosen candidate lives — otherwise the
    // index-based Locator would silently resolve to the wrong (page-1) card.
    await cartPage.clearCart();
    const reloaded = await reloadCandidates(page, orderHistoryPage, pageNum);
    const targetCard = reloaded[targetIndex];

    const reorderSnap = await orderHistoryPage.snapshotCard(targetCard);
    // Integrity check: the list can shift between the survey and the click (a new order
    // landing, pagination drift). Fail loudly rather than silently exercising a
    // different order than the one we deliberately selected.
    expect(
      reorderSnap.orderId,
      `order-history shifted between selection and click — selected ${chosen.snap.orderId} but the card at that position is now ${reorderSnap.orderId}`
    ).toBe(chosen.snap.orderId);
    // NOTE: Re-Order All is not exclusive to multi-product orders (observed on
    // UAT: a single-product order can expose it too — the real trigger appears
    // unrelated to product count, possibly coupon usage). So this only asserts
    // the card has at least one product; the match logic below works for any count.
    expect(reorderSnap.products.length, 'Re-Order All card must have at least one product').toBeGreaterThan(0);
    console.log(`[order-history] Re-Order All — selected order ${reorderSnap.orderId} with ${reorderSnap.products.length} products:`, reorderSnap.products.map((p) => `${p.name} (qty ${p.quantity}, $${p.linePrice})`));

    await targetCard.locator('button').filter({ hasText: /re-?order all/i }).first().click();
    await page.waitForURL(/\/cart/, { timeout: 15000 });

    // Re-Order All must actually POPULATE the cart. Poll for at least one row instead
    // of waitForCartLoaded()'s opaque 30s locator timeout, so a silent no-op reports as
    // "added no products" (an app-side failure) rather than a generic timeout.
    // Observed on Badlands UAT 2026-08-04: ORD-000875833 (a 6-Units Subscription plus a
    // $0 promo line) navigates to /cart showing "Your cart is empty!" with a 0 badge —
    // nothing is added. The equivalent DMP subscription order re-orders correctly, so
    // the $0 promo line is the likely trigger. Left failing on purpose.
    await expect
      .poll(async () => await cartPage.productRows.count(), {
        timeout: 20000,
        message: `Re-Order All on ${reorderSnap.orderId} navigated to /cart but added NO products (cart is empty). Expected ${reorderSnap.products.length}: ${reorderSnap.products.map((p) => `${p.name} (qty ${p.quantity}, $${p.linePrice})`).join(' | ')}`,
      })
      .toBeGreaterThan(0);

    const cartRowCount = await cartPage.productRows.count();
    expect(cartRowCount, 'cart row count must equal order product count').toBe(reorderSnap.products.length);

    // Read every field WITHIN its own <cart-line> row. Never index the page-wide
    // locators positionally here: a SUBSCRIPTION row renders no [data-qa="quantity"]
    // stepper, so that locator has fewer elements than there are rows and .nth(i)
    // would silently pair another row's quantity with this row's name/price.
    // QUANTITY SOURCE — order matters, and getting it backwards is a silent wrong-pass:
    //   [data-qa="quantity"]         = the STEPPER value → the real quantity (1, 2, 3 …).
    //   [data-qa="product-quantity"] = the PACK DESCRIPTOR → "1 Jar", "1 Bag", "1 Unit".
    // This used to read product-quantity FIRST and regex the leading digit out of it, so a
    // cart row of 3 × "1 Jar" reported quantity 1 — the pack size, not the quantity. It went
    // unnoticed for months because almost every order the spec picks is qty 1, where pack-1
    // and quantity-1 coincide. A qty-3 order (ORD-000879945, drmarty UAT 2026-08-19) exposed
    // it: "expected 3, received 1" on a cart whose MONEY was correct ($149.85 = 3 × $49.95).
    // So: prefer the stepper, and only fall back to the pack text for SUBSCRIPTION rows,
    // which render no stepper at all.
    const safeText = async (loc) => {
      try { return (await loc.textContent({ timeout: 2000 })).trim(); }
      catch { return null; }
    };
    const firstInt = (s) => {
      const m = s && s.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    };
    const cartRows = [];
    for (let i = 0; i < cartRowCount; i++) {
      const row = cartPage.productRows.nth(i);
      const name = await safeText(row.locator('[data-qa="product-name"]').first());
      const priceText = await safeText(row.locator('[data-qa="product-price"]').first());
      // Structural subscription signal: a subscription line has no quantity STEPPER
      // (you can't increment a subscription the way you can a standard line item).
      const hasStepper = (await row.locator('[data-qa="quantity"]').count()) > 0;
      const quantity = hasStepper
        ? firstInt(await safeText(row.locator('[data-qa="quantity"]').first()))
        : firstInt(await safeText(row.locator('[data-qa="product-quantity"]').first()));
      cartRows.push({
        name,
        price: priceText ? parseFloat(priceText.replace(/[^\d.]/g, '')) : null,
        quantity,
        isSubscription: !hasStepper,
        packText: await safeText(row.locator('[data-qa="product-quantity"]').first()),
      });
    }
    console.log('[order-history] Cart rows after Re-Order All:', cartRows);

    // Match each order product to a cart row, then assert qty + price.
    // GOTCHA: the cart renders the SAME display name for a product's SUBSCRIPTION and
    // STANDARD variants (order history distinguishes them — "… - 1 Bag Subscription"
    // vs "… - 1 Bag" — the cart does not). So name alone can pair the wrong rows.
    // Prefer a row matching on name AND price; fall back to name-only.
    const priceMatches = (cr, op) =>
      cr.price != null
      && (Math.abs(cr.price - op.linePrice) <= 0.01
        || (cr.quantity != null && Math.abs(+(cr.price * cr.quantity).toFixed(2) - op.linePrice) <= 0.01));
    const remaining = [...cartRows];
    for (const op of reorderSnap.products) {
      let idx = remaining.findIndex((cr) => sharesSignificantWords(cr.name, op.name, 2) && priceMatches(cr, op));
      if (idx === -1) idx = remaining.findIndex((cr) => sharesSignificantWords(cr.name, op.name, 2));
      expect(
        idx,
        `no cart row matched order product "${op.name}". Remaining cart rows: ${remaining.map((r) => `${r.name} ($${r.price} × ${r.quantity})`).join(' | ')}`
      ).toBeGreaterThanOrEqual(0);
      const cr = remaining.splice(idx, 1)[0];

      // A null here is a real signal (DOM drift / brand difference) — fail loudly.
      expect(
        cr.quantity,
        `no quantity found for cart row "${cr.name}" — expected ` +
        `${cr.isSubscription ? '[data-qa="product-quantity"]' : '[data-qa="quantity"]'}`
      ).not.toBeNull();

      // Quantity semantics differ for subscriptions: /order-history counts UNITS
      // (e.g. qty 2 bags) while the cart counts SUBSCRIPTION LINES (qty 1, priced at
      // the full per-delivery amount). Verified on UAT: an order line of qty 2 @
      // $57.90 re-orders into a cart row of qty 1 @ $57.90 — the MONEY matches, so the
      // right amount of product was added; only the unit is expressed differently.
      // Asserting unit-equality there would be wrong, so assert it only for standard
      // rows; the line-total check below is the real guarantee for every row.
      if (cr.isSubscription) {
        console.log(`[order-history] "${cr.name}" is a subscription row (no qty stepper) — cart qty ${cr.quantity} (subscription lines) vs order qty ${op.quantity} (units); asserting line total instead`);
      } else {
        expect(cr.quantity, `quantity mismatch for "${op.name}" (matched cart row "${cr.name}")`).toBe(op.quantity);
      }

      // /order-history price is LINE TOTAL. Cart may display unit OR line.
      // Accept either: cart price === line total, OR cart × qty === line total (±$0.01).
      expect(cr.price, `no price found for cart row "${cr.name}"`).not.toBeNull();
      const okAsLineTotal = Math.abs(cr.price - op.linePrice) <= 0.01;
      const lineTotalGuess = +(cr.price * cr.quantity).toFixed(2);
      const okAsUnitPrice = Math.abs(lineTotalGuess - op.linePrice) <= 0.01;
      expect(
        okAsLineTotal || okAsUnitPrice,
        `price mismatch for "${op.name}": order line $${op.linePrice}, cart shows $${cr.price} × qty ${cr.quantity} (line $${lineTotalGuess})`
      ).toBe(true);
    }
  });

  // ============================================================
  // KNOWN ISSUE — CART-9257
  // https://goldenhippomedia.atlassian.net/browse/CART-9257
  //
  // Re-Order All on an order that carries a $0.00 free/promo line navigates to /cart
  // and adds NOTHING — not even the paid line items — with no message. Reproduced
  // manually in a browser and via automation, so it is app-side.
  //
  // This is a CHARACTERIZATION test, not a masked failure. The assertion below states
  // the CORRECT expectation (Re-Order All should populate the cart); `test.fail()`
  // records that the app does not meet it today. Consequences:
  //   - while broken → the assertion fails, test.fail() marks it expected, suite stays
  //     green, and the issue is named in every run's output (nothing hidden).
  //   - once fixed  → the assertion passes, Playwright reports "expected to fail but
  //     passed" and turns the suite RED, forcing this test to be deleted (its coverage
  //     returns to the gate above, which will then stop excluding $0.00 orders).
  // That self-cleaning property is why this is a test.fail() and not a test.skip().
  // ============================================================
  test('KNOWN ISSUE CART-9257 — Re-Order All on an order containing a $0.00 free line item', async ({ page, brand }) => {
    test.fail(true, 'CART-9257: Re-Order All lands on an empty cart when the order carries a $0.00 free/promo line');

    const loginPage = new LoginPage(page, brand);
    const orderHistoryPage = new OrderHistoryPage(page, brand);
    const cartPage = new CartPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await orderHistoryPage.goto();

    const { candidates, pageNum } = await collectReorderCandidates(page, orderHistoryPage);
    test.skip(candidates.length === 0, 'No order with a Re-Order All button on this account');

    const surveyed = [];
    for (let i = 0; i < candidates.length; i++) {
      surveyed.push({ index: i, snap: await orderHistoryPage.snapshotCard(candidates[i]) });
    }
    // Data-driven, not pinned to an ORD- id: any order carrying a $0.00 line reproduces
    // it, so this keeps working as history turns over (the original repro was
    // ORD-000875833 on Badlands UAT).
    const target = surveyed.find((c) => c.snap.products.some((p) => !(p.linePrice > 0)));
    test.skip(
      !target,
      `No re-orderable order with a $0.00 line item on this page — nothing to characterize for CART-9257. Candidates: ${surveyed.map((c) => c.snap.orderId).join(', ')}`
    );

    console.log(`[CART-9257] exercising ${target.snap.orderId}: ${target.snap.products.map((p) => `${p.name} ($${p.linePrice})`).join(' | ')}`);

    await cartPage.clearCart();
    const reloaded = await reloadCandidates(page, orderHistoryPage, pageNum);
    const card = reloaded[target.index];
    const freshSnap = await orderHistoryPage.snapshotCard(card);
    expect(
      freshSnap.orderId,
      `order-history shifted between selection and click — selected ${target.snap.orderId} but found ${freshSnap.orderId}`
    ).toBe(target.snap.orderId);

    await card.locator('button').filter({ hasText: /re-?order all/i }).first().click();
    await page.waitForURL(/\/cart/, { timeout: 15000 });

    // The CORRECT expectation. Fails today — see test.fail() above.
    await expect
      .poll(async () => await cartPage.productRows.count(), {
        timeout: 20000,
        message: `CART-9257: Re-Order All on ${target.snap.orderId} navigated to /cart but added no products. Order lines: ${target.snap.products.map((p) => `${p.name} ($${p.linePrice})`).join(' | ')}`,
      })
      .toBeGreaterThan(0);
  });

  // ============================================================
  // KNOWN ISSUE — CART-9124
  // https://goldenhippomedia.atlassian.net/browse/CART-9124
  //
  // Same self-cleaning `test.fail()` shape as CART-9257 above, and for the same reason:
  // while this bug is open, an order with DUPLICATE identical line items can never pass the
  // main gate, so the gate excludes that shape and this test characterizes it instead. When
  // the bug is fixed this test reports "expected to fail but passed" and turns the suite RED,
  // forcing its deletion — at which point drop the hasDuplicateLines filter in the gate too.
  //
  // Data-driven rather than pinned to an ORD- id, so it survives history turning over.
  // Repros seen: ORD-000876209 (badlands UAT, same subscription line twice) and
  // ORD-172520845 (drmarty prod, two DISTINCT subscription lines — see the ticket note that
  // the bug is wider than "duplicates" alone).
  // ============================================================
  test('KNOWN ISSUE CART-9124 — Re-Order All on an order with duplicate identical line items', async ({ page, brand }) => {
    test.fail(true, 'CART-9124: Re-Order All lands on an empty cart when the order repeats the same line item');

    const loginPage = new LoginPage(page, brand);
    const orderHistoryPage = new OrderHistoryPage(page, brand);
    const cartPage = new CartPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await orderHistoryPage.goto();

    const { candidates, pageNum } = await collectReorderCandidates(page, orderHistoryPage);
    test.skip(candidates.length === 0, 'No order with a Re-Order All button on this account');

    const surveyed = [];
    for (let i = 0; i < candidates.length; i++) {
      surveyed.push({ index: i, snap: await orderHistoryPage.snapshotCard(candidates[i]) });
    }
    const target = surveyed.find((c) => {
      const keys = c.snap.products.map((p) => `${p.name}|${p.linePrice}|${p.quantity}`);
      return new Set(keys).size !== keys.length;
    });
    test.skip(
      !target,
      `No re-orderable order with duplicate identical line items on this page — nothing to characterize for CART-9124. Candidates: ${surveyed.map((c) => c.snap.orderId).join(', ')}`
    );

    console.log(`[CART-9124] exercising ${target.snap.orderId}: ${target.snap.products.map((p) => `${p.name} ($${p.linePrice})`).join(' | ')}`);

    await cartPage.clearCart();
    const reloaded = await reloadCandidates(page, orderHistoryPage, pageNum);
    const card = reloaded[target.index];
    const freshSnap = await orderHistoryPage.snapshotCard(card);
    expect(
      freshSnap.orderId,
      `order-history shifted between selection and click — selected ${target.snap.orderId} but found ${freshSnap.orderId}`
    ).toBe(target.snap.orderId);

    await card.locator('button').filter({ hasText: /re-?order all/i }).first().click();
    await page.waitForURL(/\/cart/, { timeout: 15000 });

    // The CORRECT expectation. Fails today — see test.fail() above.
    await expect
      .poll(async () => await cartPage.productRows.count(), {
        timeout: 20000,
        message: `CART-9124: Re-Order All on ${target.snap.orderId} navigated to /cart but added no products. Order lines: ${target.snap.products.map((p) => `${p.name} ($${p.linePrice})`).join(' | ')}`,
      })
      .toBeGreaterThan(0);
  });
});

// Collect every order card on /order-history that exposes a Re-Order All button,
// paginating once if page 1 has none. Returns the cards plus whether page 2 was used,
// so the caller can re-locate the same card after a reload.
/**
 * Collect Re-Order All candidates, paginating to page 2 when page 1 can't serve the caller.
 *
 * @param isEligible optional (snapshot) => boolean. When given, page 1 is considered
 *   insufficient unless at least one of its candidates satisfies it — so the gate can look
 *   past page 1 for a USABLE order. Omit it (the known-issue tests do) to keep the plain
 *   "any candidate will do" behaviour.
 *
 * This used to paginate only when page 1 had ZERO candidates. On badlands UAT page 1 held
 * exactly two, both of them blocked by known bugs ($0.00 line → CART-9257, duplicate line →
 * CART-9124), so the gate never looked at page 2 — where a perfectly good multi-product order
 * (ORD-000871123) was sitting — and skipped itself for lack of a target. Green with zero
 * coverage. The account data was fine; the pagination rule was wrong.
 */
async function collectReorderCandidates(page, orderHistoryPage, isEligible = null, maxPages = 6) {
  const serves = async (cards) => {
    if (cards.length === 0) return false;
    if (!isEligible) return true;
    for (const card of cards) {
      if (isEligible(await orderHistoryPage.snapshotCard(card))) return true;
    }
    return false;
  };

  let candidates = await orderHistoryPage.reorderableCards();
  let pageNum = 1;

  // Walk forward until a page SERVES the caller, or the pages run out. Two earlier versions
  // were both too shallow: the original only paginated when page 1 had ZERO candidates (so
  // badlands never saw its usable order on page 2), and the next only ever checked page 2 (so
  // drmarty prod, whose re-orderable orders sit deeper, found nothing and skipped). maxPages
  // is a runaway guard, not an expected limit — accounts here have far fewer pages.
  while (!(await serves(candidates)) && pageNum < maxPages) {
    const canPaginate = await orderHistoryPage.nextPageButton.isVisible().catch(() => false);
    if (!canPaginate) break;
    await orderHistoryPage.nextPageButton.click();
    await page.waitForTimeout(3000);
    const next = await orderHistoryPage.reorderableCards();
    pageNum += 1;
    // Keep walking even through a page with no candidates — a later page may still serve.
    candidates = next;
  }

  const served = await serves(candidates);
  if (!served) {
    // Nothing anywhere: return to page 1 so `candidates` matches what the caller's
    // skip/exclusion message will name.
    await orderHistoryPage.goto();
    candidates = await orderHistoryPage.reorderableCards();
    pageNum = 1;
  }
  if (pageNum > 1) console.log(`[order-history] candidates taken from page ${pageNum}`);

  // `pageNum` is what reloadCandidates needs to re-paginate back to the chosen card. Do NOT
  // reintroduce a boolean `usedPage2` alongside it — a caller passing the boolean into
  // reloadCandidates(pageNum) silently never paginates (`1 < true` is false), so an
  // index-based Locator resolves against page 1's cards and exercises the wrong order.
  return { candidates, pageNum };
}

// Reload /order-history and return the Re-Order All candidates again. clearCart() +
// goto() reset to page 1, so re-paginate when the chosen candidate lived on page 2 —
// otherwise an index-based Locator silently resolves to the wrong card.
async function reloadCandidates(page, orderHistoryPage, pageNum = 1) {
  await orderHistoryPage.goto();
  // Walk forward the same number of pages the candidates came from. Clicking next ONCE was
  // only ever correct while collection stopped at page 2; now that it walks deeper, an
  // index-based Locator would otherwise resolve against the wrong page's cards.
  for (let i = 1; i < (pageNum || 1); i++) {
    await orderHistoryPage.nextPageButton.click();
    await page.waitForTimeout(3000);
  }
  return orderHistoryPage.reorderableCards();
}

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
