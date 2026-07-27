# Tranche 152 — see what comes off stock before the run closes

**Status:** verified — all gates green
**Origin:** Tom, 2026-07-27. Backend companion in `gt-factory-os`, same branch: report-time reconciliation + `GET .../consumption-preview`.
sizing: M
scorecard_target_category: ops_surface
expected_delta: the operator reads exactly what a report will take off stock — and where each number came from — before the run closes, instead of finding out later that nothing moved.

## The case

A run reported without collecting consumed nothing at all. Three live runs hit that path on 2026-07-26/27 — 143 DETOX 0.5L NS, 6 MATCHA 0.5KG, 30 MATCHA 30G — producing **179 finished units while moving zero raw material or packaging**.

The floor path that causes it is visible on the run card: **"Collect materials"** and **"Report"** sit side by side, and reporting never required collecting. Taking the second button was silently free.

Tom, on what the screen owes the operator: *"המטרה היא לראות בדיוק כמה לוקט מכל דבר ואז להצליב אל מול התוצרת המוגמרת שיוצאת"* — see exactly how much of each thing was collected, then cross-check it against the finished product. And *"כן — מסך סיכום לפני אישור סופי"*.

## What the backend now does (this tranche consumes it)

Consumption is decided **per component**, not per run:

| Component state | Quantity | Shown as |
|---|---|---|
| collected | net of what was taken | `Collected` |
| not collected | recipe × **actual** reported output | `From recipe` |

Per component is what keeps the dangerous middle closed: under an all-or-nothing rule, ticking one line and forgetting nine would leave nine components on the shelf in the books — worse than the bug being fixed.

`GET /api/production-runs/:run_id/consumption-preview?output_qty=` runs that same reconciliation read-only, so the summary shows the numbers that actually post.

## The screen

**No new page and no extra tap.** The report already had a two-step confirm; the summary fills that step. Tap "Finish run" → read what moves → tap again.

Per row: the material, what comes off, where the number came from, `collected N · recipe says M` when both exist, and the balance left after.

Two things can need an answer:

- **Stock says there is none left.** A tick — *"Yes, it really was used"* — posts the full quantity and lets the balance go below zero. That is the honest state when units are made before their packaging is booked in (Tom: bottles standing unlabelled are a debt against a label delivery that has not landed). Left unticked, the take stops at zero exactly as before. **Never blocks** — it has a safe default and blocking would strand the operator on the floor.
- **A collected quantity a factor of two or more from the recipe**, in either direction. More often a typed digit than a real over-take, so it asks what happened. **This does block** the second tap. Under-collection is gated as hard as over-collection: it is the direction that silently leaves stock on the books.

Changing the output quantity clears both — the decisions described a different number.

A preview that fails to load never traps anyone: the run still finishes and the backend still reconciles; only the summary is lost.

## Manifest

| File | Change |
|---|---|
| `src/app/api/production-runs/[run_id]/consumption-preview/route.ts` | new — proxy to the read-only preview |
| `src/app/(production)/production/runs/[run_id]/report/_components/ConsumptionSummary.tsx` | new — the summary list, below-zero tick, explanation input |
| `src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx` | summary fills the existing confirm step; decisions travel with the report |
| `src/app/(production)/production/runs/[run_id]/report/_lib/report.ts` | preview + decision types, `buildConsumptionDecisions`, `explanationsSatisfied` |
| `src/app/(production)/production/runs/[run_id]/report/_lib/report.test.ts` | 10 new tests for the gate |
| `src/app/(production)/production/_lib/copy.ts` | summary copy; `report_stock_note` corrected — materials come off whether or not they were collected |

## Evidence

- `npx tsc --noEmit` — clean
- `npx vitest run` — **1107/1107 passed**, 131 files
- `npx next lint --dir "src/app/(production)"` — no warnings or errors
- Backend unit tests for the same reconciliation: 33/33 in `net-picks.test.ts`

## Not in this tranche

- The run card still offers "Report" without collecting. That path is now safe rather than removed — back-dated reporting is routine on the floor and must stay reachable.
- Retroactive correction of the three runs was posted directly to the ledger under Tom's authorization, not through this screen.
