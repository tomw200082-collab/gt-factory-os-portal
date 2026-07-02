# Tranche 116: Movement Log — pause LionWheel FG-out inventory decrements (count window)

status: in-progress
created: 2026-07-02
scorecard_target_category: stock_surface / operator-control
expected_delta: +1 operator-control (owner can freeze delivery-driven stock decrements
during the weekly physical count instead of hand-reversing pre-picked shipments after)
sizing: S/M (1 page + 1 component + 1 proxy route + unit test; backend lands separately
in gt-factory-os — migration 0277 + reconciler skip-and-mark branch + pause endpoint)
source: Tom-directed (2026-07-02). Every Thursday Tom counts finished goods AFTER all
deliveries leave. LionWheel confirms those deliveries later in the day (after the count),
so the reconciler's FG_OUT_PICK writes land with event_at > the count anchor and slip past
the existing pre-anchor guard (reconciliation.ts:1063-1127) — double-counting the pick on
top of the count. This previously required 29 manual "count-freeze" reversals (2026-05-13).
This tranche surfaces a manual pause toggle so the owner can freeze delivery-driven stock
changes for the counting window.

## Why this tranche
The LionWheel FG-out bridge is live (behaviorally true since the 2026-05-10 cutover). It
correctly decrements FG stock on delivery confirmation, but has no operator control to
suppress that during a physical-count window. The count anchor only protects picks whose
event_at predates it; Thursday's deliveries confirm afterward, so they double-count and
had to be reversed by hand. Tom asked for a Movement Log on/off toggle. Chosen semantic
(Tom 2026-07-02): while paused, deliveries confirmed during the OFF window stay OUT of
stock permanently (the count already covers them); only deliveries after switch-on
decrement. English/LTR copy (Movement Log is not on the Hebrew-exception list).

## Language contract
English-first. Movement Log is NOT on the authorized Hebrew-operator-label surface list
(portal CLAUDE.md). All toggle + banner copy is English.

## What this does NOT touch
- Does not flip the global frozen flag `LIONWHEEL_FG_OUT_BRIDGE_ENABLED` (that is a
  rollback-gated kill-switch; separate control).
- Does not change ledger math, the delivery-confirmation trigger, or reversal semantics.
- No backend authored in this repo — the portal only proxies to the API pause endpoint.

manifest:
  - src/app/(shared)/stock/movement-log/page.tsx
  - src/components/stock/FgOutPauseControl.tsx
  - src/app/api/stock/fg-out-pause/route.ts
  - tests/unit/stock/fg-out-pause-control.test.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/116-movement-log-fg-out-pause.md
  - docs/portal-os/tranches/_active.txt

## Out of scope
Backend migration/endpoint/reconciler change (lands in gt-factory-os, same branch),
per-item pause (this is a global FG-out pause), auto-release scheduling (banner + daily
reminder are the safety net for v1).

## Verification gates
- `npx tsc --noEmit` clean
- `npx vitest run tests/unit/stock/fg-out-pause-control.test.tsx` green
- Toggle visible only to admin/planner; paused banner visible to all roles
- English copy only
