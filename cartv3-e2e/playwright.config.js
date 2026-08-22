// @ts-check
const { defineConfig, devices } = require('@playwright/test');

require('dotenv').config();

// Cloudflare bot-protection bypass for QA automation.
// DevOps adds a WAF rule that SKIPS bot management when the User-Agent contains our
// unique token, so the suite isn't challenged (works on any IP — incl. IPv6/dynamic —
// and headless/CI). The token is a shared secret kept ONLY in .env (gitignored),
// never committed. When QA_UA_TOKEN is unset, behavior is unchanged (default Chrome UA).
//   .env:   QA_UA_TOKEN=<token DevOps allow-lists>
//   Rule:   "User-Agent contains DrMartyQA/<token>"
const QA_UA_TOKEN = process.env.QA_UA_TOKEN;
const QA_USER_AGENT = QA_UA_TOKEN
  ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 DrMartyQA/${QA_UA_TOKEN}`
  : undefined;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  // The a11y lane has its OWN config (playwright.a11y.config.js) — different default env
  // (prod), two viewport projects, and parallel workers. Without this ignore, `testMatch`
  // would sweep tests/a11y/ into every functional run (incl. cartv3:uat / cartv3:prod,
  // which only filter on the @real-order tag) and they'd execute with the wrong config.
  testIgnore: '**/a11y/**',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  use: {
    // Headless is the default — the QA_UA_TOKEN UA allow-list (below) clears Cloudflare
    // bot protection in headless on BOTH UAT and prod (verified 2026-06-17: cart
    // commerce-service APIs return 200 headless, no cf-mitigated/403/429). To WATCH a
    // run in a real browser window, set HEADED=1 (or pass --headed, which also wins).
    headless: !process.env.HEADED,

    // --- Per-action / per-navigation ceilings (added 2026-08-19) ---
    // Playwright defaults BOTH of these to 0 = NO TIMEOUT, so any un-timed click(),
    // waitFor() or fill() is bounded only by the test timeout. That is why a missing
    // element produced 90s (or 270s with test.slow()) of silence and then an unhelpful
    // "Test timeout exceeded" naming whatever call happened to be in flight, instead of a
    // fast, specific locator error. Four separate "hangs" chased this session were all
    // this: header shopLink.click, the login submit click, account-main-page-links'
    // manageSubscriptionsBtn.waitFor, and cart-verify-header-links.
    //
    // An EXPLICIT timeout in code always wins over these, so anything already tuned
    // (waitForCartLoaded's 30s, the upsell-spinner 15s, the PayPal popup 20s) is unchanged.
    // Raise a specific call's timeout rather than these ceilings if something legitimately
    // needs longer.
    actionTimeout: 20000,
    navigationTimeout: 45000,

    // 'on-first-retry' captured NOTHING, because retries: 0 — there is never a first retry.
    // retain-on-failure gives every failure a full trace (timeline, DOM snapshots, network),
    // which is what makes a hang or a wrong-page failure self-diagnosing:
    //   npx playwright show-trace test-results/<brand>/<test>/trace.zip
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
      // Slow-motion for watching a run: set SLOWMO=<ms> to pause between each action
      // (e.g. SLOWMO=800). Defaults to 0 (no delay) so normal/CI runs are unaffected.
      slowMo: Number(process.env.SLOWMO) || 0,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Run FULL Chromium in "new headless" mode instead of Playwright's default
        // headless-shell binary. The shell is a stripped build with a visibly different
        // fingerprint (no `window.chrome`, different Sec-CH-UA, no GPU stack), which
        // third-party SDKs fingerprint on. PayPal was the proof: its button rendered and
        // its SDK loaded fine, but it silently refused to launch the checkout popup —
        // 3/3 pass headed, 1/3 headless, with no order-creation call in the trace
        // (2026-08-19). New headless is far closer to headed, so the suite stays fully
        // headless rather than needing a headed-only lane.
        // Needs the full Chromium binary: `npx playwright install chromium`.
        channel: 'chromium',
        // Override the device's default UA with our allow-listed QA UA (only when
        // QA_UA_TOKEN is set). Must be here, AFTER the device spread, since
        // devices['Desktop Chrome'] carries its own userAgent.
        ...(QA_USER_AGENT ? { userAgent: QA_USER_AGENT } : {}),
      },
    },
  ],
});
