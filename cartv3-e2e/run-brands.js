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
  const res = spawnSync('npx', ['playwright', 'test', ...playwrightArgs], {
    stdio: 'inherit',
    env: { ...process.env, BRAND: brand, ENVIRONMENT: environment },
  });
  results.push({ brand, code: res.status == null ? 1 : res.status });
}

console.log('\n═══ run-brands summary ═══');
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓ PASS' : '✗ FAIL'}  ${r.brand} (${environment})`);
}
process.exit(results.every((r) => r.code === 0) ? 0 : 1);
