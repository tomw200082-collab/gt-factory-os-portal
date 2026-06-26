# Tranche 108: production-plan — copy & vocabulary consistency

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / data_truthfulness
expected_delta: 0 (copy/vocabulary hygiene — §1 jargon, §4 status terms, §8 labels)
sizing: S (4 files; no backend)
source: /ux-release-gate on /planning/production-plan (2026-06-26) — Batch 2 of
the approved 7-batch plan. Findings: VARIANCE_TOOLTIP jargon, "Firm" jargon,
Done→Completed (§4), bare "Report" label (§8), generic toasts, item_id §1 leak
in the move-confirm.

## The fixes
1. **§1 jargon — VARIANCE_TOOLTIP.** Dropped "per the production reporting v1
   model … BOM over output + scrap" internal mechanics; now plain operator
   English ("compares what was produced to what was planned. Scrap is not
   counted as output. Stock has already been updated from this production
   report.").
2. **§1 jargon — "Firm".** The not-reportable tooltip "Firm this plan before
   reporting production" → "Confirm this plan …", aligning with the draft chip's
   own "not yet confirmed" wording.
3. **§4 status vocabulary — "Done" → "Completed".** The day-lane footer badge
   "✓ Done" → "Completed" (also drops the decorative Unicode ✓ — the success
   color + text already carry the state, so no screen-reader noise).
4. **§8 label — "Report" → "Report Production".** The live-plan card CTA was a
   bare noun/verb "Report"; now an explicit imperative.
5. **Toast honesty — product name in plan-mutation toasts.** Edit / cancel /
   delete / move-to-tomorrow success toasts now name the affected plan ("Plan
   updated for <item>." etc.) via a new §1-safe `planLabel()` helper (item name
   or the base-batch descriptor, **never** the raw item_id). On a board of many
   cards the planner now sees which one changed.
6. **§1 leak — move-confirm.** `handleMoveToTomorrow` built its confirm label
   from `item_name ?? item_id`, leaking the raw id; now uses `planLabel()`.
7. **Internal clarity.** `mapStatusToHebrew` (produces English) renamed to
   `mapStatusToMessage` — the old name was misleading.

Verified NOT issues (left unchanged): the header CTA is already "Add production"
/ "Add production manually" (no bare "Add Manually" exists); the
`/stock/production-actual` variance tooltip's "production reporting v1" wording
is a different surface, out of this tranche's scope.

Deferred to a Tom question (not guessed): the "<n> units total" KPI sums planned
quantities across mixed UoMs (liters + bottles + kg) into one number labelled
"units" — a data-truthfulness issue (FLOW-014/015). What it should show when the
week mixes units is a product call; raised with Tom, not silently changed.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_lib/helpers.ts
  - src/app/(planning)/planning/production-plan/_lib/usePlans.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/108-production-plan-copy-vocabulary.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (no test asserted the changed strings;
  non-named toast fallbacks preserve the prior copy when no label exists).

## Checklist
- [x] VARIANCE_TOOLTIP §1 jargon removed · verified
- [x] "Firm" → "Confirm" tooltip · verified
- [x] "✓ Done" → "Completed" (§4, drop decorative ✓) · verified
- [x] "Report" → "Report Production" (§8) · verified
- [x] product name in edit/cancel/delete/move toasts via §1-safe planLabel · verified
- [x] move-confirm item_id §1 leak removed · verified
- [x] mapStatusToHebrew → mapStatusToMessage · verified
- [ ] Tom review / merge · open question: mixed-UoM KPI total (FLOW-014/015)
