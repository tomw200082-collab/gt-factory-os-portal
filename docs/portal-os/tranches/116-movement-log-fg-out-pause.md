# Tranche 116: Movement Log — pause + undo LionWheel FG-out inventory decrements (count window)

status: in-progress
created: 2026-07-02
updated: 2026-07-03 (added per-delivery undo, grilled scope with Tom)
scorecard_target_category: stock_surface / operator-control
expected_delta: +2 operator-control (pause freezes FUTURE delivery-driven decrements during
the count; undo reverses a decrement that ALREADY posted — e.g. a delivery confirmed just
before the pause was switched on)
sizing: S/M (pause: 1 page + 1 component + 1 proxy route + unit test. undo: +1 component +
2 proxy routes + unit test, same page). Backend lands separately in gt-factory-os —
migration 0277 + reconciler skip-and-mark branch + pause endpoint + fg-out-pick-reversal
endpoint (GET status / POST undo).
source: Tom-directed (2026-07-02, extended 2026-07-03). Every Thursday Tom counts finished
goods AFTER all deliveries leave. LionWheel confirms those deliveries later in the day
(after the count), so the reconciler's FG_OUT_PICK writes land with event_at > the count
anchor and slip past the existing pre-anchor guard (reconciliation.ts:1063-1127) —
double-counting the pick on top of the count. This previously required 29 manual
"count-freeze" reversals (2026-05-13). The pause toggle stops it going forward; the undo
control (grilled 2026-07-03) handles a delivery that already posted before the pause was
switched on.

## Undo scope (grilled with Tom, 2026-07-03 — locked, not re-opened)
- FG_OUT_PICK movement_type ONLY (COUNT_ADJUST already has its own undo; WASTE/GR have
  their own reversal paths; production/other types out of scope).
- Per-row (per movement_id) — no batch/bulk undo.
- admin/planner only — no operator self-undo (no "own the delivery" concept, unlike a
  count an operator personally submitted).
- No time-window limit (matches "planner/admin can undo anytime" precedent for counts).
- Reason optional (matches the pause-toggle confirm pattern, not the mandatory count-undo
  pattern).
- Reuses the already-ratified `FG_OUT_PICK_REVERSAL` movement type / reversal class
  (`LOCKED_DECISIONS.md` §LionWheel, Tom-ratified 2026-05-23) — this is a UI for a
  correction Tom was already doing by hand via psql, not a new ledger mechanism.
- Known v1 gap, surfaced not guessed: dual-role FG/RM-twinned items (rare, hardcoded list)
  — undo does not auto-reverse the matched bulk-RM cover transfer; backend posts a warning
  exception instead.

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
  - src/components/stock/FgOutPickUndoControl.tsx
  - src/app/api/stock/fg-out-pause/route.ts
  - src/app/api/stock/fg-out-pick/[movement_id]/reversal-status/route.ts
  - src/app/api/stock/fg-out-pick/[movement_id]/undo/route.ts
  - tests/unit/stock/fg-out-pause-control.test.tsx
  - tests/unit/stock/fg-out-pick-undo-control.test.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/116-movement-log-fg-out-pause.md
  - docs/portal-os/tranches/_active.txt

## Out of scope
Backend migration/endpoint/reconciler change (lands in gt-factory-os, same branch),
per-item pause (this is a global FG-out pause), auto-release scheduling (banner + daily
reminder are the safety net for v1), batch/bulk undo, undo of any movement_type other
than FG_OUT_PICK, automatic reversal of a dual-role item's matched bulk-RM cover transfer.

## Verification gates
- `npx tsc --noEmit` clean
- `npx vitest run tests/unit/stock` green
- Pause toggle visible only to admin/planner; paused banner visible to all roles
- Undo control visible only to admin/planner, only on FG_OUT_PICK rows, hidden once a row
  is already reversed
- English copy only
