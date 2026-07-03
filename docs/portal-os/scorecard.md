# Portal Readiness: 92/100 (delta: +48 total, +1 this update)

> **2026-07-03 DR-018 UX-release-gate P0 batch (Tranche 121).** +1:
> `planning_surface` 9 → 10. Closed all 5 P0 findings from the DR-018 gate
> (`/planning/meeting`↔`/planning/procurement`↔`/purchase-orders/placement-queue`
> Thursday→Sunday corridor): nav discoverability, an undefined `.btn-accent`
> class silently unstyling 10+ primary CTAs, a zero-confirmation destructive
> action, missing dialog focus management (plus a latent stacking-context bug
> found while fixing it — the FocusMode close button was unclickable behind
> the header), and orphaned ARIA grid roles on the inventory-flow desktop
> grid. All e2e-proven `@mocked` on chromium. Evidence lists below for
> tranches 093-120 were not individually back-filled this update —
> `registry.md` is the authoritative one-line-per-tranche index in the
> interim; a full `/portal-scorecard` recompute remains the right way to true
> up every category.
>
> **2026-06-25 truth correction (Tranche A / 092).** +3 is NOT new feature work —
> two stale ratings were corrected against shipped reality. The `/portal-audit`
> admin-surface auditor proved the three admin shells are live (see below);
> `QuarantinedPage` no longer exists anywhere in `src/app`. Tranche 090 performed
> the baseline-update ritual. All 10 categories are now ≥ 7; 9 of 10 are ≥ 8.

Post-Tranche-036 (procurement-merge + suite-green session). Previous: 86/100 (post-017). The +2 this session: flow_continuity 9→10 and regression_resistance 9→10 (see "What this session delivered" below). Source audit (re-audit): [2026-04-22-all-reaudit.md](audit-reports/2026-04-22-all-reaudit.md). Backend package for the last category: [backend-package-admin-superuser-depth.md](backend-package-admin-superuser-depth.md).

## Categories

| Category | Score | Δ total | Gap to 10 |
|---|---|---|---|
| admin_superuser_depth | 7 | +4 | **Partly unblocked (re-credit 2026-06-25).** 3 of 5 deliverables shipped — /admin/users, /admin/jobs, /admin/integrations are live. Remaining: audit-log history (#1) + four-eyes queue (#2) + run-now/resync mutation halves. See [backend-package-admin-superuser-depth.md](backend-package-admin-superuser-depth.md). |
| nav_integrity | 10 | +7 | Maintained. baseline-update ritual done (Tranche 090); manifest covers every page. |
| flow_continuity | 10 | +8 | Maintained. Live prod-backend smoke of the focus loop (the @mocked e2e is the CI proof); recent-submissions + approval queue stay backend-blocked. |
| role_gate_correctness | 10 | +4 | Maintained. Middleware scaffold activates as layer 3 when backend populates `app_metadata.role`. |
| data_truthfulness | 8 | +3 | Real /admin/integrations health (backend-blocked); aggregate KPIs (backend-blocked). |
| planning_surface | 10 | +3 | Maintained. DR-018 P0 batch closed (Tranche 121); P1/P2 backlog (tranches 122-125) still open. |
| ops_surface | 8 | +5 | Recent-submissions (backend-blocked); auto-post deep-link target (backend-blocked). |
| dashboard_truth | 9 | +3 | Aggregate KPIs (backend-blocked). |
| technical_substrate | 10 | +4 | Maintained. |
| regression_resistance | 10 | +7 | ESLint not yet in CI (no config); baseline + quarantine rituals; backend-dependent *-real e2e not gated. |

## What this session delivered (Tranches 027–036)

**+2 (86 → 88)** — the procurement-merge epic, then a full test-suite hardening pass.

- **027–033 `procurement merge` (flow_continuity 9→10):** the scattered Sunday close (purchase session + calendar + recommendations + manual PO) became **one `/planning/procurement` page** — an action list grouped by decision (must-today / can-wait / handled) with a derived "why now"; a full-screen **focus mode** that walks approve → place → auto-advance and creates the real PO through the existing place endpoint; inline ad-hoc add-line; and the calendar folded in as a secondary view. 47 dedicated unit tests.
- **034–035 `suite green + CI gate` (regression_resistance 9→10):** the **entire unit suite driven red→green (35 failing → 0)** — every failure diagnosed on its merits (30 genuine stale-assertion fixes, components unchanged), then **`vitest` wired into `portal-pr-guard`** to close the root cause (CI never ran it, so 35 assertions had silently rotted).
- **036 `focus e2e + doctrine + e2e gate`:** a route-mocked **Playwright e2e proves the focus close loop** end-to-end; the obsolete items-bom doctrine was **re-anchored** to the current products architecture (0 skips); the `@mocked` e2e is now **gated in CI** (chromium + dev-shim, no backend). Suite: **371 passed / 0 skipped** across 52 files.

Honest open items: live production-backend smoke of the focus loop (needs a real env), ESLint in CI (no config yet), and the backend-dependent `*-real` e2e (need Supabase).

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

## Single category below 8: `admin_superuser_depth` (7)

Re-credited 5 → 7 on 2026-06-25: deliverable #3 (the three admin shells) shipped
since the 2026-04-22 rating, but the scorecard lagged. **`/admin/users`,
`/admin/jobs`, `/admin/integrations` are live real-data surfaces today**
(`QuarantinedPage` no longer exists anywhere in `src/app`). Genuinely remaining:

1. **Audit-trail GET** (`GET /api/audit-log?entity_type=&entity_id=`) → unblocks history tabs on Product 360 + 5 other detail pages (currently placeholder). _Backend-blocked._
2. **Approval-queue mutations** (`POST /api/admin/change-requests` + planner approve/reject) → enables four-eyes review on sensitive master-data fields. _Backend-blocked._
3. **Mutation halves of the live shells** — jobs `run-now` (`POST /api/admin/jobs/[name]/run-now`) and a unified integrations resync / `GET /api/integrations/health` feed. _Backend-blocked; the read surfaces already ship._

When #1/#2 land, portal-side the work is M-or-smaller per shell.

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

last_reviewed: 2026-07-03
