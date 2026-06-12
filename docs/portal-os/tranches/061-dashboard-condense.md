# Tranche 061 — dashboard-condense: less load, money-first planning, beauty pass (Phase 3 of 4)

status: implemented (branch `claude/dashboard-ui-audit-pc60ck`; Tom merges after screenshot review)
evidence: tsc clean · vitest 622/622 (78 files) · eslint clean · Playwright @mocked 4/4 ·
  3 fresh screenshots delivered (critical/clear desktop + mobile). Page: 10 → 7 sections;
  one query removed (exceptions 200-row); 2 orphan components deleted (KpiTile, StockHealthCard).
phase: dashboard convergence, Phase 3 — re-scoped by Tom's screenshot review
(2026-06-12): "לרכז, למקד ולהוריד עומס מיותר… הכי חשוב: כמה כסף אוציא השבוע על
רכש של חומרי גלם ואריזות לפי תכנון הייצור, רכש בפועל שלא נשמר כהזמנות רכש,
וקבלת סחורה שהוזמנה… תקפיד על עיצוב ממש ממש יפה."

## Design thesis
The Tranche-060 page still carried legacy bands that duplicate the Flow
Ribbon and the queue. Phase 3 cuts the page from 10 sections to 7, and gives
Tom the three answers he named, in one place — **The Week panel**:

1. **How much money goes out this week on RM+PKG** (per the planning-driven
   purchase session): the unplaced session-PO total is the panel's display
   number; placed-this-week shown beside it.
2. **Procurement decided but not recorded as a PO**: session POs in
   `approved` (and `proposed`) status — named explicitly with count + ₪.
3. **Goods waiting to be received**: open POs (count, ₪, late) with a
   receive CTA.

## Duplication map (what is removed, and which surface now owns its job)

| Removed | Job moves to |
|---|---|
| KPI strip (RM/FG value, Open POs, Critical Exceptions tiles) | RM+PKG money → Week panel; FG value → ribbon FG node; open POs → Week panel "awaiting receipt"; total value → verdict chip; exceptions → inbox (queue keeps stops-production rows) |
| Shortage Risk panel | MATERIALS node (state + min-cover + drill card) → /planning/inventory-flow |
| Stock Health donut | MATERIALS node state dot + sub-line |
| PlanningCard (latest run) | /planning quick action; run meta is not a daily decision |
| ProductionWeek bars | Week panel production half (runs done/total this week) |
| Recent Production panel | merged single "Recent activity" feed (ledger already contains production output) |
| Stock-movement-flow chart | ribbon edge animations carry today's flow; chart band keeps Production activity + Inventory value (planner) |
| exceptionsQ (200-row fetch) | dropped — one less query on mount |

## Beauty pass (visual constitution §5 enforcement)
- Flow nodes get the premium kpi-tile language: tone-driven top rail +
  gradient, larger display numbers, hover lift — the ribbon reads as the
  page's instrument cluster.
- Longer, clearer edge connectors.
- Canvas calm: dot-grid faded 0.45 → 0.18; hero "breathe" animation removed
  (motion budget: live dot, count-up, chart draw-in, danger pulse only).
- Charts gain a dashed peak gridline + peak label (y-reference, DASH-V5).
- Week panel reuses the .kpi-tile premium shell (tone rail, icon halo, big
  tabular number) so the page stays one coherent language.

## File manifest
- `docs/portal-os/tranches/061-dashboard-condense.md` — this plan.
- `src/app/(shared)/dashboard/_lib/week.ts` — NEW pure module: session-PO
  week money rollup (to-order / approved-not-placed / placed, ILS guard) +
  week run progress. With `week.test.ts`.
- `src/app/(shared)/dashboard/_components/bands/WeekPanel.tsx` — NEW Band 3.
- `src/app/(shared)/dashboard/page.tsx` — section removals + WeekPanel wiring;
  exceptionsQ removed; merged activity feed.
- `src/app/(shared)/dashboard/_components/KpiTile.tsx` — DELETED (unused).
- `src/app/(shared)/dashboard/_components/StockHealthCard.tsx` — DELETED (unused).
- `src/app/(shared)/dashboard/_components/TrendChart.tsx` — peak gridline+label.
- `src/app/globals.css` — node premium pass, calm pass, week-panel rows.
- `tests/e2e/dashboard.spec.ts` — assertions updated to the condensed layout.

## Verification gates
- tsc clean · vitest green (incl. new week tests) · eslint clean ·
  Playwright @mocked dashboard + procurement green · fresh screenshot set to Tom.

## Behaviour preserved
- Every deep link that existed survives (links move surfaces, never vanish).
- Verdict band, ribbon semantics, queue ranking, role rules — unchanged.
- No new data sources; one query (exceptions) removed.
