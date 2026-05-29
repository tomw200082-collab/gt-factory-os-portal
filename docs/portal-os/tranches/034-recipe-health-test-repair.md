# Tranche 034: recipe-health-test-repair

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: regression_resistance
expected_delta: +1 on regression_resistance (first step toward a green, CI-gated suite)
sizing: S  (≤4 files)

## Why this tranche
Phase 1 of the "make the suite green, then gate it in CI" plan. The
recipe-health-card suite is the largest red cluster (8 failures). Deep diagnosis
shows the component renders the readiness label in TWO intended places (header
chip + bottom summary banner), so the tests' `queryByText(...)` (which throws on
multiple matches) are **stale** — the same `getAllByText(...).length` idiom is
already used elsewhere in the very same file. Fix the stale assertions; classify
and fix the two confirmation tests on fresh evidence. Test-first; touch the
component only if a genuine regression is proven.

## Scope
- `tests/unit/admin/recipe-health-card.test.tsx` — replace the multiple-match
  `queryByText` waitFor assertions with `getAllByText(...).length`.
- Re-run; classify the two "Edit recipe" confirmation tests precisely and fix
  correctly (test staleness vs real defect).

## Manifest (files that may be touched)
manifest:
  - tests/unit/admin/recipe-health-card.test.tsx
  - src/components/admin/recipe-health/RecipeHealthCard.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- The other 10 failing suites (separate per-domain tranches).
- Wiring vitest into CI (a later tranche, once the whole suite is green).

## Tests / verification
- vitest: recipe-health-card.test.tsx fully green.
- typecheck clean; no regression in the procurement suite.
- full-suite failure count drops by the recipe-health cluster.

## Exit evidence
- vitest pass count for the suite + full-suite delta + PR link.

## Rollback
Revert the PR (test-only unless a real component fix is proven, which would be
called out explicitly).

## Operator approval
- [ ] Tom approves (comment `@claude /portal-tranche-fix 034`)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 — deep per-failure diagnosis, test-only fixes.

**recipe-health-card suite: 8 failures → 1** (14/15 pass). Repo-wide: **35 → 28**
failing tests; 343 passed; typecheck clean. Component file NOT edited (no
guess-fixing).

**Fixed (7) — all genuine staleness, the component is correct:**
- 6× the readiness label (`Production-ready` / `…with warnings` / `Cannot
  publish`) now renders in TWO intended places (header chip + bottom summary),
  so `queryByText` (throws on multiple) → switched to the `getAllByText(...)
  .length` idiom already used elsewhere in the same file. Same for the
  `/no primary supplier/` and `/empty/` assertions.
- 1× the clone endpoint envelope changed to `{ row: { bom_version_id } }`; the
  test's POST mock still returned a flat object → updated. The no-draft
  clone+navigate test now passes.

**Left failing + documented (1) — a real candidate bug, NOT masked:**
- "draft exists → confirm modal" : with a DRAFT row present, clicking [Edit
  recipe] attempts a CLONE (createDraft 500) instead of opening the modal —
  `draftVersionId` resolves null at click time. Reproduces in isolation; the
  no-draft path works. Flagged with a `FIXME(tranche-034)` for a recipe-health
  domain runtime triage rather than hidden via `it.skip` or a forced pass.

**Scorecard delta:** +1 regression_resistance (7 real tests un-rotted; the
remaining red is now a *signal* of a real discrepancy, not noise).

**Recommendation:** continue per-domain (stock, bom-edit, readiness) the same
way, then wire `vitest` into `portal-pr-guard` once the suite is green so drift
can never silently accumulate again.
