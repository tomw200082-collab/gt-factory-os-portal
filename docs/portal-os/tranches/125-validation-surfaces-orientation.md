# Tranche 125: validation-surfaces-orientation

status: landed-pending-review
created: 2026-07-03
verified: 2026-07-03 (portal-tranche-verifier PASS)
scorecard_target_category: planning_surface
expected_delta: +0 on planning_surface (already 10/10 after tranche 121; this closes the last of DR-018's P1/P2 backlog, not a new category ceiling)
sizing: M (7 files)

## Renumbering note

Implements what DR-018 labeled "Tranche 120" — the last tranche in this
batch. See tranche 121's renumbering note for the full explanation.
Renumbered to 125.

## Why this tranche

DR-018's remaining backlog on the "validation" surfaces (inventory-flow,
the planning overview, production-simulation): `DayCell`'s aria-label
interpolated a raw snake_case enum value (`tier critical_stockout`)
straight into what a screen reader announces; non-working day cells were
still real Tab stops with no popover behind them; the overview's "planning
pipeline" section read as a second navigable ordering path when it's
actually an engine-health monitor (the real corridor is Forecast → Meeting
→ Lock → Procurement); the production-simulation containment banner's
all-negative framing ("does not... is not...") deterred legitimate use of
a genuinely useful what-if tool; and the inventory-flow page had no caption
telling an operator *when* to reach for it in the weekly rhythm.

## Scope

- `risk.ts`: new `CELL_TIER_LABEL` export (6-key map, exact locked copy)
  + a `cellTierLabel()` resolver that also covers the coarser
  `DayCellTier` fallback values (`watch`/`critical`/`stockout`) so the
  aria-label is never `undefined` if the 5-tier field hasn't shipped yet
  (A11Y-007).
- `DayCell.tsx`: aria-label uses `cellTierLabel(...)`; non-working cells
  get `tabIndex={-1}` (A11Y-008).
- `planning/page.tsx`: "The planning pipeline" → "Engine diagnostic" +
  a one-line corridor disclaimer; the cadence block below is untouched
  (FLOW-003).
- `production-simulation/page.tsx`: containment banner reworded to
  positive framing (COPY-004).
- `inventory-flow/page.tsx` + `InventoryFlowClient.tsx`: appended
  corridor-role caption (FLOW-009) — see scope note below on why both
  files were touched.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/inventory-flow/_components/DayCell.tsx
  - src/app/(planning)/planning/inventory-flow/_lib/risk.ts
  - src/app/(planning)/planning/inventory-flow/_lib/risk.test.ts
  - src/app/(planning)/planning/page.tsx
  - src/app/(planning)/planning/production-simulation/page.tsx
  - src/app/(planning)/planning/inventory-flow/page.tsx
  - src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx  # scope addition — see "Actual evidence"; page.tsx only carries the invisible <meta> description, the real on-page caption a human reads lives in this client component's WorkflowHeader
  - docs/portal-os/tranches/125-validation-surfaces-orientation.md
  - docs/portal-os/tranches/_active.txt
  - tests/e2e/inventory-flow-smoke.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope — genuinely backend-blocked (not silently dropped)

**FLOW-008 was NOT independently implemented as a separate item.** The
DR-018 plan text bundled FLOW-007/FLOW-008/FLOW-009 as "inventory-flow/
simulation corridor-role captions" under one instruction covering 3 files
(`planning/page.tsx`, `production-simulation/page.tsx`,
`inventory-flow/page.tsx`) — all 3 were addressed above (retitle,
reframe, caption respectively). No distinct FLOW-008-only file or copy
target was named in the plan beyond those three; nothing was knowingly
skipped.

## Tests / verification
- typecheck clean
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked` chromium: extended `tests/e2e/inventory-flow-smoke.spec.ts`
- regression-sentinel: no baseline regressions
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. Copy + a11y attributes + one new pure-function export; no
data-layer changes.

## Operator approval
- [x] Tom approves this plan — blanket authorization from the DR-018
  execution-plan message, 2026-07-03 (see tranche 121 for the exact quote).

## Actual evidence (filled in by execution)

**Scope note**: `InventoryFlowClient.tsx` was added to the manifest
mid-tranche. `inventory-flow/page.tsx`'s only content is a Next.js
`export const metadata` object — its `description` field renders into an
invisible `<meta name="description">` tag, not on-page text. The real,
human-visible caption is `WorkflowHeader`'s `description` prop inside
`InventoryFlowClient.tsx`. Both were updated: the metadata for SEO/tab-title
consistency (harmless, matches the literal instruction), and the client
component's header for the actual FLOW-009 fix a human would see. The
client-component addition was kept to one short clause, respecting the
Tranche 057 (FLOW-M07) mobile above-the-fold budget noted in the existing
code comment there.

**Files touched:**
- EDIT `risk.ts` — `CELL_TIER_LABEL` (exact 6-key map from the spec) +
  `cellTierLabel()` resolver covering both `CellTierWithProduction` and
  the coarser `DayCellTier` fallback.
- NEW `risk.test.ts` — 4 cases: every `CellTierWithProduction` key has a
  non-snake_case label; the map matches the exact locked copy; the
  resolver covers every `CellTierWithProduction` value; the resolver also
  covers the 3 `DayCellTier`-only fallback values.
- EDIT `DayCell.tsx` — `aria-label` now calls `cellTierLabel(...)` instead
  of interpolating the raw enum; `tabIndex={isNonWorking ? -1 : 0}`.
- EDIT `planning/page.tsx` — pipeline section `aria-label` + heading text
  → "Engine diagnostic"; new one-line disclaimer paragraph. The cadence
  block ("How planning works here") below is untouched, per the plan.
- EDIT `production-simulation/page.tsx` — containment banner body
  reworded from "This does not change inventory and is not the production
  planning source of truth." to "Use this to check material needs before
  committing. Changes here don't affect the production plan or inventory."
  (the bold "What-if preview." lead-in kept).
- EDIT `inventory-flow/page.tsx` — `metadata.description` gains the
  corridor-role sentence.
- EDIT `InventoryFlowClient.tsx` — `WorkflowHeader`'s `description` prop
  gains the same corridor-role sentence (see scope note above).
- EXTEND `tests/e2e/inventory-flow-smoke.spec.ts` — 3 new tests: T08
  (no day-cell aria-label matches `/critical_stockout|at_risk|non_working/`,
  data-dependent soft-pass matching T06/T07's convention); planning
  overview shows "Engine diagnostic" + the corridor disclaimer; production
  simulation shows the reworded positive-framing banner text.

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched files: 0 errors. 1 pre-existing, unrelated
`react-hooks/exhaustive-deps` warning on `InventoryFlowClient.tsx`
(confirmed via diff — the flagged `useMemo`/line is outside the single
hunk this tranche touched).

**`npx vitest run`**: **877/877** passed, 112/112 files (+4 net-new from
`risk.test.ts`; 0 regressions).

**Playwright** (`tests/e2e/inventory-flow-smoke.spec.ts`, `@mocked`,
chromium, `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`): **10/10 passed** (7
pre-existing + 3 new).

**portal-tranche-verifier**: **PASS**. Manifest compliance confirmed (all 10
entries accounted for); tsc 0 errors; eslint 0 errors (1 pre-existing
out-of-hunk warning on `InventoryFlowClient.tsx`); vitest 877/877 passed,
112/112 files; playwright 10/10 passed
(`tests/e2e/inventory-flow-smoke.spec.ts`, chromium); all 5 finding IDs
(A11Y-007, A11Y-008, FLOW-003, COPY-004, FLOW-009) independently spot-checked
against the diff and confirmed; `InventoryFlowClient.tsx` scope-addition
rationale independently verified as accurate; no regressions against
tranches 121-124 (tranche 122's cadence-block lexicon fix confirmed intact
and untouched); no quarantine/baseline.json touches; no fake-session
reintroduction.

**PR**: https://github.com/tomw200082-collab/gt-factory-os-portal/pull/158
