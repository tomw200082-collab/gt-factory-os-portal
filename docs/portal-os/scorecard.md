# Portal Readiness: 44/100 (delta: baseline)

First concrete score — previous was unset (-1 placeholder). Source audit: [2026-04-22-all.md](audit-reports/2026-04-22-all.md).

## Categories

| Category | Score | Gap to 10 |
|---|---|---|
| admin_superuser_depth | 3 | Replace /admin/integrations fabrication with a real health query, build detail pages for items/components/suppliers, de-quarantine or reclassify jobs+users, and surface an audit-trail column. |
| nav_integrity | 3 | Correct the 4 /ops/stock/* manifest paths, remove QuarantinedPage surfaces from SideNav (or flip their manifest status to quarantined), add /inbox + /admin/products/[item_id] rows, and freeze baseline. |
| flow_continuity | 2 | Build /stock/submissions read-back, build the unified inbox listing, wire Cancel to the existing /api/physical-count/[id]/cancel proxy, linkify exception-row entity references, and include deep links in operator success banners. |
| role_gate_correctness | 6 | Pin manifest role lists to layout semantics (or tighten layouts to match manifest), and scope (inbox)/layout approvals children to planner:execute. |
| data_truthfulness | 5 | Replace the INTEGRATIONS fabrication with a real health query and hide the FAKE SESSION pill behind NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH. |
| planning_surface | 7 | Add invalidateQueries(['forecasts','versions']) in forecast/new.onSuccess, linkify convert-to-PO toasts, linkify exception-row entity references. |
| ops_surface | 3 | Build /stock/submissions list (already in nav-manifest plan §B.1), wire Physical Count Cancel to the existing proxy, include deep links in all four submit banners. |
| dashboard_truth | 6 | Evolve /dashboard into a real KPI surface (runs-today, pending-approvals, exceptions-open) sourced from live queries; fix the integrations dashboard fabrication in tandem. |
| technical_substrate | 6 | Rename the fake-auth identifiers (or add pending-cleanup quarantine entries naming these three files), paraphrase the api-proxy comment, and wire forecast/new invalidation. |
| regression_resistance | 3 | Freeze baseline.json from this audit (populate routes/nav_items/role_gates), seed quarantine.json with pending-cleanup entries for the three fake-auth files, delete the stale TODO, and clean the legacy e2e spec. |

## What moved since last time

This is the first real score. The `-1` placeholders across all 10 categories have been replaced with evidence-backed values; total lands at 44/100. The lowest-scoring dimension is `flow_continuity` (2/10) — every operator submit is write-without-read, and both manual-approval flows are orphan deep links. The highest is `planning_surface` (7/10), where the forecast → runs → exceptions loop is mostly walkable with correct TanStack cache invalidation. Four categories sit at 3/10 (admin_superuser_depth, nav_integrity, ops_surface, regression_resistance), which together define the first bounded tranche focus: bootstrap-truthfulness (integrations, jobs+users, manifest correction, forbidden-string quarantine) unblocks the OS's ability to measure itself; then stock-readback-and-inbox attacks flow_continuity + ops_surface directly.

## How scoring works
1. `/portal-audit` produces evidence.
2. `/portal-scorecard` reads the latest audit + live repo state, assigns 0–10 per category, writes `scorecard.json`, and regenerates this file.
3. Delta is recorded so movement is visible.

## What "full production" looks like
- All 10 categories at ≥ 8/10.
- No critical drift in the most recent weekly cron report.
- At least one tranche landed for every category that started below 6/10.

last_reviewed: 2026-04-22
