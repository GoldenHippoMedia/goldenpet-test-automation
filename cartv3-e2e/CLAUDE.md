# goldenpet-test-automation — Project Context for Claude

This file is auto-loaded by Claude Code. Read it first before doing any work in this folder.

> **Last verified:** 2026-08-19 — **Prod failure sweep. DMP prod 8/8 GREEN** (was 8 failing), **BRP prod 7/8** — first time Badlands has ever been run. Ten prod failures triaged into four unrelated causes, none of them Cloudflare: (1) **add-to-cart `net::ERR_ABORTED`** — the app consumes `?product1=` and client-side-redirects, beating DOMContentLoaded. Fixed in `CartPage._gotoAddToCart()` (`waitUntil:'commit'`, tolerate the abort, **verify the URL and re-navigate**, hard-gate on `waitForURL(/\/cart/)`). Critical sub-finding: an abort can leave you on the PREVIOUS page, and `waitForCartLoaded()` false-greens there because **/checkout also renders `[data-qa="product-name"]`** → 90s timeouts on missing cart-only controls. (2) **Member-pricing spec was self-comparing** — it snapshotted prices post-login before member pricing applied, so it asserted `59.95 > 59.95`; now reloads + `expect.poll`s until the price drops (DMP 59.95→30.95, BRP 59.95→40.95 — member pricing was never broken). (3) **Shipping City OPTIONAL→REQUIRED**, rolling out per brand **AND per env**: DMP both envs, BRP UAT yes / prod next release → driven by `brand.shippingCityRequired`, resolved per env by the fixture (a brand-only flag was wrong and broke BRP UAT). (4) **Logged-in cart intermittently renders its LOGGED-OUT shell** after a successful login (DMP + BRP prod) → new `cartPage.waitForLoggedInCart()` guard, unconfirmed root cause, see Known Open Bugs. Also: `CART-9124` is **wider than its ticket says** (reproduced with two DISTINCT subscription line items, not just duplicates); Store Locator's assertion was **tautological** (locator selected on the href it then asserted) → now text-located + `brand.storeLocatorUrlPattern`; header nav hrefs are **relative on CMS pages, absolute on app pages**; `run-brands.js` **hung after brand 1** because `reporter:'html'` defaults to `open:'on-failure'` (fixed, plus per-brand report/output dirs). Login hardening (`LoginPage`) went through THREE iterations, and the failures are worth knowing: v1 gated on the submit button being enabled inside a 5s window and **threw** — it hard-failed two specs on UAT where the old inline fill was fine. v2 dropped the gate and never threw, but then badlands UAT showed the form **re-mounting during the click**, leaving a disabled button that `click()`'s unbounded auto-wait ground on for the full 90s. v3 (current) retries **fill → enable-check → click → navigate as one unit**, every wait bounded, retrying only while still on `/login` so it can never break a login that already succeeded. `fillCredentials()` stays best-effort/never-throws; only `loginAndWait()` fails, with the observed form state in the message. STILL OPEN — the HEADER specs only: `header.spec.js` is now **`test.fixme()`'d** (known broken, fix in progress) and `cart-verify-header-links` remains DMP-skipped. Both are blocked on the same thing: header nav hrefs are RELATIVE on CMS pages but ABSOLUTE on Angular app pages, so on drmarty prod `header.spec.js` failed at TWO DIFFERENT links on consecutive runs (Store Locator, then Shop) depending only on which page it was standing on. The Store Locator locator/assertion fix landed but is UNVERIFIED while the spec is parked. See Backlog → "Cross-brand test strategy" (the parent decision) and "Brand-portable header nav testing". Prior: 2026-06-08 — Checkout batch (6 specs: `checkout-subscription-terms`, `checkout-coupon-validation`, `checkout-form-validation`, `checkout-header-display`, `checkout-country-state`, `checkout-prepopulate`) added and **verified green here** (UAT, headed). Ports the 8 Checkout-V2 + 1 Cart/Checkout GI tests → 6 specs ("Footer Links Check" dropped as redundant with `cart-terms-and-privacy-links.spec.js`). Read-only (no orders) → out of `@real-order`. Key audit findings (see "Checkout Page (/checkout)" reference): /checkout form fields now have clean `data-qa` (shipping uses `--shipping` suffix, billing `-`); checkout is STRICTER than /account-details (Email + City required); coupon `apply-coupon` → 404 invalid / 200 valid + "Coupon not found" toast (observer-based capture — toast retains last msg); inline validation errors are `.invalid-message` scoped to the section (input sits in a nested fieldset); subscription terms (`[data-qa="subscription-terms-text"]`) render on /cart + /checkout with all disclosure links verified by destination. Brand-content values (coupon `AUTOTEST1`, CS phone/hours, first-party domain, free-shipping text) were moved out of test logic into `data/site-config.json` and are read via `brand.content.*` / `brand.primaryDomain` (done 2026-06-10) — see Backlog "Brand-portability of the checkout specs". Extended `pages/checkout.page.js` + `pages/cart.page.js` + `pages/base.page.js` (observer-based toast capture); added `data/checkout-country-cases.json` + `data/checkout-field-validation.json`; npm `cartv3:checkout:{all,subscription-terms,coupon,form-validation,header,country-state,country-us,country-can,prepopulate}:uat`. Prior: 2026-06-05 — Profile & Settings batch (`account-update-customer-info.spec.js`, `account-update-shipping-address.spec.js` [data-driven US + CAN], `account-update-billing-address.spec.js`) added and **verified green here** (UAT, headed, 6 tests). All on `/account-details` ("Manage Account"). Each snapshots the account's current values and restores them (afterEach safety net) → required-field validation (empty field → inline error + Save disabled + no PUT) → mutate → assert the save `PUT /account-service/proxy/account/{id}` status + request body + "Successfully updated account" toast → reload round-trip. Shipping is data-driven from `data/shipping-address-cases.json` (one test per country; asserts the Country→State/Province dropdown swap). Billing (no GI source) exercises the "Different Billing Address" toggle and round-trips/cleans up via the backend `billingAddress` (the toggle state isn't persisted by the app). Extended `pages/account-details.page.js` (+`fetchAccount()`), hardened `pages/base.page.js` popup-dismiss against a navigation race, and added a `QA_UA_TOKEN`-driven Cloudflare bot-bypass User-Agent in `playwright.config.js` (DevOps allow-lists `DrMartyQA/<token>`; secret lives in `.env`). npm: `cartv3:account:{all,customer-info,shipping,shipping-us,shipping-can,billing}:uat`. Earlier same batch context: 2026-06-03 — Manage Payments port (`payment-add-card.spec.js`) added and **verified green here** (UAT, headed). Add a CC via the Braintree hosted-field form on `/payment-details` → assert backend save POST (<300) + a new `**** 4242` row in My Card(s) → exercise the remove modal (NEVERMIND cancels non-destructively; YES removes) → assert backend delete call (<300) + the success toast + the row disappears. UAT-only (skips prod — don't submit/store cards on prod). Adds `pages/payment-details.page.js`, `brand.addCardTestCard` (4242 card), npm `cartv3:payments:add-card:uat`. Established a **mandatory data-qa audit step** before working any page (see "Selector strategy"). Earlier same day: Order History port (`order-loggedin-list-reorder.spec.js`) added and **verified green here** (UAT, headed). Comprehensive `/order-history` test: list smoke, per-card validation (date / payment method / math / image render), pagination, Buy It Again (product-identity round-trip to PDP), Re-Order All (product-identity round-trip to /cart), `afterEach` cart cleanup. Adds `pages/order-history.page.js`. Prior context: Pet Profiles batch (4 specs) verified green 2026-06-02; CartV3 suite migrated from gh-auto-funnel-tools; 19 earlier tests + 6-test Order Placement batch are ported but **still pending verification here**. Tests live in `tests/` as `.spec.js` files. Requires `.env` with PAYPAL_SANDBOX_EMAIL / PAYPAL_SANDBOX_PASSWORD for the PayPal tests, and `<BRAND>_<ENV>_ACCOUNT_ID` (or `data/site-config.json` → `testAccountIds`) for the Pet Profiles API setup.

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

### 5. Run mode: HEADLESS is the default (verified UAT + prod, 2026-06-17)
- **Headless works** on BOTH UAT and prod — the `QA_UA_TOKEN` UA allow-list (see
  `playwright.config.js`) clears Cloudflare bot protection in headless just as in headed.
  Diagnosed 2026-06-17: the cart `commerce-service/proxy/cart/*` + `payment-service` APIs
  return **200 headless** on both envs, with **no `cf-mitigated` header, no 403/429**. The
  old "HEADED ONLY" rule predated the token allow-list (added 2026-06-05) and is obsolete.
- **Headedness is orthogonal — chosen at run time, NOT baked into scripts.**
  `playwright.config.js` sets `headless: !process.env.HEADED`, so **every** npm script (incl.
  `@real-order`, UAT and prod) defaults to headless and can be watched on demand by prefixing
  `HEADED=1` (or appending `--headed`, which also wins). The only deliberately-headed entries
  are the `cartv3:*:headed` aliases and `cartv3:debug`. In UI mode (`npm run test:ui`) use the
  "Show browser" toggle.
  ```bash
  npm run cartv3:order:loggedin-cart-cc:uat            # headless
  HEADED=1 npm run cartv3:order:loggedin-cart-cc:uat   # same script, headed
  ```
- UAT orders are **Braintree SANDBOX** (no real money — always safe to run, headed or
  headless). Real-card orders happen on **prod** only. Independent of headedness, prod
  `@real-order` placement faces the separate Cloudflare **rate-limit** (see Backlog) — a
  velocity gate, not a bot/headless gate.
- Headless still leaks fingerprint tells (`Sec-CH-UA`/`navigator.userAgentData` exposes
  `HeadlessChrome`; `window.chrome` absent; WebGL = software SwiftShader). CF currently
  ignores them because the UA-token rule is a skip-rule evaluated ahead of fingerprinting.
  If a future CF rule change starts blocking headless, that's the likely vector — the ask
  to DevOps would be to keep the `DrMartyQA/<token>` skip covering those API paths.

#### `channel: 'chromium'` — required for third-party SDKs in headless (added 2026-08-19)
The chromium project sets **`channel: 'chromium'`**, which runs FULL Chromium in "new
headless" mode instead of Playwright's default **headless-shell** binary. The shell is a
stripped build with a visibly different fingerprint (no `window.chrome`, different
`Sec-CH-UA`, no GPU stack), and **third-party SDKs fingerprint on exactly that**.
- **Proof:** `cart-paypal-button` on drmarty UAT was **3/3 headed, 1/3 headless**. The trace
  showed PayPal's SDK loading fine and the button rendering (`smart/buttons` 200 at 16.5s),
  then **no `xoplatform/checkout` call at all** — PayPal silently declined to launch the
  popup. Not a timeout: raising the wait would have changed nothing. With
  `channel: 'chromium'` it went 3/3 headless on UAT and prod.
- So §5's "headless works" holds for our own first-party APIs, but **not automatically for
  embedded third-party widgets**. If a new third-party integration misbehaves only headless,
  check the fingerprint before adding waits or a headed lane.
- **CI must install the full binary: `npx playwright install chromium`.** The headless-shell
  install alone will not satisfy this channel.

### 6. Timeout ceilings and traces (config, 2026-08-19)
`playwright.config.js` `use` now sets:
- **`actionTimeout: 20000` / `navigationTimeout: 45000`.** Playwright defaults BOTH to `0` =
  **no timeout**, so any un-timed `click()` / `waitFor()` / `fill()` was bounded only by the
  TEST timeout. That single gap produced four separate "hangs" chased in one session — the
  header `shopLink.click` (270s), the login submit click (90s), `account-main-page-links`'
  `manageSubscriptionsBtn.waitFor` (270s) and `cart-verify-header-links` (90s) — each
  reporting a vague "Test timeout exceeded" naming whatever call was in flight. An EXPLICIT
  timeout in code always wins over these, so already-tuned waits are unaffected. **Raise a
  specific call's timeout rather than these ceilings.**
- **`trace: 'retain-on-failure'`** (was `'on-first-retry'`, which with `retries: 0` meant
  traces were **NEVER** captured). Every failure now carries a full timeline, DOM snapshots
  and network log: `npx playwright show-trace test-results/<brand>/<test>/trace.zip`. This is
  what settled the PayPal question above in ~30 seconds instead of another 5-minute run —
  reach for the trace before theorising.

---

## Open Follow-ups & Known Issues (START HERE for anything outstanding)

This is the **single index** of everything outstanding in the suite. Four categories, below.
When you (or Claude) want to "pick up the TODOs," start here — each category says where the
full context lives and how to close an item out.

**How to find every open item mechanically** (this index should list them all, but the markers
are the source of truth):
```bash
cd cartv3-e2e && grep -niE 'TODO|when fixed|DevOps TODO|BACKLOG' CLAUDE.md
```

Quick map:
- **A. Known open app bugs** — real product defects the suite works around. → table below.
- **B. Missing `data-qa` (ask team)** — selectors we had to fall back on because no `data-qa` exists. → table below.
- **C. DevOps asks** — infra/allow-list requests, not test or app bugs. → below.
- **D. Post-migration backlog** — forward-looking test ideas + architecture improvements. → the [Backlog (post-migration)](#backlog-post-migration) section at the end of this file.

---

### A. Known open app bugs (the suite works around)

Real, filed app bugs the tests have surfaced. Each affected spec is deliberately **relaxed**
(with the ticket # in a code comment + a soft runtime log) so the suite stays green while the
defect is tracked — rather than left red as noise.

**When a ticket is fixed:** `grep -rn <TICKET> tests/`, restore the strict assertion, remove
the workaround/soft-log, re-run the affected spec on UAT to confirm it passes, then delete the
row here. (The soft logs also flip to a "may be fixed — tighten me" note in the run output.)

| Ticket | Spec | Bug | Test workaround → what to restore when fixed |
|--------|------|-----|----------------------------------------------|
| [CART-9082](https://goldenhippomedia.atlassian.net/browse/CART-9082) | `subscription-update-shipping-address.spec.js` | Subscription **Additional Address (`line2`) can be SET but not CLEARED** — emptying it drops the field from the PUT, backend keeps the old value. | Asserts line2 *sets* only; never restores it to empty. When fixed: assert clearing empties line2 (UI + backend). |
| [CART-9120](https://goldenhippomedia.atlassian.net/browse/CART-9120) | `subscription-skip-next-order.spec.js` | **Skip modal previews the wrong skip-to date** — computes +60 days vs the backend's +2 calendar months, so it's off by a day for multi-month cadences. | Asserts date *advanced forward* + summary matches the backend; soft-logs the modal-preview mismatch. When fixed: restore strict `sameDisplayDate(summary, next)`. |
| [CART-9124](https://goldenhippomedia.atlassian.net/browse/CART-9124) | `order-loggedin-list-reorder.spec.js` | **Re-Order All returns an EMPTY cart.** Originally scoped to "2× the exact same product" (identical line items). **WIDER than that — 2026-08-19, drmarty prod, ORD-172520845 reproduced it with TWO DISTINCT products that were both SUBSCRIPTION line items** ("Tilly's Treasures - 1 Unit Subscription" + "Nature's Feast … Cat Food 12oz - 1 Unit Subscription"), so duplicates are not the trigger — subscription line items are implicated. Ticket needs this detail added. | Spec auto-picks `firstReorderableCard()` → intermittently lands on such an order → the cart comes back empty. Non-deterministic on the shared account (a pass doesn't clear the bug). When fixed: verify manually against BOTH a 2×-identical order AND a multi-subscription order; optionally make card-selection deterministic. |
| _no ticket yet — confirm first_ | `cart-paypal-button.spec.js`, `cart-verify-fields-and-links.spec.js` | **Logged-in cart intermittently renders in its LOGGED-OUT shell** after a login that demonstrably succeeded (we already waited for `/my-account`). Symptoms: "CREATE ACCOUNT / LOGIN" in the header, a "LOG IN" + "Checkout as Guest" button in the cart body, `#paypal-button` present-but-hidden, `[data-qa="shipping-street"]` absent, and **standard instead of member pricing** on the same account that got member pricing seconds earlier. Seen on **DMP prod 2026-08-19** and **BRP prod 2026-08-19**. Suspected auth/CDN caching race on the /cart render. | `cartPage.waitForLoggedInCart()` reloads up to 2× before any logged-in-only assertion. It logs `[cart] rendered the LOGGED-OUT cart while authenticated — reloading (n/2)` each time. **If that log fires and the reload CLEARS it → render race, leave the guard in place. If it throws after both reloads → real session/caching defect: file it.** Do not "fix" this by loosening the assertions. |
| [BW-7357](https://goldenhippomedia.atlassian.net/browse/BW-7357) | `thank-you-page.spec.js` | **Tilly's Treasures product display-name mismatch** — Cart shows "Tilly's Treasure Beef Liver Treats", Order Confirmation shows "Dr. Marty Tilly's Treasures - 1 Bag". May be fixed on prod already but still reproduces on UAT (confirmed 2026-07-21). | `assertProductNamesMatch` is intentionally left strict to keep surfacing this — do NOT loosen it. When fixed on UAT: re-run with the Tilly's variant to confirm the row disappears. |

### B. Missing `data-qa` — ask the team to add (with current fallback)

Elements we target by a **fallback** selector (id / role / aria-label / text) because the app
exposes no `data-qa` yet. Consolidated here for a single "please add data-qa" ask to the team;
full context for each lives inline in the **Selector Reference** section under the named page.
**When the team adds a `data-qa`:** switch the page object to it, drop the fallback, and delete
the row here. (The team keeps adding `data-qa` — re-audit a page before trusting these.)

| Page / area (Selector Reference) | Element(s) with no `data-qa` | Current fallback |
|----------------------------------|------------------------------|------------------|
| Checkout Page (`/checkout`) | Header region `#page-header` (`<linkless-page-header>`) | `#page-header` id/structure |
| Manage Payments (`/payment-details`) | Saved-card list cards; remove-modal **confirm** ("YES") + **cancel** ("NEVERMIND") buttons | class/text for cards; `aria-label` for modal buttons |
| Manage Account (`/account-details`) | Section "Edit" link; inline validation error | `<p>`-text "Edit"; `.invalid-message` |
| Order History (`/order-history`) | Order cards + their buttons | class/text-based |
| Header nav (all pages) | Nav links (Shop / Subscribe / Reviews / FAQ / Contact / **Store Locator**) | `a.header__nav__link[href="…"]` on DMP — brittle: hrefs are relative on CMS pages, absolute on app pages, and Store Locator's destination has moved. Store Locator now matched by TEXT + `brand.storeLocatorUrlPattern`. **On BRP the nav is Builder-authored with NO href and NO data-qa** (volatile `builder-<hash>` classes only), which is why `header.spec.js` + `cart-verify-header-links.spec.js` `test.skip` badlands. A `data-qa` per nav item would let both specs run on every brand — see Backlog "Brand-portable header nav testing". |
| Subscription Editor (`/subscription-edit`) | Quantity select; Recipient Info modal **Update**/**Close** buttons; "Yes, I want to update" agreement checkbox; Ship Now **success popup** | `select#quantityId`; exact-name/`Close`; label-text; copy-match (apostrophe-agnostic) |
| Subscription cancellation (`/subscription-cancellation`) | Cancel-confirm modal **confirm** + **dismiss** buttons | `aria-label` (`Click to confirm cancel` / `Click to close modal without cancelling`) |

### C. DevOps asks (infra — not test/app bugs)

- **[CART-9181](https://goldenhippomedia.atlassian.net/browse/CART-9181) — Cloudflare rate-limit
  allow-list for QA `@real-order` / add-card traffic.** Repeated real orders (and add-card)
  trip a **velocity-based** CF rate-limit ("Too many requests" toast, Submit/ADD CARD stuck
  disabled). This is separate from the bot-wall that `QA_UA_TOKEN` already clears. **Ask:** add
  an exception on the *rate-limit* rule keyed on the `DrMartyQA/<token>` UA or a secret
  header/cookie (NOT IP — QA IPs are dynamic), covering `*/commerce-service/proxy/{cart,tax}/*`,
  `*/account-service/proxy/*`, `*/payment-service/proxy/*`, and the order-submit endpoint. Full
  diagnosis in the **Known Issues** note near the end of this file. Workaround today: space
  `@real-order` runs; submit from `/cart` (sidesteps the `/checkout` challenge). Reproduced again
  2026-07-21 (drmarty UAT) — `order-guest-checkout-cc`, `order-loggedin-cart-paypal`,
  `order-loggedin-checkout-cc`, and `payment-add-card` all failed together in one dense batch run.
- **[TODO / on hold — DECIDED NOT TO PURSUE, revisit only if needed] Turnstile + rate-limit on
  prod order/payment SUBMIT endpoints.** On **prod specifically**, the app-side Cloudflare
  **Turnstile** challenge (`challenges.cloudflare.com/cdn-cgi/challenge-platform`, seen as `401`
  + a "Too many requests" toast; also `419` on `*/proxy/funnel/stats/save/`) blocks automated
  SUBMIT on the `/checkout` order path and would similarly gate `/payment-details` card actions.
  The `QA_UA_TOKEN` UA skips edge **bot management** only — it does NOT clear Turnstile or the
  rate-limit rule. Turnstile itself is confirmed present+working on DMP prod `/checkout` +
  `/payment-details` (real `1.` tokens); BLR returned the Cloudflare **test dummy token**
  (`XXXX.DUMMY.TOKEN.XXXX`) → BLR is on a *testing* sitekey, not a live one (separate dev/CMS
  fix, not DevOps infra). **SDET decision (do NOT file the allow-list ask):** we deliberately do
  NOT automate the prod `/checkout` CC submit — `order-loggedin-checkout-cc` stays `test.skip`
  on prod, covered on UAT; prod order placement is covered by `order-loggedin-cart-cc`
  (`@prod-order`, submits from `/cart`, no Turnstile). Rationale: the only prod-unique element is
  Turnstile, which we'd be *bypassing* (so the automated test wouldn't reflect the real user
  path), it doubles real-order load for thin incremental coverage, and it needs a standing
  security carve-out on the payment-submit path. The prod `/checkout` CC path is covered by a
  **manual release smoke** instead. **Revisit ONLY if** we ever need automated prod `/checkout`
  or `/payment-details` submit coverage — then the ask is: allow-list the QA UA (or a secret
  header) on the **Turnstile/managed-challenge + rate-limit rules** for the checkout & order
  `*/proxy/*` submit endpoints, both prod zones. Evidence already captured (DMP prod):
  `cf-ray=a1b429dfaf63f79d-LAX` / `a1b42a5debff55c7-LAX`.
- **❌ NOT a DevOps issue: "login submit stays disabled on prod" is NOT Turnstile.**
  Recorded because it was investigated and *wrongly* attributed to Turnstile first
  (2026-08-19) — check this before raising anything with DevOps.
  Turnstile's script IS present on prod `/login`
  (`challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, plus
  `/cdn-cgi/challenge-platform/…`), which makes it a tempting culprit. **It does not gate the
  login button.** Live-probed on BOTH prod brands, read-only, no submit:

  | | DMP prod | BRP prod |
  |---|---|---|
  | Turnstile script | `api.js?render=explicit` | same |
  | `window.turnstile` | object | object |
  | Turnstile **iframes / widget** | **0 / none** | **0 / none** |
  | `cf-turnstile-response` input | **absent** | **absent** |
  | Button, valid email + password | **ENABLED** | **ENABLED** |

  `render=explicit` means the widget only appears if the app calls `turnstile.render()` — it
  never does on `/login`, so no widget and no token exist, and the submit button is gated by
  **client-side validation only** (valid email pattern + non-empty password). The two brands
  are identical here, so brand-to-brand differences on this symptom are NEVER a config
  difference — don't raise one.
  **Actual cause:** `fill()` sets the value and fires a single `input` event that the
  `gh-input` custom-element wrapper can miss, so Angular's value accessor never runs and the
  form model stays invalid while `inputValue()` still reads the text back. Tell-tale:
  `email chars=22, password chars=10, submit disabled=true` with **NO `.invalid-message`**
  anywhere. Same class as the documented Braintree row in Common Failure Patterns. Fixed by
  `pressSequentially()` in `LoginPage.fillCredentials`.
  (Separately: never build a Turnstile bypass. It is bot-detection circumvention, and the test
  would stop reflecting the real user path. The genuine Turnstile items are on the
  checkout/payment SUBMIT paths — see the item above this one.)
- **`QA_UA_TOKEN` allow-list on each NEW brand's UAT Cloudflare zone** before running the suite
  there (else logged-in navs hit the bot wall). See Backlog "Brand-portability".

### D. Post-migration backlog

Forward-looking test ideas + architecture improvements (incl. the SDET-maturity items:
data-isolation, pushing the mutation matrix to API tests, the cancel-spec parallel-safety fix).
→ see the [Backlog (post-migration)](#backlog-post-migration) section at the end of this file.

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
    ├── run-brands.js            # run spec(s) across multiple brands sequentially (BRANDS=drmarty,badlands)
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
    │   ├── pet-profile-api.js   # pets create/remove/list via API (page.evaluate fetch + CSRF headers)
    │   ├── subscription-api.js  # subscriptions GET via API (page.evaluate fetch + CSRF headers) — list/round-trip
    │   └── subscription-dates.js # date helpers for subscription specs (ISO add-days, display-date compare)
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
    │   ├── payment-details.page.js # /payment-details — add-card form + saved-card list
    │   └── subscription-edit.page.js # /subscription-edit + /subscription-cancellation — skip/ship/update/cancel
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
        ├── country-options-restricted.spec.js       # ✅ verified green on PROD (skips UAT) — Country dropdown = exactly US + CAN (/account-details + /checkout)
        ├── subscription-skip-next-order.spec.js     # ✅ verified green (drmarty UAT, headed 2026-07-16) — skip + self-heal (UAT only per env policy)
        ├── subscription-update-next-order-date.spec.js # ✅ verified green (drmarty UAT, headed 2026-07-16) — edit next-order date + self-heal; finishes GI's unfinished 🚧 test; +date-range validation test
        ├── subscription-update-quantity.spec.js     # ✅ verified green (drmarty UAT, headed 2026-07-16) — change qty + self-heal; +min-qty guard
        ├── subscription-update-frequency.spec.js    # ✅ verified green (drmarty UAT, headed 2026-07-16) — NEW (no GI) change delivery frequency + self-heal
        ├── subscription-update-payment.spec.js      # ✅ verified green (drmarty UAT, headed 2026-07-16) — NEW (no GI) switch payment method + self-heal
        ├── subscription-update-shipping-address.spec.js # ✅ verified green (drmarty UAT, headed 2026-07-16) — NEW (no GI) change delivery street + self-heal
        ├── subscription-ship-now.spec.js            # ✅ verified green (drmarty UAT, headed 2026-07-16) — Ship Now + self-heal date (UAT only per env policy — places a real sandbox order)
        ├── subscription-cancel.spec.js              # ✅ verified green (drmarty UAT, headed 2026-07-16) — cancel a disposable sub (UAT-only, @real-order); needed two-step-modal fix
        └── subscription-guards.spec.js              # ✅ verified green (drmarty UAT, headed 2026-07-16) — NEW auth redirect + non-destructive cancel back-out (UAT + prod)
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

> **2026-08-19 — six of the above are now verified on DMP *prod* (and UAT), not just in the
> source repo:** `auth-empty-cart-login-redirect`, `cart-logged-out-verify-pricing-after-login`,
> `cart-verify-fields-and-links`, `cart-paypal-button`, `cart-shipping-threshold`, plus
> `checkout-prepopulate` and `account-update-shipping-address` from the batches below. All
> green on DMP prod (8/8) in the prod failure sweep; the same set is 7/8 on BRP prod (only
> `cart-verify-fields-and-links` outstanding there — the logged-out-cart-shell bug).
> **NOT yet verified:** `header.spec.js` (not re-run since the Store Locator fix) and
> `cart-verify-header-links.spec.js` (blocked on the header-nav strategy decision — Backlog).

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
  ⚠️ **Intermittent red — [CART-9124](https://goldenhippomedia.atlassian.net/browse/CART-9124)** (see Known Open Bugs): when `firstReorderableCard()` happens to pick an order with **2× the exact same product**, Re-Order All returns an **empty cart** and this section times out. Real app bug, reproduces on prod; a pass just means a non-duplicate order got auto-selected.

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

Subscription Management — ✅ all 9 specs verified green (drmarty UAT, headed, 2026-07-16)
> **Still TODO for this batch:** headless UAT sweep (drmarty + badlands via `cartv3:multi`) and a prod spot-check of the two prod-eligible specs (guards + shipping smoke). The 2026-07-16 verification was drmarty UAT (headed); badlands UAT (headed) also green (13 pass / 1 expected skip).
>
> **ENV POLICY (set 2026-07-16, IDENTICAL for drmarty + badlands):**
> - **UAT** runs **everything** (all mutations + order placement — Braintree sandbox, safe).
> - **Prod** runs **NON-DESTRUCTIVE only**: `guards` (auth redirect + retention back-out) and
>   `update-shipping-address` (read-only render/dropdown-swap smoke). Everything that mutates
>   a real sub or places an order is `test.skip(process.env.ENVIRONMENT === 'prod')`:
>   skip, next-order-date, quantity, frequency, payment (mutating self-heal) + ship-now, cancel
>   (order-placers). Rationale: the write logic is env-identical, so prod mutation adds little,
>   while a failed prod self-heal could corrupt a real sub and ship-now/cancel place real orders
>   (and BLR's auto-refund/fulfillment-suppression nets are unconfirmed). Prod's real risk is
>   config/content/routing (e.g. the `/subscription-management` routing bug), which the two
>   non-destructive specs cover. To change: grep `ENVIRONMENT === 'prod'` in `tests/subscription-*`.

| Spec | UAT | Prod |
|------|:---:|:----:|
| skip, next-order-date, quantity, frequency, payment | ✅ full | ⏭️ skip (mutating self-heal) |
| ship-now, cancel | ✅ full (sandbox order) | ⏭️ skip (places real order) |
| guards | ✅ | ✅ (non-destructive) |
| update-shipping-address | ✅ full mutation | ✅ read-only smoke |
The 6 GI "Subscriptions - *" tests (the extra batch beyond the initial migration) become
**5 specs** on the `/subscription-edit` editor (the GMD `/sub-history` "Ship Now" variant
is intentionally dropped — that brand is retired; DMP/BLR use the `/subscription-edit` UI).
All are brand-agnostic (platform app-builder `data-qa`) and backed by the new
`pages/subscription-edit.page.js`, `helpers/subscription-api.js`, and
`helpers/subscription-dates.js`. Live `data-qa` + behavior audit done 2026-06-17 (see the
"Subscription Editor" selector reference below). npm: `cartv3:subscription:{all,skip,next-date,quantity,frequency,payment,shipping,ship-now,guards}:{uat,prod}` + `cartv3:subscription:cancel:uat`.

- `subscription-skip-next-order.spec.js` — GI: "Skip Next Order". Existing sub; snapshot
  date → "Skip next order" → assert the post-skip summary date == the date the confirm
  modal promised (`[data-qa="next-date"]`) + the skip write is 2xx + backend still active
  → **self-heal** the date back. **UAT only** — per the env policy above, prod runs
  non-destructive subscription checks only (this spec mutates a real sub via self-heal).
- `subscription-update-next-order-date.spec.js` — GI: "Next Order Date" (which was
  UNFINISHED in GI — 🚧, exited before its write ran). **Finished here:** expand Delivery
  Frequency → set the editable `input[type=date][data-qa="next-order-date"]` → Update →
  assert UI + backend round-trip → self-heal restore. **UAT only** (env policy above).
- `subscription-update-quantity.spec.js` — GI: "Update Quantity". Change `select#quantityId`
  → Update → assert UI + backend → self-heal restore qty. **UAT only** (env policy above).
- `subscription-ship-now.spec.js` — GI: "Ship Now Button" (non-GMD). Find a sub whose
  "Ship Now!" is available (skip-pass if none, like GI), ship it, assert the success popup
  + the next-order date advanced + write 2xx → self-heal date. **UAT only** — Ship Now places
  a REAL order (Braintree sandbox on UAT), so it's gated off prod per the env policy above
  (same for drmarty + badlands; BLR's auto-refund/fulfillment-suppression nets are unconfirmed).
- `subscription-cancel.spec.js` — GI: "Cancel Subscription". Cancel is an irreversible
  soft-delete, so it can't self-heal an existing sub: it places a **throwaway** sub
  (`loggedin_sub_2`), cancels THAT (Cancel Subscription Box → `/subscription-cancellation`
  → pick "ANOTHER REASON - CANCEL NOW" reason-toggle → "I still want to cancel"), and
  asserts it drops from the active list (UI) + backend GET (`active:false`). Because it
  places a real (card-charging) order, it stays **UAT-only** + `@real-order` (GI: EXCLUDE
  PROD). `afterEach` safety-cancels a stray sub if the test died before cancelling.
- `subscription-update-frequency.spec.js` — **NEW (no GI source).** Changes the delivery
  cadence (`frequency-select`) on an existing sub → asserts write 2xx + toast + UI reload
  + backend `frequency` changed → self-heal restore. **UAT only** (env policy above).
- `subscription-update-payment.spec.js` — **NEW (no GI source).** Switches the sub's
  payment method (`payment-select`) to another saved method → write 2xx + UI reload
  (asserts by option VALUE, since labels dup on the shared account) + backend active →
  self-heal restore. **UAT only** (env policy above).
- `subscription-update-shipping-address.spec.js` — **NEW (no GI source).** TWO layers,
  split by env so a real prod sub is never irreversibly mutated:
  - **Full-form mutation test — UAT ONLY** (`test.skip(brand.env === 'prod')`). Changes the
    ENTIRE delivery recipient (country, first/last name, street, additional line, city,
    state, zip) via the "Change" link's "Recipient Info" MODAL → asserts the
    Country→State/Province dropdown swap → write 2xx + UI reload (every field) + backend
    record carries the values → self-heal restore. **Data-driven** from
    `data/subscription-address-cases.json` (one `test()` per country; `-g "United States"` /
    `-g "Canada"`). Uses **per-run UNIQUE values** (timestamp-suffixed street + additional)
    so a green assert PROVES a fresh write landed — not a stale-state coincidence
    (change-detection: asserts the persisted value `!==` the original).
  - **Read-only render/dropdown-swap smoke — PROD ONLY** (`test.skip(brand.env !== 'prod')`).
    Opens the form, asserts it renders + the US↔CAN state-dropdown swap works, then closes
    WITHOUT saving. Catches prod-specific render/config bugs with zero data mutation.

  Tests persistence through the SUBSCRIPTION write endpoint specifically (the field-level
  validation matrix on this same component is covered by
  `account-update-shipping-address.spec.js`, which hits the /account endpoint).
  ⚠️ **KNOWN APP BUG — CART-9082:** the Additional Address line (backend `line2`) can be SET
  but not CLEARED — emptying it drops the field from the PUT and the backend keeps the old
  value. The spec asserts line2 SETS correctly and deliberately does NOT rely on clearing it
  (so it's green whether the bug is present or fixed). Discovered via live audit 2026-07-08.
- `subscription-guards.spec.js` — **NEW.** Cross-cutting, non-destructive: (1) logged-out
  `/subscription-edit` redirects to `/login`; (2) reaching the cancellation page and
  opening a reason does NOT cancel — only the final confirm does (retention back-out;
  asserts the sub stays active via UI + backend). **UAT + prod.**

Extra non-GI checks folded into the update specs: the next-order-date spec has a second
**date-range validation** test (past/today/beyond-max rejected via the input's min/max +
`update-btn` stays disabled); the quantity spec guards that offered quantities are ≥ 1;
the skip spec has a second **repeatable-skip** test (a second skip advances again); the
quantity + frequency specs assert the edit-panel **order-summary math** (grand total =
subtotal + tax + shipping) via `SubscriptionEditPage.assertSummaryMath()`. The quantity spec
also **independently recomputes** New Subtotal = unit price × new qty (via
`getSelectedQuantityUnitPrice()`, parsed from the "N - $X.XX / unit" option) so a mispriced
quantity is caught even if the UI + backend agree on the same wrong number.

> **Backend contract (CONFIRMED live 2026-07-08, drmarty UAT):**
> - **Write:** all edits are `PUT /account-service/proxy/subscriptions/{accountId}/{subId}`
>   → 200 (skip/ship/update/cancel all hit this path; assertions key off method + 2xx, which
>   is fine — the path is now known and stable).
> - **Record shape** (from `subApi.logSubscriptionShape()`): `id, type, name, active,
>   frequency, startDate, endDate, accountId, subtotal, localeSubtotal, tax, localeTax,
>   shipping, localeShipping, nextOrderDateTime, lastOrderDate, shippingAddress, orderItems,
>   coupon, payment, addOns`. So: next-order date = **`nextOrderDateTime`**, cadence =
>   **`frequency`**, status = **`active`**; there is NO top-level `quantity` (it's inside
>   `orderItems`). `shippingAddress` is a nested object: `firstName, lastName, line1, line2,
>   city, countryCode, country, postalCode, regionCode, region` (line2 = the Additional
>   Address — see CART-9082). Field-level backend asserts can be tightened against these.

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

# Run a single brand: override BRAND (the fixture reads it once per process)
HEADED=1 BRAND=badlands ENVIRONMENT=uat npx playwright test tests/subscription-update-quantity.spec.js

# order-loggedin-list-reorder picks its Re-Order All order DETERMINISTICALLY (first
# candidate with all line items priced > $0 — see CART-9257 in the Backlog). Two overrides:
#   REORDER_ORDER_ID=<ORD-…>  pin one specific order (reproduce a run exactly)
#   REORDER_RANDOM=1          random selection instead, for exploratory sweeps
REORDER_ORDER_ID=ORD-000875833 BRAND=badlands ENVIRONMENT=uat npx playwright test tests/order-loggedin-list-reorder.spec.js

# Run the SAME spec(s) across MULTIPLE brands, sequentially (one run per brand, via run-brands.js):
#   BRANDS defaults to "drmarty,badlands", ENVIRONMENT to "uat"; HEADED/SLOWMO inherited.
BRANDS=drmarty,badlands ENVIRONMENT=uat npm run cartv3:multi -- tests/subscription-*.spec.js
```

**Multi-brand runs write PER-BRAND artifacts** (`run-brands.js`, 2026-08-19): each brand gets
`playwright-report/<brand>` and `test-results/<brand>`, and the closing summary prints a
`show-report` command per brand. Before this, brand 2 overwrote brand 1's report AND its
screenshots/`error-context.md`, so only the last brand was debuggable.

`run-brands.js` also forces `PLAYWRIGHT_HTML_OPEN=never` for its child runs. **Do not remove
that** — `reporter: 'html'` defaults to `open: 'on-failure'`, which starts a blocking report
server; under `spawnSync` that hangs the wrapper on the first brand with a failure, and the
Ctrl+C needed to escape kills the whole run, so later brands silently never execute. Single
brand `npx playwright test` runs are unaffected and still auto-open the report.

**A quiet run is usually not a hang.** The list reporter prints per test on completion, so N
timing-out tests look like N × 90s of silence. Check for progress counters (`[5/8]`) before
assuming a stall — and prefer bounded waits in specs (see the PayPal popup row in Common
Failure Patterns) so a failure reports fast with a real message.

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
| **Pack descriptor** (NOT the quantity) | `[data-qa="product-quantity"]` — renders **"1 Jar" / "1 Bag" / "1 Unit"**. Present on EVERY row, subscriptions included. ⚠️ Regexing the leading digit out of this yields the PACK SIZE, not how many the customer is buying. |
| **Actual quantity** (stepper value) | `[data-qa="quantity"]` — the real count (1, 2, 3 …). **Absent on subscription rows** (no stepper), which is also the structural subscription signal: `count() > 0` ⇒ standard line. |

> ⚠️ **Read quantity from `[data-qa="quantity"]`, and only fall back to parsing
> `product-quantity` for subscription rows.** The reverse order silently reports 1 for every
> row: pack-1 and quantity-1 coincide on the overwhelming majority of test data, so the bug
> passes for months. `order-loggedin-list-reorder` had it until a qty-**3** order surfaced it
> (drmarty UAT 2026-08-19: "expected 3, received 1" on a cart whose money was correct —
> $149.85 = 3 × $49.95). Money matching while quantity mismatches is the tell.
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
- ⚠️ **Nav-link hrefs are RELATIVE on CMS pages but ABSOLUTE on app pages** (found on DMP
  prod 2026-08-19). On the homepage/CMS the nav renders `href="/products"`; on **/cart** the
  same nav renders `href="https://drmartypets.com/products"` (likewise `/faq-bridge`,
  `/store-locator`). So `a.header__nav__link[href="/products"]` matches on CMS pages and
  silently never matches on /cart — `cart-verify-header-links.spec.js` burned its full 90s
  waiting for it. Any header nav locator used from an app page must accept both forms (or
  match on text). See the Backlog item "Brand-portable header nav testing".
- **Store Locator: locate by TEXT, assert the href against a pattern.** The destination
  varies per brand and has MOVED (DMP prod went from the `store.drmartypets.com` subdomain
  to a first-party `/store-locator` path). `headerPage.storeLocatorLink` now matches
  `a.header__nav__link:has-text("Store Locator")` and `header.spec.js` asserts the href
  against **`brand.storeLocatorUrlPattern`** (regex source in `site-config.json`, accepts
  both shapes). The OLD locator selected on `href="<expected>"` and the spec then asserted
  that same href — a tautology that could only pass or say "element(s) not found", so the
  URL move surfaced as a bogus href *mismatch*. Don't reintroduce that shape.

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
| /subscription-edit | No heading — use `[data-qa="subscription-select"]` (the active-subscription picker). **Do NOT use `getByText('Skip next order')`** — that control now lives only inside `<mobile-sticky-footer-v2>` (`lg:hidden` → `display:none` at desktop widths), so it's present-but-hidden on the desktop viewport. Audited live 2026-06-17; other desktop-visible data-qa: `last-order-date`, `next-order-date`, `delivery-payment-btn`, `subscription-name`, `subscription-price`; the "Delivery and payment" expansion adds `subscription-edit-close-btn`, `subtotal-{original,new}`, `tax`, `shipping`, `grand-total`, `frequence-toggle`, `paypal-method-display`, `update-btn`, `cancel-btn`. |

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

### 6. Headless works now (was blocked by bot protection pre-token) — see Architecture §5
- **RESOLVED 2026-06-17.** Headless passes on UAT + prod via the `QA_UA_TOKEN` UA allow-list.
- The old "tried UA override / webdriver injection / Chrome channel, none worked" notes were
  from BEFORE DevOps allow-listed the `DrMartyQA/<token>` UA (2026-06-05). A *bare* UA
  override didn't work; the *allow-listed token* does, headless included. (The webdriver
  stealth init script in `fixtures/brand.js` is still present and harmless.)

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
- **Which fields are required (re-verified 2026-08-19 on DMP + BRP, UAT + prod):**
  - Customer Info: **First Name, Last Name** required; **Phone, Email OPTIONAL**
    (clearing them does NOT block Save).
  - Shipping: **Street, Zip/Postal** required on every brand; Additional, Country, State
    OPTIONAL. **City is BRAND-DEPENDENT — see below.**
  - Billing: **Street, City, Zip/Postal** required; Additional, Country, State OPTIONAL.
  - ⚠️ **Shipping City went OPTIONAL → REQUIRED — rolling out per brand AND per env.** The
    old note here said shipping and billing "differ on City"; that inconsistency is being
    FIXED, not preserved. Verified state as of 2026-08-19:

    | Brand | UAT | prod |
    |-------|-----|------|
    | drmarty | **required** | **required** |
    | badlands | **required** | still optional (next release) |

    - `account-update-shipping-address.spec.js` reads **`brand.shippingCityRequired`** — a
      top-level flag the fixture resolves **per env**, not `brand.content.*`. In
      `site-config.json` it accepts a plain boolean or `{ "uat": true, "prod": false }`.
      **A brand-only flag is not enough** — a release reaches UAT before prod, so the same
      brand legitimately differs by env mid-rollout. Getting this wrong is how the flag was
      first set from prod evidence and then failed on BRP UAT.
    - **TODO (when fixed):** collapse `badlands.shippingCityRequired` to plain `true` once
      BRP prod ships it and delete the `_comment_shippingCityRequired` note. The spec needs
      no change either way.
    - Unset defaults to **`true`** — a new brand inherits the finished behaviour rather than
      a legacy exception it would have to opt out of.
    - Diagnostic tell: **Street's** required-error assertion passes on every brand/env, so a
      City-only failure is a real validation difference, NOT a missing `.invalid-message`.
  - The specs assert EACH required field individually (clear → inline error + Save
    disabled → restore → Save re-enables) AND assert representative OPTIONAL text
    fields stay non-blocking (clear → Save still enabled): Phone (customer),
    Additional (shipping/billing), plus City wherever it is still optional.
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

### Subscription Editor (/subscription-edit + /subscription-cancellation) — data-qa audited 2026-06-17

Platform app-builder UI (shared across non-GMD brands). The page loads a
`select[data-qa="subscription-select"]` of every ACTIVE sub (option text
"Subscription #SSC-#####", option **value = the Salesforce id** e.g. `a0WQL000009C76z2AC`);
selecting one renders that sub's summary client-side. "Delivery and payment"
(`delivery-payment-btn`) opens the edit panel (`<subscription-edit-confirmation-panel>`).

| What | Selector |
|------|----------|
| Subscription selector | `select[data-qa="subscription-select"]` (value = SF id; label has `SSC-#####`) |
| Last / Next order date (DISPLAY) | `[data-qa="last-order-date"]` / `div[data-qa="next-order-date"]` ("21 Jun 2026") |
| Next order date (EDITABLE) | `input[data-qa="next-order-date"]` (`type=date`, ISO value) — **inside the expanded Delivery-Frequency section**; SAME data-qa as the display div, so scope by `div`/`input` |
| Ship Now button | `[data-qa="ship-next-order-now-btn"]` ("Ship Now!") |
| Skip Next Order button | `[data-qa="skip-next-order-btn"]` |
| Delivery & Payment expander | `[data-qa="delivery-payment-btn"]` |
| Frequency expander / select | `[data-qa="frequence-toggle"]` (sic) / `[data-qa="frequency-select"]` (Every week … Every year) |
| Quantity select | `select#quantityId` — **NO data-qa** (GI's `quantity-select` is gone; TODO: ask team). Blank 1st option, then "N - $X.XX / unit" |
| Payment select / manage link | `[data-qa="payment-select"]` / `[data-qa="payment-options-link"]` |
| Ship-to name/address/zip; change link | `[data-qa="ship-to-name"/"ship-to-address"/"ship-to-zipcode"]`, `[data-qa="change-shipping-address-link"]` (opens the Recipient Info MODAL, below) |
| **Recipient Info address modal** (opened by change link) | reused `<address-form>`, SINGLE-dash suffix: `[data-qa="ship-country-"/"ship-street-address-"/"ship-additional-address-line-"/"ship-city-"/"ship-state-"/"ship-postal-code-"]`. Its OWN commit button is a plain `<button>Update</button>` (**NO data-qa**; distinguish from the panel by exact name "Update" vs "Update Subscription Box") + a `Close` button (no data-qa). Clicking modal Update writes the address into the panel's Ship-to DISPLAY and closes the modal — **no network write**; persistence is the panel `update-btn`. TODO: ask team for data-qa on the modal Update/Close. |
| Order summary | `[data-qa="subtotal-original"/"subtotal-new"/"tax"/"shipping"/"grand-total"]` |
| "Yes, I want to update" agreement checkbox | **NO data-qa** — `div[role="button"].checkbox` wrapping a `<mat-icon>` (`check_box_outline_blank`↔`check_box`), label `<p class="checkbox-label">Yes, I want to update my subscription!</p>`. **Must tick to enable `update-btn`.** Locate by the label text. TODO: ask team for a data-qa. |
| Update / Cancel box; close | `[data-qa="update-btn"]` (disabled until the agreement checkbox is ticked) / `[data-qa="cancel-btn"]` ("Cancel Subscription Box") / `[data-qa="subscription-edit-close-btn"]` |
| Sub name (in panel) / image / price / savings | `[data-qa="subscription-name"/"subscription-image"/"subscription-price"/"subscription-savings"]` |
| **Skip modal** | container `[data-qa="skip-next-order-modal"]`; `skip-date` (current) → `next-date` (skips to); `skip-confirm-btn` / `skip-cancel-btn` |
| **Ship Now modal** | container `[data-qa="ship-order-now-modal"]`; `ship-confirm-btn` ("Yes, Ship Now") / `ship-cancel-btn` ("No Thanks"). Success popup ("You're all set!"/"Order Confirmed") has **no data-qa** — matched by copy + a `mat-icon` close (TODO). ⚠️ The copy uses a **typographic apostrophe (U+2019 "'"), not ASCII** — text matchers must be apostrophe-agnostic (`[’']?`) or they silently miss the popup (verified 2026-07-14). Applies to any copy-based matcher against this app. |
| **Cancellation page** (`/subscription-cancellation/{sfId}`) | `subscription-id` (SSC), `next-ship-date`; reason accordions `[data-qa="reason-toggle"]` (one per reason; expand "ANOTHER REASON - CANCEL NOW" — Builder copy, brand-configurable via `brand.content.cancelReason`). ⚠️ **TWO-STEP confirm (verified live 2026-07-16):** (1) `[data-qa="cancel-btn"]` ("I still want to cancel") only OPENS an "ARE YOU SURE…" modal (no write); (2) the modal's real confirm fires the write + redirects to `/my-account`. The modal's two buttons have **NO data-qa** → fall back to `aria-label`: confirm = `[aria-label="Click to confirm cancel"]` ("YES, PLEASE CANCEL SUBSCRIPTION"), dismiss = `[aria-label="Click to close modal without cancelling"]` ("DO NOT CANCEL"). **TODO: ask team to add data-qa to the cancel-confirm modal buttons.** `SubscriptionEditPage.confirmCancel()` clicks both steps. |

**Behavior gotchas (audited live 2026-07-08, drmarty UAT):**
- **`update-btn` is gated by the "Yes, I want to update my subscription!" agreement box —
  a valid change is NOT enough.** After changing qty/date/frequency/payment/address,
  `update-btn` stays DISABLED until that box is ticked. It has **NO data-qa** — it's a
  custom `div[role="button"].checkbox` wrapping a `<mat-icon>` (NOT an `<input
  type=checkbox>`, so a checkbox-input scan won't find it), located by its label text
  "Yes, I want to update my subscription!". `SubscriptionEditPage.clickUpdate()` ticks
  `this.agreeCheckbox` when `update-btn` is still disabled, then waits for it to enable.
  ⚠️ The earlier `[data-qa="terms-checkbox"]` documented here was a WRONG guess — that
  attribute never existed in the DOM, so the old `clickUpdate()` silently no-op'd the tick
  and `update-btn` never enabled (waitForSubscriptionWrite then timed out). This gates
  ALL update specs, not just shipping.
- **Editing the delivery address is a SEPARATE modal, not inline.** The Ship-to "Change"
  link (`change-shipping-address-link`) opens a "Recipient Info" modal with its own
  `<button>Update</button>` (no data-qa). You must click THAT to commit the edited street
  into the panel display (it fires no network write + closes the modal); only then does
  the panel `update-btn` persist. `setShippingAddress()` fills the modal fields and clicks
  the modal Update; the spec then calls `clickUpdate()` for the panel write.
- **Two `data-qa="next-order-date"` elements** — the summary `<div>` (display) and the
  editable `<input type=date>` (in the expanded frequency section). Never use a bare
  `[data-qa="next-order-date"]` — scope with `div`/`input`.
- **Mutation API:** every write (skip/ship/update/cancel) is a non-GET to
  `/account-service/proxy/subscription(s)/...`; the read is `GET
  /account-service/proxy/subscriptions/{accountId}` (accountId = `brand.testAccountId`,
  same as Pets). Exact write sub-paths + the record field names are logged on first run
  (see the "First-run TODOs" note in Migration Status).
- **Self-heal:** skip/ship advance the next-order date; update-date/qty mutate the sub.
  The specs snapshot and RESTORE (afterEach safety net), so prod runs leave the shared
  account net-zero — same discipline as the account-update specs. (Serial execution —
  `workers:1` — means no cross-spec collision on a shared sub.)

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
| Cart product list never loads (headless or headed) | Cloudflare bot block — `QA_UA_TOKEN` missing/not allow-listed for this zone | Ensure `QA_UA_TOKEN` is set in `.env` and allow-listed on the env's CF zone (headless itself is fine — verified UAT + prod 2026-06-17) |
| XPath `text()="X"` finds nothing | Angular comment nodes | `normalize-space(text())="X"` |
| Submit Order stays disabled after CC fill | Braintree needs keydown | `pressSequentially()` not `fill()` |
| Intermittent `12//26` expiry | Slash collision | Strip `/` from expiry before typing |
| Strict mode violation on First Name | Footer form conflict | Scope to `main` |
| Product name comparison fails | Different display copy per page | `assertProductNamesMatch()` |
| Multiple PayPal iframes | Two iframes same title | Use `iframe.component-frame.visible` |
| `net::ERR_ABORTED` on `/cart?product1=…` | The app consumes the query and client-side-redirects; on prod that beats DOMContentLoaded | `CartPage._gotoAddToCart()` — `waitUntil:'commit'`, tolerate the abort, **then verify the URL** (see next row) |
| Cart-only control never appears (90s timeout) after an add-to-cart nav | The abort CANCELLED the nav and left the page on the PREVIOUS page (usually /checkout). `waitForCartLoaded()` false-greens because **/checkout also renders `[data-qa="product-name"]`** | `_gotoAddToCart()` re-navigates and hard-gates on `waitForURL(/\/cart/)`. Never treat `waitForCartLoaded()` as proof of which page you're on |
| Logged-in cart renders LOGGED-OUT after a successful login (`#paypal-button` hidden, `[data-qa="shipping-street"]` missing, standard instead of member pricing) | Auth state not applied to the /cart render — suspected caching/session race, seen on DMP + BRP prod | `cartPage.waitForLoggedInCart()` before any logged-in-only assertion; it reloads twice then throws a "file it" message |
| Header nav locator times out on /cart but works on CMS pages | App-page nav hrefs are ABSOLUTE, CMS-page hrefs are relative | See "Cart Header — cross-page gotcha" |
| `run-brands` runs brand 1 then hangs forever | `reporter:'html'` defaults to `open:'on-failure'` → blocking report server; `spawnSync` waits on it, and the Ctrl+C to escape kills the whole run so later brands never execute | Fixed in `run-brands.js` (`PLAYWRIGHT_HTML_OPEN=never` + per-brand report/output dirs). Don't "fix" it by changing the config reporter — single-brand runs still auto-open |
| PayPal spec sits silent then reports only `waiting for event "popup"` | Unbounded `page.waitForEvent('popup')` eats the whole 90s test timeout | Pass an explicit `{ timeout }` and a label naming the surface (`cart / subscription`, …) |
| 90s of `element is not enabled` on `[data-qa="login-btn"]`, often with `element was detached from the DOM, retrying` | The Angular login form **re-mounts during the click** — after fill+verify succeeded. The re-mount wipes the inputs and re-disables submit, and `click()`'s unbounded auto-wait then consumes the whole test timeout (badlands UAT 2026-08-19) | `LoginPage.loginAndWait()` retries **fill → enable-check → click → navigate as one unit**, every wait bounded, and only while still on `/login`. Don't split the enable-check away from the click, and don't leave the click unbounded |
| `order-loggedin-list-reorder` SKIPS and the run still reports PASS | Its Re-Order All target is chosen from LIVE shared-account data, so no eligible order = nothing to test. Green with zero coverage | Read the **preflight census** the spec prints (candidates / gate-eligible / per-ticket exclusions). It names one of two causes: **TEST-DATA GAP** — place 1 order with 2+ distinct products, all > $0, none repeated (Re-Order All only renders on multi-product orders); or **BUG-BLOCKED** — every candidate hits CART-9257/CART-9124, nothing to do until those land |
| Re-Order All gate skips even though a usable order exists | Candidate collection stopped too shallow. It once paginated only when page 1 had ZERO candidates (badlands UAT never saw its usable page-2 order), then only ever checked page 2 (drmarty prod's sit deeper) | `collectReorderCandidates()` now walks pages until one SERVES the caller's eligibility rule (`maxPages` is a runaway guard). `reloadCandidates()` must re-paginate to the SAME `pageNum` — passing a boolean there silently never paginates (`1 < true` is false) and resolves against page 1's cards |
| `image must render (naturalWidth > 0)` fails intermittently on order cards | `snapshotCard` reads `naturalWidth`/`complete` SYNCHRONOUSLY with nothing waiting on the image, so a card captured mid-load reports false | Wait (bounded) for `imgs.every(i => i.complete)` before snapshotting. This does NOT weaken the check: a 404'd image reports `complete: true` with `naturalWidth: 0`, so a genuinely broken asset still fails |
| Cart quantity asserts 1 when the order had more, but the PRICE matches | Read `[data-qa="product-quantity"]` (pack text "1 Jar") instead of `[data-qa="quantity"]` (stepper) | See the Cart Page selector table — stepper first, pack text only for subscription rows |
| Subscription update hangs on a disabled `[data-qa="update-btn"]` | `update-btn` is disabled **by design** until the "Yes, I want to update my subscription!" agreement box is ticked — a valid change alone does NOT enable it | `clickUpdate()` ticks that box itself. **Never pre-check `updateBtn.isEnabled()` before calling it** — the button is legitimately disabled at that moment, so a guard there skips the work and reports a confident false "cannot restore" (my own bug, 2026-08-19: it made ship-now "pass" by not restoring). If it still hangs, the agreement box locator is the suspect — it has no `data-qa`; `clickUpdate()` now throws naming it |
| Login helper "fixed" but a spec that used to pass now fails | A shared login helper is on the critical path of nearly every logged-in spec, so any hard failure or over-strict gate in it fails specs that were fine | `fillCredentials()` must never throw (best-effort refill); only `loginAndWait()` may fail, and only after bounded retries with the observed form state in the message |

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

// Brand APP-BEHAVIOUR flags — NOT brand.content.*, and resolved PER ENV by the fixture.
// In site-config.json each accepts a boolean OR { "uat": …, "prod": … }; a per-env value is
// temporary by nature (a release hits UAT before prod) — collapse it once the rollout ends.
// Unset defaults to TRUE so a new brand inherits finished behaviour, not a legacy exception.
brand.shippingCityRequired   // City required on /account-details shipping?
                             // drmarty: both envs. badlands: UAT yes, prod not yet.
                             // See Manage Account → "Which fields are required"
brand.storeLocatorUrlPattern // regex SOURCE for the header Store Locator href;
                             // accepts /store-locator OR store.<domain>
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
  - **DOCUMENTED EXCEPTION: `tests/a11y/`** (accessibility lane, added 2026-08-06). It is intentionally NOT a sibling folder — do not "fix" it by moving it out. The rule above exists to stop *unrelated* tools from being buried here; a11y is the opposite case, because `fixtures/axe.js` extends `fixtures/brand.js` and the Phase-3 authenticated scans reuse the existing page objects. A sibling folder would have to duplicate `site-config.json`, `brand.js`, the `QA_UA_TOKEN` Cloudflare UA logic, `base.page.js`'s popup dismissal, and every page object — five files that would immediately drift. It has its own **`playwright.a11y.config.js`** (prod-first, parallel, desktop + mobile) and `playwright.config.js` carries **`testIgnore: '**/a11y/**'`** so functional runs never sweep it in. Full context: [`tests/a11y/README.md`](./tests/a11y/README.md).

---

## Accessibility (a11y) lane — `tests/a11y/`

Added 2026-08-06 on `feature/a11y-axe-scans`. Axe/WCAG scans, **separate config**
(`playwright.a11y.config.js`), read-only, **not in any release gate**. Full docs:
[`tests/a11y/README.md`](./tests/a11y/README.md) — read that before touching it.

The three things most likely to be misunderstood later:
1. **It lives here on purpose, not by accident** — see the documented exception under
   "Things Safe to Change". `playwright.config.js` has `testIgnore: '**/a11y/**'`.
2. **The rule set is fixed by a public claim, not preference.** Both brands publish an
   accessibility statement claiming **WCAG 2.1 A & AA** conformance and both name
   **Level Access** as their vendor. Scans use exactly `wcag2a/2aa/21a/21aa`. Check
   whether Level Access already has audit findings before treating our baseline as new.
3. **`data/a11y-pages.json` is keyed by TEMPLATE id, not URL** — that's what makes DMP's
   `/product/<slug>` and Badlands' `/p/<slug>` the same template in reports. Adding a
   brand = a new `brands.<name>.pages` array, no spec changes.

Committed baseline = `tests/a11y/__snapshots__/` (violation fingerprints only). The
human-readable findings (`a11y-report/`) are generated and gitignored. Phase 3 (authenticated
+ modal-state scans, plus hand-written keyboard/focus-trap tests axe structurally cannot do)
is not built yet.

---

## Backlog (post-migration)

Capture ideas here so they don't get lost. Don't action until the migration is done — finishing the GI → Playwright port keeps the green-suite-as-safety-net intact for any future refactor.

- **Cross-brand test strategy — OPEN, decide before adding brand #3 (raised 2026-08-19).**
  Badlands (BRP) ran for the FIRST TIME EVER on 2026-08-19, and only **8 specs** of the ~40 in
  `tests/` have ever executed against it. Everything else in this file's "verified green"
  claims is **drmarty-only**. Before committing to a cross-brand cadence we need a plan for
  what "runs on every brand" even means, because that first run already surfaced four
  distinct KINDS of brand difference:
  1. **App behaviour differs, temporarily — AND per ENV, not just per brand.** Shipping City
     is required on DMP (both envs) and on BRP **UAT**, but not yet BRP **prod**. Config-driven
     via `brand.shippingCityRequired`, which the fixture resolves per env. **Lesson: a
     rollout-in-progress difference is brand × env.** Setting such a flag from one env's
     evidence alone will fail in the other — it did here.
  2. **App behaviour differs, permanently** — member-price deltas (DMP 59.95→30.95, BRP
     59.95→40.95), free-shipping thresholds (DMP $50, BRP $49).
  3. **Markup differs structurally** — DMP's coded Angular header vs BRP's Builder-authored
     one with no hrefs and no `data-qa`. No shared selector exists.
  4. **Env-specific quirks that are NOT brand differences** — the add-to-cart
     `net::ERR_ABORTED` fires on DMP prod and never on BRP, so a brand-conditional fix here
     would have been wrong; it belongs in the page object for everyone.
  **The decision to make:** how to keep cross-brand coverage honest without either (i) running
  everything everywhere and drowning in expected-difference noise, or (ii) quietly skipping
  BRP forever, which is where we are now.
  Options to weigh:
  - **(a) Baseline first.** Run the FULL non-`@real-order` suite once on BRP UAT purely to
    measure the gap, then triage each failure into: real bug / brand difference to configure /
    spec not portable. You cannot plan coverage without knowing the gap — right now nobody
    knows how many of the ~32 unrun specs pass on BRP.
  - **(b) Classify specs by portability** — brand-agnostic (built on platform `data-qa`, run
    everywhere) vs brand-specific (CMS/Builder content, run per brand). Could be a tag
    (`@brand-agnostic`) so `cartv3:multi` runs the portable set on all brands by default.
  - **(c) Push differences into `site-config.json`, one spec per behaviour** — the pattern is
    already established twice (`shippingCityRequired`, `storeLocatorUrlPattern`) — and it must
    support per-ENV values, not just per-brand.
    Preferred over `if (brand.name === 'badlands')` branching in specs, which doesn't scale.
  - **(d) Per-brand skip registry** — explicit, reviewable list of what each brand can't run
    and why, so skips are visible debt rather than buried `test.skip` calls.
  **Recommendation: (a) now, then (c) as the mechanism and (b) as the organizing principle,
  with (d) to keep the remainder honest.** Prereqs for any brand run are already listed under
  "Brand-portability of the checkout specs" below (`site-config` entry, product CSV, `.env`
  creds + account ID, **`QA_UA_TOKEN` allow-listed on that brand's zone**) — check those first,
  or the baseline measures infrastructure gaps instead of coverage gaps.
  Tooling is ready: `run-brands.js` now writes per-brand `playwright-report/<brand>` and
  `test-results/<brand>`, so a two-brand baseline is debuggable for both.

- **Brand-portable header nav testing — UNRESOLVED, needs a strategy decision (raised
  2026-08-19).** *(Blocked on the cross-brand strategy above. `header.spec.js` is
  `test.fixme()`'d as of 2026-08-19 — known broken, not intentionally skipped.)* The header is the least portable surface in the suite and the current
  specs only work on DMP. Three separate problems stack up:
  1. **Different markup per brand.** DMP has a coded Angular header (`a.header__nav__link`
     with real hrefs). BRP's is Builder-authored: no `href`, no `data-qa`, only volatile
     `builder-<hash>` classes, and "Shop" is a dropdown rather than a direct link. There is
     no shared selector, which is why `header.spec.js` and
     `cart-verify-header-links.spec.js` both `test.skip` badlands.
  2. **Different hrefs for the same nav item, per page.** Relative on CMS pages, absolute on
     app pages (see "Cart Header — cross-page gotcha").
  3. **Different destinations for the same nav item, per brand and over time.** Store
     Locator moved from `store.<domain>` to a first-party `/store-locator` path on DMP.
     Handled for that one link via `brand.storeLocatorUrlPattern`, but that approach doesn't
     scale to a whole nav.
  **The open question is what we're actually asserting.** Options to weigh:
  (a) assert only that each nav item EXISTS and NAVIGATES somewhere valid, dropping
      per-brand URL literals — portable, but weak (a link pointing at the wrong page still
      passes if that page loads);
  (b) keep destination assertions but move the whole expected nav (label → URL pattern) into
      `site-config.json` per brand — precise and portable, but it's config that has to be
      maintained per brand and per redesign;
  (c) ask the team for a `data-qa` per nav item (`data-qa="nav-shop"`, `nav-store-locator`,
      …) so the LINK is found structurally and only the expected destination is configured —
      the cleanest, but needs dev work on the Builder-authored headers too.
  **Recommendation: (c) as the goal, (b) as the interim** — (b) can ship now and its config
  survives the move to (c). Decide before onboarding another brand, or the skip list grows.
  Do NOT paper over it by relaxing the URL assertions to `/products|shop`-style regexes;
  that hides real misrouting.

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
    `data-qa` selectors were touched. **✅ Badlands — all fields confirmed + filled in
    (2026-07-20):** `primaryDomain` (`badlandsranch.com`), `freeShippingText` (`FREE!`),
    `validCoupon` (`AUTOTEST1` — same coupon as drmarty), `csPhone` (`888-872-4522`),
    `csHours.weekday` (`Mon-?Fri.*PT`), `csHours.weekend` (`Sat-?Sun.*PT`) — confirmed
    live: Mon–Fri 6am–5pm PT, Sat–Sun 6am–4pm PT (regex-source strings, same tolerant
    pattern style as drmarty's, PT vs drmarty's PST). No more `TODO_CONFIRM_BADLANDS_*`
    placeholders remain in `data/site-config.json`.
  - **Brand-clean today (code), but verify the brand's content matches:**
    `checkout-prepopulate` (asserts vs the brand's own account record — fully portable);
    `checkout-form-validation` (platform validation copy; the required-field map lives in
    `data/checkout-field-validation.json` — edit if the brand's required fields differ);
    `checkout-country-state` (data-driven US/CAN — fine if the brand ships US/CAN);
    `checkout-subscription-terms` (generic "automatically renewing subscription" copy +
    brand's `loggedin_sub_2`).
  - Badlands specifically still has only placeholder CSVs + no test account, so it
    can't run until that data lands.

### Architecture / test-maturity improvements (SDET backlog — aspirational, post-migration)

These are where a mature/"FAANG-style" test org would diverge from the current design. The
current approach is a sound, above-average **Ghost Inspector → Playwright migration** (it adds
backend asserts, env-safety, and self-heal the GI originals lacked) — these items are the next
level up, to tackle once the port is done and merged, NOT in the migration branch.

- **Data isolation over shared-account self-heal.** Today the mutating specs snapshot →
  mutate → assert → restore on ONE shared Salesforce test account per brand. The textbook
  approach is *ephemeral/isolated test data*: a fresh (or reset) account seeded per run,
  DB/API fixtures, or transactional rollback — so a test never depends on restoring state
  correctly and can't pollute a sibling. Driver: the current model is fragile — a failed
  self-heal poisons the next run, and there's a shared-account race (see the cancel item
  below). Open questions: can QA provision/seed accounts on demand (SF sandbox refresh, an
  account-factory API)? Is per-run isolation worth the infra vs. the current restore pattern?

- **Push the mutation matrix down to API/integration tests (test pyramid).** The
  quantity/frequency/date/payment/shipping permutations are currently exercised through full
  browser + login E2E (slow — the BLR sub run was ~5.7 min — and flake-prone). A mature suite
  keeps UI E2E to a thin layer of critical happy paths and covers the field/permutation matrix
  at the API layer (the `PUT /account-service/proxy/subscriptions/{acct}/{sub}` contract is
  already known — see "Backend contract"). Likely a new sibling tool folder (`api-tests/`) per
  the monorepo convention, not code in `cartv3-e2e/`. Driver: speed, stability, and pyramid
  shape. Keep the existing E2E as the thin top layer.

- **`subscription-cancel` shared-account race — tighten before any parallel `@real-order`.**
  The spec identifies its throwaway sub via `list.find(s => !beforeSscs.has(s.ssc))` (first
  SSC not present before). It can never pick a *pre-existing* sub, but if two brand-new subs
  appear between snapshot and poll (concurrent run on the same account, or one order spawning
  two subs) it could pick the wrong *new* one. Safe today because `@real-order` runs serially;
  if these ever run parallel on one account, match on the just-placed product/order id instead
  of "first new SSC." Driver: correctness under parallelism. (Same shared-account caveat
  applies to any self-heal spec run concurrently.)

- **(Nice-to-have, low priority) UI subscription lifecycle canary.** A single *additive*
  spec (`subscription-lifecycle.spec.js`) that walks one throwaway sub through
  create → a couple of updates → cancel via `test.step()`s, owning + cleaning its own data.
  It would **not** replace or re-wire the 9 granular specs (which stay independent + parallel
  + self-healing — that's the regression layer); it's a coarse end-to-end smoke on top.
  **Explicitly rejected:** re-wiring all 9 specs to share ONE created SSC (setup→serial→teardown)
  — that couples the specs, forces serial runs, and makes the create-order a single point of
  failure, trading away test independence for a cleanliness the self-heal + throwaway-cancel
  patterns already provide. **Note:** the create→update→cancel lifecycle is cheaper, faster,
  isolated, and rate-limit-free at the **API layer** (see the item above) — so if the
  API-tests investment happens, that's the better home for this lifecycle and the UI canary
  becomes unnecessary. Only add the UI canary if you want a browser-level owned-data smoke
  before the API layer exists.

- **Shared-account cart leakage between specs (confirmed 2026-08-04) — clear the cart at the START of any spec that reasons about cart contents.** The logged-in test account's cart persists **server-side**, so a spec that crashes before its own `afterEach` leaves items behind for the *next* spec. Proven in one dense batch: `order-loggedin-checkout-cc` logged `cart was NOT empty at test start — 1 leftover row(s): ProPower Plus`, traced to a prior **Re-Order All** run in `order-loggedin-list-reorder`. Why it silently corrupts assertions: `CartPage.getOrderSummary()` reports only the **FIRST** row's `productName`/`quantity` while `subtotal` covers the **whole** cart — so a leftover row makes cart→confirmation checks compare two *different* products (this is exactly what produced a bogus `quantity: cart=1 vs confirmation=2` failure that looked like an app bug). `order-loggedin-checkout-cc` now logs any pre-existing rows **by name** and then clears before adding its product — keep that pattern (log first, then clear) so a dirty cart stays visible instead of being silently swallowed. A dedicated automation-only account (in progress) is the real fix for this whole class.

- **`/cart` per-row reads MUST be scoped to `cart-line` — never index the page-wide `[data-qa]` locators positionally (live-audited 2026-08-04).** One **`<cart-line>`** element per line item; each contains exactly one `product-name` + `product-price` + `product-delete-link`. Audited counts on a 2-row cart (subscription + standard): `product-name: 2`, `product-price: 2`, `product-delete-link: 2`, **`product-quantity: 2`**, but **`quantity: 1`**, `quantity-increase-btn: 1`, `product-delete-btn: 1`.
  - **A SUBSCRIPTION row renders no quantity STEPPER** (`[data-qa="quantity"]` / increase / decrease) — it does still render the **text** quantity `[data-qa="product-quantity"]`. So **read quantity from `[data-qa="product-quantity"]`** (present on every row) rather than the stepper.
  - Because those per-field counts differ per row, `quantityValue.nth(i)` against a product-row index both **hangs** on the missing element *and* **silently pairs another row's quantity with this row's name/price**. Both were hit in `order-loggedin-list-reorder` once its Re-Order All pick was randomized onto a subscription-containing order. Fix: `cartPage.productRows` (= `cart-line`) and read each field *inside* the row.
  - **The cart shows the SAME display name for a product's subscription and standard variants** ("Nature's Blend Essential Wellness 16oz" for both), while order history distinguishes them ("… - 1 Bag Subscription" vs "… - 1 Bag"). So name-only matching cannot pair order lines to cart rows — disambiguate with **price** (line total, or unit × qty).

- **Re-Order All lands on an EMPTY cart when the order carries a $0.00 free/promo line — [CART-9257](https://goldenhippomedia.atlassian.net/browse/CART-9257) (found 2026-08-04, behavior under review).** On `uat.badlandsranch.com`, Re-Order All on **`ORD-000875833`** — a *"Superfood Bites … 6 Units Subscription"* (qty 1, $80.94) plus a *"Superfood Complete … 1 Unit"* line at **$0.00** (a free product attributed to the order) — navigates to `/cart`, which renders **"Your cart is empty!"** with a **0** badge. The click lands; **nothing** is added, not even the paid subscription line, and there is no message.
  - **CONFIRMED MANUALLY** — reproduces by hand in a browser, so it is **app-side, not an automation artifact**. `ORD-000871123` (two normally-priced items) works by hand and automated; on **DMP** `ORD-000875589` (subscription qty 2 + standard, both priced) also works. So a subscription alone is not the trigger; the **$0.00 line is the differentiator** (subscription + $0.00 remain confounded in the single failing order).
  - **Open question in the ticket:** the $0.00 price itself is legitimate (a free product on the order). Refusing to re-order a free line may well be intended — but silently emptying the cart instead of adding the paid lines and/or messaging the user is the part under review.
  - **How the spec handles it (deliberate, two-part):**
    1. **The gate is DETERMINISTIC.** Re-Order All exercises the **first candidate whose line items are all priced > $0**. A random pick made the spec pass or fail on the draw, which is disqualifying for a regression gate (an unreproducible red gets ignored). The rule needs no hardcoded ORD- id, so it survives history turnover, and **every excluded $0.00 candidate is logged with the CART-9257 reference** — the exclusion is visible, not silent.
    2. **A characterization test covers the broken shape** — `KNOWN ISSUE CART-9257 …` asserts the CORRECT expectation (the cart should populate) and is marked **`test.fail()`**. While broken it fails, is marked expected, and is named in every run. **When the app is fixed it PASSES, Playwright reports "expected to fail but passed" and the suite goes RED** — forcing that test to be deleted and the gate's $0.00 exclusion to be dropped. That self-cleaning property is why it's a `test.fail()` and **not** a `test.skip()`, which would rot silently.
  - **Env overrides:** `REORDER_ORDER_ID=<ORD-…>` pins one order (reproduce a specific run); `REORDER_RANDOM=1` restores random selection for exploratory sweeps.

- **Known catalog bug (Jira filed)** — Cart and Order Confirmation render different display names for the Tilly's Treasures variant ("Tilly's Treasure Beef Liver Treats" vs "Dr. Marty Tilly's Treasures - 1 Bag"). `assertProductNamesMatch` in `helpers/order-validations.js` is intentionally left strict so it keeps surfacing this mismatch — do NOT loosen the helper to make the test pass; the fix belongs in the catalog data.

- **Known PROD bug — My Account subscription links route to the wrong page (found 2026-06-11, prod triage).** On `/my-account` → "My Recent Orders / My Subscriptions", the individual `SSC-####` subscription links **and** the `MANAGE SUBSCRIPTIONS` button are supposed to open **`/subscription-edit`** (UAT correctly goes to `/subscription-edit/<salesforceId>`, e.g. `/subscription-edit/a0WQL000009C76z2AC`). **On prod they route to `/subscription-management/<salesforceId>` instead** (e.g. `https://drmartypets.com/subscription-management/a0WVo00000NEDWPMA5`) — a real, functional page (shows Delivery Frequency & Date) but the WRONG destination. `account-main-page-links.spec.js` asserts `toHaveURL(/subscription-edit/)` (substring regex — the trailing SF id is irrelevant to the match) and is **left red on prod on purpose** to surface this. Do NOT loosen the assertion to accept `/subscription-management` — the fix belongs in the app routing. (The order-link half of the same spec passes; only the subscription routing is broken. The `firstOrderLink` / `firstSubscriptionLink` page-object locators were broadened to `a, button` because the order/subscription IDs render as `<button>`s, not anchors — that's a legitimate selector fix, unrelated to the routing bug.)

- **✅ RESOLVED 2026-08-04 — the two blockers are now SEPARATED by hard evidence (read the Turnstile sitekey straight out of the page config). This supersedes the guesswork in the entries below.** The app ships its client config inline in the page HTML, so the Turnstile sitekey is directly observable — on `/checkout` or `/payment-details`, in DevTools console:
  ```js
  console.log((document.documentElement.innerHTML.match(/"TURNSTILE_SITE_KEY":"[^"]*"/) || ['not found'])[0]);
  ```
  | Env | `TURNSTILE_SITE_KEY` | Meaning |
  |---|---|---|
  | **UAT** (`uat.drmartypets.com`, `GH_ENV: development`) | `1x00000000000000000000AA` | Cloudflare's documented **always-pass TEST key**. The widget (`#turnstile-widget`) self-solves on load — the hidden `cf-turnstile-response` input already holds `XXXX.DUMMY.TOKEN.XXXX`. **Turnstile can NEVER block automation on UAT.** |
  | **PROD** (`drmartypets.com`, `GH_ENV: production`) | `0x4AAAAAACFgM3HsyNlEH5V1` | **LIVE key** → a real human-verification challenge that automation cannot solve. |
  **Conclusions (both earlier theories were right, but in different envs):**
  - **PROD payment/order submit via `/checkout` + `/payment-details` is Turnstile-blocked, by design, with NO automation workaround.** This *confirms* `test.skip(brand.env === 'prod')` on `order-loggedin-checkout-cc` and `payment-add-card` being UAT-only — keep both. Prod order-placement coverage stays with `order-loggedin-cart-cc` (submits from `/cart`, no Turnstile page).
  - **UAT is not Turnstile-blocked TODAY — but it was until 2026-07-21.** DevOps confirmed the `TURNSTILE_SITE_KEY` config var was **last modified 2026-07-21** (Heroku config change, v591). The CART-9181 failures were ~2026-07-09 and earlier, i.e. **before** that change — so UAT was almost certainly on a **live** key while those failures happened, and switching it to the always-pass test key is what fixed them. **DevOps's "it's most likely Turnstile" was correct for UAT as well as prod**; the earlier conclusion here that UAT's block was the rate-limit was wrong — it came from reading the sitekey *after* the 2026-07-21 change. DevOps also stated they **do not want live keys in UAT**, so the test key is the intended steady state (not a temporary workaround).
  - **CART-9181 disposition — UAT half RESOLVED (by the 2026-07-21 test-key change).** Verified 2026-08-04: `order-loggedin-checkout-cc` passes on UAT both isolated and inside a dense 7-spec `tests/order-*.spec.js` batch (5 real orders placed). The *prod* half is **not actionable** — a live Turnstile key is intended security, so do NOT ask for a prod bypass; keep the prod skips.
  - **CF velocity rate-limit — still present but NON-FATAL, ask is on hold.** The `401 /account-service/proxy/auth/me` + `419 /proxy/funnel/stats/save/` cf-ray responses still appear under dense runs but no longer block anything (orders complete). Only re-raise the QA rate-limit exception (keyed on the `DrMartyQA/<token>` UA, NOT IP) if dense runs start failing on these again.
  - **Do NOT re-request an IP/VPN allow-list** — ruled out empirically (see below): the original failure occurred *while on the office VPN*.

- **⚠️ UPDATE 2026-07-09 — office VPN / IP allow-listing is RULED OUT, and the block also hits UAT (not just prod). Tracked as CART-9181.** *(NOTE: the "it's Turnstile on UAT" framing in this entry is superseded by the 2026-08-04 entry above — UAT runs an always-pass test key, so the UAT block was the CF rate-limit. The VPN/IP conclusion below still stands.)* Evidence from a dense 7-spec `tests/order-*.spec.js` batch on **UAT** (`uat.drmartypets.com`), run **while connected to the office VPN (static egress IP)**:
  - **6 of 7 passed** — guest CC, guest PayPal, logged-in **cart** CC, logged-in **cart** PayPal, logged-in **`/checkout` PayPal** (`ORD-000872005/006/007/008/009`), and `order-loggedin-list-reorder`.
  - **Only `order-loggedin-checkout-cc` failed** — `401 ← /account-service/proxy/auth/me` (cf-ray `a1f6b6d8dd524896-LAX`), then stuck on `/checkout`, never reached `/order-confirmation` (90s timeout).
  - **The discriminating fact:** `/checkout` **PayPal PASSED** while `/checkout` **CC FAILED** in the same batch/session. Same page, same moment → this is **NOT** a velocity/rate-limit wall on `/checkout` (PayPal would have tripped too) and **NOT** page-level. It is specific to the **credit-card form submit**, i.e. the **Turnstile-gated payment-details path**; PayPal submits via its own popup and bypasses that form.
  - **→ VPN / office-IP allow-listing does NOT fix this. Do not re-request an IP allow-list** (Turnstile is a per-session CAPTCHA, not IP-gated). This was tested empirically on VPN and still failed.
  - **→ Also corrects the "UAT works" claim in the entry below:** the CC-via-`/checkout` submit is blocked on **UAT too**, so UAT's Turnstile is NOT using lenient/test keys today.
  - **The one open ask (CART-9181):** set **non-live / test CF Turnstile keys on `uat.drmartypets.com`** (keep the same env — no separate staging env). Parity is preserved: only the CAPTCHA stops challenging; all cart/checkout/payment/order code stays identical to prod, and no testable coverage is lost (the real Turnstile challenge can't be automated regardless — validate it manually on prod). DevOps to confirm no other team needs live Turnstile behavior on UAT. **Rejected alternatives:** IP/VPN allow-list (ruled out above); a fixed inter-order delay (slows the suite, doesn't reliably cover dense batches); a separate staging env (we don't want a second env to maintain).
  - **Interim workaround:** run the `@real-order` specs in a smaller/separate pass rather than one dense batch — most pass fine; expect `order-loggedin-checkout-cc` to remain blocked until the Turnstile keys change.

- **⚠️ CORRECTED 2026-07-01 — the payment/order-submit block is Cloudflare TURNSTILE (in the app code), NOT a Cloudflare WAF rate-limit.** DevOps confirmed the "Too many requests" seen at the payment step comes from a Cloudflare **Turnstile** widget embedded in `hippo-builder-cart`'s **payment-details page** (a human-verification CAPTCHA, not a WAF rule). It therefore **cannot be bypassed from Cloudflare** — UA / IP / secret-header allow-listing does nothing, so the "Fix (DevOps): allow-list the rate-limit" ask in the historical note below was a **misdiagnosis and is CLOSED** (DevOps has no remaining action; the `DrMartyQA` UA whitelisting for the *bot wall* on drmartypets.com + uat.badlandsranch.com is done and is a separate thing). Automation can't produce a valid Turnstile token, so the payment/order submit is rejected. **Prod-only impact:** prod uses live Turnstile keys and blocks automated payment/order submit via `/checkout` + `/payment-details`; **UAT works** (test/lenient keys), so the payment/order-submit specs (`order-loggedin-checkout-cc`, `payment-add-card`, `thank-you-page`) are **UAT-verified only**. **No prod workaround** short of an app-code QA bypass (the cart dev team adds a server-side Turnstile-verify skip gated behind a secret QA header — security-reviewed). Per standard QA practice we do **not** weaken prod bot protection for automation; Turnstile-gated flows are validated in a non-prod env (test sitekeys), and on prod the payment page is smoke-tested manually during releases. **Prod order-placement coverage is retained by `order-loggedin-cart-cc`** — it submits from `/cart`, which does NOT render the Turnstile payment page, and it places real prod orders successfully.

- **[HISTORICAL — superseded by the 2026-07-01 Turnstile correction above; the rate-limit framing was a misdiagnosis] Prod `@real-order` `/checkout` "Too many requests" was originally attributed to a Cloudflare rate-limit.** Repeated real-order runs in one window trip a Cloudflare edge **rate-limit rule** that surfaces a **"Too many requests"** toast on `/checkout` and keeps Submit Order disabled. (NOTE: a rate-limited `/checkout` can also *render* PayPal-first with a greyed-out Submit Order — that is a **symptom of the rate-limit**, NOT real behavior. A manual logged-in cart→checkout shows Submit **enabled** with no "Or pay with credit card" toggle needed; confirmed 2026-06-16. So do not add a credit-card-toggle workaround — it would mask the rate-limit and risk breaking the healthy flow.) **Why `QA_UA_TOKEN` doesn't help:** that UA allow-list is on the **bot-detection / managed-challenge** rule (identity-based, clears the initial bot wall); the rate-limit is a **separate, velocity-based, per-IP/session** rule that counts requests regardless of UA. **Fix (DevOps):** add an exception on the *rate-limit* rule for QA traffic — keyed on the `DrMartyQA/<token>` UA or a secret header/cookie (NOT IP — QA IPs are dynamic) — covering `*/commerce-service/proxy/{cart,tax}/*`, `*/account-service/proxy/*`, `*/payment-service/proxy/*` (Braintree client token + add-card), and the order-submit endpoint. **Not strictly prod / not just `/checkout` (observed 2026-06-17):** the rate-limit is velocity-based on ANY env — a dense `npx playwright test tests` batch on UAT (several real orders back-to-back) tripped it and then blocked **`payment-add-card.spec.js`** on `/payment-details` with the same "Too many requests" toast (ADD CARD stuck disabled; the Braintree form itself fills fine — confirmed via screenshot, so it is NOT a headless/fill bug). Space `@real-order` + add-card runs out, or use a fresh IP. **Test disposition:** `order-loggedin-checkout-cc.spec.js` has a fast-fail 429 guard (named CF diagnostic from captured first-party ≥400 responses) and is **UAT-primary / prod-on-demand** — the saved-card order PATH is verified on prod by `order-loggedin-cart-cc.spec.js`, which submits from `/cart` and sidesteps this challenge. Don't hammer the same IP retrying — repeat trips extend the cooldown; space runs, use a fresh IP, or wait for the DevOps allow-list.

- **✅ RESOLVED 2026-07-01 — the managed-challenge / bot rule below is now fixed on `uat.badlandsranch.com`.** A full **headless** 45-test batch (`BRAND=badlands ENVIRONMENT=uat npx playwright test tests`) bootstrapped Angular, logged in, and placed **real CC orders** (`ORD-000863088/093/094`) — previously impossible headless (Angular never loaded). So DevOps applied the managed-challenge skip-rule to the Badlands UAT zone, AND the earlier "UAT backend instability" (login `waitForURL` timeouts / "context closed" crashes) did not recur → treat that as resolved too. **Still TODO:** (a) confirm `badlandsranch.com` **prod** got the same skip-rule — the 6/29 launch date has passed, so verify before running headless on prod; (b) the **separate velocity rate-limit is still open** — see the 2026-07-01 status update at the end of this block. Original finding kept below for history.
- **[HISTORICAL — resolved 2026-07-01, see note above] Badlands UAT/prod zones are NOT on the `QA_UA_TOKEN` Cloudflare allow-list — headless is fully blocked (DevOps TODO, not a test/app bug; found 2026-06-17, blocks Badlands onboarding).** This is the **managed-challenge / bot rule**, distinct from the velocity rate-limit above. On `uat.badlandsranch.com` the top-level `/login` HTML returns 200, but every subsequent app request — the lazy-loaded Angular **`/chunk-*.js`**, `/account-service/proxy/auth/me`, `/commerce-service/proxy/cart/`, `/builder/proxy/cache/entry/*`, `/environment/dd-rum-params/`, and re-requests of `/login` — gets **403 with `cf-mitigated: challenge`**, so Angular never bootstraps (`[data-qa]` count 0, no login form). **Headed passes** (real Chrome solves the JS challenge via `challenges.cloudflare.com/cdn-cgi/challenge-platform`); **headless cannot**. **Proof (A/B, identical headless script + same `DrMartyQA/<token>` UA, back-to-back 2026-06-17):** `uat-int.drmartypets.com/login` → login form renders ~1s, **0** challenge-403s; `uat.badlandsranch.com/login` → **9** 403s, all `cf-mitigated: challenge`, no form. Same code/token/mode → the **Cloudflare zone config is the only variable**. **Do NOT try to defeat the challenge in-suite** (stealth/fingerprint hacks) — against policy, brittle, and would mask the identical gap on the Badlands **prod** zone before the **6/29** launch. **Fix (DevOps):** apply the existing `DrMartyQA/<token>` managed-challenge skip-rule + the rate-limit exception to **`uat.badlandsranch.com`** (now) and **`badlandsranch.com`** (before 6/29), mirroring the DMP zones — cover the app shell + `/chunk-*.js` + `*/{account,commerce,payment}-service/proxy/*` + `/builder/proxy/*` + order-submit. **Until allow-listed, Badlands can only be exercised HEADED** (`HEADED=1 BRAND=badlands ENVIRONMENT=uat …`); login + the per-brand config (URLs, CSV, content, account ID `0010m00000kgYHjAAM`) are all otherwise in place. *(Separate, lower-pri: the `builder/proxy/.../default-website-section` calls also 404 "Model not found" for `mainFooter`/`pdpBelowSliderContent`/`promotional-card` — Badlands CMS content not yet authored in Builder; decorative, doesn't block login, but footer-link/heading specs will need it later.)*
  - **Onboarding progress (2026-06-17):** config is fully staged — UAT base `https://uat.badlandsranch.com`, both product CSVs (`badlands-{uat,prod}.csv`, staging→uat / production→prod), `testAccountIds.uat` = `0010m00000kgYHjAAM`, `validCoupon` AUTOTEST1, `csPhone` 888-872-4522, `csHours` (regex, **unverified vs live header** — confirm during `checkout-header-display`), `cancelReason`, reused DMP `testAddress`, UAT `paymentDetails` path. `.env` has `BADLANDS_TEST_EMAIL`/`_PASSWORD`. **`login.spec.js` passes HEADED** (`[data-qa="login-btn"]` + `gh-input.{email,password}-input input` all carried over). Smoke is otherwise blocked on the CF allow-list above. Temp diagnostics `audit-login-headless.js` (A/B re-verify after DevOps fixes — Badlands row should flip to `login-btn: YES, 403s: 0`) + `audit-header-headed.js` left in the tree; delete once Badlands is green.
  - **`header.spec.js` is SKIPPED for Badlands (`test.skip(brand.name === 'badlands')`) — decision 2026-06-17, revisit post-launch.** Live-audited the Badlands header (homepage + post-login `/my-account`): it is **authored in Builder.io**, NOT the coded Angular header DMP uses. The nav items (Shop/Subscribe & Save/Reviews/Contact Us/Store Locator) are `<li>`/`<span>`/`<button>` Builder blocks with **no `href`, no `data-qa`**, only **`builder-<hash>` classes that regenerate on every Builder publish** (unusable as selectors), and **"Shop" is a dropdown** (Shop by category / Shop All / Shop Food / Shop Treats), not a direct `/products` link. So DMP's `a.header__nav__link[href="…"]` finds nothing and the spec stalls on `shopLink`. There is no stable hook to port onto today (data-qa absent; text-match is fragile + the dropdown changes the click model). **Clean fix = ask the team to add `data-qa` to the Builder header nav** (Builder supports custom block attributes) — then the spec becomes brand-portable like the rest of the app. **DevOps/CMS TODO for the team.** Until then header-nav coverage for Badlands is intentionally skipped (not red). NOTE: the rich `data-qa` on the app pages (`product-name`, `subtotal`, `saved-card`, `submit-order-btn`, …) is all cart/checkout content and DID carry over — the gap is specifically the Builder-authored **header**.
  - **⭐ TEAM/CMS ASK — add `data-qa` to the Builder HEADER + FOOTER nav (un-blocks 3 skipped Badlands specs).** DMP and Badlands run the **same stack + same Builder**, but the header is authored **differently per brand**, proven by a live A/B audit (2026-06-17):
    - **DMP header nav** = real anchors `<a href="/products" class="header__nav__link …">Shop</a>` (also `/subscribe-save`, `/reviews`, store-locator URL). Testable purely because of the **hrefs + stable `header__nav__link` class** — note **neither brand has `data-qa` here**.
    - **Badlands header nav** = `<li>`/`<span>` **Builder blocks with NO href, NO `data-qa`**, only volatile `builder-<hash>` classes, and **"Shop" is a dropdown** (Shop All / Shop Food / Shop Treats). Nothing stable to select → nav can't be automated.
    - **The ask:** author the Badlands header nav as real `<a href="…">` links matching DMP **and/or add `data-qa`** to the header nav items. Same for **footer** nav where brands diverge — add `data-qa` so footer-link specs stay brand-portable (Badlands footer already caught one collision: it has a "Contact Us" button that clashed with the pets remove-modal — see Bucket A fix). Adding `data-qa` to header+footer is the durable, brand-agnostic fix (better than relying on hrefs/classes).
    - **Un-skip path (no code change needed):** once Badlands' header exposes those `<a href>` links (or `data-qa`), the existing `pages/header.page.js` selectors just work — **delete the 3 `test.skip(brand.name === 'badlands')` gates** and they pass. The gated specs: `header.spec.js`, `auth-login-logout-header-states.spec.js` (needs the account dropdown too), `cart-verify-header-links.spec.js` (also redundant). These are Badlands-only skips — all 3 still run on DMP.
  - **Bucket A test-side fixes — DONE + verified on Badlands UAT (2026-06-17):** (1) `checkout-header-display` → config `csPhone` `(888) 872-4522`, `csHours` `Mon-?Fri.*6am.*5pm.*PST` / `Sat-?Sun.*6am.*4pm.*PST` (live header renders parens + **PST**, not the PT we were first told); (2) `pets-remove-profile` → `PetsPage.contactUsBtn` scoped to `[role="dialog"]` (Badlands' Builder **footer** also has a "Contact Us" button → strict-mode collision); (3) `order-loggedin-list-reorder` → PDP is brand-specific: URL `/(product|p)/` (Badlands uses `/p/<slug>`) and title `h1.product-name, [data-qa="os-product-name"]` (Badlands PDP uses the **`os-*`** product widget: `os-product-name`/`os-variant`/`os-add-to-cart`). All brand-portable (help DMP too).
  - **`order-loggedin-list-reorder` — Re-Order All empty-cart bug ([CART-9124](https://goldenhippomedia.atlassian.net/browse/CART-9124), confirmed on prod 2026-07-20).** The spec auto-selects `firstReorderableCard()`; when that order contains **2× the exact same product**, Re-Order All returns an **empty cart** → `waitForCartLoaded` times out. This is a **real app bug (CART-9124)** that reproduces on **prod** — NOT a UAT seed-data quirk (the earlier 2026-06-17 diagnosis of "inaccurate Salesforce records, passes on prod" was WRONG; it fails on prod too). It's intermittent because it depends on which order gets auto-selected — a green run does NOT clear the bug. Re-Order All works for orders with **distinct** products (verified on Badlands, ORD-000860840: 2 products → cart populated + qty/price matched). NOT hacked to pass. (Option for a deterministic board: make card-selection skip orders with duplicate line items / whose Re-Order All yields an empty cart, with per-attempt cart cleanup.)
  - **Bucket B — RESOLVED (2026-06-17, all verified green on Badlands UAT):** (a) `cart-shipping-threshold` — Badlands is **free shipping on $49+** (a GUEST/logged-out rule; logged-in is always free). The test's "over-threshold" add was `loggedin_std_3`, which on Badlands is a **$19.99 treat** (Superfood Bites) — never cleared $49, so the app *correctly* charged $4.95. Fixed by using `loggedin_std_1` ($59.95 flagship) for the over-threshold case (brand-portable; DMP re-verified green). (b) `checkout-subscription-terms` — the CDN terms doc IS the intended Badlands destination; made brand-aware via **`brand.content.subscriptionTermsUrl`** (drmarty `subscription_terms`, badlands `badlandsranch-terms`). (c) `cart-terms-and-privacy-links` — the `/your-privacy-choices` page EXISTS + the footer link is correct (`<a href="/your-privacy-choices">`); the batch failure was a **transient popup/hydration flake** — passes in isolation, no change needed. (d) `cart-verify-fields-and-links` — Badlands cart `shipping-street` renders **line 1 only**; test relaxed to compare street line 1 (`split(',')[0]`).
  - **Bucket C — RESOLVED (2026-06-17):** header-dependent specs handled. `auth-empty-cart-login-redirect` **RESCUED (not skipped)** — broadened `HeaderPage.loginLink` to `a[href="/login"], a[href="/login/"]` (Badlands uses a trailing slash) + added a settle (dismiss popup + networkidle) after the header-link click to beat an Angular login-form re-mount race; passes green. The other two — `auth-login-logout-header-states` (needs the Builder account dropdown for logout) + `cart-verify-header-links` (Builder logo/nav, also redundant) — are `test.skip(brand.name === 'badlands')`, folded into the header `data-qa` ask above.
  - **BACKLOG — move hardcoded URL *patterns* into `brand.content` (brand-portability, next-brand prep).** Brand **content values** are already config-driven (coupon/CS/domain/free-shipping), but several redirect/URL **patterns** are still hardcoded in specs and had to be edited by hand for Badlands: PDP path (`/product/` vs `/p/` — now a `/(product|p)/` union in `order-loggedin-list-reorder`), the Subscription-Terms destination (`/subscription_terms` vs Badlands' CDN html — `checkout-subscription-terms`), and Privacy-Choices (`/your-privacy-choices` — `cart-terms-and-privacy-links`). To make the next brand a pure config add, promote these to `brand.content` (e.g. `pdpPathPattern`, `subscriptionTermsUrl`, `privacyChoicesPath`) with drmarty defaults, same pattern as the content-value migration. Similarly the PDP title selector could become a `brand`-level selector rather than a hardcoded union.
  - **STATUS UPDATE (2026-07-01 — two of three blockers RESOLVED; only the velocity rate-limit remains):**
    1. **✅ CF managed-challenge allow-list — RESOLVED on `uat.badlandsranch.com`.** A full **headless** 45-test batch bootstrapped Angular, logged in, and placed real CC orders (`ORD-000863088/093/094`). The 2026-06-17 "still 9× challenge-403s" symptom is gone. **TODO:** confirm the same skip-rule is on `badlandsranch.com` **prod** (6/29 launch date has passed).
    2. **✅ UAT backend instability — RESOLVED (no recurrence).** The headless batch ran end-to-end (36 passed) with no login `waitForURL` timeouts or "context closed" crashes. Backend is stable enough to trust headless results now.
    3. **⚠️ STILL OPEN — CF velocity rate-limit on the Badlands zone (DevOps).** The dense 45-test batch tripped it: `419 ← /proxy/funnel/stats/save/` (`cf-ray=a1480b8c5972cb83-LAX`) + `401 ← /account-service/proxy/auth/me` (`cf-ray=a1480b2978fbcb83-LAX`), which took down the 3 `@real-order` **PayPal** specs (the slowest tests, hit hardest at the tail of a batch) — one stuck on `/cart`, one popup-never-opened, one timeout at PayPal `#btnLogin`. **Proof it's the rate-limit and not code/PayPal-drift:** re-ran all 3 specs **individually, spaced out** → all green in 43–52s each with **zero cf-ray** (`ORD-000863114/115/119`). **The ask (same as the DMP rate-limit item above):** add a QA exception on the *rate-limit* rule (separate from the managed-challenge rule now fixed) for `uat.badlandsranch.com` + `badlandsranch.com`, keyed on the `DrMartyQA/<token>` UA (works on DMP) or a secret header — NOT IP — covering `*/commerce-service/proxy/{cart,tax}/*`, `*/account-service/proxy/*`, `*/payment-service/proxy/*`, and order-submit. **No repo change owed** — the specs and PayPal flow are healthy. **Interim mitigation:** don't run all `@real-order` PayPal specs inside one dense `npx playwright test tests` batch — run them isolated/spaced, or exclude `@real-order` from the big batch and run separately.
  - **Token-naming note (decision: keep as-is for now).** The `DrMartyQA/` UA prefix is a brand-agnostic shared QA marker (the "DrMarty" wording is historical). Renaming to e.g. `GoldenPetQA/` is a trivial 1-line edit in `playwright.config.js` BUT the string is matched by Cloudflare WAF rules on every zone, so a rename = a **coordinated cutover**: DevOps adds the new string to ALL zones (DMP UAT+prod, Badlands UAT+prod) → repo changes the prefix → DevOps removes the old string. Out of order, it breaks the currently-working DMP zones. **Do it later as a synced task if desired; not now (don't add moving parts mid-onboarding).**
  - **Findings from headed runs (keep — re-verify once UAT stable):** (a) ✅ **product variant IDs from `badlands-uat.csv` DO resolve on `uat.badlandsranch.com`** — a headed cart add/qty run loaded products (settles the staging→uat backend question). (b) ⚠️ `cart-shipping-threshold` returned shipping **$4.95** where free was expected — likely a Badlands free-shipping-threshold / price-tier difference vs DMP; investigate when the env is trustworthy.
  - **Heroku "prod-builder" env — clean headless, candidate INTERIM validation target.** `https://prod-ps-badlands-builder-21e6431f8e4b.herokuapp.com` (UAT is reportedly "based off" this build). Probed headless: login form renders ~1s, **0** CF challenges, ungated (NOT behind the badlandsranch CF zone) — so it dodges BOTH UAT blockers. ⚠️ **SAFETY UNCONFIRMED — do NOT run `@real-order` (or account/pets/reorder mutation) specs there until verified:** (1) Braintree **sandbox vs live** (it's "based off production" → could charge real cards — hard rule: UAT-sandbox only), (2) prod vs test **Salesforce** data, (3) which **variant IDs** it serves (prod or uat CSV). Until confirmed, only the **guest display/validation** specs (`checkout-header-display`, `checkout-form-validation`, `checkout-country-state`, cart link/popup checks) are safe there. Would need a new `site-config` env entry + matching CSV to wire in.
