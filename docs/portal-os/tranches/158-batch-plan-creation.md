# Tranche 158 — the board can create the plan shape the factory actually runs

**Status:** in progress
**Origin:** Tom, 2026-08-01, in writing: *"תן לי אופצייה במסך התכנון היומי גם להוסיף ייצור
כבאצ׳ שמתחלק למוצרים — כרגע יש לי רק אופציה לשים שם ייצור per item. תבדוק שם לעומק את כל
הזרימת עבודה ותשפר אותה כל שזה יעבוד מושלם."*
Driven by the 2026-08-01 `/ux-flow-audit` of `/planning/production-plan` (batch creation flow).
sizing: M
scorecard_target_category: planner_surface
expected_delta: a planner opens the production-plan board and creates a base-batch plan
(one tank run split across bottles) without leaving to the Weekly Meeting or developer
tools; the same-day double-production guard offers the corrective action instead of only
"add anyway"; a batch's split can grow a product it didn't start with.

## Why

The board could DISPLAY base-batch rows — `item_id NULL`, `base_bom_head_id` +
`pack_manifest` — which is the shape used for most real production days (24 live rows),
but every creation entry point (`Add production` header, day-lane add, recommendations)
was per-item only. The system read a plan type it could not write. Root-caused in the
2026-08-01 audit as FLOW-001 (backend POST had no batch branch) + FLOW-002 (no portal UI).
Backend branch shipped in gt-factory-os (same-day companion PR: `base_batch` POST variant,
contract §6.2b, tests C1–C8 8/8).

## File manifest

- `src/app/(planning)/planning/production-plan/_components/AddBatchModal.tsx` — NEW.
  Batch composer: base picker (ACTIVE BASE heads with ≥1 member item), tank size
  (prefilled from recipe output), split editor with live liters meter (reuses
  `packLiters`/`meterTone` from BatchTuneDialog), POST `plan_type:'base_batch'`.
- `src/app/(planning)/planning/production-plan/page.tsx` — header "Add batch" button
  (takes the no-drafts primary slot; "Add production" drops to secondary permanently),
  `handleAddBatch`, modal wiring, FLOW-003 third option in the same-day guard,
  FLOW-005 identity-carrying success toast.
- `src/app/(planning)/planning/production-plan/_components/BatchTuneDialog.tsx` —
  FLOW-004: "+ Add product to split…" picker constrained to the base head's member
  items; `TunableBatch.base_bom_head_id` (optional, additive).
- `src/app/(planning)/planning/production-plan/_lib/types.ts` — `CreateBaseBatchRequest`
  added to `CreatePlanOrNoteRequest`.
- `src/components/overlays/ConfirmDialog.tsx` — opt-in `extraLabel` third action
  (resolves `"extra"`); existing boolean callers unchanged.
- `src/app/(planning)/planning/production-plan/_components/AddBatchModal.test.tsx` — NEW.
- `src/components/overlays/ConfirmDialog.test.tsx` — extraLabel coverage (additive).

## Audit trace

| Finding | Class | Resolution |
|---|---|---|
| FLOW-001 | ARCH_REQUIRED | backend repo — POST `base_batch` branch (companion PR) |
| FLOW-002 | DECISION_GRADE | AddBatchModal + header entry |
| FLOW-003 | FLOW_COMPLETION | guard gains "Tune the batch instead" |
| FLOW-004 | FLOW_COMPLETION | BatchTuneDialog add-item picker |
| FLOW-005 | FLOW_COMPLETION | toast carries item · qty · date from `resp.echo` |
| FLOW-006 | POLISH | resolved by FLOW-002 (real button); tooltips clarified |

## Verification

- `npx tsc --noEmit` clean · eslint clean · vitest green (N/N reported in PR).
- Acceptance: POST from the composer returns a row with `is_base_batch: true`;
  board shows the new batch card with its pack breakdown; guard shows three options;
  tune dialog can append a member item.
