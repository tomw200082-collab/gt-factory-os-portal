# Tranche 052 — "Improvised liquid recipe" UI (per-plan recipe override)

status: executed 2026-06-11 — pending merge
phase: improvement-plan-2026-06 (backend 0237 landed gt-factory-os api/src/plan-recipe/*)
approved_by: Tom (2026-06-11 flagship-feature authorization)

## Backend contract (landed — gt-factory-os/api/src/plan-recipe/{schemas,handler,route}.ts)
- GET /api/v1/queries/production-plan/:plan_id/recipe — effective liquid recipe (override when
  customized, standard BASE leaf set otherwise): liquid_lines [{component_id, component_name,
  qty_per_unit, uom, available_qty, standard_qty_per_unit, in_standard}], removed_standard_lines,
  customized, override_id, note, base/override BOM version ids; 409 reason_code on note rows /
  non-MANUFACTURED / no-BASE-head items.
- PUT /api/v1/mutations/production-plan/:plan_id/recipe { idempotency_key, lines:[{component_id,
  qty_per_output_unit, uom}], note? } — full replacement of the liquid set; lines:[] (or DELETE)
  clears. Plan must be draft/planned/in_production and not reported (PLAN_NOT_EDITABLE);
  packaging classes rejected (COMPONENT_IS_PACKAGING). Idempotency via form_submissions
  (form_type='plan_recipe_override', key in the JSON body per repo convention).
- GET /api/v1/queries/production-plan/recipe-overrides/last?item_id= — most recent override
  lines for the item ("load last improvisation").
- production-actuals OPEN accepts ?from_plan_id= and flags customized_recipe when that plan has
  an override (base-source bom_lines replaced server-side with batch-equivalent override lines).

## File manifest
- src/app/api/production-plan/[plan_id]/recipe/route.ts — NEW proxy GET+PUT+DELETE
- src/app/api/production-plan/recipe-overrides/last/route.ts — NEW proxy GET
- src/app/(planning)/planning/production-plan/_lib/recipe-types.ts — NEW portal mirror of
  plan-recipe schemas
- src/app/(planning)/planning/production-plan/_lib/recipe-helpers.ts — NEW pure helpers (diff vs
  standard, availability tier ok/tight/short, live run totals, identical-to-standard check,
  working-set validation, PUT body build) + recipe-helpers.test.ts (26 tests)
- src/app/(planning)/planning/production-plan/_lib/useRecipe.ts — NEW TanStack hooks
  (usePlanRecipe, useSavePlanRecipe, useLastOverride, useRecipeComponents w/ packaging filter,
  usePlanRecipeFlag badge cache, 409 reason_code → operator copy)
- src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx — NEW
  centerpiece editor (bottom-sheet mobile / centered modal desktop, items-end sm:items-center):
  header item+planned qty, editable per-unit liquid table w/ live totals + availability chips +
  amber "Changed (was X)" / green "Added" diff chips, inline-confirm remove, struck-through
  removed-standard rows + Restore, SearchableSelect add-component (RM only), footer Load last
  improvisation / Reset to standard / Cancel / Save recipe for this run; save of a set identical
  to standard sends lines:[] (clears, no no-op override)
- src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx — "Custom recipe"
  FlaskConical accent chip (lazy flag, see below) + "Adjust recipe" action on live MANUFACTURED
  plans (strip already hides once reported/cancelled)
- src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx — onAdjustRecipe
  pass-through
- src/app/(planning)/planning/production-plan/page.tsx — ManualAddModal second step for
  MANUFACTURED items: primary "Review recipe" (create plan → panel opens immediately) + quiet
  "Add without reviewing recipe" secondary (one click, prior behavior); REPACK keeps plain "Add
  to plan"; RecipeOverridePanel mount + toast wiring
- src/app/(ops)/stock/production-actual/page.tsx — open call now carries from_plan_id;
  customized_recipe on the snapshot type; accent banner above the consumption preview ("This run
  uses a custom recipe — materials will be consumed per the adjusted recipe."); preview math
  scales the server-replaced lines verbatim (no client recomputation contradicts the override)
- docs/portal-os/tranches/052-recipe-override-ui.md, registry.md

## Override-flag path for the card badge (decision)
The plan-list reads DTO does NOT carry an override flag, and a per-card recipe GET is too heavy.
Chosen path: a tiny boolean query keyed ["plan-recipe-flag", plan_id] that is (a) written into
the cache by the save/clear mutation (badge appears immediately after saving) and (b) lazily
fetched via the recipe GET only while the card's BOM-impact panel is open. Cards never touched
this session show no badge — honest lazy state, zero fan-out on board load.

## Gates
tsc clean; vitest 567/567 green (516 baseline + 26 new here + concurrent-tranche additions;
final run taken with the concurrent CalendarView/forecast tranche present in the same tree);
existing testids preserved; recipe panel follows the items-end sm:items-center bottom-sheet
pattern.

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [ ] Pushed
