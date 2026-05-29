# Tranche 032: procurement-test-coverage

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: regression_resistance
expected_delta: +0 (coverage hardening; locks the epic against future drift)
sizing: S  (≤4 files)

## Why this tranche
The 30-iteration verification pass confirmed the procurement epic is sound, but
two surfaces had only indirect coverage: the **ActionList** rendering/grouping
and the **FocusMode** controller (queue, navigation, auto-advance, done/
remaining states). This tranche adds direct tests for both — the biggest
remaining verification gap — and fixes anything they surface.

It also records the triage of the 35 pre-existing full-suite failures (below):
they are NOT caused by or related to this epic and are NOT a single systemic
fault, so they are out of scope here and flagged for dedicated per-domain
tranches.

## Scope
- `ActionList.test.tsx` — decision grouping into the three sections, overdue
  badge, empty-section copy, `onOpen` wiring vs the classic-session link.
- `FocusMode.test.tsx` — integration with mocked session hooks: progress
  readout, keyboard/footer navigation, optimistic auto-advance on skip, and the
  completion screen.
- Fix any real defect these tests reveal in ActionList/FocusMode.

## Pre-existing-failure triage (informational; out of scope)
35 failures across 11 suites — all test-vs-component drift in unrelated domains:
admin/bom (bom-draft-editor, bom-line-row, bom-line-diff, items-bom-display-only,
publish-confirm-modal, quick-fix-drawer, version-history-section,
use-enter-edit-draft), stock (StockTruthDrawer), planning-admin
(recipe-health-card, readiness-panel). Symptoms are assertion drift ("multiple
elements", "unable to find text/label", renamed roles). No common root cause; CI
does not gate on them. Each needs its domain owner's judgment (stale test vs real
regression) and a scoped tranche — fixing blind here would risk masking real
component bugs.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/procurement/_components/ActionList.test.tsx
  - src/app/(planning)/planning/procurement/_components/FocusMode.test.tsx
  - src/app/(planning)/planning/procurement/_components/ActionList.tsx
  - src/app/(planning)/planning/procurement/_components/FocusMode.tsx
  - src/app/(planning)/planning/procurement/_lib/decision.ts
  - src/app/(planning)/planning/procurement/_lib/decision.test.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- The 35 unrelated pre-existing failures (see triage); backend; new features.

## Tests / verification
- typecheck clean.
- vitest: new ActionList + FocusMode suites pass; full procurement suite green.
- production build clean.

## Exit evidence
- vitest pass counts + build result + PR link.

## Rollback
Revert the PR; tests + any local component fixes only.

## Operator approval
- [ ] Tom approves (comment `@claude /portal-tranche-fix 032`)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 — focused multi-iteration verification + improvement pass.

**Delivered:**
- `ActionList.test.tsx` (new) — 5 tests: decision grouping, overdue badge,
  empty sections, onOpen-vs-link affordance.
- `FocusMode.test.tsx` (new) — 6 tests: opens on most-urgent order, footer/arrow
  navigation, optimistic skip auto-advance, paging-past-end completion, Esc
  close, and the remaining-aware "continue to remaining" resume.
- `decision.ts` (+test) — `daysHe` Hebrew day-grammar (1=יום, 2=יומיים, else N
  ימים) applied to the "why now" copy (no more "בעוד 1 ימים").
- `FocusMode.tsx` — progress bar now a real `role="progressbar"` with
  aria-valuemin/max/now + label.

**Verification (highlights across the pass):**
- typecheck → clean.
- procurement suite → 37 tests pass across 6 files (decision 9, focus-queue 8,
  FocusCard 5, AddLineForm 4, ActionList 5, FocusMode 6) — the whole epic now
  has direct coverage incl. the controller.
- full vitest → 329 passed (was 316 before this verification work, +13); the 35
  failing suites are pre-existing/unrelated (triaged above), count unchanged.
- production build → clean (117 static pages).
- hygiene + url-guard + `.only` scan → clean.

**The 35 pre-existing failures were deliberately NOT swept** (see triage):
diverse cross-domain test-vs-component drift, no common root cause, outside this
epic, and risky to "fix" blind. Recommended as dedicated per-domain tranches.

**Scorecard delta:** +0 (declared) — regression_resistance materially
strengthened (epic locked against drift) without claiming a category bump.
