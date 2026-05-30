# Tranche 035: test-suite-green-sweep

status: in-progress
created: 2026-05-29
activated: 2026-05-29
scorecard_target_category: regression_resistance
expected_delta: +2 on regression_resistance (drive the suite to green)
sizing: L  (test-repair sweep across the remaining red suites + the proven bugs)

## Why this tranche
Phase 1 completion: drive the remaining 28 failures (10 suites) to green so
`vitest` can be wired into CI (phase 2). Each failure is diagnosed and fixed on
its merits — stale assertion (test-only) vs proven component bug (fix the
component carefully). No masking.

## Scope
- Repair stale assertions across: bom-draft-editor, bom-line-diff, bom-line-row,
  items-bom-display-only, publish-confirm-modal, quick-fix-drawer,
  readiness-panel, use-enter-edit-draft, version-history-section,
  StockTruthDrawer.
- Root-cause + fix the recipe-health draft-exists-modal bug (real defect).
- Component edits only where a genuine bug is proven by a runtime probe.

## Manifest (files that may be touched)
manifest:
  - src/components/stock/StockTruthDrawer.test.tsx
  - src/components/stock/StockTruthDrawer.tsx
  - src/components/admin/recipe-health/RecipeHealthCard.tsx
  - src/components/admin/recipe-health/useTrackData.ts
  - src/components/admin/recipe-health/useEnterEditDraft.ts
  - src/components/bom-edit/useEnterEditDraft.ts
  - tests/unit/admin/recipe-health-card.test.tsx
  - tests/unit/admin/bom-draft-editor.test.tsx
  - tests/unit/admin/bom-line-diff.test.tsx
  - tests/unit/admin/bom-line-row.test.tsx
  - tests/unit/admin/items-bom-display-only.test.ts
  - tests/unit/admin/publish-confirm-modal.test.tsx
  - tests/unit/admin/quick-fix-drawer.test.tsx
  - tests/unit/admin/readiness-panel.test.tsx
  - tests/unit/admin/use-enter-edit-draft.test.tsx
  - tests/unit/admin/version-history-section.test.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Wiring vitest into CI (next tranche, once green).

## Tests / verification
- full vitest → 0 failures.
- typecheck clean; production build clean.

## Exit evidence
- full-suite 0-fail run + build + PR link.

## Rollback
Revert the PR; predominantly test-only, with any component fix called out.

## Operator approval
- [ ] Tom approves (comment `@claude /portal-tranche-fix 035`)

## Actual evidence (filled in by /portal-tranche-fix run)
<pasted after execution>
