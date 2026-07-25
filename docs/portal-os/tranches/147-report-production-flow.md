# Tranche 147 — Report production: reachable, pre-filled, and the moment stock moves

**Status:** verified — 5-lens `/ux-release-gate` run, zero P0 and zero P1 remaining (SHIP)
**Origin:** Tom, 2026-07-24 (in writing, this session), reporting a broken journey on `/planning/production-plan`:

> "When I want to report production now and I press the button on some item's card for production — it takes me to this page (`/production`) and does not let me report production. Production reporting must always be available, because sometimes we report after the fact. […] The most important fix is that when you press 'actual production', the navigation takes us to a page pre-filled with what was planned and we can edit it; once we approve, it is added to finished goods according to what came out. Also, on the today's-runs page you enter the raw materials and packaging as you know, but only after entering actual production does everything we entered there actually come off stock. The reason is that sometimes production is cancelled at the last minute and then everything is returned to place, even after we've collected."

sizing: M
scorecard_target_category: ops_surface
expected_delta: closes the plan-card → report dead-end, makes back-dated reporting a first-class path, and moves RM/PKG consumption from pick-time to report-time.

## What was wrong

1. **The plan card could not reach a report.** Tranche 143 cut `reportHref` down to a bare `"/production"`. That list is hard-coded to *today*, so a plan on any other date dead-ended — and even today's plan made the operator hunt for the right run among the day's tank + pack runs.
2. **Back-dated reporting was unreachable.** `/production` had no way to view another day, and the report endpoint rejected a run still in `PLANNED` — i.e. exactly the run nobody opened the pick screen for, which is the common case when reporting after the fact.
3. **The output field started empty**, so "we made what we planned" was a transcription job rather than a confirmation.
4. **Stock moved at the wrong moment.** Consumption posted at pick confirmation. When a run is cancelled after the materials are collected — which happens on this floor — the ledger had already been debited and the return needed reversal rows to undo. Tom's model is the opposite: collecting is a record, reporting is what makes it real.

## The two pages, as Tom describes them

- **`/production` — "today's runs"**: the page worked *before and during* production. Enter the raw materials and packaging collected. **Records only. Stock does not move here.**
- **`/production/runs/[id]/report` — "actual production"**: enter the quantity that actually came out of what was collected. **This is the only moment stock moves**: finished goods go up, collected materials come off — together, in one transaction. The gap between recipe and reality is visible because both numbers are captured.

## Changes

### Backend (`gt-factory-os`, same branch)
- `pick-confirm-handler.ts` — writes `production_run_pick` rows only; **no ledger rows**. Shortage/excess signals kept as advisory (they no longer cap anything). Idempotent replay now reconstructs from pick rows instead of ledger rows.
- `material-delta-handler.ts` — "+ Add" / "Return" corrections become **signed pick rows** (`+qty` took more, `−qty` put back) instead of ledger rows. This is a correctness fix, not just symmetry: a "Return" posted before the report would have credited stock that was never debited.
- `report-handler.ts` — nets the run's un-consumed pick rows per `(source, component_id)`, posts one capped `PICK_CONSUMPTION` row per positive net **in the same transaction as `PRODUCTION_OUTPUT`**, then stamps `stock_ledger_movement_id` on the contributing rows so a re-report cannot double-consume. Also accepts a `PLANNED` run — a run reported after the fact simply consumes nothing.
- `net-picks.ts` (new) — the netting + cap arithmetic as a pure module, so the code that decides how much inventory disappears is checkable without a database.
- `schemas.ts` — `ReportCommittedResponse` gains `consumed` + `shortfalls`.
- `db/migrations/0297_consumption_at_report_time.sql` (new) — **comment-only**. No structural change was needed: `stock_ledger_movement_id` was already nullable and `picked_qty` is `numeric(24,8)`, so a negative correction row fits. The comments are restated so the database describes what the handlers now do.

### Portal
- `ProductionJobCard.tsx` — `reportHref` carries the plan's own `plan_date`, its `plan_id`, and `report=1`.
- `RunList.tsx` — reads `?date=` (defaults to today) and `?plan=`; adds a day picker capped at today; auto-forwards to the report form when a plan resolves to exactly one reportable run; plan-scope and past-day empty states.
- `runs.ts` — `planRuns()` and `autoForwardRunId()` as pure helpers.
- `RunCard.tsx` — a second action, "Report production", on every non-terminal non-TANK run, so reporting never requires collecting first.
- `ReportForm.tsx` — output field shows the planned quantity until the operator types, labelled as the plan rather than a measurement.
- `PickList.tsx` + `copy.ts` — the copy said "Stock goes down now for what you took". It now says stock changes when you report. Leaving that string would have taught the operator to double-count.

## Deliberately not done
- **No cancel-run endpoint.** Under the new ordering a cancelled run has nothing to reverse — that is the whole benefit — so the reversal machinery Tom's scenario used to need does not need building.
- **`autoForwardRunId` does not guess for a base batch.** Tank + one run per pack SKU is genuinely ambiguous; silently picking one would report the wrong product.

## Resolves from the 146 backlog
- **FLOW-P2-001** ("report form guard for PLANNED/PICKING via direct URL") — no longer an error path. Reporting a `PLANNED` run is now a supported journey, not something to guard against.

## Manifest (files that may be touched)
manifest:
- src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
- src/app/(planning)/planning/production-plan/_components/card-report-link.test.tsx
- src/app/(production)/production/_components/RunList.tsx
- src/app/(production)/production/_components/RunCard.tsx
- src/app/(production)/production/_lib/runs.ts
- src/app/(production)/production/_lib/runs.test.ts
- src/app/(production)/production/_lib/copy.ts
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx
- src/app/(production)/production/runs/[run_id]/report/_lib/report.ts
- src/app/(production)/production/runs/[run_id]/_components/DoneBar.tsx
- src/app/(production)/production/runs/[run_id]/_components/AddMaterialControl.tsx
- src/app/(production)/production/_lib/types.ts
- src/app/api/production-runs/[run_id]/pick-list/route.ts
- tests/e2e/production-picking.spec.ts
- docs/portal-os/tranches/147-report-production-flow.md
- docs/portal-os/tranches/_active.txt

## UX release gate

Full five-lens run. Record: `gt-factory-os-production-brain/docs/phase8/dry-runs/2026-07-24-ux-release-gate-tranche-147.md`.

Three of the four worst findings were second-order effects of this tranche's own changes:

- **P0** — pre-filling the output field removed the "natural pause" tranche 146 relied on when it deferred a submit confirmation, leaving the one stock-moving action unguarded. Now a two-step confirm naming product + quantity; editing the number backs out of it.
- **P0** — `handlePickList` answered 409 for terminal runs, so tapping a Done card showed a fake network error and the portal's existing read-only screens were unreachable dead code. Terminal runs now answer 200 from the persisted picks. `?intent=report` also stops the GET flipping `PLANNED → PICKING`.
- **P0** — the stock note claimed materials come off for a run nobody collected for.
- **P1** — TANK report dead-ends in `PickList`; back-dated reporting bouncing to today after each report; the success screen ignoring `linked_plan_id` and `shortfalls`; `item_id`/`item_name` typed non-null against a nullable backend; two labels for one journey; five accessibility findings (focus-ring contrast, unannounced pre-fill provenance, unannounced stock consequence, reduced-motion, touch targets); two visual findings (banner stacking, hover-group leak).

**Resolved by Tom, 2026-07-24 — "DENIS SIMPLE WORDS":** `/production` keeps `Done`, `To do` and `Report production`. No code change was needed. The conflict is now written into `docs/portal_ux_standard.md` §1 as a scoped exception, so the next gate run reads the decision rather than re-raising it as a P1.

## Evidence
- Portal: `tsc --noEmit` clean; `eslint` clean; `vitest run` **1080/1080** across 129 files.
- Backend: `cd api && tsc --noEmit` → **0 errors in `production-runs`** (3 on `main`, pre-existing, fixed here); `npm run test:production-runs` **18/18**.
- **pgTAP: 32/32 PASS** — run for real against a scratch Postgres 16 built from the migration chain (scheduler / data-seed / view-rebuild migrations skipped, Supabase `auth` schema and roles stubbed; all objects 0295 touches verified present first). `R25` proves collecting moves no stock, `R28`/`R32` prove the report is what moves it, `R31` proves a re-report cannot double-consume, and `R30` (`rebuild_verifier = 0`) proves projection parity holds afterwards. Render-grade screenshots — the Playwright harness could not launch (the installed version wants a Chromium build not present here, and `playwright install` is not permitted). Both are stated, not evidenced.
- Live check against `gt-ops-prod` before any code was written: `production_run`, `production_run_pick`, `PICK_CONSUMPTION` and `MATERIAL_DELTA` counts all **0** — the picking flow has never run in production, so there is no in-flight data whose consumption ordering could be caught mid-change.
