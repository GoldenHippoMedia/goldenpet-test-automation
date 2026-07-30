# data-qa Attributes Rollout — Prepurchase Brand Apps

Working notes for adding `data-qa` attributes to offer-selector (OS) pages using the
`gpet-prepurchase` Claude Code plugin. Run once per brand. Current ticket: **BR-26**
(https://goldenhippomedia.atlassian.net/browse/BR-26). Current brand: **badlands-prepurchase**.

The one rule: **the plugin adds the attributes.** When it misses some, fix the plugin's
catalog — don't hand-patch the page. That's what makes every future page, on every brand,
get covered automatically.

**Overwriting existing `data-qa` values is authorized.** If a page already has a `data-qa`
attribute that doesn't match the catalog contract, Claude + the plugin may overwrite it.
The team confirmed this on 2026-07-28 — QA attributes are for internal Playwright testing,
so consistency with the catalog takes priority over preserving ad-hoc prior values.

> This is a living document — updated as we hit gotchas or make progress, so the next
> person (or the next brand) doesn't rediscover the same thing. Treat the "Known gotcha"
> notes and the status table at the bottom as current, not historical.

---

## Step 1 — Create a ticket branch off UAT

`UAT` is shared staging — never work directly on it.

```bash
cd /Users/scottlangdon/golden-pet/<brand-repo>
git status --porcelain          # confirm clean before switching
git checkout UAT && git pull && git checkout -b <TICKET-ID>-data-qa-<product-line>
```

Example used for badlands: `BR-26-data-qa-badlands` (already created).

**Known gotcha:** the plugin's `qa-bootstrap` skill pre-flight pattern-matches the branch
name against `DEV-\d+` or `FUN-\d+`. A ticket ID that doesn't match that shape (e.g. `BR-26`)
may get refused at Step 4 below even though the branch is legitimate. Flag this to dev if hit.

---

## Step 2 — Enable the plugin in the repo (one time per brand)

```bash
cd /Users/scottlangdon/golden-pet/pet-ai-agents-config
./scripts/install-gpet-plugins.sh --dry-run
./scripts/install-gpet-plugins.sh --yes
```

**Known gotcha:** the script prompts interactively ("Proceed? [y/N]"). In a non-interactive
shell (no stdin, e.g. an agent-driven terminal) that prompt can't be answered and the script
aborts with exit code 1 and no visible error. Use `--yes` to skip the prompt once you've
already reviewed the `--dry-run` output — don't use `--yes` blind, review the dry run first.

There's also a harmless cosmetic bug at the very end of the script's "Next steps" output
(`Error: Input must be provided either through stdin or as a prompt argument when using
--print`) — it's a broken `claude --print` call inside the script's own closing message, not
a failure of the actual install. Ignore it; check `.claude/settings.json` directly to confirm
success (see below) rather than trusting the script's final banner.

**Critical: plugin enablement only takes effect in a brand-new Claude Code session.** If
you're running Step 2 from inside a session that was already open, that session will NOT see
the new commands — you must start a fresh session in the brand repo afterward.

Verify it took:

```bash
cd /Users/scottlangdon/golden-pet/<brand-repo>
cat .claude/settings.json          # look for gpet-global@gpb, gpet-prepurchase@gpb
```

Then start a **fresh Claude Code session** inside the brand repo (plugin enablement only
takes effect on a new session) and confirm:

```bash
qa-catalog.sh list-types
```

Should print: `offer-selectors`, `coupons`, `surveys`, `video-pages`, `prelanders`.

**Known gotcha:** `qa-catalog.sh` is only on PATH *inside a Claude Code session* — the
plugin's `bin/` directory is added to PATH for Claude's own tool execution while the plugin
is enabled. It is **not** added to your regular shell's PATH. Running `qa-catalog.sh
list-types` directly in a plain terminal (zsh/bash prompt, not inside `claude`) will always
fail with `command not found`, even when everything is set up correctly. To verify: `cd` into
the brand repo, run `claude` to start a session, then have Claude run the command via its
Bash tool from inside that session.

**Known gotcha — don't nest Claude sessions.** Inside an already-open `claude` session, just
type `run qa-catalog.sh list-types` as a plain message. Do NOT pipe it through a nested
subprocess (e.g. `echo "..." | claude --print`) — that spins up a second, separate Claude
process and adds a layer of confusion on top of the real issue below.

**Confirmed real gotcha (not just nesting) — `qa-catalog.sh` is NOT reliably on PATH inside
a plain Bash tool call, even in a session where the plugin is genuinely enabled.** Tested
directly (no nesting): `claude plugin list` showed `gpet-global@gpb` /
`gpet-prepurchase@gpb` both `Status: ✔ enabled, Scope: user`, and the script file itself is
confirmed present and executable on disk — but a bare `qa-catalog.sh list-types` call still
returned `command not found: qa-catalog.sh` (exit 127). Invoking the exact same script by its
full path worked immediately and returned correct output. This contradicts the plugin docs'
claim that plugin `bin/` dirs are on PATH for the whole session — in practice PATH
augmentation appears NOT to reach ordinary Bash tool calls consistently in this Claude Code
version (2.1.85), even though it's what every gpet-* skill/agent assumes when it writes bare
`qa-catalog.sh ...` commands.

**Workaround (use whenever a slash command like `/gpet-prepurchase:qa-audit`,
`/gpet-prepurchase:qa-bootstrap`, or `/gpet-prepurchase:qa-attributes-rollout` reports
`qa-catalog.sh: command not found`):** have Claude resolve
the full path once and use that instead of the bare command:

```bash
find ~/.claude/plugins -name qa-catalog.sh
# → e.g. ~/.claude/plugins/marketplaces/gpb/gpet-global/bin/qa-catalog.sh
#        ~/.claude/plugins/cache/gpb/gpet-global/<version>/bin/qa-catalog.sh
```

Either resolved path works. Claude has self-corrected this way once already without being
told — if a skill run stalls on this error, just prompt it to look up the full path and
retry.

**This is worth reporting to whoever maintains `pet-ai-agents-config`** — every gpet-global /
gpet-prepurchase skill, agent, and hook body is written assuming bare `qa-catalog.sh`
resolves via PATH. If that assumption is unreliable in practice, it's a plugin-level gap, not
something specific to badlands or this machine.

**Quick verification commands, if this comes up again:**

```bash
claude plugin list                 # look for gpet-global@gpb / gpet-prepurchase@gpb, Status: ✔ enabled
find ~/.claude/plugins/cache -iname "qa-catalog.sh"   # confirms the file physically exists
```

**Correction — `/gpet-prepurchase:qa-bootstrap` does NOT create `qa-catalog.sh`.** That
script ships inside the `gpet-global` plugin itself; bootstrap only scaffolds brand-specific
files (ESLint plugin, `docs/qa-attributes.md`, Playwright spec template) that *depend on*
`qa-catalog.sh` already working. If a session says `qa-catalog.sh` is missing and suggests
running bootstrap to create it, that diagnosis is wrong — stop and verify the plugin install
first instead.

**Known gotcha — commands need the plugin namespace prefix.** A bare `/qa-audit` (or
`/qa-bootstrap`, `/qa-attributes-rollout`) fails with `Unknown skill: qa-audit`. The plugin
is named `gpet-prepurchase` (per its `plugin.json`), so the command must be prefixed:
`/gpet-prepurchase:qa-audit`, `/gpet-prepurchase:qa-bootstrap`,
`/gpet-prepurchase:qa-attributes-rollout`. Every reference in this doc below uses the
namespaced form — use that, not the short form.

---

## Step 3 — Audit (read-only, changes nothing)

```
/gpet-prepurchase:qa-audit offer-selectors <product-line>
```

Per-page report of missing required `data-qa` attributes, plus which buy buttons already
carry an `id=` that must be preserved.

---

## Step 4 — Bootstrap (one time per brand)

```
/gpet-prepurchase:qa-bootstrap
```
```bash
# Check packageManager field in package.json first — use the brand's own package manager.
# e.g. if it says "pnpm@11.1.1" → run `pnpm install` (not npm install).
# Running npm install on a pnpm-pinned repo creates a competing lockfile.
npm install   # or pnpm install / yarn, depending on packageManager in package.json
```

Adds the lint rule, `docs/qa-attributes.md` tracker, and a Playwright spec template.

**Known gotcha (badlands):** `qa-bootstrap`'s pre-flight hard-requires
`src/app/shared-components/option-selectors/`, which badlands doesn't have — it will refuse
to run until this check is made brand-aware or the catalog is extended first.

---

## Step 5 — Rollout — this is the step that adds the attributes

```
/gpet-prepurchase:qa-attributes-rollout offer-selectors <product-line> --limit 50
```

**This is a loop, not a single run.** `--limit 50` caps the batch; resume with `--since <last-batch-commit>` or `--variants <id,id,...>` until all variants are exhausted.

**The argument is a product-line folder, not a repo.** One repo can hold several product lines (e.g. Dr. Marty: `email-sms`, `drmarty`, `naturesblend`, `natures-feast`, `natures-blend-ecomm`, `dental-chews`). Run one invocation per product-line folder, not one per repo.

---

## Step 5b — Shared-component flag (stop, don't patch)

If the rollout outputs a P1 shared-component finding instead of patching the file, **that is intentional behaviour, not a failure.** The rollout skill never edits shared-component files itself — it flags them so they can be fixed in a separate PR (shared-component changes cross every brand and need their own review).

When this happens:
1. Note which shared-component file was flagged (e.g. `frequency-selector.component.html`).
2. A developer (not QA) adds the contracted `data-qa` values to that file directly and opens a **separate PR** against UAT.
3. Once that PR merges, re-run Step 5 — pages that delegate to that component will now inherit the attribute automatically.

---

## Step 6 — Verify

- Re-run `/gpet-prepurchase:qa-audit`
- `npm run lint` → expect zero errors
- Open a page in a browser, inspect the element, confirm the `data-qa` is really in the DOM
- **Uniqueness check (manual for now):** confirm each `data-qa` value matches exactly one element per page. Audit and lint only verify attributes are *present* — a value that matches two elements passes both checks and only fails when a real Playwright test runs. Watch especially for pages that render both a desktop and a mobile selector simultaneously (CSS-hidden, both in the DOM) — they double-match every core value. **When you find a double-match the fix is a code change — remove the hidden element from the DOM rather than using CSS to hide it.** The team decided (2026-07-28) to treat CSS-hiding-instead-of-removing as a performance issue and handle it at the code level; adding duplicate QA attributes to work around it is not the solution. No automated uniqueness spec exists yet; check manually until one does.

→ Clean? Go to Step 8. Missing something? Go to Step 7.

---

## Step 7 — Fix the plugin catalog (loop back to Step 5 after)

Do **not** hand-edit the page. Update the shared catalog instead:

```
Repo: pet-ai-agents-config
File: gpet-global/data/qa-page-types.json
```

**Catalog PR process (confirmed 2026-07-28):** you provide the attribute spec (what values, which component file, which element) → Luiz creates the PR against `pet-ai-agents-config` → Juanga reviews. Don't open the PR yourself — send Luiz the spec and evidence (branch + plugin output logs if the plugin was misbehaving).

**Before requesting a new catalog entry for a "brand-specific" feature:** check whether hartfelt, badlands, or another brand already has an established standard for the same pattern. If it exists elsewhere, update the brand to conform to that standard rather than asking Luiz to add a new catalog entry for an outlier. New entries are only warranted for features that are genuinely unique to one brand with no analog in any other repo.

Then re-run Step 5 on the affected pages. Loop Step 5 ⇄ Step 7 until Step 6 is clean.

**If the catalog change also touches bootstrap config** (ESLint globs, `sharedComponents` keys) loop back to **Step 4** (re-run bootstrap + re-install), not Step 5 — the lint rule needs to be re-scaffolded before the rollout will pick up the new shape.

**Badlands-specific catalog gap already identified:** OS pages are thin wrappers around one
of ~12 shared `offer-selector-vN` components (v9=296 pages, v2=72, v18=58, v16=40, v15=38,
v13=34, v14=34, v10=16, v21=8, v3=2, v20=2, v23=2) rather than hartfelt's separate
option-selector/frequency-selector pattern. The catalog needs entries for these ~12
components before rollout can cover badlands. Tag each shared file once — every page using
that version inherits it. Page-level leftovers (e.g. sticky "Claim Offer" buttons) still need
per-page tagging.

---

## Step 8 — Commit, push, open PR

```bash
git add -p                          # stage only the data-qa changes (avoid accidental lockfile etc.)
git commit -m "<TICKET-ID> data-qa: <product-line> offer-selectors batch N"
git push -u origin HEAD
# open PR against UAT (not main)
gh pr create --base UAT --title "<TICKET-ID> data-qa <product-line> OS batch N"
```

One PR per batch (≤ 50 variants). Keep shared-component fixes in a separate PR — see Step 5b.

---

## Step 9 — Done

New OS pages on this brand are now caught automatically:
- Rule reminder when a template is opened
- "You're missing X" nudge when it's saved
- Lint blocks the commit
- Code review catches the rest

---

## Definition of Done (per brand)

- [ ] `/gpet-prepurchase:qa-audit` reports zero missing required attributes
- [ ] `npm run lint` passes with zero errors
- [ ] All pre-existing buy-button `id=` values still intact
- [ ] A Playwright spec finds the selectors in a real browser
- [ ] `docs/qa-attributes.md` updated
- [ ] Plugin catalog updated so new pages — this brand and future ones with the same shape —
      are covered going forward

## Audit results (badlands, 2026-07-27)

Ran `/gpet-prepurchase:qa-audit offer-selectors`. Full output is in the session history; key
findings that change what "next step" actually means:

- **313 OS pages audited, 0 fully covered.** Expected — nothing's been rolled out yet.
- **No `id=` values on any buy button anywhere.** Good news: the highest-risk failure mode
  from hartfelt's history (stripping an `id=` that GTM/VWO depend on) doesn't apply to
  badlands. Nothing to preserve here.
- **`option-selector.component.html`, `option-selector-v2.component.html`,
  `faqs.component.html` — confirmed absent from this repo**, matching the manual finding
  above. Not a bug in the audit; badlands genuinely doesn't have these files.
- **`frequency-selector.component.html`, `page-footer.component.html`,
  `sticky-banner-price-selector/sticky-banner.component.html` — these DO exist, but carry
  zero `data-qa` values.** Real, fixable gaps.

**Important — `/gpet-prepurchase:qa-attributes-rollout` will NOT fix most of this if run
next, despite that being the auditor's own suggested next step.** The rollout skill has an
explicit rule against editing shared-component files itself (it only flags them as P1
findings for a separate PR — by design, since shared-component changes cross every brand).
So it can't touch `frequency-selector` / `page-footer` / `sticky-banner`, and it can't locate
the primary buy-button attribute at all, since that element doesn't live in the page
template — it's inside whichever `offer-selector-vN` shared component the page uses, which
the catalog doesn't model yet.

**Actual next step is two separate pieces of work, done directly (not via rollout):**

1. **Badlands PR (dev, direct edit):** add the correct `data-qa` values to the 3 shared
   components that exist today — `frequency-selector`, `page-footer`,
   `sticky-banner-price-selector/sticky-banner`.
2. **Catalog PR on `pet-ai-agents-config`:** add entries describing badlands' ~12
   `offer-selector-vN` components (see the table further up) so the tooling knows where the
   buy button, quantity options, and frequency toggle actually live.

Only after both land does `/gpet-prepurchase:qa-attributes-rollout` have anything correct to
work with.

## Correction to the audit results above (2026-07-27, later same day)

**The "0 ids to preserve" finding from `/gpet-prepurchase:qa-audit` is wrong.** The auditor
only checks `os.component.html`, and badlands' buy button doesn't live there — it's inside
whichever `offer-selector-vN` shared component the page uses. Checking those directly: **12
of the 15 active `offer-selector-vN` components have a buy-button `id=`** that must be
preserved (`offerSelectorV9__button`, `V2`, `V3`, `V10`, `V11`, `V15`, `V16`, `V17`, `V18`,
`V19`, `V20`, `V23` — `V13`, `V14`, `V21` currently have none). This is the exact GTM/VWO
failure mode from hartfelt's history (commit `0c59820`). **Do not trust the auditor's id-
preservation finding on this brand until it's fixed to follow the delegate hop** — see the
catalog request doc below, finding F3.

Also corrected: there are **15 `offer-selector-vN` versions in active use**, not 12 —
`v11`, `v17`, `v19` were missed by the first grep (each used by exactly 1 page). `v12` and
`v22` exist on disk but are referenced by zero pages — dead code.

## Catalog change request sent to Luiz (2026-07-27)

Wrote `~/Downloads/qa-catalog-request-offer-selectors-badlands.md`, mirroring the format
Patrick (QA, working DMP in parallel) used for his own catalog request, since Luiz responded
well to that format. Cross-references
[DMP-1537](https://goldenhippomedia.atlassian.net/browse/DMP-1537) — badlands independently
hit the *same* two structural blockers DMP did (the delegate-hop architecture, and "who tags
shared components that have never shipped the contract"), plus the *same* PATH defect
(bare `qa-catalog.sh` / hook scripts not resolving) that Patrick found from a different angle.
Recommends Luiz fix these generally, once, rather than patching per-brand — since a
DMP-only fix would leave badlands (and the next brand) hitting the identical wall again.

**Action:** attach/paste this file into BR-26, and add a link between BR-26 and DMP-1537 so
whoever picks up the catalog work sees both brands' evidence.

## Brand rollout order

| Brand | Status |
|---|---|
| badlands-prepurchase | In progress — branch `BR-26-data-qa-badlands`; plugin enabled and verified; `/gpet-prepurchase:qa-audit` run 2026-07-27, confirms 0/313 covered. See "Audit results (badlands, 2026-07-27)" below for what's actually blocking the rollout. |
| drmarty-prepurchase | Not started |
| hartfelt-prepurchase | Phased out — disregard as a target, but its finished work is a useful reference |
