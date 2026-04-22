# Portal Readiness: 65/100 (delta: +21)

Post-Tranche-007. Previous: 44/100 (first baseline). Source audit: [2026-04-22-all.md](audit-reports/2026-04-22-all.md). Source tranches: [001](tranches/001-bootstrap-truthfulness.md) · [002](tranches/002-fake-auth-identifier-rename.md) · [003](tranches/003-role-gate-manifest-alignment.md) · [004](tranches/004-physical-count-cancel-wire.md) · [005](tranches/005-planning-ux-polish.md) · [006](tranches/006-ops-banner-deep-links.md) · [007](tranches/007-stale-e2e-cleanup.md).

## Categories

| Category | Score | Δ | Gap to 10 |
|---|---|---|---|
| admin_superuser_depth | 5 | +2 | Surface per-row audit trail on items/components/suppliers/supplier-items/planning-policy/sku-aliases; replace /admin/integrations QuarantinedPage with a real health query once that endpoint lands in the API lane. |
| nav_integrity | 6 | +3 | Baseline freeze via kind=baseline-update ritual; enumerate remaining sub-pages in manifest. |
| flow_continuity | 5 | +3 | **Blocked on API lane.** Needs GET /api/stock-submissions + GET /api/approvals?status=pending before the portal can ship /stock/submissions read-back and unified-inbox listings. |
| role_gate_correctness | 8 | +2 | Consider tightening middleware to add path-specific role gates for belt-and-suspenders defence. |
| data_truthfulness | 8 | +3 | Real /admin/integrations health query when the endpoint lands; evolve /dashboard into live KPI widgets. |
| planning_surface | 9 | +2 | Planning-exceptions dashboard polish (counts + filters at top) — not a blocker. |
| ops_surface | 5 | +2 | Same as flow_continuity — blocked on backend GET endpoints. |
| dashboard_truth | 6 | 0 | Evolve /dashboard into real KPI widgets (runs-today, pending-approvals, exceptions-open). |
| technical_substrate | 7 | +1 | 'fakeauth' lowercase storage key stylistically worth renaming; e2e test-helper modernization. |
| regression_resistance | 6 | +3 | Baseline freeze + quarantine-seed rituals (kind=baseline-update + kind=quarantine-update). |

## What moved since last time

**+21 total (44 → 65).** Seven tranches landed in one continuous session on `claude/audit-all-VuctU`:

1. **Tranche 001** `bootstrap-truthfulness` (+8): manifest paths corrected, integrations fabrication removed, FAKE SESSION pill gated.
2. **Tranche 002** `fake-auth-identifier-rename` (+2): FakeSession → DevShimSession (public Session alias preserved). Last src/ forbidden-string violation eliminated.
3. **Tranche 003** `role-gate-manifest-alignment` (+2): manifest roles pinned to layouts; new (inbox)/inbox/approvals/layout.tsx tightens to planner+admin.
4. **Tranche 004** `physical-count-cancel-wire` (+2): Cancel button now POSTs to existing /api/physical-count/[id]/cancel; snapshots no longer leak.
5. **Tranche 005** `planning-ux-polish` (+3): forecast/new cache invalidation; convert-to-PO link; exception-row entity linkification.
6. **Tranche 006** `ops-banner-deep-links` (+2): pending waste + physical-count banners now render clickable approval links.
7. **Tranche 007** `stale-e2e-cleanup` (+1): deleted stale goods-receipt-success.spec.ts.

Plus a **+1 audit correction** on `admin_superuser_depth`: the admin-surface audit reported items/components/suppliers detail pages as dead; the route audit (correctly) said they exist. A direct disk check confirmed the route audit — all detail pages are present and wired. The scorecard now reflects that truth.

## Ceiling-held categories

**`flow_continuity` (5/10) and `ops_surface` (5/10)** are now both gated on backend API work that CLAUDE.md explicitly forbids this portal repo from authoring: `/stock/submissions` read-back needs `GET /api/stock-submissions`; unified inbox listing needs `GET /api/approvals?status=pending`. Until those land in the W1 API lane, the portal will remain at this ceiling for those two categories — any portal-side attempt to fill the gap would reintroduce the same fabrication anti-pattern Tranche 001 just removed from /admin/integrations.

## Remaining portal-native work (outside this session)

1. **`kind=baseline-update` ritual**: freeze `baseline.json` from the current live state so regression-sentinel has real anchors. Blocked by hook Rule 6 from normal tranche-fix edits; needs an operator-authorized ceremony.
2. **`kind=quarantine-update` ritual**: seed `quarantine.json.entries[]` with pending-cleanup for the two remaining auth files. Same hook constraint.
3. **Audit-trail column** on the 6 wired admin surfaces (items, components, suppliers, supplier-items, planning-policy, sku-aliases). Requires the API to expose `GET /api/audit-log?entity_type=...&entity_id=...` — another lane-boundary item.
4. **Live /dashboard KPIs** (runs-today, pending-approvals, exceptions-open). Portal-native work; good candidate for a future medium tranche.
5. **Convert remaining auto-post banners** (receipts + production-actual) to deep-link once /stock/submissions lands.

## How scoring works
1. `/portal-audit` produces evidence.
2. `/portal-scorecard` reads the latest audit + live repo state, assigns 0–10 per category, writes `scorecard.json`, and regenerates this file.
3. Delta is recorded so movement is visible.

## What "full production" looks like
- All 10 categories at ≥ 8/10.
- No critical drift in the most recent weekly cron report.
- At least one tranche landed for every category that started below 6/10.

last_reviewed: 2026-04-22
