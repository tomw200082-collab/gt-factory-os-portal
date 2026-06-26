# Tranche 115: decision-board a11y + touch/keyboard inspection

status: in-progress
created: 2026-06-26
scorecard_target_category: economics_surface / accessibility
expected_delta: +1 accessibility (the board's primary readout becomes reachable on
touch + keyboard; honest error state; missing filter entry restored)
sizing: S/M (1 page + e2e spec; no backend, no shared-component / globals / tailwind change)
source: Tom-directed (2026-06-26) — ran the shipped board (tranche 114) through
`/frontend-design`, `/ui-ux-pro-max`, and `/ux-flow-audit`. The `ux-flow-architect`
audit returned one P0 + five P1/P2 page-local findings; this tranche fixes them.

## Why this tranche
Tranche 114 made the board look amazing but its Inspector — the primary readout of
what a product IS and what to DO — was driven by `onMouseEnter` only. On touch
(mobile/tablet, a first-class device class) and keyboard, a user could not inspect a
product at all. The flow audit also found a misleading zero-data "success" state on
full API failure, a non-dismissable rules popover, and the "Needs data" bucket
missing from the filter strip. All fixes are page-local; none touch backend, shared
components, globals.css, or tailwind.config.ts.

## Findings fixed (from ux-flow-architect audit, 2026-06-26)
- **FLOW-001 (P0 / DECISION_GRADE)** — Inspector unreachable on touch + keyboard.
  Quadrant bubbles + table rows now select on click/tap, focus, and Enter/Space
  (sticky selection); the quadrant SVG is opened to assistive tech (group role,
  per-bubble button role + aria-label). The table remains the full keyboard data path.
- **FLOW-002 (P1)** — removed pointer-only "hover" copy → "select / tap".
- **FLOW-003 (P1)** — full `GET /api/economics` failure now renders an explicit error
  state with a Retry (`refetch`) instead of a misleading "All 0 products priced above
  cost" success verdict + zero vitals/segments.
- **FLOW-004 (P2)** — clear-on-leave inconsistency resolved by the sticky-selection
  model (selection persists until another product is chosen).
- **FLOW-005 (P1)** — RulesPopover dismisses on Escape and outside click.
- **FLOW-007 (P1)** — the "Needs data" segment card is restored to the filter strip
  (was only reachable via the verdict CTA, which is absent when a loss verdict wins).

## Deferred (noted, not in this tranche)
- **FLOW-006 (P1, effort L)** — action→destination navigation (e.g. a "Set cost &
  price" link from a `needs_data` product to its item edit surface). Needs confirmed,
  stable destination routes; not an ARCH change. Next-tranche item.

## Scope
- `src/app/(economics)/admin/decision-board/page.tsx` — the fixes above.
- `tests/e2e/decision-board.spec.ts` — add tap + keyboard inspection assertions
  (lock FLOW-001) and a `needs_data` segment assertion (FLOW-007); testids preserved
  (`decision-board` / `verdict-band` / `segments` / `quadrant`), plus a new
  `inspector` testid for the populated readout.

### Out of scope
- No backend / endpoint / contract change. No write actions. No new dependency.
- No visual redesign — interaction + state + a11y only.

## Manifest
manifest:
  - src/app/(economics)/admin/decision-board/page.tsx
  - tests/e2e/decision-board.spec.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/115-decision-board-a11y-touch.md
  - docs/portal-os/tranches/_active.txt

## Tests / verification
- typecheck clean (`npm run typecheck` → 0).
- eslint clean (page + spec → 0).
- Playwright `@mocked` decision-board spec passes (chromium): tap-to-inspect,
  keyboard-to-inspect, and needs_data segment asserted; desktop + mobile shots reviewed.

## Rollback
Revert the page + spec to the tranche-114 form. No backend / shared-component changes.

## Operator approval
- [x] Tom 2026-06-26: invoked `/frontend-design` `/ui-ux-pro-max` `/ux-flow-audit` on
  the shipped board; this tranche executes the audit's page-local findings.

## Actual evidence
- `npx tsc --noEmit` → exit 0.
- `npx eslint <page> <spec>` → exit 0.
- `npx vitest run` → 809/809 passed (107 files); no regressions.
- Playwright `@mocked` `decision-board.spec.ts` (chromium) → 1 passed, now asserting:
  tap-to-inspect on a quadrant bubble, tap-to-inspect on a table row, keyboard
  (Enter) inspect on a row, and the `needs_data` segment card present. Desktop +
  mobile shots reviewed. Ran with `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true` +
  `PW_CHROME_PATH`.
- PR: (filled after push)
