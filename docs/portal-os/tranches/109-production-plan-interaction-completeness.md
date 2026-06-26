# Tranche 109: production-plan — interaction completeness

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / data_truthfulness
expected_delta: 0 (cache coherence + form validation — correctness, no flow change)
sizing: S (3 files; no backend)
source: /ux-release-gate on /planning/production-plan (2026-06-26) — Batch 3 of
the approved 7-batch plan. Findings: FLOW-023 / FLOW-024 (cache gaps), INTER-003
(EditModal validation + §1 leak), INTER-001 (double-submit — verified already
handled).

## The fixes
1. **FLOW-023 — BOM-impact stale after recipe save.** `useSavePlanRecipe`
   invalidated only the recipe-flag key, so the card's BOM-impact panel
   (`["bom-impact", itemId, planId]`) kept rendering the pre-save material
   consumption. Now also invalidates that key, scoped by a predicate to the
   saved plan (other cards don't refetch).
2. **FLOW-024 — inbox stale after delete.** `useDeletePlan` invalidated
   `["production-plan"]` + `["planning"]` but not `["inbox"]`. A delete frees the
   linked recommendation back into the candidate pool (FK ON DELETE SET NULL), so
   it can reappear in the inbox/approval queue. `useCreatePlan` already
   invalidates `["inbox"]` when it CONSUMES a rec; the inverse now mirrors it.
3. **INTER-003 — EditModal validation + §1 leak.** Editing the planned quantity
   to blank/zero/non-numeric previously submitted `NaN` and fell back to a
   generic backend 422 toast. Now a client-side check blocks the submit with an
   inline `role="alert"` error under the field (`aria-invalid` +
   `aria-describedby`), cleared on the next edit. The modal subtitle's
   `item_name ?? item_id` §1 leak is fixed to "Unnamed item".

## Verified already handled (no change)
- **INTER-001 — double-submit on add.** All four modal submit paths are already
  gated by `!isSubmitting` / `canSubmit`: ManualAddModal (Add + Review recipe),
  AddFromRecommendationsModal (Add to plan), EditModal (Save changes),
  AddNoteModal (Add note). No churn.
- Full server-side 422 → per-field mapping for the PATCH path is deferred:
  `usePatchPlan` throws a plain mapped-status Error (no structured
  validation_errors), so wiring field-level server errors into EditModal is a
  deeper, separate pass than this tranche.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_lib/usePlans.ts
  - src/app/(planning)/planning/production-plan/_lib/useRecipe.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/109-production-plan-interaction-completeness.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (existing edit/delete/save paths unchanged;
  validation only blocks a qty that would have been a NaN/≤0 submit).

## Checklist
- [x] FLOW-023 bom-impact invalidation on recipe save (plan-scoped) · verified
- [x] FLOW-024 inbox invalidation on delete · verified
- [x] INTER-003 EditModal qty validation + inline error + §1 leak fix · verified
- [x] INTER-001 verified already handled — no change
- [ ] Tom review / merge · follow-up: patch 422 per-field mapping
