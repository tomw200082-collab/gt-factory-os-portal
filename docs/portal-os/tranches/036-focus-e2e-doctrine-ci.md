# Tranche 036: focus-e2e + doctrine-reanchor + e2e-ci-gate

status: landed-pending-review
created: 2026-05-30
activated: 2026-05-30
landed: 2026-05-30
scorecard_target_category: flow_continuity
expected_delta: +1 flow_continuity, +1 regression_resistance
sizing: M

## Why this tranche
Closes the three follow-ups in one verified pass:
- **A** — verify the focus-mode close loop end-to-end. A live-backend smoke needs
  production access (out of this environment), so the strongest deterministic
  equivalent: a route-mocked Playwright e2e that drives approve → place → advance
  and asserts the created PO + auto-advance.
- **B** — re-anchor the 5 obsolete items-bom-display-only doctrine guards to the
  CURRENT architecture (item create-form migrated to /admin/products; BOM created
  via separate endpoints; product detail shows BOM read-only).
- **C** — gate the deterministic e2e in CI without breaking on the backend-
  dependent `*-real` specs (a separate Playwright "mocked" project + a scoped CI
  step).

## Scope
- `tests/e2e/procurement-focus.spec.ts` — route-mocked focus-mode walk-through.
- `playwright.config.ts` — a "mocked" project (grep-tagged) the CI runs.
- `.github/workflows/portal-pr-guard.yml` — install chromium + run the mocked e2e.
- `tests/unit/admin/items-bom-display-only.test.ts` — replace the 5 skips with
  correct current-architecture guards (items list has no BOM bindings; products
  wizard does not bind BOM fields; product detail renders BOM read-only).

## Manifest (files that may be touched)
manifest:
  - tests/e2e/procurement-focus.spec.ts
  - tests/unit/admin/items-bom-display-only.test.ts
  - playwright.config.ts
  - .github/workflows/portal-pr-guard.yml
  - package.json

## Revive directives (if any)
revive: []

## Out-of-scope
- Live production backend smoke (no access from this environment — flagged).
- Enabling the backend-dependent `*-real` e2e in CI (needs Supabase).
- ESLint in CI (no config yet; separate tranche).

## Tests / verification
- typecheck + full vitest green (incl. re-anchored doctrine tests).
- the mocked focus e2e passes locally (chromium).
- production build clean.

## Exit evidence
- one combined verification run + PR link.

## Rollback
Revert the PR; additive e2e + CI step + test rewrite.

## Operator approval
- [ ] Tom approves (comment `@claude /portal-tranche-fix 036`)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-30. One combined verification run, all green:
- typecheck → exit 0.
- full vitest → **371 passed · 0 skipped** (52 files) — incl. the re-anchored
  doctrine tests (the 5 obsolete skips are now 5 real passing guards).
- production build → clean (117 static pages).
- `@mocked` focus e2e → **1 passed** (verified locally on chromium via the
  env-gated `PW_CHROME_PATH` escape hatch; ran in ~7s on a fresh dev server).

**A — focus close loop, end-to-end:** `tests/e2e/procurement-focus.spec.ts`
stubs the purchase-session API at the browser and drives the real UI through
approve → order document appears → place → PO created → auto-advance →
completion. (A *live* production-backend smoke still needs a real environment —
out of scope here; this is the deterministic CI-runnable equivalent.)

**B — doctrine re-anchored:** the obsolete items-page anchors (`itemSchema` /
`BOM_DISPLAY_ONLY` / `bom-wiring-readonly` / create null-seed) are replaced by
correct guards on the current architecture: the items page stays binding-free
(existing guards), the create-product wizard never binds the 3 BOM fields, and
the product detail renders the BOM read-only (link to /admin/boms, no
register/onChange). items-bom-display-only is now 12/12 with **no skips**.

**C — e2e gated in CI (safely):** `portal-pr-guard.yml` installs chromium and
runs `npx playwright test --grep @mocked` with `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`
so the dev-shim auth path is live and no Supabase backend is needed. Only
`@mocked` specs run, so the many backend-dependent `*-real` specs never break the
gate. (ESLint in CI deferred — no eslint config exists yet; a separate tranche.)

**Honest limitation:** the pinned Playwright browser build can't be downloaded in
this sandbox, so the local run used the pre-provisioned chromium-1194 via the
`PW_CHROME_PATH` config escape hatch (a no-op in CI, which downloads its own).

**Scorecard delta:** +1 flow_continuity (focus loop e2e-proven) +1
regression_resistance (doctrine re-anchored, e2e gated).
