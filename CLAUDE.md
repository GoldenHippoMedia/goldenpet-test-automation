# goldenpet-test-automation — Project Context for Claude

This file is auto-loaded by Claude Code. Read it first before doing any work in this folder.

> **Last verified:** 2026-05-26 — CartV3 suite migrated from gh-auto-funnel-tools. 15 of 40 GI tests ported (all passing in source repo). Tests live in `tests/CartV3/` as `.spec.js` files.

---

## What This Project Is

Playwright test automation for a **multi-brand e-commerce platform** (one codebase, many brands). Tests are being migrated from **Ghost Inspector** into Playwright.

**About the application under test:**
- Single-stack app builder platform shared across multiple brands
- Pages built via app builder (product pages, shop, etc.)
- Custom My Account app (profile, orders, subscriptions)
- Custom cart/checkout flow with Braintree (credit card) + PayPal
- Currently testing **Dr. Marty Pets (drmarty)** — Badlands Ranch and other brands to follow

---

## Critical Architecture Decisions

### 1. Multi-brand support via config, not test code
- **`data/site-config.json`** — URLs, paths, brand metadata, brand-specific content strings
- **`data/products/<brand>-<env>.csv`** — product variant IDs (same format as Ghost Inspector data source)
- **`fixtures/brand.js`** — custom Playwright fixture that loads config + product data based on `BRAND` and `ENVIRONMENT` env vars
- Test files NEVER hardcode brand-specific values. Adding a new brand = new config entries + new CSV, no test changes.

### 2. Multi-environment (UAT vs prod)
- `BRAND=drmarty ENVIRONMENT=prod` switches base URL and product data file
- Salesforce product variant IDs differ between UAT and prod — handled by separate CSVs in `data/products/`

### 3. Selector strategy: data-qa attributes are king
- ALWAYS prefer `[data-qa="..."]` selectors. They're the most reliable and brand-agnostic.
- Fall back to other stable selectors (id, role, text) only when `data-qa` doesn't exist yet.
- The team is adding `data-qa` to more elements — when you hit a missing one, note it as a TODO and use a fallback. Don't refactor the data-qa work yourself.

### 4. CommonJS, NOT ES modules or TypeScript
- All test files use `require()` and `module.exports`
- `.js` files only, never `.ts`
- This is intentional and should NOT be changed.

### 5. Run mode: HEADED ONLY currently
- `--headed` is required for tests to pass on prod
- Headless mode is blocked by bot protection on the site (cart API never returns the product list)
- In Playwright UI mode (`npm run test:ui`) use the "Show browser" toggle instead of hardcoding headed
- No test code changes needed when bot protection gets whitelisted later — just drop `--headed`

---

## Repository Structure

```
goldenpet-test-automation/
├── .env                          # BRAND, ENVIRONMENT, credentials (gitignored)
├── playwright.config.js
├── package.json                  # npm scripts per test suite
├── data/
│   ├── site-config.json          # brand URLs, paths, content strings, test address & card
│   └── products/
│       ├── drmarty-uat.csv       # GI data source format
│       ├── drmarty-prod.csv
│       └── badlands-{uat,prod}.csv  # placeholders, not active yet
├── fixtures/
│   └── brand.js                  # custom Playwright fixture
├── helpers/
│   ├── parse-money.js            # "$179.85" → 179.85, "Free" → 0, "TBD" → null
│   └── order-validations.js      # reusable assertion functions for order tests
├── pages/
│   ├── base.page.js              # popup dismissal logic
│   ├── login.page.js
│   ├── signup.page.js
│   ├── header.page.js
│   ├── cart.page.js
│   ├── checkout.page.js
│   ├── order-confirmation.page.js
│   ├── account-details.page.js
│   └── my-account.page.js
└── tests/
    ├── CartV3/                   # migrated CartV3 suite (all .spec.js)
    │   ├── login.spec.js
    │   ├── header.spec.js
    │   ├── auth-login-logout-header-states.spec.js
    │   ├── auth-signup-legal-links.spec.js
    │   ├── account-main-page-links.spec.js
    │   ├── auth-empty-cart-login-redirect.spec.js
    │   ├── cart-add-change-qty-remove.spec.js
    │   ├── cart-logged-out-verify-shipping-login-guest-buttons.spec.js
    │   ├── cart-logged-out-verify-pricing-after-login.spec.js
    │   ├── cart-terms-and-privacy-links.spec.js
    │   ├── cart-verify-fields-and-links.spec.js
    │   ├── cart-paypal-button.spec.js
    │   ├── cart-shipping-threshold.spec.js
    │   ├── cart-submit-order.spec.js
    │   ├── cart-verify-header-links.spec.js  # REDUNDANT — header.spec.js covers it; safe to delete
    │   ├── order-guest-checkout-cc.spec.js
    │   └── thank-you-page.spec.js
    └── (future suites go here as tests/<SuiteName>/)
```

---

## Migration Status (CartV3)

### Passing in source repo — needs verification here
All 15 tests below were passing in `gh-auto-funnel-tools/Cartv3 tests/` before migration.

- `login.spec.js` — GI: Login
- `header.spec.js` — GI: Header Navigation
- `auth-login-logout-header-states.spec.js` — GI: "Login and Out - Check Headers and Cart"
- `auth-signup-legal-links.spec.js` — GI: "Create Account - Legal Sign-Up Checkbox and Links"
- `account-main-page-links.spec.js` — GI: "My Account Main - Validate Links"
- `auth-empty-cart-login-redirect.spec.js` — GI: "No items in cart, login, user is redirected to Account Main"
- `cart-add-change-qty-remove.spec.js` — GI: "Cart - Add Product, Change Quantity, Remove Product"
- `cart-logged-out-verify-shipping-login-guest-buttons.spec.js`
- `cart-logged-out-verify-pricing-after-login.spec.js`
- `cart-terms-and-privacy-links.spec.js`
- `cart-verify-fields-and-links.spec.js`
- `cart-paypal-button.spec.js`
- `cart-shipping-threshold.spec.js`
- `cart-submit-order.spec.js` — places real order; tagged `@real-order`
- `order-guest-checkout-cc.spec.js` — places real Braintree sandbox order; tagged `@real-order`

### Not yet ported (30 remaining)

Cart / Checkout (1)
- [ ] CartCheckout - Verify Subscription Terms

Checkout-V2 (8)
- [ ] Coupon Validation
- [ ] Customer Information Form Validation
- [ ] Footer Links Check
- [ ] International Zipcode
- [ ] Logged-In - Customer Data Pre-Populates
- [ ] Shipping Address & Zip Form Validation
- [ ] Validate Each Country's State Dropdowns
- [ ] Validate Phone Number, CS Hours and Header Logo

Order (5 remaining)
- [ ] order-guest-checkout-paypal.spec.js — Guest: cart → checkout → PayPal (UAT only)
- [ ] order-loggedin-cart-paypal.spec.js
- [ ] order-loggedin-checkout-cc.spec.js
- [ ] order-loggedin-checkout-paypal.spec.js
- [ ] order-loggedin-list-reorder.spec.js

Upsell / Downsell (3-4) — backlog after Order tests
- [ ] upsell-accept-first.spec.js
- [ ] upsell-decline-accept-downsell.spec.js
- [ ] upsell-decline-all.spec.js

Pet Profiles (3)
- [ ] Pet Profiles - Create New Profile
- [ ] Pet Profiles - Edit Existing Profile
- [ ] Pet Profiles - Remove Existing Profile

Profile & Settings (3)
- [ ] Update Customer Information fields under Manage Account
- [ ] Update Shipping Address fields under Manage Account CAN
- [ ] Update Shipping Address fields under Manage Account US

Manage Payments (1)
- [ ] Manage Payments - Add Credit Card

Special Rules (4)
- [ ] DrMartyPets - Country Selections in Manage Account
- [ ] Dr Marty Pets - Sticky Footer Bundle Coupon Check
- [ ] Dr Marty Pets - Sticky Footer Bundle Opt-In
- [ ] Dr Marty Pets - Sticky Footer Bundle Subscription Check

Thank You Page (1)
- [ ] Thank You Page - Customer & Order Information Displayed (EXCLUDE PROD)

> When a test is verified green in this repo, move it to a "Verified here" section above.

---

## How to Run Tests

```bash
# All CartV3 tests, UAT, excluding real-order tests
npm run cartv3:uat

# All CartV3 tests, prod, headed (required for bot protection)
npm run cartv3:prod:headed

# Real order tests (places actual Braintree sandbox orders)
npm run cartv3:real-orders:uat

# Single test
BRAND=drmarty ENVIRONMENT=uat npx playwright test tests/CartV3/login.spec.js --headed

# Interactive UI mode (use "Show browser" toggle instead of --headed)
npm run test:ui

# Debug a specific test
npm run cartv3:debug -- tests/CartV3/login.spec.js

# View HTML report
npm run report
```

`playwright.config.js` has `retries: 0` — tests do NOT auto-retry on failure. Fix the test before re-running.

---

## How to Port a New Test from Ghost Inspector

1. Read the GI JSON from the source repo's `reference/` folder — those `steps` are the source of truth
2. Identify the GI test variables used (`{{loggedin_std_1}}`, etc.) — map to CSV columns in `data/products/<brand>-<env>.csv`
3. Create the test file in `tests/CartV3/` (or the appropriate suite folder) as a `.spec.js` file
4. Import from fixtures using `require('../../fixtures/brand')` — paths are relative to `tests/CartV3/`
5. Use existing page objects; add to them when needed (prefer extending over inlining locators)
6. **Verify selectors against the live DOM** before assuming they work — DOM may have changed since GI tests were written
7. CMS pages: URL checks only, no heading text. App pages: URL + content checks.
8. Run with `--headed` against UAT, iterate on failures
9. Update the Migration Status section above
10. Add an npm script to `package.json` for the new test

---

## Selector Reference (Live DOM, verified)

### Cart Page (logged in)
| What | Selector |
|------|----------|
| Product name | `[data-qa="product-name"]` |
| Product price | `[data-qa="product-price"]` |
| Product quantity (text) | `[data-qa="product-quantity"]` |
| Quantity number display | `[data-qa="quantity"]` |
| Remove link | `[data-qa="product-delete-link"]` |
| Decrease qty (minus) | `[data-qa="product-delete-btn"]` |
| Increase qty (plus) | `[data-qa="quantity-increase-btn"]` |
| Subtotal | `[data-qa="subtotal"]` |
| Tax | `[data-qa="tax"]` |
| Shipping | `[data-qa="shipping"]` |
| Total | `[data-qa="total"]` |
| Shipping address (street) | `[data-qa="shipping-street"]` |
| Shipping change link | `[data-qa="shipping-address-change-link"]` |
| Saved card select | `[data-qa="saved-card"]` |
| Submit Order button | `[data-qa="submit-order-btn"]` |
| Continue Shopping | `[data-qa="continue-btn"]` |
| Coupon input | `[data-qa="coupon-code"]` |
| Coupon Apply button | `[data-qa="coupon-apply-btn"]` |
| Toast message | `[data-qa="toast-message"]` |
| "Checkout with new card" | `button:has-text("Checkout with new card")` — no data-qa yet |

### Cart Page (logged out)
| What | Selector |
|------|----------|
| Login button | `button:text-is("Log In")` — no data-qa yet |
| Checkout As Guest | `#checkout-button` — no data-qa yet |
| PayPal button container | `#paypal-button` |

### Cart Header — cross-page gotcha
- CMS pages (homepage, /products): cart icon is `a[href="/cart"]`
- Angular app pages (/my-account, /cart, /checkout): cart icon is `div.cart`
- Page object handles both: `'a[href="/cart"]:visible, div.cart:visible'`

### Login Page
| What | Selector |
|------|----------|
| Email input | `gh-input.email-input input` |
| Password input | `gh-input.password-input input` |
| Submit button | `[data-qa="login-btn"]` |
| Toast / error message | `[data-qa="toast-message"]` |

### Account Pages (heading assertions)
| Page | Heading |
|------|---------|
| /my-account | `h4` "Account Management" — use `getByText`, NOT `getByRole('heading')` |
| /pets | No heading — use `page.toHaveTitle(/Pet Profile/)` |
| /account-details | `h1` "Manage Account" |
| /order-history | `h6` "Order History" — use `getByText` |
| /subscription-edit | No heading — use `getByText('Skip next order')` |

### Checkout Page (/checkout)
- NO `data-qa` on form fields — use placeholder text
- Renders in two modes: PayPal-first (default), CC form revealed by clicking `text=Or pay with credit card`

| What | Selector |
|------|----------|
| "Or pay with credit card" toggle | `text=Or pay with credit card` |
| Customer First Name | `main input[placeholder="First Name"]` — scoped to avoid footer |
| Customer Last Name | `main input[placeholder="Last Name"]` |
| Customer Email | `main input[placeholder="Email"]` |
| Customer Phone | `main input[placeholder="Phone"]` |
| Delivery First name | `input[placeholder="First name"]` (lowercase n) |
| Delivery Street | `input[placeholder="Street Address"]` |
| Delivery City | `input[placeholder="City"]` |
| Delivery Country | `page.locator('select').first()` |
| Delivery State | `page.locator('select').nth(1)` — match by `{ label: 'California' }` |
| Delivery Zip | `input[placeholder="Zip/Postal Code"]` |
| Order Summary Subtotal | `xpath=//*[normalize-space(text())="Subtotal:"]/following-sibling::*[1]` |
| Order Summary Sales Tax | `xpath=//*[normalize-space(text())="Sales Tax:"]/following-sibling::*[1]` |
| Order Summary Shipping | `xpath=//*[normalize-space(text())="Shipping:"]/following-sibling::*[1]` |
| Order Summary Total | `xpath=//*[normalize-space(text())="Total:"]/following-sibling::*[1]` |

### Order Confirmation Page (/order-confirmation)
- NO `data-qa` — uses label-text + following-sibling XPath with `normalize-space()`

| What | Selector |
|------|----------|
| Order Number | `xpath=//*[normalize-space(text())="Order Number:"]/following-sibling::*[1]` |
| Order Date | `xpath=//*[normalize-space(text())="Order Date:"]/following-sibling::*[1]` |
| Customer | `xpath=//*[normalize-space(text())="Customer:"]/following-sibling::*[1]` |
| Shipping Address | `xpath=//*[normalize-space(text())="Shipping Address:"]/following-sibling::*[1]` |
| Subtotal | `xpath=//*[normalize-space(text())="Subtotal:"]/following-sibling::*[1]` |
| Taxes | `xpath=//*[normalize-space(text())="Taxes:"]/following-sibling::*[1]` (plural — not "Tax:") |
| Shipping | `xpath=//*[normalize-space(text())="Shipping:"]/following-sibling::*[1]` (shows "Free") |
| Total | `xpath=//*[normalize-space(text())="Total:"]/following-sibling::*[1]` |

### Braintree Hosted Field iframes (CC on /checkout)
| Field | Iframe selector |
|-------|----------------|
| Card Number | `iframe[title="Secure Credit Card Frame - Credit Card Number"]` |
| Cardholder Name | `iframe[title="Secure Credit Card Frame - Cardholder Name"]` |
| Expiration Date | `iframe[title="Secure Credit Card Frame - Expiration Date"]` |
| CVV | `iframe[title="Secure Credit Card Frame - CVV"]` |

- Each iframe: use `input:not([tabindex="-1"])` to get the visible input
- Use `pressSequentially()` NOT `fill()` — Braintree listens for keydown events
- Expiry: strip the `/` before typing (`"12/26"` → `"1226"`) — Braintree auto-inserts it

---

## Important Patterns and Gotchas

### 1. Cart is an async-loading Angular SPA
- ALWAYS call `cartPage.waitForCartLoaded()` after navigation — built into `addProductToCart()` and `addProductByKey()` already

### 2. Marketing popups cover the page intermittently
- `BasePage.dismissPopupIfPresent()` handles Attentive overlay + Members-Only popup
- Call after CMS page navigations. If a click does nothing, suspect a popup.

### 3. Login redirects depend on context
- From `/login` → redirects to `/my-account`
- From cart (with items) → redirects back to `/cart`
- **Gotcha:** `waitForURL(/cart/)` matches too early (login URL contains "cart" in query) — use `url => !url.toString().includes('/login')` instead

### 4. New tabs / popups
- Terms & Privacy open in new tabs → `page.context().waitForEvent('page')`
- Privacy Choices navigates in same tab (not a new tab)
- PayPal button opens popup → `page.waitForEvent('popup')`
- PayPal button is in cross-origin iframe → `page.frameLocator('#paypal-button iframe.component-frame.visible')`

### 5. Terms / Privacy URLs
- Terms: `legal.<brand>.com/terms`
- Privacy: `legal.<brand>.com/privacy`
- Privacy Choices: `<brand>.com/your-privacy-choices` (main domain, NOT legal subdomain)

### 6. Headless mode is blocked by bot protection
- `--headed` required for prod; use "Show browser" toggle in UI mode
- Tried: user agent override, webdriver injection, Chrome channel — none worked

### 7. Real-order tests
- Tagged `@real-order` — excluded from standard runs, use `cartv3:real-orders:*` scripts
- Places actual Braintree sandbox orders; randomizes product to avoid duplicate errors

### 8. Angular text nodes wrapped in HTML comments
- Angular renders `<p><!----> Total: <!----></p>` — `text()="Total:"` returns zero matches
- **Always use `normalize-space(text())="Total:"` for XPath on Angular pages**
- Affects /checkout Order Summary and /order-confirmation

### 9. waitForURL hangs on Angular SPAs
- Use `{ waitUntil: 'commit' }` — don't wait for load event
- Applied in `CheckoutPage.waitForCheckoutLoaded()` and `OrderConfirmationPage.waitForConfirmationLoaded()`

### 10. Post-purchase upsell funnel is intermittent on UAT
- Route: `/checkout → /offer → /upsell → /downsell → /order-confirmation`
- `CheckoutPage.waitForOrderConfirmation()` polls and clicks "I'm not interested" if visible

### 11. Post-purchase popups on /order-confirmation
- Three popups: Attentive overlay, "How did you hear?" dialog, CSAT survey
- `OrderConfirmationPage.dismissConfirmationPopups()` handles all three (called twice with 1.5s pause)

### 12. Customer Info "First Name" conflicts with footer
- Both /checkout customer form AND footer newsletter have `input[placeholder="First Name"]`
- Always scope to `main`: `page.locator('main input[placeholder="First Name"]')`

### 13. Product name display differs across pages
- Cart: `"Nature's Blend Essential Wellness 16oz"`
- Confirmation: `"Dr. Marty Nature's Blend Essential Wellness- 1 Bag"`
- Use `assertProductNamesMatch()` — asserts 2+ shared significant words

### 14. Empty cart bug on UAT
- Removing all products shows nothing (no "empty" message) — prod shows it correctly
- `isCartEmpty()` returns false on UAT even when empty; test against prod or check `productName.count() === 0`

---

## Order Test Architecture

Each page object has `getOrderSummary()` returning `{ productName, quantity, itemPrice, subtotal, tax, shipping, total }`.

Reusable assertions in `helpers/order-validations.js`:

| Function | Use |
|----------|-----|
| `assertOrderIdFormat(orderId)` | Matches `/^ORD-\d{6,9}$/` |
| `assertSnapshotsAgree(a, b, aLabel, bLabel, fields)` | Compare specific fields; skips nulls |
| `assertProductNamesMatch(a, b, aLabel, bLabel)` | Loose match — 2+ shared significant words |
| `assertMoneyMath(snapshot)` | `total = subtotal + tax + shipping` (±$0.01) |
| `assertConfirmationMatchesSubmission(conf, submitted)` | Customer/address round-trip |
| `assertTaxApplied(snapshot)` | `tax > 0` |
| `assertShippingThreshold(snapshot)` | ≥$50 = free; <$50 = fee |

Money parsing: `parseMoney("$179.85")` → `179.85`, `parseMoney("Free")` → `0`, `parseMoney("TBD")` → `null`

---

## Common Failure Patterns

| Symptom | Cause | Fix |
|---------|-------|-----|
| "element(s) not found" on cart load | Angular async | `cartPage.waitForCartLoaded()` |
| Click does nothing | Popup overlay | `dismissPopupIfPresent()` |
| `waitForURL(/cart/)` matches login page | Login URL has "cart" in query | `url => !url.toString().includes('/login')` |
| `waitForURL` times out | Angular pending XHRs | `{ waitUntil: 'commit' }` |
| Test passes headed, fails headless | Bot protection | Run `--headed` |
| XPath `text()="X"` finds nothing | Angular comment nodes | `normalize-space(text())="X"` |
| Submit Order stays disabled after CC fill | Braintree needs keydown | `pressSequentially()` not `fill()` |
| Intermittent `12//26` expiry | Slash collision | Strip `/` from expiry before typing |
| Strict mode violation on First Name | Footer form conflict | Scope to `main` |
| Product name comparison fails | Different display copy per page | `assertProductNamesMatch()` |
| Multiple PayPal iframes | Two iframes same title | Use `iframe.component-frame.visible` |

---

## Test Data

```js
brand.testAddress  // { firstName, lastName, email, address1, city, state, zip, phone }
brand.testCard     // { number, expiry, cvv, postalCode }
brand.testProducts.loggedin_std_1  // Salesforce variant ID
brand.cartUrl('loggedin_std_1')    // full cart URL
```

UAT Braintree test card: `4111 1111 1111 1111` exp `12/26` cvv `123` zip `91364`

### Ghost Inspector Variable Mapping
| GI Variable | CSV Column | Description |
|-------------|-----------|-------------|
| `{{loggedin_std_1}}` – `{{loggedin_std_4}}` | `loggedin_std_1`..`4` | Standard variants, logged-in |
| `{{loggedin_sub_1}}` `{{loggedin_sub_2}}` | `loggedin_sub_1`..`2` | Subscription variants |
| `{{loggedout_std_1}}` `{{loggedout_std_2}}` | `loggedout_std_1`..`2` | Standard variants, logged-out |
| `{{loggedout_sub_1}}` | `loggedout_sub_1` | Subscription variant, logged-out |
| `{{loggedout_add_shipping_fee}}` | `loggedout_add_shipping_fee` | Product under $50 (triggers shipping fee) |
| `{{products_path}}` | `products_path` | Products listing path |
| `{{pdp_path}}` | `pdp_path` | Product detail page path |

---

## Things NOT to Change
- CommonJS / `.js` files — do not convert to ESM or TypeScript
- `BRAND` / `ENVIRONMENT` env var pattern
- `data/products/<brand>-<env>.csv` column format — matches Ghost Inspector data source
- Heading text checks on CMS pages — URL-only by design

## Things Safe to Change
- Add new page objects for new tests
- Refactor selectors to `data-qa` as the team adds them
- Delete `tests/CartV3/cart-verify-header-links.spec.js` (redundant with `header.spec.js`)
- Add new brands to `site-config.json` and `data/products/`
- Add new test suites under `tests/<SuiteName>/`
