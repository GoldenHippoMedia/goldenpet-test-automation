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
    trace: 'on-first-retry',
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
        // Override the device's default UA with our allow-listed QA UA (only when
        // QA_UA_TOKEN is set). Must be here, AFTER the device spread, since
        // devices['Desktop Chrome'] carries its own userAgent.
        ...(QA_USER_AGENT ? { userAgent: QA_USER_AGENT } : {}),
      },
    },
  ],
});
