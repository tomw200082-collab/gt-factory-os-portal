# Tranche 050 — Production reporting: wire portal to Phase-6 backend

status: executed 2026-06-11 — pending merge
phase: improvement-plan-2026-06 Phase 6 close (backend landed gt-factory-os cdc6403)
approved_by: Tom (2026-06-11 full-run authorization)

## Backend contract (landed)
- GET /api/v1/queries/production-actuals/:submission_id — full committed report (output/scrap/uom,
  item, event_at, reported_by, plan linkage, consumption rows w/ component names + movement ids,
  reversal status: reversed_by_submission_id/reversed_at/reversal_reason; reversal envelopes carry
  reverses_submission_id).
- POST /api/v1/mutations/production-actuals/:submission_id/reverse — admin-only, body { reason },
  idempotent; 409 ALREADY_REVERSED.
- production-plan reads now expose raw status ('draft'|'planned'|'in_production'|'completed'|'cancelled')
  + is_base_batch / pack_manifest_count hints.
- production-actuals open response lines carry available_qty; submit accepts variance_reason_code
  ('material_shortage','equipment','quality_loss','recipe_yield','extra_demand','counting_error','other')
  + variance_note; INSUFFICIENT_STOCK shortfalls carry component_name; list rows carry variance + reversed fields.

## File manifest
- src/app/api/production-actuals/[submission_id]/route.ts — NEW proxy GET
- src/app/api/production-actuals/[submission_id]/reverse/route.ts — NEW proxy POST
- src/app/(ops)/stock/production-actual/page.tsx — (a) honor ?submission_id= → read-only committed-report
  view (B2: output/scrap/variance, consumption table w/ names+movement ids, reporter, plan link,
  reversal status); (b) admin-only "Reverse this report" (confirm + required reason, loading,
  success → plan back to planned, invalidations); (c) variance reason select + note required-ish
  outside the ±2% band on submit (C8); (d) availability columns Required|Available|After in the
  pre-submit preview, red shortfall rows + disabled submit w/ human reason (C10); (e) history rows
  click through to ?submission_id= + show reporter/variance (C12 partial)
- src/app/(planning)/planning/production-plan/page.tsx + _components/ProductionJobCard.tsx +
  _lib/types.ts — B4: render raw status (Draft muted, no Report CTA on drafts; In production state;
  base-batch card variant "base batch · N SKUs"); "View report →" already links ?submission_id= (now lands)
- unit tests for new pure helpers
- docs/portal-os/tranches/050-production-backend-wiring.md, _active.txt, registry.md

## Gates
tsc clean; vitest green (488 baseline + new); existing testids preserved

## Checklist
- [ ] Implemented  - [ ] Typecheck  - [ ] Vitest  - [ ] Pushed
