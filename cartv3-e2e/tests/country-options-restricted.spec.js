const { test, expect } = require('../fixtures/brand');
const { LoginPage } = require('../pages/login.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { AccountDetailsPage } = require('../pages/account-details.page');

// GI: "Special Rules - DrMartyPets - Country Selections in Manage Account (Mike)"
//
// The GI test logs into /account-details and asserts the shipping Country <select>
// offers United States AND Canada. Its INTENT (per its name + description — "confirms
// that the Country selections only include the United States and Canada") is the
// business rule that those are the ONLY selectable countries: DMP ships US/CAN only.
//
// PROD-ONLY. The dropdowns are already proven to CONTAIN US + CAN on both envs by
// account-update-shipping-address.spec.js + checkout-country-state.spec.js (both
// selectOption "US|United States" and "CA|Canada"). The only net-new coverage is
// EXCLUSIVITY — "exactly these two, nothing else". That holds only on PROD: UAT seeds
// extra countries into the dropdown (a known UAT data quirk), so the exclusivity
// assert would false-fail there. Hence test.skip on non-prod (matches the inline
// env-skip convention used by payment-add-card / thank-you-page).
//
// Covers BOTH customer-facing country pickers, since "only US + CAN" is a site-wide
// rule, not a single-page one:
//   1. /account-details shipping Country (logged-in — the GI source page)
//   2. /checkout       shipping Country (guest)
// The option list is sourced from the shared <address-form> country config and does
// NOT vary by auth (auth only changes how the form is revealed, not the options), so
// one path per surface is sufficient.
//
// Read-only — no mutation, no cleanup, out of @real-order.

// Sorted option values the Country <select> must contain EXACTLY (nothing more).
const EXPECTED = ['CA|Canada', 'US|United States'];

test.describe('Special Rules - Country Selection Restricted to US + Canada (prod-only)', () => {
  test('Manage Account shipping Country offers ONLY United States + Canada', async ({ page, brand }) => {
    test.skip(brand.env !== 'prod', 'Exclusivity holds on prod only — UAT seeds extra countries');

    const loginPage = new LoginPage(page, brand);
    const account = new AccountDetailsPage(page, brand);

    await loginPage.goto();
    await loginPage.login();
    await account.goto();
    await account.enterShippingEditMode(); // Country <select> only renders in edit mode

    const labels = await account.countryOptionLabels();
    const values = (await account.countryOptionValues()).sort();
    console.log('[country:account-details] options =', labels.filter(Boolean).join(' | '));

    expect(
      values,
      `/account-details Country must offer EXACTLY US + Canada (got: ${values.join(', ')})`
    ).toEqual(EXPECTED);
  });

  test('Guest /checkout shipping Country offers ONLY United States + Canada', async ({ page, brand }) => {
    test.skip(brand.env !== 'prod', 'Exclusivity holds on prod only — UAT seeds extra countries');

    const cartPage = new CartPage(page, brand);
    const checkoutPage = new CheckoutPage(page, brand);

    await cartPage.addProductByKey('loggedout_std_1');
    await cartPage.checkoutAsGuestButton.click();
    await checkoutPage.waitForCheckoutLoaded();
    await checkoutPage.revealCreditCardForm();

    const labels = await checkoutPage.countryOptionLabels();
    const values = (await checkoutPage.countryOptionValues()).sort();
    console.log('[country:checkout] options =', labels.filter(Boolean).join(' | '));

    expect(
      values,
      `/checkout Country must offer EXACTLY US + Canada (got: ${values.join(', ')})`
    ).toEqual(EXPECTED);
  });
});
