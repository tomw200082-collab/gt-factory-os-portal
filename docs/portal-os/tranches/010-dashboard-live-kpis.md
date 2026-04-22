# Tranche 010: dashboard-live-kpis

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: dashboard_truth
expected_delta: +2 (dashboard_truth 7→9)
sizing: S (2 files; 1 new)

## Why this tranche
The dashboard is a server component that greets the user and links to live modules — but it has no numbers. An operator landing there has to click through to know whether anything needs attention. Live KPI tiles (exceptions-open, planning-runs total, forecast-drafts) make the dashboard immediately useful and close the `dashboard_truth` gap without needing any new backend endpoints — every query points at an existing GET proxy.

## Scope
- New `src/components/dashboard/KpiTiles.tsx` — client component with three `useQuery` calls (`/api/exceptions?status=open`, `/api/planning/runs`, `/api/forecasts/versions?status=draft`). Renders a responsive 1→3 column tile grid. Each tile: count + label + link to filtered view. Graceful degradation: "—" with tooltip when query fails; `<Skeleton />` while loading.
- `src/app/(shared)/dashboard/page.tsx` — render `<KpiTiles />` between the workflow header and the live-modules card. Keeps the greeting server-side; KPIs are hydrated client-side after mount.

## Manifest (files that may be touched)
manifest:
  - src/components/dashboard/KpiTiles.tsx
  - src/app/(shared)/dashboard/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Chart widgets (timeseries, sparklines) — require the backend to expose aggregated endpoints.
- Role-scoped KPI filtering — all tiles visible to every authenticated role; the upstream API gates by capability.
- Stock ledger last-movement — no GET endpoint exists.

## Tests / verification
- typecheck clean.
- Manual: `/dashboard` renders tiles with live counts; tile links land on the correct filtered pages.

## Rollback
Revert; zero runtime impact outside /dashboard.

## Operator approval
- [x] Tom approves this plan (session directive "תעשה הכל לפי הסדר אבל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
