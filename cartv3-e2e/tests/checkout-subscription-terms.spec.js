const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

// GI: "Cart/Checkout - Verify Subscription Terms (Shane)"
//
// The subscription-terms block renders ONLY when a SUBSCRIPTION item is in the
// cart, and it shows on BOTH /cart and /checkout. Logged-in.
//
// Live audit (2026-06-08): the block is [data-qa="subscription-terms-text"]
// (= #subscription-terms-section). Copy is "By clicking Submit Order…" — there is
// NO agree checkbox (the GI-era checkbox is gone). It carries 3 links:
//   - "Subscription Terms" -> cdn .../subscription_terms_of_service.html
//   - "Account" -> /my-account
//   - support@drmartypets.com (mailto)
//
// Hardened beyond the GI steps:
//   - asserts the terms text + all 3 links on /cart AND /checkout;
//   - NEGATIVE case (no GI equivalent): a STANDARD product must NOT show the block.
//
// Read-only (never submits an order) — stays out of @real-order. afterEach clears
// the shared logged-in cart (server-side) so it's net-zero.

const TERMS_RX = /automatically renewing subscription/i;

// Verify a link opens in a NEW TAB at a URL matching `urlRx`, and that tab loads.
// All disclosure links here are target="_blank" (live-audited 2026-06-08), so this
// never navigates the cart/checkout page away — tabs are opened and closed.
async function verifyOpensInNewTab(page, link, urlRx, label) {
  await expect(link, `${label} link should be present`).toBeVisible();
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    link.click(),
  ]);
  await tab.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(tab, `${label} should open ${urlRx}`).toHaveURL(urlRx);
  await tab.close();
}

// Assert every disclosure link on the CURRENT page opens its correct destination.
// URL patterns are PATH-based (brand-agnostic — not tied to drmartypets.com).
async function verifyDisclosureLinks(page, subTermsRx) {
  const sub = page.locator('[data-qa="subscription-terms-text"]');
  // subscription-block links. The Subscription Terms destination is brand-specific
  // (DMP: a /subscription_terms path; Badlands: a terms doc on its CDN), so the expected
  // pattern is passed in from brand.content.subscriptionTermsUrl.
  await verifyOpensInNewTab(page, sub.getByRole('link', { name: /^Subscription Terms$/ }), subTermsRx, 'Subscription Terms');
  await verifyOpensInNewTab(page, sub.getByRole('link', { name: /^Account$/ }), /\/my-account/, 'Account');
  // support email — mailto, so assert the href (don't click — it would open a mail client)
  await expect(sub.getByRole('link', { name: /support@/i }), 'support email is a mailto link')
    .toHaveAttribute('href', /^mailto:/);
  // legal disclaimer links (present on both /cart and /checkout)
  await verifyOpensInNewTab(page, page.getByRole('link', { name: 'Terms & Conditions' }).first(), /\/terms/, 'Terms & Conditions');
  await verifyOpensInNewTab(page, page.getByRole('link', { name: 'Privacy Policy' }).first(), /privacy/, 'Privacy Policy');
}

test.describe('Cart/Checkout - Verify Subscription Terms', () => {
  test.describe.configure({ mode: 'serial' });

  test('subscription terms + all disclosure links work on /cart and /checkout', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);
    // Subscription Terms link destination is brand-specific (see brand.content).
    const subTermsRx = new RegExp(brand.content.subscriptionTermsUrl || 'subscription_terms', 'i');

    await loginPage.goto();
    await loginPage.login();

    // Add a SUBSCRIPTION variant (cartUrl appends &isSubscription=true&frequency=1).
    await cartPage.addProductByKey('loggedin_sub_2');

    // --- /cart ---
    await test.step('terms render on /cart', async () => {
      await expect(cartPage.subscriptionTerms, 'terms block should be visible on /cart').toBeVisible();
      await expect(cartPage.subscriptionTerms).toContainText('Subscription Terms');
      await expect(cartPage.subscriptionTerms).toContainText(TERMS_RX);
      await expect(cartPage.subscriptionTerms.locator('a')).toHaveCount(3);
    });

    await test.step('all disclosure links open correct destinations on /cart', async () => {
      await verifyDisclosureLinks(page, subTermsRx);
    });

    // --- /checkout (reached via the cart's shipping "change" link, as other specs do) ---
    await test.step('terms render on /checkout', async () => {
      await cartPage.changeShippingLink.click();
      await page.waitForURL(/checkout/, { timeout: 15000 });
      await expect(checkoutPage.subscriptionTerms, 'terms block should be visible on /checkout').toBeVisible();
      await expect(checkoutPage.subscriptionTerms).toContainText('Subscription Terms');
      await expect(checkoutPage.subscriptionTerms).toContainText(TERMS_RX);
      await expect(checkoutPage.subscriptionTerms.locator('a')).toHaveCount(3);
    });

    await test.step('all disclosure links open correct destinations on /checkout', async () => {
      await verifyDisclosureLinks(page, subTermsRx);
    });
  });

  test('standard (non-subscription) product does NOT show subscription terms', async ({ page, brand }) => {
    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await cartPage.addProductByKey('loggedin_std_1');

    // The block should be absent for a standard product (negative guard).
    await expect(cartPage.productName.first()).toBeVisible(); // cart actually loaded
    await expect(cartPage.subscriptionTerms).toHaveCount(0);
  });

  test.afterEach(async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    await cartPage.clearCart().catch(() => {});
  });
});
