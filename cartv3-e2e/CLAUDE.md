# goldenpet-test-automation — Project Context for Claude

This file is auto-loaded by Claude Code. Read it first before doing any work in this folder.

> **Last verified:** 2026-06-08 — Checkout batch (6 specs: `checkout-subscription-terms`, `checkout-coupon-validation`, `checkout-form-validation`, `checkout-header-display`, `checkout-country-state`, `checkout-prepopulate`) added and **verified green here** (UAT, headed). Ports the 8 Checkout-V2 + 1 Cart/Checkout GI tests → 6 specs ("Footer Links Check" dropped as redundant with `cart-terms-and-privacy-links.spec.js`). Read-only (no orders) → out of `@real-order`. Key audit findings (see "Checkout Page (/checkout)" reference): /checkout form fields now have clean `data-qa` (shipping uses `--shipping` suffix, billing `-`); checkout is STRICTER than /account-details (Email + City required); coupon `apply-coupon` → 404 invalid / 200 valid + "Coupon not found" toast (observer-based capture — toast retains last msg); inline validation errors are `.invalid-message` scoped to the section (input sits in a nested fieldset); subscription terms (`[data-qa="subscription-terms-text"]`) render on /cart + /checkout with all disclosure links verified by destination. Brand-content values (coupon `AUTOTEST1`, CS phone/hours, first-party domain, free-shipping text) were moved out of test logic into `data/site-config.json` and are read via `brand.content.*` / `brand.primaryDomain` (done 2026-06-10) — see Backlog "Brand-portability of the checkout specs". Extended `pages/checkout.page.js` + `pages/cart.page.js` + `pages/base.page.js` (observer-based toast capture); added `data/checkout-country-cases.json` + `data/checkout-field-validation.json`; npm `cartv3:checkout:{all,subscription-terms,coupon,form-validation,header,country-state,country-us,country-can,prepopulate}:uat`. Prior: 2026-06-05 — Profile & Settings batch (`account-update-customer-info.spec.js`, `account-update-shipping-address.spec.js` [data-driven US + CAN], `account-update-billing-address.spec.js`) added and **verified green here** (UAT, headed, 6 tests). All on `/account-details` ("Manage Account"). Each snapshots the account's current values and restores them (afterEach safety net) → required-field validation (empty field → inline error + Save disabled + no PUT) → mutate → assert the save `PUT /account-service/proxy/account/{id}` status + request body + "Successfully updated account" toast → reload round-trip. Shipping is data-driven from `data/shipping-address-cases.json` (one test per country; asserts the Country→State/Province dropdown swap). Billing (no GI source) exercises the "Different Billing Address" toggle and round-trips/cleans up via the backend `billingAddress` (the toggle state isn't persisted by the app). Extended `pages/account-details.page.js` (+`fetchAccount()`), hardened `pages/base.page.js` popup-dismiss against a navigation race, and added a `QA_UA_TOKEN`-driven Cloudflare bot-bypass User-Agent in `playwright.config.js` (DevOps allow-lists `DrMartyQA/<token>`; secret lives in `.env`). npm: `cartv3:account:{all,customer-info,shipping,shipping-us,shipping-can,billing}:uat`. Earlier same batch context: 2026-06-03 — Manage Payments port (`payment-add-card.spec.js`) added and **verified green here** (UAT, headed). Add a CC via the Braintree hosted-field form on `/payment-details` → assert backend save POST (<300) + a new `**** 4242` row in My Card(s) → exercise the remove modal (NEVERMIND cancels non-destructively; YES removes) → assert backend delete call (<300) + the success toast + the row disappears. UAT-only (skips prod — don't submit/store cards on prod). Adds `pages/payment-details.page.js`, `brand.addCardTestCard` (4242 card), npm `cartv3:payments:add-card:uat`. Established a **mandatory data-qa audit step** before working any page (see "Selector strategy"). Earlier same day: Order History port (`order-loggedin-list-reorder.spec.js`) added and **verified green here** (UAT, headed). Comprehensive `/order-history` test: list smoke, per-card validation (date / payment method / math / image render), pagination, Buy It Again (product-identity round-trip to PDP), Re-Order All (product-identity round-trip to /cart), `afterEach` cart cleanup. Adds `pages/order-history.page.js`. Prior context: Pet Profiles batch (4 specs) verified green 2026-06-02; CartV3 suite migrated from gh-auto-funnel-tools; 19 earlier tests + 6-test Order Placement batch are ported but **still pending verification here**. Tests live in `tests/` as `.spec.js` files. Requires `.env` with PAYPAL_SANDBOX_EMAIL / PAYPAL_SANDBOX_PASSWORD for the PayPal tests, and `<BRAND>_<ENV>_ACCOUNT_ID` (or `data/site-config.json` → `testAccountIds`) for the Pet Profiles API setup.

---

## What This Project Is

Playwright test automation for a **multi-brand e-commerce platform** (one codebase, many brands). Tests are being migrated from **Ghost Inspector** into Playwright.

**Repo layout note (important):** `goldenpet-test-automation/` is a multi-tool monorepo. The repo root holds only `.gitignore` and one folder per tool/suite. This project (CartV3 E2E) lives entirely under `cartv3-e2e/` — that folder owns its own `package.json`, `playwright.config.js`, `pages/`, `fixtures/`, `helpers/`, `data/`, `tests/`, and `.env`. Future tools (e.g. unit, API, other suites) will live as sibling top-level folders, NOT inside `cartv3-e2e/`. All paths in this doc are relative to `cartv3-e2e/`.

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
- **New-brand onboarding check:** CMS/Builder.io-driven `data-qa` tags (footer links, page headings, cancellation-reason content) are authored per brand in Builder — NOT guaranteed by code. When onboarding a new brand, verify those tags actually carried over before trusting those locators.

### 2. Multi-environment (UAT vs prod)
- `BRAND=drmarty ENVIRONMENT=prod` switches base URL and product data file
- Salesforce product variant IDs differ between UAT and prod — handled by separate CSVs in `data/products/`

### 3. Selector strategy: data-qa attributes are king
- ALWAYS prefer `[data-qa="..."]` selectors. They're the most reliable and brand-agnostic.
- Fall back to other stable selectors (id, role/aria, text) only when `data-qa` doesn't exist yet.
- The team is adding `data-qa` to more elements — when you hit a missing one, note it as a TODO and use a fallback. Don't refactor the data-qa work yourself.

#### MANDATORY: audit a page for data-qa BEFORE writing/changing its selectors
Whenever you start work on a page (a new port, a new page object, or editing
selectors on an existing one), FIRST enumerate the data-qa attributes that page
actually exposes on the **live DOM**, and prefer them. The DOM drifts and the team
keeps adding data-qa, so never assume from memory or from the GI JSON — verify.

1. Open the page in the live browser (Chrome MCP if available; otherwise have the
   user paste DOM). Trigger any dynamic regions you'll target (open the modal,
   reveal the form, load the list) — data-qa on lazily-rendered elements only
   appears once they're in the DOM.
2. List every data-qa on the page (and re-list after opening a modal/section to
   catch ones that appear dynamically):
   ```js
   [...new Set([...document.querySelectorAll('[data-qa]')].map(e => e.getAttribute('data-qa')))]
   ```
3. For each element you need, use its `[data-qa="..."]` if one exists. Only when an
   element genuinely has none (confirm by inspecting THAT element's attributes, not
   just a page-level scan) do you fall back to id → role/aria → stable text.
4. Record every fallback you had to use as a `TODO: ask team to add data-qa …` in
   this file's selector reference, so the gaps are visible and can be closed later.

This is how the Manage Payments port was done — the audit confirmed `add-card-btn`,
`card-list`, `card-details`, `delete-card-btn`, `toast-message` exist, and that the
remove-modal confirm/cancel buttons do NOT (→ `aria-label` fallback + a logged TODO).

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
goldenpet-test-automation/      # repo root — holds .gitignore only; each tool/suite
│                                 lives in its own self-contained top-level folder
├── .gitignore
└── cartv3-e2e/                  # CartV3 Playwright E2E suite (this project)
    ├── .env                     # BRAND, ENVIRONMENT, credentials (gitignored)
    ├── playwright.config.js
    ├── package.json             # cartv3:* npm scripts
    ├── data/
    │   ├── site-config.json     # brand URLs, paths, content strings, test address & card
    │   ├── shipping-address-cases.json # data-driven country cases for the Manage Account shipping test
    │   ├── billing-address-cases.json  # data-driven country cases for the Manage Account billing test
    │   ├── checkout-country-cases.json # data-driven US/CAN cases for the /checkout country-state test
    │   ├── checkout-field-validation.json # per-field required/format map for the /checkout form-validation test
    │   └── products/
    │       ├── drmarty-uat.csv  # GI data source format
    │       ├── drmarty-prod.csv
    │       └── badlands-{uat,prod}.csv  # placeholders, not active yet
    ├── fixtures/
    │   └── brand.js             # custom Playwright fixture
    ├── helpers/
    │   ├── parse-money.js       # "$179.85" → 179.85, "Free" → 0, "TBD" → null
    │   ├── order-validations.js # reusable assertion functions for order tests
    │   └── pet-profile-api.js   # pets create/remove/list via API (page.evaluate fetch + CSRF headers)
    ├── pages/
    │   ├── base.page.js         # popup dismissal logic
    │   ├── login.page.js
    │   ├── signup.page.js
    │   ├── header.page.js
    │   ├── cart.page.js
    │   ├── checkout.page.js
    │   ├── order-confirmation.page.js
    │   ├── account-details.page.js
    │   ├── my-account.page.js
    │   ├── order-history.page.js # /order-history list + card snapshots
    │   ├── pets.page.js         # /pets + /pets/create + /pets/edit form & list
    │   └── payment-details.page.js # /payment-details — add-card form + saved-card list
    └── tests/                   # flat — all CartV3 specs here, no CartV3/ subfolder
        ├── login.spec.js
        ├── header.spec.js
        ├── auth-login-logout-header-states.spec.js
        ├── auth-signup-legal-links.spec.js
        ├── account-main-page-links.spec.js
        ├── auth-empty-cart-login-redirect.spec.js
        ├── cart-add-change-qty-remove.spec.js
        ├── cart-logged-out-verify-shipping-login-guest-buttons.spec.js
        ├── cart-logged-out-verify-pricing-after-login.spec.js
        ├── cart-terms-and-privacy-links.spec.js
        ├── cart-verify-fields-and-links.spec.js
        ├── cart-paypal-button.spec.js
        ├── cart-shipping-threshold.spec.js
        ├── cart-verify-header-links.spec.js  # REDUNDANT — header.spec.js covers it; safe to delete
        ├── order-guest-checkout-cc.spec.js
        ├── order-guest-checkout-paypal.spec.js
        ├── order-loggedin-cart-cc.spec.js    # renamed from cart-submit-order.spec.js
        ├── order-loggedin-cart-paypal.spec.js
        ├── order-loggedin-checkout-cc.spec.js
        ├── order-loggedin-checkout-paypal.spec.js
        ├── thank-you-page.spec.js                 # ✅ verified green here — TY/confirmation DISPLAY (UAT-only, @real-order, submits from /cart)
        ├── order-loggedin-list-reorder.spec.js    # Order History list + Buy It Again + Re-Order All
        ├── pets-create-profile.spec.js            # ✅ verified green here
        ├── pets-edit-profile.spec.js              # ✅ verified green here
        ├── pets-remove-profile.spec.js            # ✅ verified green here
        ├── pets-create-profile-validation.spec.js # ✅ verified green here (no GI equivalent)
        ├── payment-add-card.spec.js               # ✅ verified green here — Manage Payments add-card (UAT-only)
        ├── account-update-customer-info.spec.js   # ✅ verified green here — Manage Account customer info
        ├── account-update-shipping-address.spec.js # ✅ verified green here — Manage Account shipping (data-driven US + CAN)
        ├── account-update-billing-address.spec.js  # ✅ verified green here — NEW (no GI) "Different Billing Address" toggle
        ├── checkout-subscription-terms.spec.js      # ✅ verified green here — sub terms + all disclosure links on /cart + /checkout (logged-in)
        ├── checkout-coupon-validation.spec.js       # ✅ verified green here — valid+invalid coupon on /cart + /checkout (guest)
        ├── checkout-form-validation.spec.js         # ✅ verified green here — customer/shipping/billing per-field format+required (guest)
        ├── checkout-header-display.spec.js          # ✅ verified green here — logo/phone/CS-hours (guest)
        ├── checkout-country-state.spec.js           # ✅ verified green here — US/CAN country→state + intl zip (guest, data-driven)
        ├── checkout-prepopulate.spec.js             # ✅ verified green here — logged-in customer+shipping pre-populate
        └── country-options-restricted.spec.js       # ✅ verified green on PROD (skips UAT) — Country dropdown = exactly US + CAN (/account-details + /checkout)
```

---

## Migration Status (CartV3)

### Passing in source repo — needs verification here
All 19 tests below were passing in `gh-auto-funnel-tools/Cartv3 tests/` before migration.

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
- `order-loggedin-cart-cc.spec.js` — renamed from `cart-submit-order.spec.js`; logged-in user submits a real order from the cart with the default saved CC. Covers two duplicate GI tests ("Cart - Log In..." and "Order - Log In..."). Tagged `@real-order`
- `order-guest-checkout-cc.spec.js` — places real Braintree sandbox order; tagged `@real-order`
- `order-guest-checkout-paypal.spec.js` — Guest: cart → checkout → PayPal popup login → order. Uses PAYPAL_SANDBOX_EMAIL / PAYPAL_SANDBOX_PASSWORD from `.env`. UAT only. Tagged `@real-order`
- `order-loggedin-cart-paypal.spec.js` — Logged-in: PayPal button on the cart page; cart auto-submits after popup closes. UAT only. Skips `assertShippingThreshold` (logged-in free-shipping benefit). Tagged `@real-order`
- `order-loggedin-checkout-cc.spec.js` — Logged-in: cart → /checkout (via shipping change link) → submit with saved CC. Skips `assertShippingThreshold`. Tagged `@real-order`
- `order-loggedin-checkout-paypal.spec.js` — Logged-in: cart → /checkout → PayPal; /checkout auto-submits after popup closes. UAT only. Skips `assertShippingThreshold`. Tagged `@real-order`
### ✅ Verified green here (UAT, headed)
Tests below are run and passing **in this repo** (not just the source repo).

Pet Profiles batch (first set verified here, 2026-06-02):
- `pets-create-profile.spec.js` — GI: "Pet Profiles - Create New Profile". UI create with **randomized** inputs (type, sex, weight, health issues — logged each run for repro). Asserts request body, response body, and the /pets card all match every submitted field. API soft-delete teardown (`afterEach`).
- `pets-edit-profile.spec.js` — GI: "Pet Profiles - Edit Existing Profile". **API setup** creates the profile (skips UI form for setup), then UI edits **every field** (name, sex flipped, weight, health issues — randomized). Asserts request + response bodies, preserved fields (breed/birthday/profileType not wiped), and the /pets card. Lands on `/pets/edit/{petId}`.
- `pets-remove-profile.spec.js` — GI: "Pet Profiles - Remove Existing Profile". API setup; single consolidated test: opens the remove modal → asserts the modal copy renders the correct pet name → clicks "Contact Us" (asserts nav to `/contact`, non-destructive) → returns → confirms remove. Pins the soft-delete contract (`PUT {id, active:false}`, status 200) and asserts the card disappears.
- `pets-create-profile-validation.spec.js` — NEW (no GI equivalent). Client-side validation on `/pets/create`: empty submit blocked (no POST, stays on page) with all five `"<Field> is required"` inline errors shown; breed-not-selected → `"Invalid value"`; valid form clears all errors. NOTE: Save is **always enabled** — the form blocks on click, it does not disable the button.

Order History (verified 2026-06-03):
- `order-loggedin-list-reorder.spec.js` — GI: "Order-list - List, Buy-It-Again, Re-Order".
  Comprehensive `/order-history` test. GI source has only 3 thin asserts; this port
  extends to 5 sections:
  1. **List smoke** — heading visible, ≥1 ORD- visible, first ID matches `/^ORD-\d{6,9}$/`.
  2. **Per-card validation** — loops every visible card on page 1 and asserts: date
     format `MM/DD/YYYY`, payment method matches `/^(Card Ending in \d{4}|PayPal)$/`,
     math `total ≈ subtotal + tax + shipping` via `assertMoneyMath` (CAD ` CAD` suffix
     stripped before parsing), every product image rendered (`naturalWidth > 0`,
     non-empty `alt`).
  3. **Pagination smoke** — if a next-page button exists, click it and assert the first
     visible ORD-id changes; otherwise log-and-skip that section.
  4. **Buy It Again** — picks the **first order's first product row** (deterministic +
     property-based, not random), snapshots its product name, scopes the click to that
     row's button, asserts PDP URL matches `/\/product\//` and the PDP `h1.product-name`
     shares ≥1 significant word with the order row's product name (PDP shows a short
     form like "ProPower Plus" vs the order row's "Dr. Marty ProPower Plus - 3 Jars").
  5. **Re-Order All** — picks the **first card on page 1 with a Re-Order All button**
     (per product knowledge: only multi-product 2+ orders expose it). Paginates once
     if absent on page 1; `test.skip()` only if truly absent everywhere. Snapshots all
     the card's products, clicks the button, asserts `/cart` is populated with a
     matching row count, and each product matches by name (loose word match), exact
     quantity, and price (cart may show unit OR line total — test accepts either).
  `afterEach` calls `cartPage.clearCart()` so Re-Order All doesn't leave items lying
  around on the shared test account for subsequent runs.

### Checkout batch — ✅ all ported AND verified green here (UAT, headed, 2026-06-08)

The Cart/Checkout + Checkout-V2 display/validation/pre-populate tests are ported as
**6 specs** (9 GI tests → 6, one absorbed as redundant) and **verified green in this
repo** (UAT, headed). All are read-only (no orders submitted) → out of `@real-order`.
Live `data/data-qa` audit done 2026-06-08 (see the "Checkout Page (/checkout)" selector
reference below).

- `checkout-subscription-terms.spec.js` — GI: "CartCheckout - Verify Subscription
  Terms". Logged-in; sub product (`loggedin_sub_2`) → terms render on **/cart AND
  /checkout** via `[data-qa="subscription-terms-text"]` (3 links, **no checkbox** —
  copy changed to "By clicking Submit Order…"). Also **verifies every disclosure link
  opens its correct destination in a NEW TAB** on both pages (all are `target="_blank"`):
  Subscription Terms → `…/subscription_terms…`, Account → `/my-account`, Terms &
  Conditions → `…/terms`, Privacy Policy → `…/privacy…` (support email → asserts the
  `mailto:` href, not clicked). URL patterns are path-based (brand-agnostic). + NEGATIVE
  case: a standard product shows NO terms. `afterEach` clears the shared logged-in cart.
  NOTE: the Terms/Privacy link checks overlap with `cart-terms-and-privacy-links.spec.js`
  (which tests them on a standard cart) — kept here for full per-page link coverage in
  the subscription context; dedupe later if desired.
- `checkout-coupon-validation.spec.js` — GI: "Coupon Validation". Guest. Tests BOTH
  valid + invalid on BOTH /cart and /checkout: invalid → **"Coupon not found"** toast +
  `apply-coupon` 404; valid `AUTOTEST1` → 200 + Total recomputes down. **/checkout** also
  asserts the `[data-qa="discount"]` line (the **/cart has no discount line / clear
  button** — coupon still applies, total just drops). A valid coupon carries cart→checkout
  (every apply calls `remove-coupon` first), so the spec `clearCoupon()`s on checkout to
  test the pages independently. Toast capture is observer-based (the toast element retains
  its last message, so "Coupon not found" repeating cart→checkout needs a MutationObserver,
  not a text-changed check).
- `checkout-form-validation.spec.js` — GI: "Customer Information Form Validation" +
  "Shipping Address & Zip Form Validation" + NEW billing-address validation. Guest.
  **FULL per-field parity** with the Manage Account specs: data-driven from
  `data/checkout-field-validation.json` (one `test()` per section — customer / shipping /
  billing), asserting EACH field: required field empty → "This field is required" +
  valid clears it; optional field empty → non-blocking; format fields (names/email/
  street/zip) → inline error + valid clears. Live messages: bad name/street/zip →
  **"Invalid pattern"**, bad email → **"Please enter a valid email address"**. See the
  audited required-field map in the selector reference (checkout is stricter than
  /account-details — Email + City are required here).
- `checkout-header-display.spec.js` — GI: "Validate Phone Number, CS Hours and Header
  Logo". Guest. `#page-header` logo rendered (naturalWidth>0), phone number, both
  CS-hours lines.
- `checkout-country-state.spec.js` — GI: "Validate Each Country's State Dropdowns" +
  "International Zipcode" (+ happy-path of "Shipping Address & Zip"). Guest,
  **data-driven** from `data/checkout-country-cases.json` (US + Canada only — prod
  ships US/CAN; UAT extras ignored). Country→State/Province swap + a valid in-country
  postal clears the error (Canada = the international case). Run one: `-g "Canada"`.
- `checkout-prepopulate.spec.js` — GI: "Logged-In - Customer Data Pre-Populates".
  Logged-in checkout shows customer + delivery as **read-only text**; asserts both
  pre-populate, compared against the account record (`fetchAccount()`). `afterEach`
  clears the cart.

> **"Checkout-V2 - Footer Links Check" → NOT ported (redundant).** The checkout
> Terms & Conditions / Privacy Policy links (`[data-qa="legal-text"]`) are already
> exercised by `cart-terms-and-privacy-links.spec.js` (its "CHECKOUT PAGE CHECKS"
> block clicks both and asserts `/terms` + `/privacy`). The links are auth-independent,
> so the guest-path GI test adds no coverage. Same treatment as
> `cart-verify-header-links.spec.js`.

Order Placement — ✅ all ported (pending verification here)
All 6 order placement tests are now in `tests/` (4 ported from the feature/order-tests
branch + guest-cc + the renamed loggedin-cart-cc). See the "needs verification here" list above.

Order History — ✅ all ported AND verified green here (UAT, headed). See "Verified green here" above.

Upsell / Downsell — NO standalone GI tests exist (this was a speculative breakout, not
backed by any Ghost export). The upsell/downsell funnel is already exercised within the
specs that traverse it: every `@real-order` order spec walks the funnel and declines, and
`thank-you-page.spec.js` ACCEPTS the first upsell and asserts the resulting SPECIAL OFFER
ORDER NO. No separate specs needed.

Pet Profiles — ✅ all ported AND verified green here (UAT, headed)
All 3 GI Pet Profiles tests + a new validation spec are in `tests/` and passing.
These tests pioneer a new pattern for this suite: **API assertions woven into
UI E2E tests** (status, response shape, request body) backed by a new
`helpers/pet-profile-api.js` for API setup/teardown. Key infrastructure and
gotchas this batch introduced (see "Pet Profiles" gotchas section below):
- `helpers/pet-profile-api.js` — create/remove/list via the backend, used for
  fast test setup and `afterEach` cleanup.
- `brand.testAccountId` (from `data/site-config.json` → `testAccountIds.<env>`,
  overridable via `<BRAND>_<ENV>_ACCOUNT_ID` env var) — Salesforce account ID
  needed for the account-scoped pets API.
- npm scripts: `cartv3:pets:{all,create,edit,remove,validation}:uat`.

Profile & Settings — ✅ all ported AND verified green here (UAT, headed, 2026-06-05)
- `account-update-customer-info.spec.js` — GI: "Update Customer Information fields
  under Manage Account". Two tests: (1) snapshots originals → required + optional
  field validation → **unsaved-edits-discarded-on-reload** check → updates
  First/Last/Phone → asserts the save PUT status + request body + success toast →
  backend GET round-trip + **cross-section integrity** (addresses untouched) → UI
  reload round-trip → restores originals (afterEach safety net); (2) **special
  characters** in name (accent/apostrophe/hyphen) round-trip verbatim through the
  PUT + GET. Never touches the EMAIL field (login identity). Runs UAT + prod.
- `account-update-shipping-address.spec.js` — GI: "Update Shipping Address fields
  under Manage Account" (US + CAN). **Data-driven** from
  `data/shipping-address-cases.json` (one `test()` per country; add a country = add
  a JSON entry). Asserts the Country→State/Province dropdown swap (provinces present
  / US states absent for CAN, and vice-versa), required-field validation, the save
  PUT status + `shippingAddress` request body, success toast, and a reload
  round-trip; restores the original address (critical: flips country back to US).
  Shared parameterized page-object method (`setShippingAddress`) for both countries.
  Runs UAT + prod. npm: `cartv3:account:shipping-{us,can}:uat` select via `-g`.
- `account-update-billing-address.spec.js` — **NEW, no GI source** (found during the
  audit). **Data-driven (US + CAN)** from `data/billing-address-cases.json`. Per
  country: enables the "Different Billing Address" toggle, asserts the billing
  Country→State/Province dropdown swap, billing required-field validation (empty
  street → inline error + Save disabled), fills a billing address that DIFFERS from
  shipping, asserts the save PUT carries a `billingAddress` block (matching every
  field + differing from `shippingAddress`) and the success toast, then round-trips
  + restores + self-heals **via the backend account GET** — NOT the toggle, whose
  on/off state the app doesn't persist. npm: `cartv3:account:billing{,-us,-can}:uat`.

Manage Payments — ✅ verified green here (UAT, headed, 2026-06-03)
- `payment-add-card.spec.js` — GI: "Manage Payments - Add Credit Card (Mike)".
  GI only *filled* the Braintree form (never saved/asserted — its own note: "the
  test credit card is not actually saved on the user account"). This port makes it
  a real test: add a card → assert it persisted via (a) the backend save POST
  status, (b) a new `**** 4242` row in My Card(s) → then exercise the delete UI
  on that card: the NEVERMIND modal button cancels non-destructively (card stays),
  then confirm removes it and asserts the success toast + the row disappears.
  `afterEach` self-heal removes any stray 4242 card as a safety net (net-zero on
  the shared account). (Total-count assertions are avoided — the list windows ~49
  rendered rows; the unique 4242 row is the reliable signal.)
  Uses a distinct `4242` card (`brand.addCardTestCard`) — last-4 not already on
  the account (all 4111/0005) — so the added row is uniquely findable for both
  the assertion and cleanup. **UAT-only** (`test.skip` on prod): decodes GI's
  `/-int|au./` gate as "the -int integration env, not international" (the brand is
  CAN/USA-only; `au.` matched nothing) and avoids submitting/storing card details
  on production. npm: `cartv3:payments:add-card:uat`. Adds
  `pages/payment-details.page.js`.

Special Rules (1)
- [x] DrMartyPets - Country Selections in Manage Account → `country-options-restricted.spec.js`
  (**PROD-ONLY**, ✅ verified green on prod / skips UAT). The GI test only asserted US + CAN are
  *present* in the /account-details shipping Country dropdown — that PRESENCE is already
  fully covered on UAT + prod by `account-update-shipping-address.spec.js` and
  `checkout-country-state.spec.js` (both `selectOption` US and CA). The net-new coverage is
  the **exclusivity** rule implied by the GI name/description ("only US + Canada"): the
  Country `<select>` contains *exactly* those two. That holds **only on prod** — UAT seeds
  EXTRA countries into the dropdown (known UAT data quirk), so an exclusivity assert
  false-fails on UAT → `test.skip(brand.env !== 'prod')`. Covers BOTH country pickers:
  /account-details shipping (logged-in) + /checkout shipping (guest); the option list is
  auth-independent (sourced from the shared `<address-form>` country config), so one path
  per surface suffices. Read-only (no mutation/cleanup), out of `@real-order`. Asserts the
  sorted option *values* equal `["CA|Canada","US|United States"]`. GOTCHA: both dropdowns
  have a leading placeholder option **"-Select a Country-"** (its value is the label text,
  NOT empty), so `countryOptionValues()` filters to the real `<CODE>|<Name>` format
  (`/^[A-Z]{2}\|/`) to drop it. Added `countryOptionLabels()` + `countryOptionValues()` to
  `account-details.page.js` and `checkout.page.js`. npm:
  `cartv3:country:restricted{,-account,-checkout}:prod`.
> The 3 "Sticky Footer Bundle" GI tests (Coupon Check, Opt-In, Subscription Check) are
> **obsolete — the Sticky Footer Bundle feature no longer exists in the app**, so there is
> nothing to port. Their GI exports were removed from `reference/` (2026-06-09). This was
> the only remaining Special Rules work; the section is now complete.

Thank You Page (1)
- [x] Thank You Page - Customer & Order Information Displayed (EXCLUDE PROD) →
  `thank-you-page.spec.js` (**✅ verified green here — UAT, headed, 2026-06-09**). Faithful +
  enhanced port: `@real-order`, **UAT-only** (`test.skip` on prod — the GI test uses a
  UAT-only Amex card; we use the saved default card). Flow mirrors GI: login → add a
  randomized standard product (dodge duplicate-order errors) → apply `AUTOTEST1` (optional
  — coupon entry can intermittently fail in UAT) → **Submit Order directly from `/cart`**
  (saved default card; NOT via `/checkout` — GI only went to `/checkout` for the disabled
  billing steps, so for this display test `/cart` submit is equivalent, matches
  `order-loggedin-cart-cc.spec.js`, and avoids the `/checkout` Cloudflare challenge) →
  **accept the 1st upsell, decline the rest**
  (to surface a SPECIAL OFFER ORDER NO.) → assert the confirmation page **displays** the
  full GI set (each asserted, not just logged): thank-you headline, Order ID, Order Date,
  **Upsell Order ID** (accepts the 1st upsell to surface it, but asserts FORMAT only when a
  SPECIAL OFFER ORDER NO. actually displays — intermittent, GI marks it optional), money
  math + **Tax**, **Shipping** + shipping address, **Customer info** (name AND email), and
  **Discounts** — the coupon apply is gated on its `apply-coupon` → 200 response, and the
  "Coupons & Discounts:" row is required to show a non-zero amount only when the coupon
  actually applied (UAT coupon entry is flaky, so it logged-skips otherwise). PLUS net-new
  **identity** checks (snapshots the cart before submit): the ordered **product** appears on
  the receipt (loose name match cart→TY), confirmation **quantity** is positive, and the
  receipt **email == the logged-in account** (`brand.email`). DESIGN NOTE (SDET): it does
  NOT assert cart total == confirmation total — accepting the upsell can change totals, and
  full financial cart→confirmation matching is already covered by
  `order-loggedin-checkout-cc.spec.js`; here we match only upsell-STABLE invariants and use
  `assertMoneyMath` for confirmation-internal consistency. Reuses `OrderConfirmationPage`
  (label-text + following-sibling xpath) — no new page object.
  **`afterEach` clears the logged-in cart** (server-side persistent shared state — a run
  that fails before submit would otherwise leave its product behind and the cart
  accumulates across runs). **429 guard:** the spec fails fast with a clear
  "Too many requests" message at checkout, with a network diagnostic (first-party + CF
  only) that logs the offending calls. ROOT CAUSE (diagnosed 2026-06-09): it's a
  **Cloudflare edge managed-challenge / rate-limit**, NOT a backend order cap — a
  `challenges.cloudflare.com/cdn-cgi/challenge-platform` 401 fires at checkout and the
  `commerce-service/proxy/{tax/cart,cart/*}` + `account-service/proxy/*` calls abort
  behind it (all `server: cloudflare`), so the app shows "Too many requests" and Submit
  stays disabled. Login + `apply-coupon` (→ 200) still work, so it's not a global block.
  Repeated headed `@real-order` runs in one window trip Cloudflare's per-IP/session rate
  limit; the `QA_UA_TOKEN` UA allow-list gets past the INITIAL bot wall but does NOT cover
  this checkout-time challenge. Submitting from `/cart` (not `/checkout`) sidesteps it, so
  the test passes today; the DevOps ask only matters if a future test must submit via
  `/checkout`. **→ DevOps TODO:** extend the QA allow-list / raise the CF rate-limit +
  Turnstile rule to cover the checkout & order `*/proxy/*` endpoints.
  **Duplicate-order resilience:** the platform rejects an order matching a recent one
  ("duplicate order" toast). Variation is randomized across all 4 `loggedin_std_*` variants
  × qty 1-3 (decoupled — the old GI scheme only made 2 signatures and collided under
  repeated runs); on a duplicate rejection the spec bumps quantity (new signature) and
  resubmits up to 4× (safe — a rejected order never leaves `/cart`, so no double-charge).
  Still: **space `@real-order` runs out** — rapid repeats trip both this and the CF limit.
  **Speed:** `waitForURL` off `/cart` instead of a blind 7s sleep, `applyCoupon(..,{toastTimeout:0})`
  to skip the dead 6s toast wait (status-only), trimmed funnel polls. Also hardened
  `pages/login.page.js` to `waitForURL(..,{waitUntil:'commit'})` (gotcha #9 — Angular
  `/my-account` never fires `load`; benefits every logged-in spec). Run:
  `npm run cartv3:order:thank-you:uat` (UAT only — places ONE real sandbox order).
  NOTE: net-new vs the order-placement specs is the upsell-acceptance path + the
  discount/upsell-order-ID display + cart→TY product/email identity; the core confirmation
  asserts overlap with `order-loggedin-checkout-cc.spec.js` (kept — dedicated DISPLAY test).

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
BRAND=drmarty ENVIRONMENT=uat npx playwright test tests/login.spec.js --headed

# Interactive UI mode (use "Show browser" toggle instead of --headed)
npm run test:ui

# Debug a specific test
npm run cartv3:debug -- tests/login.spec.js

# View HTML report
npm run report
```

`playwright.config.js` has `retries: 0` — tests do NOT auto-retry on failure. Fix the test before re-running.

---

## How to Port a New Test from Ghost Inspector

1. Read the GI JSON from the source repo's `reference/` folder — those `steps` are the source of truth
2. Identify the GI test variables used (`{{loggedin_std_1}}`, etc.) — map to CSV columns in `data/products/<brand>-<env>.csv`
3. Create the test file directly in `tests/` (flat — no per-suite subfolders) as a `.spec.js` file
4. Import from fixtures using `require('../fixtures/brand')` — paths are relative to `tests/`
5. Use existing page objects; add to them when needed (prefer extending over inlining locators)
6. **Audit the live DOM for data-qa FIRST, then verify selectors** — see "Selector
   strategy: data-qa attributes are king → MANDATORY audit" above. Enumerate the
   page's data-qa (including after opening modals/sections), prefer them, and only
   fall back (id → role/aria → text) for elements that truly have none. Never trust
   the GI JSON's selectors — the DOM drifts and the team keeps adding data-qa.
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

### Checkout Page (/checkout) — data-qa audited 2026-06-08

**Two render modes that ALSO depend on auth — important:**
- **Guest:** PayPal-first by default. The customer + shipping + payment (CC) form is
  revealed by clicking **"Or pay with credit card"** (`CheckoutPage.revealCreditCardForm()`).
- **Logged-in:** the customer + delivery sections render as **read-only display text**
  (with an "Edit" toggle that swaps to inputs); payment is a saved-card `[data-qa="saved-card"]`.
  So `[data-qa="first-name"]` inputs do NOT exist until you click Edit.

The team has added **clean data-qa across /checkout** (the old placeholder/xpath
locators in `checkout.page.js` remain for the order-placement specs; prefer data-qa
for new work). **Instance-suffix gotcha** (reused `<address-form>` component):
- **Delivery (shipping)** inputs use the **`--shipping`** (double-dash) suffix.
- **Billing** inputs (revealed by the "Use a different billing address" toggle) use the
  **`-`** (single trailing dash) suffix. These are DISTINCT exact data-qa strings, so
  `[data-qa="ship-state-"]` (billing) never matches `[data-qa="ship-state--shipping"]`.
  **Never use a `^=` prefix match here** — it would match both.

| What | Selector |
|------|----------|
| "Or pay with credit card" toggle (guest) | `text=Or pay with credit card` |
| Customer First / Last / Phone / Email | `[data-qa="first-name" / "last-name" / "phone" / "email"]` (ids `customer-firstName` …) |
| Customer Info section | `[data-qa="customer-info-form"]` (display text when logged-in) |
| Delivery section | `[data-qa="address-form"]` (`.first()`) |
| Delivery Country | `[data-qa="ship-country--shipping"]` (`<select>`, value `US\|United States` / `CA\|Canada`) |
| Delivery First / Last name | `[data-qa="first-name--shipping" / "last-name--shipping"]` |
| Delivery Street / Additional / City | `[data-qa="ship-street-address--shipping" / "ship-additional-address-line--shipping" / "ship-city--shipping"]` |
| Delivery State/Province | `[data-qa="ship-state--shipping"]` (`<select>`, value `CA\|California`) |
| Delivery Zip / Phone | `[data-qa="ship-postal-code--shipping" / "phone--shipping"]` |
| "Use a different billing address" toggle | `[data-qa="billing-address-toggle"]` (hidden checkbox — click wrapping `<label>`) |
| Billing form (2nd address-form when on) | `[data-qa="address-form"]` `.nth(1)` |
| Billing fields | `[data-qa="ship-{country,street-address,additional-address-line,city,state,postal-code}-"]` + `first-name-` / `last-name-` (**single trailing dash; NO phone field**) |
| Order Summary Subtotal/Tax/Shipping/Total | `[data-qa="subtotal" / "tax" / "shipping" / "total"]` (data-qa now exists — prefer over xpath) |
| Order Summary Discount (after coupon) | `[data-qa="discount"]` (only present once a valid coupon applies) |
| Coupon input | `[data-qa="coupon-input"] input` (it's a `<gh-input>` wrapper; inner `#order-form-coupon-input`) |
| Coupon apply | `[data-qa="coupon-apply"]` |
| Coupon clear (after valid apply) | `[data-qa="coupon-clear"]` |
| Subscription terms (sub item in cart) | `[data-qa="subscription-terms-text"]` (= `#subscription-terms-section`; 3 links, no checkbox) |
| Legal disclaimer (Terms/Privacy links) | `[data-qa="legal-text"]` |
| Submit Order | `[data-qa="submit-order-btn"]` (disables on invalid form) |
| Toast | `[data-qa="toast-message"]` (site-wide, transient — see toast quirk) |
| Header region | `#page-header` (`<linkless-page-header>`, **NO data-qa — TODO: ask team**) |
| Header logo | `#page-header img[alt="Brand Logo"]` (no data-qa) |
| Header phone / CS hours | text in `#page-header` (phone is plain text, not a `tel:` link) — no data-qa |

**Validation (guest form, live-verified 2026-06-08) — FORMAT + required. Errors render
as `<p class="invalid-message">` (same class as account-details; NO data-qa). GOTCHA:
the input sits in a NESTED inner `<fieldset>` while the message lives in the OUTER one,
so `ancestor::fieldset[1]` from the input does NOT contain it — scope to the SECTION
container instead (`[data-qa="customer-info-form"]` / the shipping/billing
`[data-qa="address-form"]`) `.locator('.invalid-message')`:**
- Name with digits ("123") → **"Invalid pattern"**; Street `[]\` → "Invalid pattern"; Zip `[][][]` → "Invalid pattern".
- Email malformed → **"Please enter a valid email address"**.
- Empty required field → **"This field is required"** (renders with a short delay — Playwright's auto-waiting `toBeVisible` handles it). Valid input clears the field's error.
- **The inline required message — NOT the submit button — is the signal.** On guest checkout the submit button is always disabled until the Braintree CC fields are filled, independent of the address form, so don't gate per-field assertions on it.
- **Required-field map (live-audited 2026-06-08, captured in `data/checkout-field-validation.json`). Checkout is STRICTER than /account-details:**
  - **Customer Info:** First name, Last name, **Email** required; **Phone** optional. (⚠️ Email is OPTIONAL on /account-details but REQUIRED here.)
  - **Shipping (Delivery):** First name, Last name, Street, **City**, Zip/Postal required; Additional + Phone optional. (⚠️ City is OPTIONAL for shipping on /account-details but REQUIRED here.)
  - **Billing:** First name, Last name, Street, City, Zip/Postal required; Additional optional.
  - Country/State are pre-selected `<select>`s (default to US + first state) — not empty-testable, so not asserted as required.

**Coupon backend (live-verified 2026-06-08), shared by /cart and /checkout:**
- `POST /commerce-service/proxy/cart/apply-coupon` → **404** (invalid) / **200** (valid).
- `POST /commerce-service/proxy/cart/remove-coupon` → 200 (clear).
- Invalid coupon toast: transient sequence "Applying your discount!" → **"Coupon not found"**.
- Valid `AUTOTEST1` ≈ $1.00 off. **Cart** coupon hooks differ: `[data-qa="coupon-code"]` + `[data-qa="coupon-apply-btn"]`.

### Checkout Page (/checkout) — legacy order-summary xpath (order-placement specs)
The order-placement specs still use placeholder/xpath locators (pre-data-qa). Kept for
back-compat; new specs use the data-qa table above.

| What | Selector |
|------|----------|
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

### 15. Pet Profiles (/pets) — gotchas from the migration
- **Angular whitespace breaks anchored text matches (recurring!).** `/pets` renders
  text with surrounding whitespace + comment nodes: pet-name divs, the `REMOVE` /
  `Contact Us` buttons, and the health-issue tiles all have padded text like
  `" REMOVE "`. An anchored regex (`/^REMOVE$/`) matches NOTHING and the locator
  hangs until timeout. Fix: use substring `hasText: 'REMOVE'` OR XPath
  `normalize-space()="..."`. `PetsPage.profileCard()` and `selectHealthIssue()`
  use the normalize-space XPath pattern; `removeButton`/`contactUsBtn` use substring.
- **API calls must go through the browser, not `page.request`.** Cloudflare bot
  protection 403s the Playwright APIRequestContext (different TLS fingerprint).
  `helpers/pet-profile-api.js` runs `fetch()` inside `page.evaluate()` so calls
  inherit the browser's trusted session.
- **The pets API needs custom headers.** Without them you get `419`. The Angular
  HttpClient interceptor adds: `x-csrf-token` (= `gh-token` cookie value),
  `x-sid` (= `SessionId` cookie value), `x-locale: US`, `x-language: en`. The
  helper reads those cookies in page context and replays them.
- **Remove is a SOFT delete.** UI "Remove" and the helper both do
  `PUT {id, active:false}` — no hard DELETE endpoint exists. The `/pets` list
  filters by `active`, so it looks clean, but inactive records persist in
  Salesforce forever. Per-test `afterEach` cleanup keeps the visible list clean;
  it does NOT purge the DB. A true purge is a backend/Salesforce admin task.
- **Create form moved to its own route** `/pets/create` (not a modal); edit is
  `/pets/edit/{petId}` (title "Edit Pet Profile"). After Save, the app
  auto-redirects to `/pets` — don't manually reload, just `waitForURL(/\/pets$/)`.
- **Breed is a Material autocomplete.** Typing alone yields "Invalid value" — you
  must type then commit via ArrowDown+Enter. Enter ALSO submits the form, so the
  create flow types breed last and wraps the commit in
  `Promise.all([waitForResponse, commitBreedAndSubmit()])`.
- **`healthConditions` quirks:** the API returns them **sorted alphabetically**
  (UI sends click-order) and returns **`null` (not `[]`)** when none selected.
  Assert response-side as a sorted set and coalesce `null` → `[]`.
- **Save is always enabled** on the create/edit form — validation blocks on click
  and renders inline `"<Field> is required"` errors; it does NOT disable Save.
- **Birthday is now required** (was optional in the GI era).

### Pet Profiles API endpoints (account-scoped)
| Operation | Method + URL | Body |
|-----------|--------------|------|
| Create | `POST /account-service/proxy/pets/profile/{accountId}` | `{name, profileType, sex, breed, birthday, weight:{current,ideal,category}, healthConditions[]}` |
| Edit | `PUT /account-service/proxy/pets/profile/{petId}` | full profile + `id` |
| Remove (soft) | `PUT /account-service/proxy/pets/profile/{petId}` | `{id, active:false}` |
| List (active) | `GET /account-service/proxy/pets/all/{accountId}` | — |

`{accountId}` = `brand.testAccountId` (Salesforce `001*`); `{petId}` = `a1D*`, returned in create/list responses.

### Pet Profiles selectors (/pets, live-verified)
| What | Selector |
|------|----------|
| Add/Add-another button | `button:has-text("Add a pet profile"), button:has-text("Add another pet")` (no data-qa) |
| Name input | `[data-qa="profile-name"]` |
| Type radios | `input[type=radio][value="Dog"|"Cat"]` (no data-qa) |
| Sex radios | `input[type=radio][value="Male"|"Female"]` (no data-qa) |
| Breed (autocomplete) | `[data-qa="breed"]` |
| Birthday | `[data-qa="birthday"]` |
| Weight | `[data-qa="current-weight"]` |
| Health-issue tiles | `section.grid > div.cursor-pointer` (divs, not buttons; padded text) |
| No-health-issues | `button:has-text("No health issues")` |
| Save | `[data-qa="save-btn"]` |
| Profile card (by name) | XPath `//div[contains(@class,"text-2xl") and normalize-space()="{name}"]` → ancestor card |
| Card edit (pencil) | `button.absolute.top-3.right-3` (within card) |
| Card REMOVE | `button:has-text("REMOVE")` (within card) |
| Remove confirm | `button:has-text("Yes, Please Remove")` |
| Remove modal Contact Us | `button:has-text("Contact Us")` → navigates to `/contact` |
| Card list has NO data-qa | TODO: flag to team to add data-qa on cards/buttons |

### Manage Payments (/payment-details, live-verified 2026-06-03)
Clean `data-qa` hooks exist here. The CC form is **Braintree Hosted Fields with the
SAME iframe titles as /checkout** — the GI source's `#cardType` select and
non-iframe `#cardNumber`/`#expiration`/`#cvcCode` selectors are stale/gone; do not
use them.

| What | Selector |
|------|----------|
| Card Number iframe | `iframe[title="Secure Credit Card Frame - Credit Card Number"]` (same 4 iframes as /checkout) |
| Cardholder Name iframe | `iframe[title="Secure Credit Card Frame - Cardholder Name"]` |
| Expiration iframe | `iframe[title="Secure Credit Card Frame - Expiration Date"]` |
| CVV iframe | `iframe[title="Secure Credit Card Frame - CVV"]` |
| Add Card button | `[data-qa="add-card-btn"]` — **disabled until the form validates**; fill all fields first |
| Saved-card row (one per method) | `[data-qa="card-list"]` |
| Masked number (per row) | `[data-qa="card-details"]` — shows REAL last-4 (`4111…`→`**** **** **** 1111`) |
| Remove button (per row) | `[data-qa="delete-card-btn"]` (renders as "delete_forever / Remove Card") |
| Set-default radio | `button[aria-label="Set as default payment method"]` / `"Default payment method"` |
| Remove-confirm modal — YES | `button[aria-label="Click to confirm remove payment method"]` ("YES, REMOVE THIS PAYMENT METHOD") |
| Remove-confirm modal — cancel | `button[aria-label="Click to cancel remove payment method"]` ("NEVERMIND") |
| Toast | `[data-qa="toast-message"]` (site-wide) — success toast on confirmed delete |

- **Iframe fill:** identical to checkout — `pressSequentially()` (not `fill()`) and
  strip `/` from the expiry. `PaymentDetailsPage.fillCreditCard()` mirrors
  `CheckoutPage.fillCreditCard()`.
- **The shared test account is heavily polluted** (~49 saved methods: many `1111`,
  several PayPal tokens, one `0005`) — old test runs accumulate. The add-card test
  uses a distinct `4242` card so its row is unique, and self-heals/cleans up by
  last-4. Don't bulk-delete the pre-existing cards from a test.
- **Delete-confirm modal:** clicking `delete-card-btn` opens a Material dialog
  (`mat-dialog-container`) with "YES, REMOVE THIS PAYMENT METHOD" (confirm) and
  "NEVERMIND" (cancel). **These two buttons have NO data-qa** (audited — only
  `aria-label` + class), so they're targeted by `aria-label`. **TODO: ask the team
  to add data-qa to the remove-modal confirm/cancel buttons.** NEVERMIND is
  non-destructive (closes modal, card stays); confirm removes the card + fires a
  success toast. The test exercises both paths on its own 4242 card.
- **Toast is a `<standard-toast>` that's ALWAYS in the DOM and reports visible —
  it's just EMPTY when idle** and fills with text only while a toast shows (then
  empties). Don't gate on `isVisible()`; poll `[data-qa="toast-message"]` for
  non-empty text, and start polling BEFORE the triggering click (toasts are
  transient). `PaymentDetailsPage._captureToastText()` does this.
- **API checks:** the add path asserts the save POST status (<300); the delete
  path asserts the backend delete call status (<300) — both captured via
  `waitForResponse` on the app's `/proxy/` API. (Status only — unlike the Pets
  tests we don't assert request/response body schema; the card token payload
  isn't a meaningful contract to pin here.)
- **Backend endpoints (pinned, verified 2026-06-03):**
  - Add: `POST /payment-service/proxy/turnstile/braintree/client/payment-option` → 200
  - Delete: `DELETE /account-service/proxy/payment-options/{accountId}/{token}` → 200
  - The test asserts each call's status (<300) via `waitForResponse` on these.
- **Toast wording quirk — the element retains its LAST message after dismissing.**
  Add shows "Your payment method has been added successfully."; remove shows
  "Successfully removed payment option." Because the add toast can still be lingering in the
  `<standard-toast>` element when you delete, `confirmRemoveModal()` snapshots the
  stale text first and `_captureToastText(timeout, ignoreText)` waits for the text
  to CHANGE. The delete assertion requires REMOVAL wording (`/remov|delet/i`), NOT
  generic "success" — else a stale "added successfully" toast would falsely pass.

### Manage Account (/account-details, live-verified 2026-06-04)
The h1 is "Manage Account". Two editable sections, each revealed by clicking its own
"Edit" link (swaps read-only `<p>`s for inputs). A SINGLE "SAVE ACCOUNT INFO" button
(`save-btn`) persists BOTH sections at once. Form fields all have clean `data-qa`;
the only gaps are the Edit links and the inline validation text.

| What | Selector |
|------|----------|
| Customer Info section | `[data-qa="customer-info-form"]` |
| Shipping Address section (editable) | `[data-qa="address-form"]` |
| Shipping Address section (display wrapper) | `[data-qa="shipping-address-form"]` |
| First name | `[data-qa="first-name"]` (input, id `customer-firstName`) |
| Last name | `[data-qa="last-name"]` |
| Phone | `[data-qa="phone"]` |
| Email | `[data-qa="email"]` — **do NOT mutate (login identity)** |
| Country | `[data-qa="ship-country-shipping"]` (`<select>`, value `US\|United States` / `CA\|Canada`) |
| Street | `[data-qa="ship-street-address-shipping"]` |
| Additional line | `[data-qa="ship-additional-address-line-shipping"]` |
| City | `[data-qa="ship-city-shipping"]` |
| State / Province | `[data-qa="ship-state-shipping"]` (`<select>`, value `CA\|California` / `BC\|British Columbia`) |
| Zip / Postal | `[data-qa="ship-postal-code-shipping"]` |
| "Different Billing Address" toggle | hidden checkbox `[data-qa="billing-address-toggle"]` — **click the wrapping `<label class="accountDetails__toggleControl">`, not the input** (it's opacity-0 / 0×0) |
| Billing sub-form (when toggle on) | `[data-qa="billing-address-form"]` (a REUSED `<address-form>`; its inner `<section>` also has `data-qa="address-form"`, so TWO exist when billing is on) |
| Billing fields | `[data-qa="ship-{country,street-address,additional-address-line,city,state,postal-code}-billing"]` — distinct `-billing` suffix, **no collision** with shipping |
| Save (whole page) | `[data-qa="save-btn"]` ("SAVE ACCOUNT INFO") |
| Toast | `[data-qa="toast-message"]` (site-wide) |
| Section "Edit" link | `<p>` text "Edit" inside each section — **NO data-qa. TODO: ask team.** |
| Inline validation error | `.invalid-message` ("This field is required") — **NO data-qa. TODO: ask team.** |

- **Single shared Save persists everything** — one `PUT /account-service/proxy/account/{accountId}`
  saves customer info AND shipping address together; the app then re-fetches
  `GET /account-service/proxy/account?accountId={id}`. `{accountId}` = `brand.testAccountId`.
- **Country↔State coupling:** changing `ship-country-shipping` repopulates the SAME
  `ship-state-shipping` `<select>` (US 53 states ⇄ CA 14 provinces, auto-selecting
  the first). `AccountDetailsPage.setShippingAddress()` waits for the target option
  to exist (`_waitForStateOption`) before selecting. One method covers all countries.
- **Select option value format `"<code>|<name>"`** maps to the backend split apart:
  `shippingAddress.countryCode`/`country` and `.regionCode`/`region`. The shipping
  test derives expected values by splitting on `|`.
- **Validation is REQUIRED-FIELD ONLY:** clearing a required field shows the inline
  `.invalid-message` "This field is required", **disables `save-btn`, and blocks the
  PUT**. (Contrast the Pets form, where Save stays enabled and blocks on click.)
  There is NO client-side postal/phone FORMAT validation — letters in zip / a short
  phone are accepted by the form.
- **Which fields are required (audit-confirmed 2026-06-05):**
  - Customer Info: **First Name, Last Name** required; **Phone, Email OPTIONAL**
    (clearing them does NOT block Save).
  - Shipping: **Street, Zip/Postal** required; City, Additional, Country, State OPTIONAL.
  - Billing: **Street, City, Zip/Postal** required; Additional, Country, State OPTIONAL.
  - ⚠️ **Shipping and Billing differ on City** — the SAME reused `<address-form>`
    treats City as optional for shipping but REQUIRED for billing. Verify per-instance;
    don't assume they match. (Looks like a product inconsistency — candidate to flag.)
  - The specs assert EACH required field individually (clear → inline error + Save
    disabled → restore → Save re-enables) AND assert representative OPTIONAL text
    fields stay non-blocking (clear → Save still enabled): Phone (customer),
    City + Additional (shipping/billing).
- **Cross-section integrity (regression guard):** one shared Save persists the whole
  record, so each spec verifies (via the account GET) that editing one section does
  NOT alter the others — a customer-info edit leaves shipping + billing addresses
  unchanged; a shipping edit leaves the customer name unchanged; a billing edit
  leaves the shipping address unchanged.
- **API round-trip:** beyond the PUT status + request body, each spec re-fetches the
  account via `fetchAccount()` (the backend GET) and asserts the change actually
  persisted server-side (not just optimistic UI).
- **Toast quirk (same as payments):** `[data-qa="toast-message"]` is always in the
  DOM, empty when idle, and RETAINS its last message after dismissing. `save()`
  snapshots the stale text and waits for the toast to CHANGE. Success copy is
  "Successfully updated account" (also accept "...your profile has been updated").
- **Backend endpoint (pinned, verified 2026-06-04):**
  - Save: `PUT /account-service/proxy/account/{accountId}` → 200. Request body:
    `{ firstName, lastName, phone, birthday, brand, id, shippingAddress: { line1,
    line2, city, region, regionCode, country, countryCode, postalCode } }`.
  - The tests assert the PUT status (<300) AND the request body (the persisted contract).
- **"Different Billing Address" toggle:** OFF by default (billing == shipping). When
  ON, the PUT body gains a `billingAddress` block (same shape as `shippingAddress`),
  and the reused billing `<address-form>` uses `-billing`-suffixed input data-qa.
  The backend PERSISTS a distinct `billingAddress` (verified via the account GET).
  **Quirk — the toggle state is NOT persisted.** The account record has no "use
  different billing" flag; the page ALWAYS loads with the toggle OFF, even when a
  distinct `billingAddress` exists in the data (so a saved different billing isn't
  re-surfaced — likely a UX bug, flagged to the team). Therefore the reliable
  persistence/round-trip + cleanup contract is the **account GET's `billingAddress`**,
  NOT the toggle's reload state — `account-update-billing-address.spec.js` and its
  self-heal/`afterEach` key off `AccountDetailsPage.fetchAccount()`. The "clean"
  state for the shared account is `billingAddress == shippingAddress`.
- **`AccountDetailsPage.fetchAccount()`** — reads the persisted account record via
  `GET /account-service/proxy/account?accountId={id}` run inside `page.evaluate`
  (browser session inherits Cloudflare trust; same gotcha/pattern as
  `helpers/pet-profile-api.js`). Used to assert persistence and to restore billing.

### Order History (/order-history, live-verified)
No `data-qa` on cards or buttons yet — TODO: flag to team. All selectors are class/text-based.

| What | Selector |
|------|----------|
| Page heading | `getByText('Order History')` (h6 — not getByRole) |
| Order card (one per order) | `ul.orders__rowWrap` — **NOT** `article.orders__container` (that's a single page-level wrapper around ALL orders, easy mistake) |
| Order # (per card) | `<b>` containing `/ORD-\d+/` |
| Product row (per card) | `div.inline-flex.flex-col.md:flex-row` |
| Product name (per row) | `<b>` (e.g. "Dr. Marty Nature's Feast - 1 Bag") |
| Product price (per row) | `<p>` matching `/^\$[\d,.]+/` — **LINE TOTAL** (price × qty), not unit |
| Quantity (per row) | `<p>` matching `/Quantity:\s*\d+/` |
| Product image (per row) | `<img>` with `src` + `alt` (cdn.drmartypets.com/images/retail/...) |
| Buy It Again button | `button` hasText `/buy it again/i` (page text is "Buy it Again!" — note lowercase "it") |
| Re-Order All button | `button` hasText `/re-?order all/i` — only on **multi-product (2+) orders** |
| Next page | `button[aria-label="Click to go to next page"]` |
| Card date | `<p>` matching `/^\d{2}\/\d{2}\/\d{4}$/` (e.g. "06/02/2026") |
| Card payment method | `<p>` after the "Payment Method" label; matches `/^(Card Ending in \d{4}\|PayPal)$/` |
| Card totals | `<p>` text like `"Total $107.01"`, `"Subtotal $97.50"`, `"Sales Tax $9.51"`, `"Shipping $0.00"`. CAD orders include ` CAD` suffix and a `(w/GST)` qualifier on Total — strip both before `parseMoney` |

### PDP (Product Detail Page) — live-verified

| What | Selector |
|------|----------|
| Product title | `h1.product-name` (short form, e.g. "ProPower Plus" — NOT the full catalog name) |
| Add to Cart | text `/add to cart/i` (no data-qa yet) |

**Gotcha — price is LINE TOTAL, not unit price.** On `/order-history`, the displayed
`$X.XX` next to each product is already `unitPrice × quantity`. Verified via
ORD-000852984: "Nature's Feast - 1 Bag" shows `$59.90` Qty 2 (unit ≈ $29.95), and
$59.90 + $49.95 (ProPower 1 Jar Qty 1) = $109.85 = $108.85 subtotal + $1 AUTOTEST1
coupon. The `/cart` page may display unit OR line; the reorder test tolerates either.

**Gotcha — Re-Order All mutates the shared account's cart server-side.** Use an
`afterEach` hook to call `cartPage.clearCart()` so re-ordered items don't linger for
subsequent runs / other contributors.

**Gotcha — product names differ between order-history and cart (catalog naming).**
Same product appears as "Dr. Marty Nature's Feast - 1 Bag" on `/order-history` but
"Nature's Feast Fish and Poultry 12oz" in the cart. Use loose word-overlap matching
(≥2 shared significant words), same approach as `assertProductNamesMatch`.

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

// Brand-content values (site-config.json → brands.<brand>; specs fall back to drmarty defaults)
brand.content.validCoupon        // valid coupon code        (drmarty: "AUTOTEST1")
brand.content.csPhone            // CS phone in checkout hdr  (drmarty: "1-800-670-1839")
brand.content.csHours            // { weekday, weekend } regex-source strings for the CS-hours lines
brand.content.freeShippingText   // free-shipping cell text   (drmarty: "FREE!")
brand.primaryDomain              // first-party domain, no scheme (drmarty: "drmartypets.com")
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
- Delete `tests/cart-verify-header-links.spec.js` (redundant with `header.spec.js`)
- Add new brands to `site-config.json` and `data/products/`
- Add new test suites / tools as **siblings of `cartv3-e2e/`** at the repo root (e.g. `cartv3-unit/`, `api-tests/`) — each gets its own `package.json`, `playwright.config.js`, `pages/`, etc. Do NOT add suites under `tests/` here; this folder is dedicated to CartV3 E2E.

---

## Backlog (post-migration)

Capture ideas here so they don't get lost. Don't action until the migration is done — finishing the GI → Playwright port keeps the green-suite-as-safety-net intact for any future refactor.

- **Product variant strategy refactor** — extend `brand.cartUrl()` (or add a sibling helper) to support variant pools / fallbacks per test, rather than each test hard-coding a single `productKey`. Driver: avoid Salesforce duplicate-order rejections on real-order tests and simplify per-test variant choice. Open questions to answer at refactor time: how often do dupes actually occur in CI, do all order tests need the same dodging strategy, and what other variant-related needs surfaced during the rest of the migration (e.g. subscription vs standard, price-tier targeting for shipping threshold).

- **Logged-in /checkout with NEW credit card** — add `order-loggedin-checkout-newcc.spec.js` covering the path where a logged-in user clicks "Checkout with new card" on the cart (sibling of the saved-card flow in `order-loggedin-checkout-cc.spec.js`). Driver: the saved-card path uses the default card on file; the new-card path exercises the Braintree hosted-fields form, a different code path currently only covered by guest tests. No 1:1 GI source — new coverage. Use `cartPage.checkoutWithNewCardLink` to enter the flow; reuse `checkoutPage.fillCreditCard()` for the Braintree iframe inputs.

- **Prod-safe add-card smoke (optional)** — `payment-add-card.spec.js` is UAT-only
  because it submits/stores a card. If we ever want production coverage, add a
  separate thin test that *fills* the Braintree form and asserts ADD CARD becomes
  enabled but **never clicks it** (no submission, nothing stored). Reuses
  `PaymentDetailsPage.fillCreditCard()` + the `addCardBtn` enabled check. Driver:
  smoke the prod form renders/validates without touching the live account.

- **Logged-in coupon coverage (optional)** — `checkout-coupon-validation.spec.js` is
  guest-only (matches the GI source). A logged-in coupon path hits the SAME
  `apply-coupon` endpoint + the same cart/checkout coupon UI, so it adds little new
  coverage. If we ever want it, fold a coupon apply/remove into an existing logged-in
  order/checkout spec rather than a new test — and clean up via `coupon-clear`
  (checkout) since a logged-in coupon persists on the shared account's server-side
  cart. Driver: only if logged-in coupon handling ever diverges from guest.

- **Brand-portability of the checkout specs (do before running on a new brand)** —
  the 6 checkout specs are built on platform-level `data-qa` (shared app builder), so
  selectors carry across brands; the differences are brand CONTENT. To run them on a
  new brand (e.g. the upcoming brand + its new UAT site):
  - **Prereqs (whole-suite, not just these specs):** (1) `site-config.json` entry
    (UAT base URL, paths, `testAddress`, `testAccountIds`, content); (2)
    `data/products/<brand>-uat.csv` with variant IDs (`loggedin_std_1`,
    `loggedin_sub_2`, `loggedout_std_1/2`, …); (3) `.env` creds
    `<BRAND>_TEST_EMAIL`/`_TEST_PASSWORD` + account ID; (4) **`QA_UA_TOKEN`
    allow-listed on the new brand's UAT Cloudflare zone** (else logged-in navs hit the
    bot wall); (5) `cartv3:checkout:*` npm scripts (or run with `BRAND=<brand>`).
  - **✅ Brand-content values are now CONFIG-DRIVEN (done 2026-06-10).** The values
    that used to be hardcoded to Dr.Marty now live in `data/site-config.json` per brand
    and are read via `brand.*`:
    - valid coupon → `brand.content.validCoupon` — `checkout-coupon-validation.spec.js`,
      `thank-you-page.spec.js` (was `AUTOTEST1`);
    - CS phone → `brand.content.csPhone`; CS-hours → `brand.content.csHours`
      `{weekday, weekend}` (regex-source strings) — `checkout-header-display.spec.js`;
    - first-party domain network filter → `brand.primaryDomain` —
      `thank-you-page.spec.js` (was a `drmartypets.com` literal);
    - free-shipping display text → `brand.content.freeShippingText` —
      `cart-shipping-threshold.spec.js` (the checkout free-shipping cell now renders
      `FREE!`, not `$0.00` — the old `$0.00` literal had silently drifted red).

    Each spec falls back to the drmarty default when a brand omits the field, and no
    `data-qa` selectors were touched. **Badlands**: `primaryDomain`
    (`badlandsranch.com`) + `freeShippingText` (`FREE!`) are populated; the unknown
    ones are loud `TODO_CONFIRM_BADLANDS_*` placeholders (coupon, phone, weekday +
    weekend hours) — confirm those with the team and fill them in before running these
    specs on Badlands.
  - **Brand-clean today (code), but verify the brand's content matches:**
    `checkout-prepopulate` (asserts vs the brand's own account record — fully portable);
    `checkout-form-validation` (platform validation copy; the required-field map lives in
    `data/checkout-field-validation.json` — edit if the brand's required fields differ);
    `checkout-country-state` (data-driven US/CAN — fine if the brand ships US/CAN);
    `checkout-subscription-terms` (generic "automatically renewing subscription" copy +
    brand's `loggedin_sub_2`).
  - Badlands specifically still has only placeholder CSVs + no test account, so it
    can't run until that data lands.

- **Known catalog bug (Jira filed)** — Cart and Order Confirmation render different display names for the Tilly's Treasures variant ("Tilly's Treasure Beef Liver Treats" vs "Dr. Marty Tilly's Treasures - 1 Bag"). `assertProductNamesMatch` in `helpers/order-validations.js` is intentionally left strict so it keeps surfacing this mismatch — do NOT loosen the helper to make the test pass; the fix belongs in the catalog data.

- **Known PROD bug — My Account subscription links route to the wrong page (found 2026-06-11, prod triage).** On `/my-account` → "My Recent Orders / My Subscriptions", the individual `SSC-####` subscription links **and** the `MANAGE SUBSCRIPTIONS` button are supposed to open **`/subscription-edit`** (UAT correctly goes to `/subscription-edit/<salesforceId>`, e.g. `/subscription-edit/a0WQL000009C76z2AC`). **On prod they route to `/subscription-management/<salesforceId>` instead** (e.g. `https://drmartypets.com/subscription-management/a0WVo00000NEDWPMA5`) — a real, functional page (shows Delivery Frequency & Date) but the WRONG destination. `account-main-page-links.spec.js` asserts `toHaveURL(/subscription-edit/)` (substring regex — the trailing SF id is irrelevant to the match) and is **left red on prod on purpose** to surface this. Do NOT loosen the assertion to accept `/subscription-management` — the fix belongs in the app routing. (The order-link half of the same spec passes; only the subscription routing is broken. The `firstOrderLink` / `firstSubscriptionLink` page-object locators were broadened to `a, button` because the order/subscription IDs render as `<button>`s, not anchors — that's a legitimate selector fix, unrelated to the routing bug.)
