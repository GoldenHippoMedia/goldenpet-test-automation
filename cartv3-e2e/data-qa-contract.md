# CartV3 E2E — `data-qa` Contract

The set of `data-qa` attribute values the CartV3 Playwright suite currently
depends on as locators. Hand this to the app team (hippo-builder-cart) whenever
they rename or change `data-qa` attributes: **any name on this list that gets
renamed or removed in the app breaks a test here** until the matching page
object is updated. Diffing app-side renames against this list surfaces the
test-impacting ones up front instead of discovering them after deploy.

**Last regenerated:** 2026-06-12 (against `main`)

## How to regenerate

```bash
cd cartv3-e2e
# data-qa referenced in page objects + specs:
grep -rhoE 'data-qa="[^"]+"' pages/ tests/ | sed -E 's/data-qa="//; s/"$//' | sort -u
# plus data-qa names that come from data fixtures (e.g. checkout-field-validation.json):
grep -rhoE '"qa"[[:space:]]*:[[:space:]]*"[^"]+"' data/ | sed -E 's/.*"qa"[[:space:]]*:[[:space:]]*"//; s/"$//' | sort -u
```

## Caveats

- **`data-qa` literals only.** Locators that use `getByRole`, text, CSS, or xpath
  are NOT in this list (by design — this is the `data-qa` rename contract).
  Page objects that use **zero** `data-qa` and rely on other strategies:
  `order-history`, `my-account`, `header`, `order-confirmation`.
- **Snapshot.** Reflects the repo at the date above — regenerate before each round.
- **Dash conventions matter.** The address-form fields use distinct instance
  suffixes that are NOT interchangeable: checkout delivery uses a double dash
  (`ship-*--shipping`), checkout billing uses a single trailing dash (`ship-*-`),
  and account-details uses single-dash `-shipping` / `-billing`. Never collapse
  these with a `^=` prefix match.

## Where they live (heaviest first)

| Page object | `data-qa` locators |
|---|---|
| `checkout.page.js` | 40 |
| `cart.page.js` | 29 |
| `account-details.page.js` | 25 |
| `pets.page.js` | 7 |
| `payment-details.page.js` | 6 |
| `signup.page.js` / `login.page.js` / `base.page.js` | a few each |

## The list (alphabetical, deduped)

```
add-card-btn
address-form
billing-address-form
billing-address-toggle
birthday
breed
ca-terms-checkbox
cancel-btn
card-details
card-list
checkout-btn
continue-btn
coupon-apply
coupon-apply-btn
coupon-clear
coupon-code
coupon-input
current-weight
customer-info-form
delete-card-btn
discount
email
first-name
first-name-
first-name--shipping
last-name
last-name-
last-name--shipping
legal-text
login-btn
payment-settings-btn
phone
phone--shipping
product-delete-btn
product-delete-link
product-name
product-price
product-quantity
profile-name
quantity
quantity-increase-btn
save-btn
saved-card
ship-additional-address-line-
ship-additional-address-line--shipping
ship-additional-address-line-billing
ship-additional-address-line-shipping
ship-city-
ship-city--shipping
ship-city-billing
ship-city-shipping
ship-country-
ship-country--shipping
ship-country-billing
ship-country-shipping
ship-postal-code-
ship-postal-code--shipping
ship-postal-code-billing
ship-postal-code-shipping
ship-state-
ship-state--shipping
ship-state-billing
ship-state-shipping
ship-street-address-
ship-street-address--shipping
ship-street-address-billing
ship-street-address-shipping
shipping
shipping-address
shipping-address-change-link
shipping-address-form
shipping-combined
shipping-country
shipping-name
shipping-street
submit-order-btn
subscription-terms-text
tax
toast-message
total
```
