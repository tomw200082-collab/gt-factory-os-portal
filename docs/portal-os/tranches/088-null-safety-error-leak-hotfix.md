# Tranche 088: null-safety + error-leak hotfix (P0 cluster from the 3-area sweep)

status: in-progress
created: 2026-06-25
scorecard_target_category: reliability / ux
expected_delta: +2 (kills 4 route crashes under degraded payload + stops raw-JS leak + fixes inbox false-all-clear)
sizing: S/M (5 source files, all additive null-guards + 1 copy/logic fix; no backend)
source: /ux-release-gate render-grade 3-area sweep (2026-06-25), 5 UX agents

## Why
The sweep found a systemic null-fragility class: 4 of 8 routes crash to the error
boundary under an empty/partial API payload, and the shared boundary leaks the raw
JS exception to operators. Three findings are real in production regardless of
fixtures (the leak, the inbox "5/4", the inbox false all-clear). The crash-guards
are defensive: harmless in healthy prod, but they stop incident-time crashes on the
operator forms + the planner's primary risk surface.

## Scope (manifest)
manifest:
  - src/app/error.tsx
  - src/app/(inbox)/inbox/page.tsx
  - src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx
  - src/app/(planning)/planning/inventory-flow/supply/SupplyFlowClient.tsx
  - src/app/(ops)/stock/receipts/page.tsx
  - src/app/(ops)/me/activity/page.tsx
  - docs/portal-os/registry.md

## Landed
- **error.tsx:110** — stop leaking `{error.message}` to operators; render it only in
  non-production. Support code (`error.digest`) still shows. (visual/copy/a11y P0)
- **inbox:1440** — banner hardcoded `/4` with 5 sources → "5/4". Add `TOTAL_SOURCES`,
  use it in the fraction. (flow/visual/copy/interaction P0)
- **inbox false all-clear** — when ALL sources fail, `InboxEmptyState` still said
  "Nothing in your inbox. All clear." Now shows a degraded "couldn't load" copy when
  `allSourcesFailed`. (flow/visual/interaction/a11y P0 — decision-grade)
- **InventoryFlowClient.tsx:100,118 + child `items` props** — `data.items` consumed
  unguarded (while :133 was guarded — inconsistent) → `?? []`. Unblocks
  /planning/inventory-flow + /supply under bad payload. (all dims P0)
- **receipts:1102,1118** — `data?.rows.find(...)` only guards `.data`, not `.rows`
  → `(data?.rows ?? []).find(...)`. Unblocks goods receipt. (interaction/flow P0)
- **me/activity:71** — `flatMap((p) => p.rows)` → `?? []` (undefined rows produced
  an undefined row → `event_at` crash on /stock/submissions mobile). (interaction P0)

## Corrected vs agent claims
The agents pinned the inventory-flow crash at `FilterBar.tsx:138` — that line is
already guarded (`if (!items?.length) return 0`). The real unguarded consumers are
`InventoryFlowClient.tsx:100/118`. Fixed the real site.

## Verification
- tsc 0 · eslint 0 · vitest green
- Playwright @uxshot re-render of the 5 crash/false-state routes confirms they now
  render (no error boundary) under the empty-stub fixture.

## Checklist
- [x] error leak · inbox 5/4 · inbox false-all-clear · inv-flow guards · receipts guards · me/activity guard
- [ ] Tom review / ship to prod
