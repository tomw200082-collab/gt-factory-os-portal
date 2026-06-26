# Tranche 113: KPI unit-honesty + recipe discard-confirm a11y polish

status: in-progress
created: 2026-06-26
scorecard_target_category: data_truthfulness / planning_surface
expected_delta: 0 (data-truthfulness correctness + a11y polish)
sizing: XS (2 files; no backend)
source: Tom-approved decisions (2026-06-26) on the three open questions, plus
the /ck:review survivors H1+H2.

## The fixes
1. **FLOW-014/015 — mixed-UoM KPI honesty (Q2).** The "N units total" KPI summed
   `planned_qty` across every active plan regardless of unit, then labelled the
   result "units" — summing liters + bottles + kg into one meaningless number.
   Now: when every active plan shares a unit the KPI shows the quantity total +
   that unit (unchanged); when the week mixes units it shows the honest **run
   count** ("N planned runs"). `dominantUom` (the per-day-lane fallback) is left
   exactly as-is so that path doesn't change.
2. **H1 (/ck:review) — focus into the discard confirm.** When the
   RecipeOverridePanel discard confirm opens, focus now moves to its safe-default
   "Keep editing" button (mirroring ConfirmDialog focusing Cancel), via a
   `keepEditingRef` + a `confirmingClose` effect — previously focus stayed on the
   ×/Cancel trigger.
3. **H2 (/ck:review) — Escape dismisses the confirm, not the panel.** While the
   discard confirm is open, Escape now returns to the form
   (`setConfirmingClose(false)`) instead of re-arming `requestClose`.

## Decisions recorded (Tom-approved 2026-06-26) — NOT building in v1
- **Batch 7 research features** — capacity/overload signal and "risk-of-late"
  urgency both require a capacity / lead-time model that CLAUDE.md locks out of
  v1 ("do not model capacity in v1"); plan-vs-actual side-by-side and
  forward-scheduling/move buttons are layout/workflow opinions that don't beat
  what the card already shows (actual hero + "vs planned" + variance badge;
  "Move to tomorrow" already exists). **Decision: not built in v1.** Revisit when
  a capacity + lead-time contract exists.
- **Confirm-panel family** (stock receive/count, inbox reject/approve,
  procurement place/skip) — **Decision: no new unified confirm panel.** Rule:
  confirm only on irreversible/destructive actions, and reuse the existing inline
  two-step pattern (tranches 098/105) — never a new modal. Reversible actions
  that create auditable, reversal-correctable events stay confirm-free to keep
  operator speed (tiebreaker: beat the workbook).

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/113-kpi-honesty-and-confirm-polish.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 795/795 (uniform-unit KPI path renders exactly as
  before; confirm focus/Escape are additive).

## Checklist
- [x] mixed-UoM KPI → run count; uniform → qty + uom · verified
- [x] H1 focus into discard confirm (Keep editing) · verified
- [x] H2 Escape dismisses confirm, not panel · verified
- [x] Batch 7 + confirm-panel family recorded as "not in v1" decisions
- [ ] Tom review / merge
