# Tranche 039: ReconcileBadge — Lucide icon (design-system handoff)

status: in-progress
created: 2026-05-31
activated: 2026-05-31
scorecard_target_category: ux_polish
expected_delta: +0 (icon-vocabulary conformance; no scorecard category moves on a single badge)
sizing: S

## Why this tranche
The GT Factory OS Design System handoff bundle (claude.ai/design, "Operational
Precision") states an absolute iconography rule: **status is communicated with
Lucide icons and colored dots — never emoji or unicode-as-icon.** Tranche 023
swept emoji decorations off the receipts surface, but `ReconcileBadge` still
rendered its leading mark as a `"⚠"` unicode glyph (`<span className="font-mono">⚠</span>`).
This tranche brings that one stray glyph onto the canonical `lucide-react`
`<AlertTriangle>` already used 100+ places across the portal — closing the last
isolated, test-safe glyph-as-icon in a small presentational component.

## Non-negotiable: zero logic change
Presentation only. The change is the value of the `<Badge icon=...>` prop:
`<span className="font-mono">⚠</span>` → `<AlertTriangle className="h-3 w-3" strokeWidth={2} />`.
The `<Badge>` primitive already wraps `icon` in an `aria-hidden` span, so the
icon was — and remains — decorative. Untouched: tone (`warning`), variant,
size, `interactive`, `onClick`, `disabled`, `tooltip` body, `ariaLabel`, the
`ring-warning/50` className, the `floorGap`/`uom` props, and every string of
copy. No data layer, no contract, no handler, no test id.

## Scope
- `src/components/stock/ReconcileBadge.tsx` — import `AlertTriangle` from
  `lucide-react`; swap the `⚠` glyph node for the Lucide icon; update the
  docstring so its "preserved verbatim" note stays truthful.

## Out-of-scope
- The pervasive, **test-asserted** glyph vocabulary used elsewhere (`✕`/`✓`/`✗`/
  `●`/`▸`/`▾` across inventory, movement-log, dashboard, BOM editor, PO detail).
  Several of those glyphs are referenced by existing unit tests
  (`readiness-panel.test.tsx`, `recipe-health-card.test.tsx`) and live inside
  logic-heavy surfaces, so de-glyphing them is its own scoped, test-aware work —
  deliberately not bundled here.
- The design bundle's UI-kit screens (two-level nav, dashboard v2 widgets) — those
  are logic-touching and remain future tranche candidates.

## Tests / verification
- typecheck clean — `npx tsc --noEmit` → exit 0
- vitest: `src/components/stock/ReconcileBadge.test.tsx` (5 passed) + full suite
  (55 files, 416 tests, all passing — no regression)
- regression-sentinel: no baseline regressions (no nav/route/quarantine surface touched)

## Rollback
Revert the one-file diff; no data-layer changes, so the revert is clean.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 039` on the PR)

## Actual evidence
- typecheck: `npx tsc --noEmit` → exit 0
- unit suite: `npx vitest run` → Test Files 55 passed (55), Tests 416 passed (416)
- targeted: `npx vitest run src/components/stock/ReconcileBadge.test.tsx` → 5 passed
- branch: `claude/great-shannon-X02VD`
