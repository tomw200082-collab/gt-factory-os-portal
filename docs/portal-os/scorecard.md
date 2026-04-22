# Portal Readiness: 52/100 (delta: +8)

Post-Tranche-001 `bootstrap-truthfulness`. Previous: 44/100 (first baseline). Source audit: [2026-04-22-all.md](audit-reports/2026-04-22-all.md). Source tranche: [001-bootstrap-truthfulness.md](tranches/001-bootstrap-truthfulness.md).

## Categories

| Category | Score | Δ | Gap to 10 |
|---|---|---|---|
| admin_superuser_depth | 4 | +1 | Build detail pages for items/components/suppliers, surface an audit-trail column, and replace /admin/integrations QuarantinedPage with a real /api/integrations/health query once the endpoint lands. |
| nav_integrity | 6 | +3 | Populate baseline.json from live state (Tranche 003 kind=baseline-update) and add the remaining sub-page rows. |
| flow_continuity | 2 | 0 | Build /stock/submissions read-back, build the unified inbox listing, wire Cancel to the existing /api/physical-count/[id]/cancel proxy, linkify exception-row entity references, and include deep links in operator success banners (Tranche 005, 006, 007). |
| role_gate_correctness | 6 | 0 | Pin manifest role lists to layout semantics (or tighten layouts to match manifest), and scope (inbox)/layout approvals children to planner:execute. |
| data_truthfulness | 8 | +3 | Evolve /dashboard into a real KPI surface and replace /admin/integrations QuarantinedPage with live health query when endpoint lands. |
| planning_surface | 7 | 0 | Add invalidateQueries(['forecasts','versions']) in forecast/new.onSuccess, linkify convert-to-PO toasts, linkify exception-row entity references. |
| ops_surface | 3 | 0 | Build /stock/submissions list, wire Physical Count Cancel to the existing proxy, include deep links in all four submit banners. |
| dashboard_truth | 6 | 0 | Evolve /dashboard into a real KPI surface (runs-today, pending-approvals, exceptions-open) sourced from live queries. |
| technical_substrate | 6 | 0 | Add pending-cleanup quarantine entries for the two fake-auth files (Tranche 002), then rename identifiers in a follow-up (Tranche 004). Wire forecast/new cache invalidation. |
| regression_resistance | 4 | +1 | Freeze baseline.json from current live state (Tranche 003), seed quarantine.json with pending-cleanup for the two fake-auth files (Tranche 002), and clean the stale _todo_after_bootstrap entry. |

## What moved since last time

**+8 total (44 → 52).** Tranche 001 bootstrap-truthfulness landed a single read-with-a-pen commit that aligned the OS's truth files with code reality:

- `nav_integrity` +3: route-manifest paths for the 4 operator /stock/* routes now match code; /admin/{integrations, jobs, users} reclassified from `live` to `quarantined`; /inbox and /admin/products/[item_id] rows added; SideNav no longer exposes any quarantined surface.
- `data_truthfulness` +3: the /admin/integrations page now renders `<QuarantinedPage>` instead of a hard-coded INTEGRATIONS array with frozen `last_at` timestamps and disabled cosmetic buttons; the "FAKE SESSION" pill in the TopBar is now gated behind `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true"` so it cannot leak to production.
- `admin_superuser_depth` +1: one fabricating domain became one honestly-quarantined domain; the count of "surfaces that lie" dropped from 1 to 0.
- `regression_resistance` +1: `X-Fake-Session` / `X-Test-Session` literals no longer appear anywhere in `src/`; the 4 corrected manifest rows now give regression-sentinel real anchors to bind on.

Six categories are unchanged by design — Tranche 001 was intentionally scoped to truthfulness only. The next two highest-leverage tranches are:

1. **Tranche 002** `quarantine-update`: seed `quarantine.json.entries[]` with `pending-cleanup` for `src/lib/auth/fake-auth.ts` and `src/lib/auth/session-provider.tsx`; delete stale `_todo_after_bootstrap[1]`.
2. **Tranche 003** `baseline-update`: freeze `baseline.json` routes/nav_items/role_gates from live state so regression-sentinel fully binds.

Then Tranches 005–007 (`stock-readback-and-inbox`) attack flow_continuity + ops_surface directly — those two categories together hold 13 of the 48 points currently missing.

## How scoring works
1. `/portal-audit` produces evidence.
2. `/portal-scorecard` reads the latest audit + live repo state, assigns 0–10 per category, writes `scorecard.json`, and regenerates this file.
3. Delta is recorded so movement is visible.

## What "full production" looks like
- All 10 categories at ≥ 8/10.
- No critical drift in the most recent weekly cron report.
- At least one tranche landed for every category that started below 6/10.

last_reviewed: 2026-04-22
