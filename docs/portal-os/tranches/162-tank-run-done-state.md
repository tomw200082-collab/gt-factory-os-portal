# Tranche 162 — the tank never says it is done

**Status:** built — tsc 0, vitest green
**Origin:** Tom, 2026-08-10, screenshot of `Collect for the tank` (base batch, 500 L) still showing
*In production* and *"This tank makes the liquid. Report the filling jobs for it."* after he had
already reported the bottles:
*"למה זה לא כותב שזה יוצר כבר אם הזנתי את הייצור של הבקבוקים?"* ·
*"צריך לשפר את הלוגיקה של כל ההזנת ייצור היא כרגע לא מספיק מובנת וטובה."*
sizing: S
scorecard_target_category: ops_surface
expected_delta: a TANK run states its real state — whether its plan's filling jobs are reported —
instead of sitting on a status that can never change, and the operator can reach those filling jobs
from it.

## The defect

A `production_run` row with `stage = 'TANK'` **is never reported**. The backend answers
`RUN_NOT_REPORTABLE` for it (`api/src/production-runs/report-handler.ts:104`) and the portal hides
the report action (`isRunReportable`, `_lib/runs.ts`). Its picks are swept into stock by the *first*
PACK run of the same plan that gets reported — `postRunConsumption`
(`report-handler.ts:443-455`) selects the plan's TANK runs and stamps their picks as consumed.

That sweep never touches the tank's own `status`. So a TANK run stays `PLANNED` / `PICKING` /
`IN_PRODUCTION` **forever**, including after every bottle it filled is booked into stock. There is
no state it can reach that says "accounted for".

Both surfaces then render the tank in complete isolation from the runs that consume it:

- `RunCard` shows the status badge straight off `run.status` — a finished base batch reads
  *In production* next to its own filling jobs already marked *Done*.
- `PickList` shows `pick_tank_no_report` — *"Report the filling jobs for it"* — with no idea whether
  those jobs were reported an hour ago, and no link to them.

So the screen tells a correct-looking lie, and the instruction it gives has usually already been
carried out. That is exactly what Tom read as "not understandable".

## The fix (portal-only)

The sibling runs already carry the answer: `GET /api/production-runs/today?date=` returns every run
of the day with `plan_id` and `status`, and the portal already filters by plan (`planRuns`, the
`?plan=` scope). One new pure helper reads it:

`tankFillProgress(rows, run)` → `{ done, total, allDone } | null` — of this tank's plan, how many
non-cancelled filling runs are reported. `null` when there is nothing to say (not a tank, no plan,
no filling runs loaded), and every caller degrades to the old copy on `null`.

Two call sites, one message each:

| State | What the tank now says |
|---|---|
| `allDone` | *"All filling jobs are reported. This tank is finished — its materials came off stock."* + Done badge |
| partial | *"1 / 3 filling jobs reported."* + the existing "report the filling jobs" line |
| no siblings loaded | unchanged — the old line |

Plus a link from the tank to `/production?plan=<plan_id>`, which is the already-supported plan scope,
so the tank stops being a dead end.

## Manifest
manifest:
- src/app/(production)/production/_lib/runs.ts
- src/app/(production)/production/_lib/runs.test.ts
- src/app/(production)/production/_lib/copy.ts
- src/app/(production)/production/_lib/today.ts
- src/app/(production)/production/_components/RunCard.tsx
- src/app/(production)/production/_components/RunList.tsx
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- docs/portal-os/tranches/162-tank-run-done-state.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- **Giving the TANK run a real terminal status.** The honest fix is backend: when the last PACK run
  of a plan is reported, close the plan's TANK runs. That is a `production_run` state-machine change
  in `gt-factory-os` (W1 lane) and it changes what `status` means, so it needs its own migration,
  pgTAP, and Tom's call. Until then the portal derives the state instead of inventing one — it never
  writes a status it was not given.
- The rest of the production-entry corridor Tom called unclear (auto-forward on `?report=1`, the day
  switcher, back-dated reporting, unplanned runs, plan-level view). Audited separately; each is its
  own tranche.

## Language
`/production` and `/production/runs/**` are English per CLAUDE.md — operator surface, weak English
reader. New strings stay in the same register: numbers first, short words.

## Tests / verification
- `npx tsc --noEmit` → 0.
- `npx vitest run "src/app/(production)/"` → green, incl. new `tankFillProgress` cases.
