#!/usr/bin/env node
/**
 * Run the same Playwright spec(s) across multiple brands, sequentially.
 *
 * The brand fixture (fixtures/brand.js) reads process.env.BRAND ONCE at module load, so
 * a single `playwright test` run is locked to one brand. This wrapper spawns one run per
 * brand, one after another, so you can exercise DMP + BLR (or any list) in a single
 * command. It does NOT run brands in parallel — each brand's run finishes before the next
 * starts (cleaner logs, and the suite is workers:1 anyway).
 *
 * Usage (BRANDS + ENVIRONMENT are env vars; everything after `--` is passed to Playwright):
 *   BRANDS=drmarty,badlands ENVIRONMENT=uat node run-brands.js tests/subscription-*.spec.js
 *   HEADED=1 BRANDS=drmarty,badlands ENVIRONMENT=uat node run-brands.js tests/subscription-update-quantity.spec.js
 *   npm run cartv3:multi -- tests/subscription-*.spec.js      (BRANDS/ENVIRONMENT via env)
 *
 * Defaults: BRANDS=drmarty,badlands  ENVIRONMENT=uat.
 * HEADED / SLOWMO / QA_UA_TOKEN etc. are inherited from the environment as-is.
 *
 * Exit code: 0 only if EVERY brand passed; otherwise 1 (after running them all, so one
 * brand's failure doesn't hide another's).
 */

const { spawnSync } = require('child_process');

const brands = (process.env.BRANDS || 'drmarty,badlands')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);
const environment = process.env.ENVIRONMENT || 'uat';
const playwrightArgs = process.argv.slice(2); // e.g. ["tests/subscription-*.spec.js", "--headed"]

if (!brands.length) {
  console.error('run-brands: no brands. Set BRANDS=drmarty,badlands (comma-separated).');
  process.exit(2);
}

console.log(`\nrun-brands: brands=[${brands.join(', ')}] env=${environment} args=[${playwrightArgs.join(' ')}]\n`);

const results = [];
for (const brand of brands) {
  console.log(`\n─── ${brand} (${environment}) ───`);

  // Per-brand artifact dirs. Without these, brand 2 overwrites brand 1's HTML report AND
  // its test-results/ (screenshots + error-context.md), so a multi-brand run left you
  // unable to debug any brand but the last.
  const htmlDir = `playwright-report/${brand}`;
  const outDir = `test-results/${brand}`;
  const args = ['playwright', 'test', ...playwrightArgs];
  if (!playwrightArgs.some((a) => a.startsWith('--output'))) args.push(`--output=${outDir}`);

  const res = spawnSync('npx', args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      BRAND: brand,
      ENVIRONMENT: environment,
      // The html reporter defaults to open:'on-failure', which starts a report server and
      // BLOCKS until Ctrl+C. Under spawnSync that hangs this wrapper on the first brand
      // that has a failure, and the Ctrl+C needed to escape kills the whole run — so the
      // remaining brands silently never execute. (Bit us on drmarty→badlands, UAT and prod,
      // 2026-08-19.) Suppress it here only; single-brand `npx playwright test` runs keep
      // auto-opening the report as before. Both var names set — modern + legacy.
      PLAYWRIGHT_HTML_OPEN: 'never',
      PW_TEST_HTML_REPORT_OPEN: 'never',
      PLAYWRIGHT_HTML_OUTPUT_DIR: htmlDir,
      PLAYWRIGHT_HTML_REPORT: htmlDir,
    },
  });
  results.push({ brand, code: res.status == null ? 1 : res.status, htmlDir });
}

console.log('\n═══ run-brands summary ═══');
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓ PASS' : '✗ FAIL'}  ${r.brand} (${environment})`);
}
console.log('\n  reports:');
for (const r of results) {
  console.log(`    ${r.brand}: npx playwright show-report ${r.htmlDir}`);
}
process.exit(results.every((r) => r.code === 0) ? 0 : 1);
