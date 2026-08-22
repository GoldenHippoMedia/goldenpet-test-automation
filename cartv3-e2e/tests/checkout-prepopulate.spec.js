const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

// GI: "Checkout-V2 - Logged-In - Customer Data Pre-Populates (Shane)"
//
// Logged-in /checkout renders the customer + delivery info as READ-ONLY text
// (with an Edit toggle), pre-filled from the account record — not as empty inputs.
//
// Live audit (2026-06-08): the customer block is [data-qa="customer-info-form"]
// (name, email, phone) and the delivery block is the first [data-qa="address-form"]
// (street, "City, Region Postal", country).
//
// Hardened beyond the GI customer-only checks: asserts BOTH the customer info AND
// the shipping address pre-populate, comparing against the persisted account record
// (fetchAccount) as the source of truth — not the login email, which can differ
// from the account's stored contact email.
//
// Read-only (never submits) -> out of @real-order. afterEach clears the cart.

test.describe('Checkout-V2 - Logged-In Customer Data Pre-Populates', () => {
  test('customer info and shipping address pre-populate from the account record', async ({ page, brand }) => {
    // login -> account fetch -> add product -> checkout -> afterEach cart clear is a long
    // chain that shares ONE timeout budget with the afterEach hook. On prod it overran 90s
    // and failed in afterEach with the assertions already green (2026-08-19).
    test.slow();

    const loginPage = new LoginPage(page, brand);
    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);
    const account = new AccountDetailsPage(page, brand);

    await loginPage.goto();
    await loginPage.login();

    // Source of truth for what SHOULD pre-populate.
    const acct = await account.fetchAccount();
    const sa = acct.shippingAddress || {};
    console.log('[prepopulate] account:', {
      firstName: acct.firstName, lastName: acct.lastName,
      line1: sa.line1, city: sa.city, region: sa.region, postalCode: sa.postalCode,
    });

    // Add a standard product and open checkout via the cart's shipping "change" link.
    await cartPage.addProductByKey('loggedin_std_2');
    await cartPage.changeShippingLink.click();
    await page.waitForURL(/checkout/, { timeout: 15000 });
    await expect(checkoutPage.customerInfoForm).toBeVisible();

    // --- Customer Information ---
    await test.step('customer info pre-populates (name, email, phone)', async () => {
      const ci = await checkoutPage.getCustomerInfoDisplayText();
      expect(ci, 'first name should pre-populate').toContain(acct.firstName);
      expect(ci, 'last name should pre-populate').toContain(acct.lastName);
      if (acct.email) expect(ci, 'email should pre-populate').toContain(acct.email);
      if (acct.phone) {
        // display is formatted "(555) 555-5555" — compare digits only
        expect(ci.replace(/\D/g, '')).toContain(String(acct.phone).replace(/\D/g, ''));
      }
    });

    // --- Delivery (shipping) address ---
    await test.step('shipping address pre-populates (street, city, state, zip)', async () => {
      const d = await checkoutPage.getDeliveryDisplayText();
      if (sa.line1)      expect(d, 'street should pre-populate').toContain(sa.line1);
      if (sa.city)       expect(d, 'city should pre-populate').toContain(sa.city);
      if (sa.postalCode) expect(d, 'postal code should pre-populate').toContain(sa.postalCode);
      if (sa.region)     expect(d, 'state/region should pre-populate').toContain(sa.region);
    });
  });

  test.afterEach(async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);
    await cartPage.clearCart().catch(() => {});
  });
});
