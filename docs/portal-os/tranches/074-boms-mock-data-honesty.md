# Tranche 074 — `/planning/boms` mock-data → honest empty states

status: implemented (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: planning UX/UI audit (2026-06-14) FLOW-007 / VISUAL-012 / VISUAL-014 —
the last P0 blocking a SHIP verdict. Decision delegated to Claude → honest empty
states (no fabricated data, no backend changes).

## Problem
`/planning/boms` rendered hardcoded mock arrays and fake numeric KPI fallbacks as
if they were live factory metrics. Backing fields/endpoints don't exist, and
`throwOnError:false` silently surfaced the fabrications with no "not real"
indicator — a planner could not tell real data from placeholders.

## Changes (single file: `src/app/(planning)/planning/boms/page.tsx`)
- Fabricated numeric KPI fallbacks (`avg_yield_pct ?? 92.4`, `max_bom_depth ?? 3`,
  `inactive_count ?? 4`, `orphaned_component_count ?? 2`,
  `avg_monthly_revisions ?? 2.1`, `shared_component_count ?? 7`,
  `avg_complexity_score ?? 4.2`, `avg_component_cost_ils ?? 8.40`,
  `selected_bom_unit_cost ?? 12.40`, and `activeVersionsBomCount`'s `: 6` fallback)
  → `null` when the real field is absent; rendered as "—" or the chip is hidden.
  No fabricated number is ever shown.
- Mock-data panels (`mockSubstitutionRules`, `mockVersionTimeline`,
  `mockPriceTrendData`, `mockStockCoverageData`, `packagingMaterialData`, inline
  approval rows, `mockShortageForecastData`, `mockMultiBomCostData`,
  `YIELD_VARIANCE`, `BOM_CHANGELOG`) → arrays removed; each panel body renders a
  calm `EmptyState` ("Not yet available — … data is coming soon"). Toggles kept.
- Header KPI chips trimmed to only those backed by real data (VISUAL-012).
- Removed orphan `showSubApplied` state.

## Kept (real, untouched)
`bomComplexityData`, `bomDiffData`, the real `activeVersionsBomCount`, every real
query, BomSimulator, BomNetRequirements, At-risk shortcuts, BOM picker/filter/
search, readiness chips, export, the real Change History / Alternatives /
Validation / Cost-Calculator panels.

## Verification
tsc --noEmit clean · vitest 677/677 · next build OK · eslint 0 errors (220
pre-existing `no-explicit-any` warnings on this file, unchanged). Implemented by
portal-production-executor; independently re-verified.

> With this, **all planning P0s are cleared** — the `/ux-release-gate` HOLD
> blockers are resolved (072 + 073 + 074). Remaining items are P1/P2 (a11y pack,
> visual token/table/chip drift, COPY abbreviations) — conditional-ship.
