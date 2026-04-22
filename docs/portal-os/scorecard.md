# Portal Readiness: 75/100 (delta: +31 total, +10 this run)

Post-Tranche-011. Previous (start of run): 44/100. Eleven tranches landed in one continuous session on `claude/audit-all-VuctU`. Source audit: [2026-04-22-all.md](audit-reports/2026-04-22-all.md).

## Categories

| Category | Score | Δ total | Gap to 10 |
|---|---|---|---|
| admin_superuser_depth | 5 | +2 | Audit-trail column on 6 wired domains; real users/jobs/integrations once backend endpoints land. |
| nav_integrity | 6 | +3 | Baseline freeze ritual + remaining sub-pages in manifest. |
| flow_continuity | 5 | +3 | **Blocked on API lane.** Needs GET /api/stock-submissions + GET /api/approvals?status=pending. |
| role_gate_correctness | 8 | +2 | Optional path-specific middleware role gates. |
| data_truthfulness | 8 | +3 | Real /admin/integrations health query; aggregate KPIs need backend aggregation. |
| planning_surface | 9 | +2 | Optional planning-exceptions dashboard. |
| ops_surface | 7 | +4 | **Backend-gated.** /stock/submissions read-back + receipts/production-actual banner deep-links. |
| dashboard_truth | 9 | +3 | Aggregate KPIs (runs-today, stock-ledger last-movement). |
| technical_substrate | 10 | +4 | Maintained at 10; follow-up: migrate process.env → requireEnv; graduate CSP from report-only; @sentry/nextjs install. |
| regression_resistance | 8 | +5 | Baseline + quarantine rituals; process.env migration. |

## What moved in this run

**Eleven tranches, +31 total (44 → 75):**

1. **T001** bootstrap-truthfulness (+8)
2. **T002** fake-auth-identifier-rename (+2)
3. **T003** role-gate-manifest-alignment (+2)
4. **T004** physical-count-cancel-wire (+2)
5. **T005** planning-ux-polish (+3)
6. **T006** ops-banner-deep-links (+2)
7. **T007** stale-e2e-cleanup (+1)
8. **T008** mobile-parity (+5) — viewport meta + drawer nav + responsive shell + tap targets
9. **T009** error-boundaries-and-observability (+2) — error.tsx + global-error.tsx + not-found.tsx + reportError
10. **T010** dashboard-live-kpis (+2) — three live tiles with honest degradation
11. **T011** security-hardening (+2) — HSTS/CSP/env-validation

Plus audit-correction (+1) on admin_superuser_depth: detail pages actually exist (route audit was right, admin-surface audit was wrong).

## Categories at ≥ 8 (production-ready)

- **technical_substrate 10/10** — mobile-first shell, error boundaries, observability surface, security headers, env validation.
- **planning_surface 9/10** — forecast+runs+exceptions loop with correct cache invalidation + linkified cross-entity refs.
- **dashboard_truth 9/10** — live KPI tiles + honest degradation; no fabrication.
- **role_gate_correctness 8/10** — manifest pinned to layouts; approval subtree tightened.
- **data_truthfulness 8/10** — no fabrications; dev-shim UI gated; honest error display.
- **regression_resistance 8/10** — error boundaries catch regressions; env fail-fast; OS hooks + workflows live.

## Ceiling categories

**flow_continuity (5) + ops_surface (7 with cap at 8):** both blocked on API-lane work per CLAUDE.md invariant. Specific endpoints needed:
- `GET /api/stock-submissions` — for operator read-back of posted/pending submissions (receipts, waste, counts, production actuals).
- `GET /api/approvals?status=pending` — for the unified inbox listing.
- `GET /api/audit-log?entity_type=&entity_id=` — for audit-trail column on admin surfaces.

Authoring these in the portal would reintroduce fabrication (the same anti-pattern Tranche 001 removed from /admin/integrations). They belong in the W1 API lane.

## Mobile parity ⭐

Tranche 008 was the user-requested mobile item:
- Viewport meta (`width=device-width, initial-scale=1, viewport-fit=cover`) — fixes 2.5× zoom-out default.
- Desktop SideNav hidden `<md`; mobile hamburger + slide-in drawer at `src/components/layout/MobileNav.tsx` (aria-modal, escape-to-close, scroll-lock, backdrop, auto-close on nav).
- Responsive gap/padding on AppShellChrome.
- TopBar: hamburger slot, tightened gaps on mobile, brand subtext hidden `<sm`, review button promoted to 36px.
- SideNav: bumped tap targets from 24px → 36px.
- Receipts line-grid: `minmax(0,…)` fractions so md+ columns don't cramp.

Every operator form already used mobile-first `grid-cols-1 sm:grid-cols-2` patterns; the shell work unlocked them.

## What "full production" needs (remaining roadmap)

Inside portal (portal-native, ready to execute):
1. Baseline freeze ritual (`kind=baseline-update`) — unlocks regression-sentinel binding.
2. Quarantine seed ritual (`kind=quarantine-update`) — pending-cleanup for `fake-auth.ts` + `session-provider.tsx`.
3. Migrate `process.env.X` callsites to `requireEnv()` + call `assertServerBootEnv()` from a root server action.
4. Graduate CSP from report-only to enforce.
5. Add `@sentry/nextjs` dep + wire `forwardToPlatform` in `src/lib/obs/report.ts`.

Across lanes (need W1 API + ops coordination):
6. `GET /api/stock-submissions`, `GET /api/approvals`, `GET /api/audit-log` land in API.
7. Portal /stock/submissions list + receipts/production-actual banner deep-links (depends on #6).
8. Portal unified /inbox listing (depends on #6).
9. Audit-trail column on 6 admin domains (depends on #6).
10. Real /admin/users + /admin/jobs + /admin/integrations (depends on #6 + new write endpoints).

## How scoring works
1. `/portal-audit` produces evidence.
2. `/portal-scorecard` reads the latest audit + live repo state, assigns 0–10 per category, writes `scorecard.json`, and regenerates this file.
3. Delta is recorded so movement is visible.

## What "full production" looks like
- All 10 categories at ≥ 8/10.
- No critical drift in the most recent weekly cron report.
- At least one tranche landed for every category that started below 6/10.

last_reviewed: 2026-04-22
