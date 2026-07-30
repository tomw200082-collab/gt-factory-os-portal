# Tranche 155 — corridor focus + Wednesday/Thursday cadence

**Status:** built — tsc 0, eslint 0, vitest 1133/1133, playwright @mocked 56/56; all three corridor pages re-rendered
**Origin:** Tom, 2026-07-30 — corridor walk + three per-page focus audits, approved in session
("סגור" → "מאשר את 155"). Plan: `PRODUCTION/docs/phase8/dry-runs/2026-07-30-corridor-focus-unified-plan.md`.
Audits: `2026-07-30-ux-flow-audit-procurement-corridor.md` + per-page focus reports (same session).
sizing: L
scorecard_target_category: planning_surface
expected_delta: at every stop in the corridor — plan → meeting → procurement → placement queue —
the worker can see, without training, which one thing to do next; and the weekly cadence matches
reality (Wednesday meeting, Thursday procurement).

## Tom's directive

"The corridor must be more focused. At every point ask: is anything here confusing, or is it
completely clear what the next step is? … I need to understand the overall process, but the workers
need to know what to focus on in each page."

## Locked decision — cadence

Wednesday = the meeting (production planning + lock + procurement planning).
Thursday = procurement execution. Was Thursday/Sunday.
`stepForToday()` is the single day gate; day names in copy get a `CADENCE_DAYS` constant so the next
change is one edit. **Not cadence:** `Sun–Thu capacity` is the factory work-week — untouched.

## Scope (24 items)

**Cadence** — MEET-310.
**Real bugs** — PLAN-304 (`Unnamed product` for base batches), PLAN-306 (drafts counted as
unreported + offered "move to tomorrow", contradicting the draft banner), MEET-308 (one missed
"firmed").
**Production plan** — PLAN-301 (+ corridor FLOW-201: primary CTA becomes "review drafts in the
meeting" when drafts exist), PLAN-302, PLAN-303, PLAN-305, PLAN-308, PLAN-309, PLAN-310-lite.
**Meeting** — MEET-301, MEET-302, MEET-303-lite (lock-step done state only), MEET-304, MEET-307,
MEET-309.
**Procurement** — PROC-301 (P0: WorkQueue CTA must reflect real PO status), PROC-302, PROC-303
(+306 merged), PROC-305, PROC-307.
**Corridor** — FLOW-202, FLOW-203, FLOW-204, COPY-201, INTER-201.

## Deliberate skips (ponytail — named re-entry conditions)

| Skipped | Add when |
|---|---|
| PROC-304 three-tier visual hierarchy (L) | still confusing after the PROC-302 reorder ships |
| PLAN-307 draft-tinted timeline bars (M) | a planner actually misreads the rail |
| MEET-303 procure-side completion signal (M) | planners report a missing "am I done" |
| Mobile status-bar metric pruning | 390px still noisy after the rail folds |
| MEET-305 "Edited" badge tooltip | **corrected mid-build:** the audit said `updated_at` / `updated_by_snapshot` were already on `DraftWeekRow`. They are not — the type carries neither. Building it would mean inventing a backend field, so it joins MEET-306 in the backend lane. |

## Escalated out (backend lane)

MEET-306 — W1 batch titles derive from `base_bom_head_id` → "DET STR" instead of a real name.
Needs `base_name` on the production-plan list DTO (`gt-factory-os`). Portal keeps the ID fallback.

## Manifest
manifest:
- src/app/(planning)/planning/meeting/_lib/cadence.ts
- src/app/(planning)/planning/meeting/_lib/cadence.test.ts
- src/app/(planning)/planning/meeting/page.tsx
- src/app/(planning)/planning/production-plan/page.tsx
- src/app/(planning)/planning/production-plan/_lib/board-summary.ts
- src/app/(planning)/planning/production-plan/_lib/board-summary.test.ts
- src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
- src/app/(planning)/planning/procurement/page.tsx
- src/app/(planning)/planning/procurement/_components/ProcurementWorkQueue.tsx
- src/app/(planning)/planning/procurement/_components/ActionList.tsx
- src/app/(planning)/planning/procurement/_components/ActionList.test.tsx
- src/app/(planning)/planning/procurement/_components/FocusMode.tsx
- src/app/(po)/purchase-orders/placement-queue/page.tsx
- src/lib/nav/manifest.ts
- tests/unit/nav/manifest-visibility.test.ts
- tests/unit/features/meeting-a11y.test.tsx
- tests/unit/features/meeting-mobile.test.tsx
- tests/e2e/meeting.spec.ts
- tests/e2e/procurement.spec.ts
- docs/portal-os/tranches/155-corridor-focus.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- `globals.css` / `tailwind.config.ts` / tokens (frozen).
- Backend contracts, schema, migrations (MEET-306 escalated instead).
- COPY-110 (needs Tom's per-role cancel-reason subset), A11Y-106 (frozen tokens), INTER-108.
- Brain-side skill docs naming Thursday/Sunday — ops-docs-curator lane.

## Language
`/planning/procurement` + `/purchase-orders/placement-queue` are Hebrew+RTL (authorized).
`/planning/meeting` + `/planning/production-plan` stay English-first.

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint .` → 0.
- `npx vitest run` → green, with new cases: `stepForToday()` Wed→firm / Thu→procure; drafts excluded
  from the today-strip unreported count; base-batch label resolves via `planLabel`.
- `npx playwright test --grep @mocked` → green.
- Re-render plan / meeting / procurement through `tests/e2e/ux-shot.spec.ts`, attach evidence.
