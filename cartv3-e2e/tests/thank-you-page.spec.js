const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { OrderConfirmationPage } = require('../pages/order-confirmation.page');
const {
  assertOrderIdFormat,
  assertMoneyMath,
  assertTaxApplied,
  assertProductNamesMatch,
} = require('../helpers/order-validations');
const { parseMoney } = require('../helpers/parse-money');

// GI: "Thank You Page - Customer & Order Information Displayed on Order Confirmation (EXCLUDE PROD)"
// UAT ONLY — test account has an Amex card saved in UAT that is not valid in prod.
//
// Flow: login → clear cart → add product → apply coupon AUTOTEST1 → submit order
// DIRECTLY FROM /cart (saved default card) → accept first upsell → decline remaining
// upsells → verify the confirmation page displays all required fields.
//
// Why submit from /cart (not /checkout): the GI script navigated to /checkout only for
// the billing-address steps, which are disabled (the 9/27 app bug noted in the GI). For
// this DISPLAY test the order-confirmation page is identical regardless of submit origin,
// so we submit on /cart — matching order-loggedin-cart-cc.spec.js and avoiding the
// /checkout-time Cloudflare edge challenge ("Too many requests" toast; see CLAUDE.md).

test.describe('Order - Thank You Page Confirmation Display', () => {
  test.slow();

  test(
    'confirmation page shows order ID, upsell ID, financials, and coupon discount',
    { tag: '@real-order' },
    async ({ page, brand }) => {
      test.skip(brand.env === 'prod', 'UAT only — test Amex card not valid in prod');

      const loginPage = new LoginPage(page, brand);
      const cartPage = new CartPage(page, brand);
      const confirmationPage = new OrderConfirmationPage(page, brand);

      // Diagnostic (quiet): SILENTLY capture first-party >=400 responses so the rate-limit
      // guard below can name the offending endpoint + layer if the "Too many requests"
      // toast ever fires. We only console.log genuinely interesting auth/rate-limit statuses
      // (401/403/419/429) — NOT the 404 CMS misses or the benign ERR_ABORTED navigation
      // cancellations, which were just noise. Scoped to the brand's first-party domain
      // (minus /builder/proxy/ CMS content) + any challenges.cloudflare.com hit.
      const firstPartyRx = new RegExp('//[^/]*' + brand.primaryDomain.replace(/[.]/g, '\\.') + '/');
      const isRelevant = (url) =>
        (firstPartyRx.test(url) && !/\/builder\/proxy\//.test(url))
        || /challenges\.cloudflare\.com/.test(url);
      const errorHits = [];
      page.on('response', (res) => {
        const url = res.url();
        const s = res.status();
        if (s >= 400 && isRelevant(url)) {
          const h = res.headers();
          const rec = {
            url,
            status: s,
            layer: (h['cf-ray'] || /cloudflare/i.test(h['server'] || '')) ? 'Cloudflare/edge (DevOps)' : 'origin/app (dev/backend)',
            server: h['server'] || '(none)',
            cfRay: h['cf-ray'] || '(none)',
          };
          errorHits.push(rec);
          if ([401, 403, 419, 429].includes(s)) {
            console.log(`[thank-you] HTTP ${s} ← ${url} | layer=${rec.layer} | cf-ray=${rec.cfRay}`);
          }
        }
      });

      await loginPage.goto();
      await loginPage.login();

      // Start from a CLEAN cart. The logged-in cart is server-side persistent, and
      // `addProductByKey` (open /cart?product1=…) APPENDS rather than replaces — so any
      // items left by a prior run (e.g. a 429-blocked run that never placed/cleaned up)
      // would otherwise accumulate at growing quantities. Clearing here means this run
      // controls its own cart contents and self-heals leftover junk. (afterEach also
      // clears, but a throttled afterEach can't, so this start-clear is the real safety.)
      await cartPage.clearCart().catch(() => {});

      // Pick a product + starting quantity with WIDE variation to dodge the platform's
      // duplicate-order protection (it rejects an order matching a recent one). The GI's
      // scheme only produced 2 distinct signatures (product+qty coupled to one parity), so
      // repeated runs collide. Randomize across all 4 std variants × qty 1-3 (decoupled) for
      // ~12 signatures, and bump qty further on a duplicate rejection during submit (below).
      const PRODUCT_KEYS = ['loggedin_std_1', 'loggedin_std_2', 'loggedin_std_3', 'loggedin_std_4'];
      const productKey = PRODUCT_KEYS[Math.floor(Math.random() * PRODUCT_KEYS.length)];
      let qty = 1 + Math.floor(Math.random() * 3); // 1..3
      await cartPage.addProductByKey(productKey);
      for (let i = 1; i < qty; i++) await cartPage.increaseQuantity();

      // Apply the brand's valid coupon — BEST-EFFORT and TIME-BOUNDED. GI marks these
      // steps optional ("in some instances the coupon code cannot be entered in UAT...
      // making this optional to avoid false failures"), so a missing/slow apply-coupon
      // response must never stall or fail the order path. Dismiss any popup first (it can
      // swallow the Apply click), then cap the whole attempt at ~12s. If it doesn't apply,
      // couponApplied stays false and the discount-display assert below is skipped.
      const validCoupon = brand.content.validCoupon;
      let couponApplied = false;
      await cartPage.dismissPopupIfPresent().catch(() => {});
      const couponVisible = await cartPage.couponInput.isVisible().catch(() => false);
      if (couponVisible) {
        const couponResp = await Promise.race([
          // toastTimeout: 0 — we only need the response status; skip the 6s toast wait
          // (applying the coupon on /cart fires no matching toast, so it was dead time).
          cartPage.applyCoupon(validCoupon, { toastTimeout: 0 }).then((r) => r.response).catch(() => null),
          page.waitForTimeout(12000).then(() => null),
        ]);
        couponApplied = !!couponResp && couponResp.status() === 200;
        console.log(`[thank-you] coupon ${validCoupon} applied=${couponApplied}`
          + (couponResp ? ` (apply-coupon status ${couponResp.status()})` : ' (no apply-coupon response — proceeding without discount)'));
      }

      // Snapshot the cart for cart→confirmation IDENTITY checks (product + quantity).
      // We deliberately do NOT assert cart total == confirmation total: accepting the
      // upsell below can change order totals, and full financial cart→confirmation matching
      // is already covered by order-loggedin-checkout-cc.spec.js. Here we match the
      // upsell-STABLE invariants and rely on assertMoneyMath for confirmation-internal sanity.
      const cartSnap = await cartPage.getOrderSummary();
      console.log(`[thank-you] cart snapshot: product="${cartSnap.productName}" qty=${cartSnap.quantity} subtotal=$${cartSnap.subtotal}`);

      // Submit the order DIRECTLY FROM /cart (saved default card pre-selected) — do NOT
      // navigate to /checkout. The GI script only went to /checkout for the billing-address
      // steps, which are disabled (the 9/27 app bug noted in the GI), so /checkout adds
      // nothing to this DISPLAY test — the Thank You / order-confirmation page is identical
      // regardless of submit origin. Submitting on /cart matches the proven
      // order-loggedin-cart-cc.spec.js path AND avoids the /checkout-time Cloudflare edge
      // challenge that surfaces the "Too many requests" toast (see CLAUDE.md — DevOps).
      await cartPage.submitOrderButton.waitFor({ state: 'visible', timeout: 20000 });

      const rateLimitToast = page.locator('text=/too many requests/i').first();
      // Builds the Cloudflare-rate-limit error from the captured first-party/CF responses.
      const buildRateLimitError = () => {
        const recent = errorHits.slice(-5);
        const source = recent.length
          ? '\n  → recent >=400 responses (newest last):'
            + recent.map((h) => `\n     • HTTP ${h.status} ${h.url} | layer=${h.layer} (server="${h.server}", cf-ray="${h.cfRay}")`).join('')
          : '\n  → (no >=400 response captured — check the console for "REQUEST FAILED" lines)';
        return new Error(
          'Order blocked by a "Too many requests" toast — a Cloudflare edge rate-limit/'
          + 'challenge (see CLAUDE.md). This is a SERVER-side limit the test cannot bypass:'
          + source
          + '\n  Fix: DevOps raises/allow-lists QA traffic for the order/cart */proxy/* endpoints. '
          + 'Meantime: space out @real-order runs, or run from a different IP/account.'
        );
      };

      // Submit from /cart, resilient to DUPLICATE-ORDER rejection. Outcome of each click:
      //   - navigates off /cart                 → order placed (success)
      //   - stays on /cart + "duplicate" toast   → REJECTED (not placed; safe to retry):
      //                                            bump quantity (new signature) + resubmit
      //   - stays on /cart + "too many requests" → Cloudflare rate-limit (fail fast)
      // A duplicate-rejected order does NOT go through (we never leave /cart), so resubmitting
      // with a different signature cannot double-charge.
      let placed = false;
      for (let attempt = 1; attempt <= 4 && !placed; attempt++) {
        // wait for Submit to enable; bail fast on the Cloudflare rate-limit toast
        const submitDeadline = Date.now() + 30000;
        while (Date.now() < submitDeadline) {
          if (await rateLimitToast.isVisible().catch(() => false)) throw buildRateLimitError();
          if (await cartPage.submitOrderButton.isEnabled().catch(() => false)) break;
          await page.waitForTimeout(500);
        }
        await expect(cartPage.submitOrderButton, 'Submit Order should be enabled on /cart').toBeEnabled();

        await cartPage.submitOrderButton.click();
        // Proceed as soon as we navigate off /cart (→ /offer|/upsell|/order-confirmation).
        await page.waitForURL((u) => !u.toString().includes('/cart'),
          { timeout: 20000, waitUntil: 'commit' }).catch(() => {});

        if (!page.url().includes('/cart')) { placed = true; break; }

        // Still on /cart → the order was rejected. Inspect the toast to decide.
        const toastTxt = await cartPage.currentToastText().catch(() => '');
        console.log(`[thank-you] submit attempt ${attempt}: stayed on /cart — toast="${toastTxt}"`);
        if (/too many requests/i.test(toastTxt)) throw buildRateLimitError();
        if (/duplicate/i.test(toastTxt)) {
          qty += 1;
          await cartPage.increaseQuantity().catch(() => {}); // change the order signature
          await page.waitForTimeout(1000);
          continue; // resubmit
        }
        // Unknown rejection — give the page a moment and retry once more.
        await page.waitForTimeout(1500);
      }
      if (!placed) {
        throw new Error(
          'Could not place an order after 4 attempts — duplicate-order protection kept rejecting '
          + '(recent identical orders for this account). Re-run later, or vary the products/quantities further.'
        );
      }

      // Upsell funnel: accept the first offer, decline the rest.
      // GI steps 17-25 show the same pattern — one YES attempt then I'M NOT INTERESTED loop.
      // Popups (Exclusive Offer, satisfaction survey, Attentive) can render OVER the funnel
      // buttons; GI had explicit "Close"/survey-dismiss steps. Without dismissing them the
      // "I'm not interested" click misses and the loop spins until teardown ("Target page …
      // closed"). Dismiss any popup each iteration before looking for the funnel buttons.
      const dismissFunnelPopup = async () => {
        await cartPage.dismissPopupIfPresent().catch(() => {});
        const closers = [
          page.locator('span:text-is("Close")').first(),
          page.locator('button:has-text("No Thanks")').first(),
          page.locator('[role="dialog"] button[aria-label*="close" i], dialog button[aria-label*="close" i]').first(),
        ];
        for (const loc of closers) {
          if (await loc.isVisible().catch(() => false)) {
            await loc.click().catch(() => {});
            await page.waitForTimeout(400).catch(() => {});
          }
        }
      };

      let firstOfferAccepted = false;
      const funnelDeadline = Date.now() + 90000;
      while (Date.now() < funnelDeadline) {
        if (page.url().includes('/order-confirmation')) break;

        await dismissFunnelPopup();
        if (page.url().includes('/order-confirmation')) break;

        if (!firstOfferAccepted) {
          const yesBtn = page.locator('button:has-text("YES UPGRADE MY ORDER")').first();
          if (await yesBtn.isVisible().catch(() => false)) {
            await yesBtn.click().catch(() => {});
            firstOfferAccepted = true;
            await page.waitForTimeout(1200).catch(() => {});
            continue;
          }
        }

        const notInterested = page.locator("text=I'm not interested").first();
        if (await notInterested.isVisible().catch(() => false)) {
          await notInterested.click().catch(() => {});
          await page.waitForTimeout(1200).catch(() => {});
        } else {
          await page.waitForTimeout(600).catch(() => {});
        }
      }

      await confirmationPage.waitForConfirmationLoaded();

      // Extract confirmation data
      const orderId = await confirmationPage.getOrderId();
      const summary = await confirmationPage.getOrderSummary();
      const customerInfo = await confirmationPage.getCustomerInfo().catch(() => null);
      const shippingAddress = await confirmationPage.getShippingAddress().catch(() => null);

      // Special Offer (upsell) order ID — only present if upsell was accepted.
      // Angular comment wrapping requires normalize-space() on the label match.
      const specialOrderIdLoc = page.locator('xpath=//h5[normalize-space(text())="SPECIAL OFFER ORDER NO."]/following-sibling::p').first();
      const specialOrderId = await specialOrderIdLoc.textContent({ timeout: 2000 }).catch(() => null);

      // Coupon discount row — may not appear if the coupon failed to apply in UAT
      const discountLoc = page.locator('xpath=//*[normalize-space(text())="Coupons & Discounts:"]/following-sibling::*[1]');
      const discountText = await discountLoc.textContent({ timeout: 2000 }).catch(() => null);

      // --- Assertions ---
      // The GI test verifies the Thank You page DISPLAYS the Order ID, Upsell Order ID,
      // Tax, Shipping, Discounts, and Customer info. Each is asserted as displayed below
      // (not merely logged), plus the thank-you headline and Order Date.

      // Thank-you headline ("Woohoo! … working on your order, <name>")
      await expect(confirmationPage.heading, 'Thank-you headline should be displayed').toBeVisible();

      // Order ID
      assertOrderIdFormat(orderId);

      // Order Date
      const orderDate = await confirmationPage.getOrderDate().catch(() => null);
      expect(orderDate, 'Order Date should be displayed').toBeTruthy();

      // Upsell (SPECIAL OFFER) Order ID — DISPLAY-only and INTERMITTENT: an upsell isn't
      // always offered, and clicking "YES UPGRADE MY ORDER" doesn't guarantee a separate
      // special-offer order renders on the confirmation (GI marks every upsell extract
      // `optional`). So assert the FORMAT only when one is actually shown; otherwise log.
      if (specialOrderId) {
        assertOrderIdFormat(specialOrderId.trim());
        console.log(`[thank-you] SPECIAL OFFER ORDER NO. displayed: ${specialOrderId.trim()}`);
      } else {
        console.log(`[thank-you] no SPECIAL OFFER ORDER NO. displayed this run (upsell accepted=${firstOfferAccepted}) — skipping upsell-order-ID assertion`);
      }

      // Money math + Tax displayed
      assertMoneyMath(summary, 'confirmation');
      assertTaxApplied(summary, 'confirmation');
      expect(summary.tax, 'Taxes should be displayed on confirmation').not.toBeNull();

      // Shipping displayed (renders "Free" → 0, so not-null is the display signal)
      expect(summary.shipping, 'Shipping should be displayed on confirmation').not.toBeNull();

      // Shipping address displayed
      expect(shippingAddress, 'Shipping address should be displayed').toBeTruthy();

      // Product identity — the item the customer added to the cart appears on the receipt
      // (loose name match; display copy differs across pages). Upsell-stable: the base
      // product is on the order regardless of whether an upsell was accepted.
      assertProductNamesMatch(cartSnap.productName, summary.productName, 'cart', 'confirmation');
      expect(summary.quantity, 'confirmation should display a positive item quantity').toBeGreaterThan(0);

      // Discounts displayed — when the coupon actually applied, the Coupons & Discounts
      // row must display a non-zero amount; otherwise skip (coupon entry can fail in UAT).
      if (couponApplied) {
        expect(discountText, 'coupon applied → Coupons & Discounts row should display').toBeTruthy();
        expect(parseMoney(discountText), 'displayed discount should be a non-zero amount').not.toBe(0);
      } else {
        console.log('[thank-you] coupon not applied this run — skipping discount-display assertion');
      }

      // Customer info displayed — both name and email (field is "Full Name (email)")
      expect(customerInfo, 'Customer info should be displayed').toBeTruthy();
      expect(customerInfo.name, 'Customer name should be displayed').toBeTruthy();
      expect(customerInfo.email, 'Customer email should be displayed').toBeTruthy();
      expect(customerInfo.email, 'Customer email should look like an email').toContain('@');
      // Customer IDENTITY — the receipt shows the LOGGED-IN account's email (deterministic).
      expect(
        customerInfo.email.toLowerCase(),
        'confirmation email should match the logged-in account'
      ).toBe(brand.email.toLowerCase());

      // --- Audit trail: log + attach to HTML report ---
      const annotations = [
        { type: 'Order ID', description: orderId },
        { type: 'Upsell Order ID', description: specialOrderId?.trim() || 'none' },
        { type: 'Product Key', description: productKey },
        { type: 'Subtotal', description: `$${summary.subtotal}` },
        { type: 'Tax', description: `$${summary.tax}` },
        { type: 'Shipping', description: `$${summary.shipping}` },
        { type: 'Total', description: `$${summary.total}` },
        { type: 'Discount', description: discountText?.trim() || 'not applied' },
      ];
      annotations.forEach(a => test.info().annotations.push(a));

      console.log('\n========================================');
      console.log(`  ORDER PLACED: ${orderId}`);
      if (specialOrderId) console.log(`  UPSELL ORDER: ${specialOrderId.trim()}`);
      console.log(`  Product: ${productKey} | Subtotal: $${summary.subtotal} | Tax: $${summary.tax} | Shipping: $${summary.shipping} | Total: $${summary.total}`);
      if (discountText) console.log(`  Discount: ${discountText.trim()}`);
      console.log('========================================\n');
    }
  );

  // Cleanup — the logged-in cart is SERVER-SIDE persistent shared state. A successful
  // run empties it by placing the order, but a run that fails BEFORE submit (e.g. a 429
  // rate-limit) leaves its product behind, so without this the cart accumulates products
  // (at varying quantities) across runs. Clear it after every test (best-effort — a
  // throttled cleanup must not error the suite).
  test.afterEach(async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    await cartPage.clearCart().catch(() => {});
  });
});
