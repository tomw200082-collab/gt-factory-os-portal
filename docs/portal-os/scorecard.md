# Portal Readiness: 84/100 (delta: +40 total, +9 this run)

Post-Tranche-015. Previous (start of run): 75/100. Two-session total: +40 from baseline 44. Source audit (re-audit): [2026-04-22-all-reaudit.md](audit-reports/2026-04-22-all-reaudit.md).

## Categories

| Category | Score | Δ total | Gap to 10 |
|---|---|---|---|
| admin_superuser_depth | 5 | +2 | **Backend-blocked.** Audit-trail GET, approval-queue mutations, real /admin/users + /admin/jobs + /admin/integrations endpoints. |
| nav_integrity | 8 | +5 | Baseline freeze ritual; remaining detail sub-pages in manifest. |
| flow_continuity | 9 | +7 | Recent-submissions surface (backend-blocked); approval queue for master-data edits (backend-blocked). |
| role_gate_correctness | 9 | +3 | Optional path-specific role gates in middleware. |
| data_truthfulness | 8 | +3 | Real /admin/integrations health (backend-blocked); aggregate KPIs (backend-blocked). |
| planning_surface | 9 | +2 | Optional planning-exceptions dashboard. |
| ops_surface | 8 | +5 | Recent-submissions (backend-blocked); auto-post deep-link target (backend-blocked). |
| dashboard_truth | 9 | +3 | Aggregate KPIs (backend-blocked). |
| technical_substrate | 10 | +4 | Maintained. |
| regression_resistance | 9 | +6 | Baseline + quarantine rituals. |

## What this run delivered (production-control, not polish)

**+9 (75 → 84)** — four genuine production-control tranches:

1. **Tranche 012** `po-detail-page` (+3) — convert-to-PO toast no longer 404s; PO list rows are click-through; new GET proxy for `/api/purchase-orders/[po_id]`; new detail page with header, source linkage, lines table; defensive contract tolerates header-only upstream responses with honest EmptyState (not fabrication).
2. **Tranche 013** `receipt-po-linkage` (+2) — Goods Receipt no longer hardcodes `po_id: null`. Optional PO dropdown (OPEN+PARTIAL); per-line po_line_id picker fed from T012 detail proxy; supplier auto-defaults from selected PO. **The PO chain is now closeable end-to-end** (rec → PO → receive-against-PO → upstream advances state).
3. **Tranche 014** `inbox-federation` (+2) — `/inbox` was a one-link stub; now a real triage queue federating `/api/exceptions?status=open,acknowledged` with severity dots, category badges, age, and the T005 deep-link map (rows pointing at approvable submissions land on `/inbox/approvals/{type}/{id}`). No new backend dependency.
4. **Tranche 015** `role-boundary-e2e` (+2) — 12-test matrix in `tests/e2e/role-boundaries.spec.ts`. Six UI-gate tests (viewer/operator/planner blocked from approvals, admin items, etc.). Six API-gate tests (viewer + operator POST/PATCH attempts to privileged endpoints assert >= 400). Defense-in-depth claim from T011 is finally test-backed.

**Honest accounting** — re-audit found T001-T011 was ~73% polish/hygiene. T012-T015 reverses that ratio: 4 of 4 advance the operational object graph.

## Categories at ≥ 8 (production-ready)

- `technical_substrate` 10/10
- `flow_continuity` 9/10 — PO chain closed; inbox federated; approval flows discoverable
- `role_gate_correctness` 9/10 — defense-in-depth tested
- `planning_surface` 9/10 — full loop walkable + deep-linked
- `dashboard_truth` 9/10 — live KPIs + honest degradation
- `regression_resistance` 9/10 — error boundaries + E2E gate matrix
- `nav_integrity` 8/10 — coherent and quarantine-clean
- `data_truthfulness` 8/10 — no fabrications anywhere
- `ops_surface` 8/10 — mobile-first, PO-aware, banner-deeplinked

## Single category below 8: `admin_superuser_depth` (5)

This is the genuine "needs backend lane" frontier. Three backend-blocked items:
1. **Audit-trail GET** (`GET /api/audit-log?entity_type=&entity_id=`) → unblocks history tabs on Product 360 + 5 other detail pages (currently placeholder).
2. **Approval-queue mutations** (`POST /api/admin/change-requests` + planner approve/reject) → enables four-eyes review on sensitive master-data fields.
3. **Real users/jobs/integrations endpoints** (`GET /api/admin/users`, `POST /api/admin/users/[id]/role`, `GET /api/admin/jobs`, `POST /api/admin/jobs/[name]/run-now`, `GET /api/integrations/health`) → un-quarantines the three QuarantinedPage admin shells.

When these land, portal-side the work is M-or-smaller per shell.

## What "FULL PRODUCTION" needs from here (operator-prioritized)

**Portal-native, can ship in a follow-up sprint without any backend work:**
1. Path-specific role gates in middleware (belt-and-suspenders layer 3) — S
2. Manifest completeness for remaining detail sub-pages — XS
3. Per-item planning-policy overlay UI (depends on backend schema; portal portion is M)
4. Process.env → requireEnv migration sweep — S
5. Graduate CSP from report-only after one clean production day — XS

**Cross-lane coordination required (W1 backend + portal):**
6. `GET /api/stock-submissions` + `/stock/submissions` list page (M backend + S portal)
7. `GET /api/audit-log` + History tabs on 6 admin detail pages (M backend + M portal)
8. `GET /api/admin/users` + invite/role-change UI (L backend + M portal)
9. `GET /api/admin/jobs` + run-now/pause UI (M backend + S portal)
10. `GET /api/integrations/health` + per-channel UI (M backend + S portal)

**Outside portal lane:**
11. Real LionWheel / Shopify / Green Invoice ingestion (W1/W4 lane)
12. Backup / rollback / rebuild_verifier rituals (infra)

## What "full production" looks like (criteria recap)
- All 10 categories at ≥ 8/10 — **9 of 10 met today**.
- No critical drift in the most recent weekly cron report.
- At least one tranche landed for every category that started below 6/10 — **all 4 met** (admin_superuser_depth +2, nav_integrity +5, flow_continuity +7, regression_resistance +6).

last_reviewed: 2026-04-22
