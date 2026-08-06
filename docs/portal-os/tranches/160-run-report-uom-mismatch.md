# Tranche 160 — the run report that told the operator the plan's unit was wrong

**Status:** built — tsc 0, vitest green
**Origin:** Tom, 2026-08-06, with a screenshot of `/production/runs/cecce8bd-…/report` (REVIVE 1L,
180 UNIT) showing the red banner `output_uom UNIT does not match items.sales_uom BOTTLE`:
*"למה זה לא נותן לי להזין את הייצור הזה?"*
sizing: XS
scorecard_target_category: ops_surface
expected_delta: the operator can finish a production run at all, on every item whose stock unit is
not the plan's generic `UNIT`.

## The defect

`ReportForm` sent `outputUom: data.uom` on submit. `data.uom` is the **run's** unit, copied at
materialization from `production_plan.uom` — a planning-side label, generically `UNIT`. The report
endpoint books the FG output in `items.sales_uom` and rejects any other value with a 409
`UOM_MISMATCH`.

So the portal was echoing a value it had no authority over into a field the backend derives anyway,
and the two disagreed for every item not sold in `UNIT`. Live master data at the time: 34 active
manufactured/repack items in `BOTTLE`, 4 in `BAG`, 1 in `TIN`, 4 in `UNIT` — the failure covered
~90% of the catalogue, deterministically, on any run whose plan carried the generic unit. REVIVE 1L
(`sales_uom = BOTTLE`, run/plan uom `UNIT`) was the first one Tom hit on the floor.

`output_uom` is optional in the request contract and the handler already defaults it to
`items.sales_uom`. Omitting it is both the smallest diff and the only value that can ever be
correct — the field had no degrees of freedom, only a way to be wrong.

Not a race, not stale cache: nothing the operator could do on that screen would have cleared it.
"Try again" retried the identical body.

## Manifest
manifest:
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx
- docs/portal-os/tranches/160-run-report-uom-mismatch.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- The nullable-`sales_uom` fallback in the report handler — different lane, shipped as
  `gt-factory-os` on the same branch. Not required to unblock the floor; it stops a blank UOM
  reaching the ledger row if an item is ever saved without a sales unit.
- **The display still shows the plan's unit** ("Making 180 UNIT") until the report posts, at which
  point the success state already reads `report.data.output_uom` and shows `BOTTLE`. The quantity is
  identical either way, so this never mis-states stock — but the label is inconsistent mid-flow.
  Fixing it properly means the run row carrying the item's unit: `handleProductionRunToday` resolves
  `items.sales_uom` for PACK runs (`handler.ts:463`) and not for SINGLE ones (`handler.ts:440`),
  which is why a SINGLE run keeps the plan's label. Backend lane, and it only changes new runs —
  rows already materialized keep theirs.
- Why `production_plan.uom` is generic `UNIT` for bottle SKUs at all — planning lane.

## Language
`/production/runs/[run_id]/report` is English (operator surface, per CLAUDE.md).

## Tests / verification
- `npx tsc --noEmit` → 0.
- `npx vitest run src/app/(production)/production/runs/[run_id]/report/_lib/report.test.ts` → 23/23.
  `buildReportBody` already had the case that matters — *"omits output_uom when none is supplied"* —
  and it asserts the key is absent from the body, which is exactly the path this tranche puts the
  screen on. No new test: the change is the removal of an argument to an already-covered branch.
- Live master-data check behind the numbers above:
  `select sales_uom, count(*) from private_core.items where status='ACTIVE'
   and supply_method in ('MANUFACTURED','REPACK') group by 1;`
