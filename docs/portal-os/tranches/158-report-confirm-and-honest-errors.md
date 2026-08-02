# Tranche 158 — the finish-run confirm cannot be tapped past, and errors stop naming internals

**Status:** in progress
**Origin:** Tom, 2026-08-02: *"תוודא שכל הזרימת עבודה של דניס במערכת היא טובה ואפשרית מקצה לקצה
להזנת האיסוף של חומרי הגלם והאריזות וגם לדיווח הייצור בפועל"* → full `/ux-release-gate` over the
`(production)` corridor, verdict **HOLD**. Then, in writing: *"תריץ הכל במקביל"*.
sizing: S
scorecard_target_category: operator_flow
expected_delta: the one action in this corridor that moves stock cannot fire before the operator has
seen what it will move; nothing on the screen prints an internal identifier at him.

## 1. The P0 — a second tap posts the run before the summary exists

`ReportForm` implements the irreversible finish as a two-step confirm: the first submit sets
`confirming = true` and returns, the second posts. The consumption preview — the panel that says what
is about to leave stock, and the only place the operator can tick *"Yes, it really was used"* for a
material the projection reads as empty — is fetched by a query whose `enabled` is
`confirming && outputOk`. It therefore **starts loading at the exact moment the confirm appears**, and
has never resolved when the confirm first renders.

During that window `preview.data` is `undefined`, and `explanationsSatisfied(undefined, …)` returns
`true` by design (`report.ts:220` — an unreachable preview must never trap an operator on the floor).
`canPost` is consequently `true`, `report.isPending` is `false`, and the submit button is **enabled**
while the panel above it still reads *"Working out what was used…"*. A double-tap — the ordinary
gesture of a gloved hand on a capacitive screen — posts the report having shown neither the quantity
confirmation, nor `"You cannot undo this."`, nor a single consumption line.

**This is not theoretical.** Both live reports of 2026-07-30 (`ce04a5ef…`, `41244104…`) posted with
`consumption_decisions: []`. Their `change_log.new_values.shortfalls` record 240 caps + 240 labels and
252 caps wanted, `consumed_qty: 0.00000000` — because with no decision the backend clamps a take
against a zero on-hand to zero (`net-picks.ts:91-100`, `report-handler.ts:507-525`), writes no ledger
row, and leaves the pick row unstamped. The material was collected, the run was reported, and nothing
came off stock.

The fix is one predicate. The summary must have settled before the confirming submit is live:

```ts
const summaryReady = !confirming || (!preview.isLoading && !preview.isFetching);
```

`summaryReady` gates both the button's `disabled` and the `onSubmit` path, so neither a fast second
tap nor a deliberate tap during the spinner can get through. A preview that **errors** leaves
`summaryReady` true on purpose — the existing rule that a failed preview must not strand the operator
is unchanged, and `ConsumptionSummary` already states in that case that the run can still be finished.

## 2. Errors stop printing internals

Five call sites threw the API's own `detail` / `error` string straight into an operator-visible
banner. `PickConflict.detail` is composed backend-side from run UUIDs and status enums — *"production_run
7d1dc63c-… not found"*, *"run … status=IN_PRODUCTION is not pickable"* — which portal_ux_standard.md §1
forbids in primary UI, and which say nothing to a weak English reader standing at a tank.

`_lib/errors.ts` maps every conflict code this corridor can actually receive to a dict key and returns
`error_generic` for anything unrecognised. `detail` is never rendered again. The `STALE` sentinel path
is untouched — it drives its own banner with a reload action.

`ConsumptionSummary` had the same class of leak in a quieter place: `line.component_name ?? line.component_id`
printed `PKG-CAP-PLASTIC-28` as a material name whenever the name was null.

## 3. Two entry points were lying about when stock moves

`cockpit.ts` is the operator's landing page and its `/production` tile has said
*"Collect materials for today's runs; confirm to update stock"* since tranche 141. Tranche 147 moved
the stock movement to the report; the tile was never updated. It is the first sentence Denis reads
each morning and it tells him the opposite of what the pick screen tells him thirty seconds later.

`quick-actions.ts` labels the same destination *"Production Actual"* with the blurb
*"Output + scrap; BOM-derived consumption."* — a different name for the same door, in developer
vocabulary.

## 4. The operator could not see which of today's jobs still had no report

Tom, same message: *"תוודא שלדניס יש את כל ההרשאות של דיווח הייצור ישירות מדף התכנון היומי."*

Checked by rendering `/planning/production-plan` as `operator` and as `planner` side by side against the
same stubbed week. Most of it was already right: `/planning` admits the operator in `middleware.ts`,
the layout gate is `planning:read` and the lattice grants it, and every job card renders the
**Report production** CTA carrying the full `?date=…&plan=…&report=1` deep link — byte-identical to
the planner's. Denis has the permission and the route.

One thing was not. The today strip's *"planned today, still no report"* list — the one surface on that
page that names the jobs Denis has yet to report — is behind `canManagePlan`, so only a planner or
admin ever saw it. Its single action, **Move to tomorrow**, genuinely is a planner action, which is
presumably how the whole block ended up gated on the wrong capability.

Split by capability rather than by block: the list renders for anyone who can report
(`stock:execute` — operator, planner, admin), **Move to tomorrow** stays `canManagePlan`, and a
**Report** link appears for whoever can report, pointing at the same deep link the job card uses. An
operator now opens the daily plan and sees exactly which of today's jobs are still waiting on him,
with one tap to each.

## 5. Deliberately not in this tranche

- **The exception on a consumption shortfall.** A shortfall is currently recorded only inside
  `change_log.new_values`, and `private_core.exceptions` has no category for it — so *"The planner will
  check it"* is a promise nothing keeps. That is a backend contract change (`gt-factory-os` lane) and
  is being built there, not here.
- **The ledger correction** for the material that never came off stock. Backend/data lane, and the
  numbers need Tom's sign-off first — two of the affected components were already reconciled by hand.
- **TANK / base-batch never reaching a terminal state**, and **unplanned runs missing from
  `/production`** — both are `handleProductionRunToday` / `report-handler` contract changes.
- Touch-target, focus-ring and reduced-motion findings from the gate's a11y dimension — real, none
  blocking, and several are token-level (`globals.css` frozen).
- Stepper increment sizing, `?date=` propagation through the pick path, and the
  `"production-run"` / `"production-runs"` query-key prefix mismatch.

manifest:
- src/app/(production)/production/_lib/errors.ts
- src/app/(production)/production/_lib/errors.test.ts
- src/app/(production)/production/_lib/copy.ts
- src/app/(production)/production/_lib/copy.test.ts
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- src/app/(production)/production/runs/[run_id]/_components/AddMaterialControl.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ConsumptionSummary.tsx
- src/app/(production)/production/runs/[run_id]/report/_lib/report.ts
- src/app/(production)/production/runs/[run_id]/report/_lib/report.test.ts
- src/app/(planning)/planning/production-plan/page.tsx
- src/features/home/cockpit.ts
- src/features/dashboard/quick-actions.ts
- tests/e2e/production-picking.spec.ts
- docs/portal-os/tranches/158-report-confirm-and-honest-errors.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- Backend contracts / migrations — the shortfall exception is authored in `gt-factory-os`.
- Tokens / `globals.css` / `tailwind.config.ts` (frozen).
- `portal_ux_standard.md` — no new standard pattern; these are enforcement fixes against the
  existing §1.
