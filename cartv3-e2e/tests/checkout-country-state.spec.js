const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

const CASES = require('../data/checkout-country-cases.json');

// GI: "Checkout-V2 - Validate Each Country's State Dropdowns (Shane)"
//     "Checkout-V2 - International Zipcode (Shane)"
//     + the happy-path half of "Shipping Address & Zip Form Validation".
//
// Guest /checkout (form behind "Or pay with credit card"). Data-driven: one test()
// per country in data/checkout-country-cases.json — each shows as its own pass/fail
// line ("… › Canada › …"), and the test.step blocks localize which assertion failed.
//
// PRODUCTION ships US + Canada only; UAT exposes more countries which we ignore.
// Per country:
//   1. selecting the country repopulates the State/Province <select> (the expected
//      region appears, the other country's region is absent) — the dropdown swap;
//   2. a valid in-country street + postal clears the inline errors (Canada doubles
//      as the "International Zipcode" case via the Canadian postal format).
//
// Guest, read-only -> out of @real-order, no cleanup (cookie-scoped cart).

// Inline errors render as <p class="invalid-message"> within the section container.
async function expectSectionClean(section) {
  await expect(
    section.locator('.invalid-message').filter({ hasText: /invalid pattern|field is required|valid email address/i })
  ).toHaveCount(0);
}

test.describe('Checkout-V2 - Country/State Dropdowns (guest)', () => {
  for (const [countryName, data] of Object.entries(CASES)) {
    if (countryName.startsWith('_')) continue; // skip the JSON _comment key

    test(countryName, async ({ page, brand }) => {
      const cartPage = new CartPage(page, brand);
      const checkoutPage = new CheckoutPage(page, brand);

      await cartPage.addProductByKey('loggedout_std_1');
      await cartPage.checkoutAsGuestButton.click();
      await checkoutPage.waitForCheckoutLoaded();
      await checkoutPage.revealCreditCardForm();

      await test.step(`country switch repopulates State/Province (${countryName})`, async () => {
        await checkoutPage.shipCountry.selectOption(data.country);
        await checkoutPage._waitForSelectOption('ship-state--shipping', data.state);
        const labels = await checkoutPage.shipStateOptionLabels();
        expect(labels, `${data.expectStatePresent} should be selectable for ${countryName}`)
          .toContain(data.expectStatePresent);
        expect(labels, `${data.expectStateAbsent} should NOT be selectable for ${countryName}`)
          .not.toContain(data.expectStateAbsent);
      });

      await test.step(`valid in-country address clears inline errors (${countryName})`, async () => {
        await checkoutPage.fillShippingAddressQa({
          firstName: 'Craig',
          lastName: 'Clemens',
          street: data.street,
          city: data.city,
          state: data.state,
          zip: data.validZip,
        });
        await checkoutPage.shipPostal.blur();
        await expectSectionClean(checkoutPage.shippingAddressForm);
      });
    });
  }
});
