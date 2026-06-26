# Tranche 095: stock-form interaction polish (audit INTER cluster)

status: in-progress
created: 2026-06-25
scorecard_target_category: ops_surface
expected_delta: 0 (interaction polish — feedback + consistency, no flow change)
sizing: XS (3 forms; no backend, no test churn)
source: /portal-audit interaction-design-specialist (2026-06-25)

## Why
The interaction audit of the three operator stock forms raised a cluster of
small, verified feedback/consistency gaps. This tranche lands the ones that
improve feedback without changing the operator flow (the confirm-panel findings
INTER-001/007 and the reset-confirm findings INTER-003/006 are held for Tom —
they add friction to the daily flow).

## Landed (each verified against current code)
- **INTER-004** — `receipts`: the express "Confirm & receive all" button showed
  "Posting…" with no spinner (every other submit shows one). Added the shared
  `<Spinner>` to match the main submit button.
- **INTER-005** — `receipts`: the per-line "Decrease quantity" stepper was never
  visually disabled at qty ≤ 1 (the onClick already no-ops via `if (cur > 1)`, so
  the affordance was misleading). Now `disabled` at qty ≤ 1, matching the
  waste-adjustment stepper.
- **INTER-008** — `physical-count`: the "Yes, cancel" confirm button gave no
  in-flight feedback while the cancel POST ran. Added the inline spinner +
  "Cancelling…" label (same idiom as Submit count).
- **INTER-011** — `receipts`: the PO-lines fetch-error warning had no Retry (the
  PO-header and master-load errors both do). Added a Retry button calling
  `poDetailQuery.refetch()`.
- **INTER-012** — `waste-adjustments` + `physical-count`: the master-load Retry
  was an underlined text link (small touch target, inconsistent with the
  goods-receipt `btn`). Restyled to `btn btn-sm`.

## Scope (manifest)
manifest:
  - src/app/(ops)/stock/receipts/page.tsx
  - src/app/(ops)/stock/physical-count/page.tsx
  - src/app/(ops)/stock/waste-adjustments/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/095-stock-form-interaction-polish.md
  - docs/portal-os/tranches/_active.txt

## Held for Tom (flow-changing, not in this tranche)
- **INTER-001 / INTER-007** — mandatory confirm panel before goods-receipt /
  physical-count submit. Adds friction to the core daily flow; Tom's UX call.
- **INTER-003 / INTER-006** — confirm before Reset/Pick-again discards a filled
  form. Lower-stakes (not a stock write) but still a flow change; grouped with
  the above for a Tom decision.
- **INTER-009** (per-line inline validation, L effort) and **INTER-010** (roving
  focus on reason chips) — follow-up tranches.

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (no new tests; no existing test broke —
  changes are presentational/feedback only).

## Checklist
- [x] INTER-004 · 005 · 008 · 011 · 012 landed, verified against code
- [ ] Tom review / merge · decide INTER-001/003/006/007 confirm-panel family
