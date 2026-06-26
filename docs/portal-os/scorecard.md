# Portal Readiness: 94/100 (delta: +3)

> **2026-06-26 recompute.** Evidence-driven by the merge of **PR #124**
> (production-plan tranches 107–113) plus main's parallel UX-flow PRs
> (#123–#142). Not a fresh full audit — a recompute against the live merged tree
> (`tsc` 0 · `eslint` 0 · **vitest 809/809**). Three categories genuinely moved;
> `admin_superuser_depth` stays at 7 (its gaps are backend-lane). All 10
> categories are now ≥ 7; **9 of 10 are ≥ 9.**

Previous: 91/100 (Tranche 092 truth-correction, 2026-06-25).
Source audit (anchor): [2026-06-19-ux-mobile-audit.md](audit-reports/2026-06-19-ux-mobile-audit.md).

## Categories

| Category | Score | Δ | Gap to 10 |
|---|---|---|---|
| admin_superuser_depth | 7 | — | Backend-blocked: audit-trail GET, four-eyes approval queue, run-now/resync mutation halves. The three admin shells are live. |
| nav_integrity | 10 | — | Maintained. Next route audit should confirm PR #142's sidebar + ⌘K search surfaces are manifest-covered. |
| flow_continuity | 10 | — | Live prod-backend smoke of the focus loop (the @mocked e2e is the CI proof); recent-submissions backend-blocked. |
| role_gate_correctness | 10 | — | Middleware gate activates as layer 3 once backend projects `role` into JWT `app_metadata`. |
| **data_truthfulness** | **9** | **+1** | Real `/admin/integrations` health + aggregate dashboard KPIs remain backend-blocked. |
| **planning_surface** | **10** | **+1** | Maintained — the planner loop is walkable and hardened; the only remaining item (exceptions dashboard) was optional polish. |
| **ops_surface** | **9** | **+1** | Recent-submissions surface + auto-post deep-link target backend-blocked. |
| dashboard_truth | 9 | — | Aggregate KPIs (runs today-vs-yesterday, ledger last-movement) need backend aggregation endpoints. |
| technical_substrate | 10 | — | Maintained. Follow-up: requireEnv migration, CSP graduation, Sentry, an eslint config to gate CI. |
| regression_resistance | 10 | — | Maintained. ESLint not yet gating CI; backend-dependent `*-real` e2e not CI-gated. |

## What moved since last time

The +3 (91 → 94) is genuine hardening, not a truth-correction. **`data_truthfulness`
8→9**: PR #124 closed three §1 raw-error leaks (usePlans 422 `detail`,
VARIANCE_TOOLTIP jargon, EditModal `item_id`) and fixed the mixed-UoM "units total"
KPI that was summing liters + bottles + kg into one meaningless number (now shows
the honest run count); main's #135/#131 moved the decision-board and economics
surfaces onto real Shopify/data-span figures. **`planning_surface` 9→10**: the
`/planning/production-plan` corridor was hardened end-to-end — PR #124's P0
data-loss prevention, §1 copy, interaction completeness, full a11y pass, and the
`useDialogA11y` deepen, alongside main's #125 variance/impact deepen, #138
disabled-reason/focus/skeleton, and #139 week-in-URL + ledger deep-links; the one
remaining item was explicitly optional. **`ops_surface` 8→9**: the idempotency-key
lifecycle (tranche 094) now prevents a duplicate ledger event when an operator
retries after a lost response — directly the category's "idempotency UX" criterion —
plus main's #137 stock a11y/redirect/zero-count polish and the #133 movement-log
dead-filter fix.

The lone sub-9 category, **`admin_superuser_depth` (7)**, is unchanged: its real
gaps (audit-log history GET, four-eyes master-data approval queue, run-now/resync
mutation halves) are backend-lane work, out of the portal lane.
