const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

const CASES = require('../data/checkout-field-validation.json');

// GI: "Checkout-V2 - Customer Information Form Validation (Shane)"
//     "Checkout-V2 - Shipping Address & Zip Form Validation (Shane)"
//     + Billing-address validation (NEW — the "Use a different billing address"
//       form reuses the same <address-form> component).
//
// FULL per-field parity with the Manage Account specs: data-driven from
// data/checkout-field-validation.json — one test() per section, asserting EACH
// field individually:
//   - required:true  -> empty shows "This field is required"; valid clears it
//   - required:false -> empty does NOT surface a required error (optional)
//   - invalid/invalidMsg -> that value surfaces the inline format error; valid clears it
//
// Guest /checkout (form behind "Or pay with credit card"; billing behind its toggle).
//
// Live audit (2026-06-08) — messages + the required map (checkout is STRICTER than
// /account-details): bad name -> "Invalid pattern"; bad email -> "Please enter a valid
// email address"; bad street/zip -> "Invalid pattern"; empty required -> "This field is
// required". Email is REQUIRED here (optional on account-details); City is REQUIRED for
// shipping + billing (optional for shipping there); Phone + Additional are optional.
//
// Errors render as <p class="invalid-message"> in the SECTION container (NOT the input's
// nested fieldset). The inline required message renders with a short delay — Playwright's
// auto-waiting toBeVisible / toHaveCount(0) handle that. The submit button is NOT used as
// a signal here (it's always disabled on guest checkout until the Braintree CC fields are
// filled, independent of the address form).
//
// Guest, read-only (never submits) -> out of @real-order; no shared-state cleanup
// (cookie-scoped cart, fresh context per test).

const ANY_ERR_RX = /invalid pattern|field is required|valid email address/i;

function sectionErrors(section) {
  return section.locator('.invalid-message').filter({ hasText: ANY_ERR_RX });
}
async function expectSectionError(section, rx) {
  await expect(section.locator('.invalid-message').filter({ hasText: rx }).first()).toBeVisible();
}
async function expectSectionClean(section) {
  await expect(sectionErrors(section)).toHaveCount(0);
}

test.describe('Checkout-V2 - Form Validation (guest, per-field)', () => {
  for (const [sectionName, cfg] of Object.entries(CASES)) {
    if (sectionName.startsWith('_')) continue; // skip the JSON _comment key

    test(`${sectionName} form: required + format validation, per field`, async ({ page, brand }) => {
      const cartPage = new CartPage(page, brand);
      const checkoutPage = new CheckoutPage(page, brand);
      const field = (qa) => page.locator(`[data-qa="${qa}"]`);

      await cartPage.addProductByKey('loggedout_std_1');
      await cartPage.checkoutAsGuestButton.click();
      await checkoutPage.waitForCheckoutLoaded();
      await checkoutPage.revealCreditCardForm();
      if (cfg.toggleBilling) await checkoutPage.setDifferentBilling(true);

      const section = checkoutPage[cfg.sectionRef];

      // --- setup: make the whole section valid so each probe is isolated ---
      for (const s of cfg.selects) {
        await checkoutPage._waitForSelectOption(s.qa, s.value).catch(() => {});
        await field(s.qa).selectOption(s.value);
      }
      for (const f of cfg.fields) {
        await field(f.qa).fill(f.valid);
        await field(f.qa).blur();
      }
      await expectSectionClean(section); // baseline: everything valid

      // --- per-field assertions ---
      // Each field is probed in isolation (all OTHER fields stay valid from setup),
      // so any message belongs to the field under test. One restore-to-valid + clean
      // check per field — no double-restore.
      for (const f of cfg.fields) {
        const loc = field(f.qa);
        const kind = f.required ? 'required' : 'optional';

        await test.step(`${f.label} (${kind}${f.invalid ? ' + format' : ''})`, async () => {
          // 1. format rule (if any): bad value surfaces the inline format error
          if (f.invalid) {
            await loc.fill(f.invalid);
            await loc.blur();
            await expectSectionError(section, new RegExp(f.invalidMsg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
          }

          // 2. empty: required field must error; optional field must NOT block
          await loc.fill('');
          await loc.blur();
          if (f.required) await expectSectionError(section, /this field is required/i);
          else            await expectSectionClean(section);

          // 3. valid value clears everything + restores isolation for the next field
          await loc.fill(f.valid);
          await loc.blur();
          await expectSectionClean(section);
        });
      }
    });
  }
});
