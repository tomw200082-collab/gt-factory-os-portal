# Tranche 087: production-plan UX fixes (render-grade gate findings)

status: in-progress
created: 2026-06-25
supersedes-active: parks 086 (procurement-placement-queue, blocked on W1 backend) — re-activate 086 when its backend dependency ships
scorecard_target_category: ux / planning
expected_delta: +1 (planning daily-decision surface)
sizing: S (3 source files, additive; 1 docs handoff; no backend, no contract change)
source: /ux-release-gate render-grade audit of /planning/production-plan (2026-06-25), evidence /tmp/ux-shots/*

## Why this tranche
`/ux-release-gate` was run render-grade (real dev-shim screenshots) on the daily
production-decision screen. Findings ranked severity×effort. This tranche lands
the safe, low-blast-radius subset and stages the feature/backend items.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/components/workflow/WorkflowHeader.tsx
  - docs/ux/production-plan-backend-requirements-2026-06-25.md

## Landed this tranche
- **F8 (Copy):** the recommendation-source chip read `Rec` (abbreviation forbidden
  by portal_ux_standard.md §4). → `Recommended`. `ProductionJobCard.tsx`.
- **F9 (Copy):** the page subtitle and the blue "Planned only" banner repeated the
  same sentence verbatim. Subtitle trimmed to "Plan production for the week."; the
  banner keeps the actuals-reporting detail. `page.tsx`.
- **F5 (Layout, shared):** on mobile the header action row overflowed and clipped
  the primary CTA ("+ Add pro…"). The shared `WorkflowHeader` actions wrapper was
  `shrink-0` with no wrap → buttons overflowed the viewport instead of wrapping.
  Added `flex-wrap` (additive; improves EVERY page's header on mobile, same pattern
  as tranche 085). `WorkflowHeader.tsx`.

## Corrected by render+code grounding (NOT bugs — no fix)
- **F7** "floating card overlapping the date strip" — the element is the normal-flow
  `today-strip` (`bg-bg-raised`, not positioned). The apparent overlap/"N" badge was
  the Next.js dev overlay in the screenshot. No defect.
- **F10** "cancelled card keeps full weight" — already de-emphasised:
  `ProductionJobCard.tsx` applies `opacity-70` + `line-through` to cancelled rows.
  Adequate; no change.

## Backend requirements written (separate lane, W1/W4)
`docs/ux/production-plan-backend-requirements-2026-06-25.md` — the data the screen
needs but does not have, for the feature findings:
- **F3 capacity anchor** — needs a daily/shift production-capacity figure.
- **F4 recommendation rationale** — needs the "why recommended" (coverage gap /
  forecast driver) on the recommendation payload.

## Staged (feature / design-decision — next tranche, need design + re-render cycles)
- **F1 feasibility roll-up** — a day-level "is today's plan buildable?" summary bar.
  The per-card BOM-impact + `RecipeOverridePanel` availability tiers already compute
  feasibility per run; a board-level roll-up can be client-side IF the impact data is
  fetched at board scope. Needs a small query/aggregation pass.
- **F2 count consolidation** — three count summaries (KPI strip, today-strip,
  week-completion) overlap with different framing. Design decision: pick the
  single source of truth (recommendation: the today-strip planned/reported/unreported)
  and demote the others. Do not delete unilaterally.
- **F6 mobile board** — weekly day-lane board scrolls horizontally on mobile.
  Proposed: single-day vertical view + day switcher on `<sm`. Layout-heavy; own tranche.

## Verification
- tsc --noEmit: 0
- eslint: 0
- vitest: board-summary, card-delete, WorkflowHeader suites green
- Playwright @uxshot re-render of /planning/production-plan (mobile + desktop) confirms
  CTA no longer clipped, "Recommended" chip, single subtitle.

## Checklist
- [x] F8 copy
- [x] F9 copy
- [x] F5 mobile header wrap
- [x] backend-requirements handoff written
- [ ] Tom review / merge
- [ ] F1 / F2 / F6 → follow-up tranche(s)
