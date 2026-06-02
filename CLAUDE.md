# goldenpet-test-automation — Project Context for Claude

This repo is a **multi-tool test automation monorepo**. Each tool / test suite
lives in its own self-contained top-level folder with its own `package.json`,
`playwright.config.js` (or equivalent), `pages/`, `fixtures/`, `helpers/`,
`data/`, `tests/`, and `.env`. The repo root itself holds only `.gitignore`
and the per-tool folders — there are no shared `pages/`, `fixtures/`, etc. at
the root.

This file is a lean "router" for the repo. For detailed project context,
read the CLAUDE.md inside whichever tool folder you're working in.

---

## Tools in this repo

- **`cartv3-e2e/`** — Playwright E2E tests for the CartV3 single-stack
  e-commerce platform (Dr. Marty Pets, future Badlands Ranch). Migrated from
  Ghost Inspector. Brand-aware via `BRAND` and `ENVIRONMENT` env vars. Full
  context, gotchas, migration status, and selector reference in
  [`cartv3-e2e/CLAUDE.md`](./cartv3-e2e/CLAUDE.md).

- **`playwright-funnel-tests-tracker/`** — QA tracking docs for Playwright funnel E2E specs across brands. Each brand has its own subfolder (e.g. `hartfelt-prepurchase/`). Contains `os-tests.md` and other spec trackers documenting what's covered, TODO, and known issues.

Future tools (e.g. `cartv3-unit/`, `api-tests/`, `badlands-e2e/`) will live as
**siblings** here, NOT inside `cartv3-e2e/`. Each new tool gets its own
folder, its own dependencies, its own config, and its own CLAUDE.md.

---

## How to work in a specific tool

`cd` into the tool's folder before running any commands — its `package.json`,
config, and `.env` all live there:

```
cd cartv3-e2e
npm run cartv3:cart:paypal:uat
```

The tool's own CLAUDE.md auto-loads from that directory with its specific
conventions, gotchas, and migration status.

---

## Repo-wide conventions

- **`.gitignore` at the repo root** covers `node_modules/`,
  `playwright-report/`, `test-results/`, and `.env` across all tools. New
  tools don't need their own.
- **CommonJS only** — `.js` files using `require()` and `module.exports`.
  No TypeScript, no ESM, in any tool. This is intentional.
- **Each tool is self-contained** — never share `pages/`, `fixtures/`, or
  `helpers/` across tool folders via relative paths (`../../other-tool/...`).
  If shared code is genuinely needed across two tools, extract to a
  separately published package rather than reaching across folders.
- **Branch / PR workflow** — work happens on feature branches (`feature/...`
  or `chore/...`); merge to `main` when verified. Solo workflows can use
  local fast-forward merges; multi-contributor work should go through a PR.

---

## When adding a new tool

1. Create a new top-level folder at the repo root (e.g. `mkdir api-tests`).
2. Set it up self-contained: its own `package.json`, config, deps, folders.
3. Add a `CLAUDE.md` inside it documenting that tool's specifics.
4. Add an entry under "Tools in this repo" above so it's discoverable from
   the root.
5. The root `.gitignore` already covers the common ignored patterns; no
   change needed unless the tool has special-case ignores.
