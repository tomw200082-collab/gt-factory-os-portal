# Tranche 092: production-plan — flow-integrity round 2 (button-logic completeness)

status: in-progress
created: 2026-06-26
scorecard_target_category: flow_continuity / ops_surface
expected_delta: +1 (close the in-flight/consistency gaps the post-090 /button-logic-review surfaced)
sizing: S-M (additive guards + spinners + one client-side validation gate; no copy, no token changes)
source: /button-logic-review /planning/production-plan (2026-06-26, post-090)

## Why
The post-090 button-logic re-audit confirmed all six 090 fixes landed and found a
small, same-class set of remaining gaps: in-flight disable not propagated to the
day-lane add buttons, two submit buttons missing the spinner the rest of the surface
uses, a missing dirty-gate, and a missing client-side qty guard. All FLOW_COMPLETION,
all additive — finishes the interaction-completeness pass.

## Findings addressed
- INTER-N01 [P1] ProductionDayLane add buttons — disable during `createMut.isPending`.
- INTER-N02 [P1] EditNoteModal — gate Save on `isDirty` (match EditModal).
- INTER-N03 [P1] DeleteModal confirm — add `Loader2` spinner.
- INTER-N04 [P1] RecipeOverridePanel save — swap static FlaskConical → `Loader2` while saving.
- INTER-N05 [P1] EditModal — client guard: block submit when qty cleared/≤0 (no NaN PATCH).
- INTER-N06 [P2] RecipeOverridePanel per-line qty — `aria-invalid` + visual mark on empty/≤0 rows.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.test.tsx
  - docs/portal-os/registry.md

## Verification
- tsc 0 (baseline 0).
- vitest full suite green (baseline 790/790); add a focused test where cheap (EditModal qty guard / day-lane disable).
- No copy/string changes, no token changes.

## Checklist
- [x] INTER-N01 day-lane add disable (ProductionDayLane `creating` prop + page wiring + test)
- [x] INTER-N02 EditNoteModal isDirty gate
- [x] INTER-N03 DeleteModal spinner
- [x] INTER-N04 RecipeOverridePanel save spinner (Loader2 import added)
- [x] INTER-N05 EditModal qty guard (aria-invalid + inline error + disabled gate)
- [x] INTER-N06 per-line qty highlight (aria-invalid + red border)
- [x] tsc 0 + vitest 792/792 (+2 ProductionDayLane tests)
- [ ] Tom merge review
