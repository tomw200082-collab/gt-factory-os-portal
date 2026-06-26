# Tranche 107: production-plan — P0 data-loss + §1 safety cluster

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / data_truthfulness
expected_delta: 0 (data-loss prevention + §1 leak removal + dialog a11y)
sizing: M (3 files; no backend)
source: /ux-release-gate on /planning/production-plan (2026-06-26) — Batch 1 of
the approved 7-batch plan. Findings: INTER-006 / FLOW-012 / A11Y-005 / A11Y-009
(RecipeOverridePanel), FLOW-018 / FLOW-019 (usePlans §1 leak), COPY-002 +
FLOW-007 (ProductionJobCard).

## Why (the P0s)
1. **RecipeOverridePanel discarded unsaved edits silently.** A planner who
   changed per-run liquid quantities and then pressed ×, Cancel, the backdrop,
   or Escape lost every edit with no warning. The panel also had no focus trap,
   no Escape handler, no initial-focus move, and used `aria-label` instead of
   `aria-labelledby` — out of parity with the page's six inline modals
   (Tranche 075 / 079). Data-loss class on the recipe surface.
2. **§1 leak: raw 422 `detail` in toasts.** `useCreatePlan` and `usePatchPlan`
   appended the backend's raw `detail` string (Zod paths / enums) to the
   operator-facing error on a 422 — internal jargon surfaced to the planner.
3. **COPY-002: raw `item_id` in the card title.** `ProductionJobCard` fell
   through to the opaque `item_id` code when `item_name` was null.
4. **FLOW-007: done plan could lose its audit link.** The "View report →" link
   was gated on `varianceSign`; a completed plan whose variance couldn't be
   computed dropped the whole footer — including the only link to its report.

## The fix
1. **RecipeOverridePanel** adopts the page's modal a11y pattern: `dialogRef` +
   `titleRef` + `useFocusTrap`, initial focus on the heading, focus return to
   the trigger on unmount, Escape-to-close, `aria-labelledby`. A new
   `requestClose()` routes ×/Cancel/backdrop/Escape through a discard confirm
   (`alertdialog`: "Keep editing" / "Discard changes") when `dirty`; the
   non-dirty path closes immediately (unchanged). New testids:
   `recipe-close-confirm` / `recipe-close-keep` / `recipe-close-discard`.
2. **usePlans** no longer appends raw `detail`; the operator-facing message is
   the plain mapped status. The structured `validation_errors` are still passed
   to `PlanMutationError` for per-field mapping in the form (unchanged).
3. **ProductionJobCard** title falls back to "Unnamed item", never `item_id`.
4. **ProductionJobCard** done footer renders whenever `completedActual` exists;
   the variance line degrades to a plain "Reported · planned …" context line
   when `varianceSign` is null, but the "View report →" link (which only needs
   `submission_id`) always shows.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_lib/usePlans.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/107-production-plan-p0-safety.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (no behavior change on existing paths;
  non-dirty close, valid save, and the done-with-variance footer are identical).
- Follow-up: a unit test driving edit→dirty→close-confirm on the recipe panel.

## Checklist
- [x] RecipeOverridePanel focus-trap/Escape/initial-focus + discard confirm · verified
- [x] usePlans §1 raw-detail leak removed (create + patch) · verified
- [x] ProductionJobCard title item_id fallback removed · verified
- [x] ProductionJobCard done audit link decoupled from varianceSign · verified
- [ ] Tom review / merge
