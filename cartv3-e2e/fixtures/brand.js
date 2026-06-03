const { test: base, expect } = require('@playwright/test');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const brand = process.env.BRAND || 'drmarty';
const env = process.env.ENVIRONMENT || 'uat';

// Load site config (URLs, paths, content)
const siteConfig = require('../data/site-config.json');
const brandConfig = siteConfig.brands[brand];

if (!brandConfig) {
  throw new Error(`Brand "${brand}" not found in site-config.json. Available: ${Object.keys(siteConfig.brands).join(', ')}`);
}

const envUrls = brandConfig.urls[env];

if (!envUrls) {
  throw new Error(`Environment "${env}" not found for brand "${brand}". Available: ${Object.keys(brandConfig.urls).join(', ')}`);
}

// Load product/test data from CSV (same format as the Ghost Inspector data source)
// Columns: domain, subdomain, cart_domain, loggedin_std_1, loggedin_std_2, ...
const productsCsvPath = path.join(__dirname, '..', 'data', 'products', `${brand}-${env}.csv`);
let testProducts = {};
if (fs.existsSync(productsCsvPath)) {
  const csvContent = fs.readFileSync(productsCsvPath, 'utf-8');
  const rows = parse(csvContent, { columns: true, skip_empty_lines: true });
  if (rows.length > 0) {
    testProducts = rows[0]; // Single-row CSV — all columns become key-value pairs
  }
}

/**
 * Custom Playwright fixture that provides brand-specific data to every test.
 *
 * Usage in tests:
 *   const { test, expect } = require('../fixtures/brand');
 *   test('my test', async ({ page, brand }) => {
 *     await page.goto(brand.url('login'));
 *     console.log(brand.content.shopHeading);
 *     console.log(brand.testProducts.loggedin_std_1); // Salesforce variant ID
 *   });
 *
 * Test product data comes from CSV files in data/products/ that mirror the
 * Ghost Inspector data source format. Column names map directly:
 *   loggedin_std_1  — standard product variant for logged-in user
 *   loggedin_sub_1  — subscription variant (includes &isSubscription=true&frequency=1)
 *   loggedout_std_1 — standard product variant for logged-out user
 *   loggedout_add_shipping_fee — product under $50 that triggers shipping fee
 *
 * To add a new brand: create data/products/{brand}-{env}.csv with the same columns.
 */
const test = base.extend({
  // Override the context to inject stealth script before any page JS runs.
  // This hides navigator.webdriver which bot detection services check.
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await use(context);
  },

  brand: [async ({}, use) => {
    const brandUpper = brand.toUpperCase().replace(/-/g, '_');
    const email = process.env[`${brandUpper}_TEST_EMAIL`];
    const password = process.env[`${brandUpper}_TEST_PASSWORD`];

    // Load product catalog from CSV (if exists)
    const csvPath = path.join(__dirname, '..', 'data', `${brand}-${env}.csv`);
    let products = [];
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      products = parse(csvContent, { columns: true, skip_empty_lines: true });
    }

    await use({
      name: brand,
      displayName: brandConfig.displayName,
      logoAltText: brandConfig.logoAltText,
      storeLocatorUrl: brandConfig.storeLocatorUrl,
      env,
      baseUrl: envUrls.base,
      paths: envUrls,
      content: brandConfig.content || {},
      testAddress: brandConfig.testAddress || {},
      testCard: siteConfig.testCards?.[env] || {},
      // Distinct card used only by the Manage Payments "Add Credit Card" test.
      // last-4 "4242" is intentionally NOT one of the cards already saved on the
      // shared test account (which are all 4111/0005), so the newly-added row is
      // uniquely identifiable for assertion and cleanup.
      addCardTestCard: siteConfig.addCardTestCards?.[env] || {},
      // Per-environment Salesforce account ID for the test user. Used by tests that
      // exercise account-scoped APIs (e.g. /pets API setup/teardown). Override in
      // .env with e.g. DRMARTY_UAT_ACCOUNT_ID=... if the shared test account changes.
      testAccountId: process.env[`${brand.toUpperCase().replace(/-/g, '_')}_${env.toUpperCase()}_ACCOUNT_ID`]
        || brandConfig.testAccountIds?.[env]
        || null,
      email,
      password,
      products,
      testProducts,

      // brand.url('login') => 'https://drmartypets.com/login'
      url: (key) => envUrls.base + envUrls[key],

      // brand.cartUrl('loggedin_std_1') => 'https://drmartypets.com/cart?product1=a0N3w...'
      // Uses the exact column names from the GI data source CSV.
      cartUrl: (productKey) => {
        const variantId = testProducts[productKey];
        if (!variantId) {
          throw new Error(`Product key "${productKey}" not found in ${brand}-${env}.csv. Available: ${Object.keys(testProducts).join(', ')}`);
        }
        return `${envUrls.base}/cart?product1=${variantId}`;
      },
    });
  }, { scope: 'worker' }],
});

module.exports = { test, expect };
