# Portal Readiness: unscored (delta: 0)

Not yet computed. Run `/portal-audit all` followed by `/portal-scorecard` in the portal repo (or via `@claude` on a PR) to produce the first real snapshot.

## Categories (to be scored)

| Category | Score | Gap to 10 |
|---|---|---|
| admin_superuser_depth | — | not yet scored |
| nav_integrity | — | not yet scored |
| flow_continuity | — | not yet scored |
| role_gate_correctness | — | not yet scored |
| data_truthfulness | — | not yet scored |
| planning_surface | — | not yet scored |
| ops_surface | — | not yet scored |
| dashboard_truth | — | not yet scored |
| technical_substrate | — | not yet scored |
| regression_resistance | — | not yet scored |

## How scoring works
1. `/portal-audit` produces evidence.
2. `/portal-scorecard` reads the latest audit + live repo state, assigns 0–10 per category, writes `scorecard.json`, and regenerates this file.
3. Delta is recorded so movement is visible.

## What "full production" looks like
- All 10 categories at ≥ 8/10.
- No critical drift in the most recent weekly cron report.
- At least one tranche landed for every category that started below 6/10.

last_reviewed: 2026-04-22
