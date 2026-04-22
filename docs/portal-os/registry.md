# Portal OS Registry

Index of every operating artifact. One line per entry. ≤150 chars per line. Keep alphabetical within sections.

## Commands
- [portal-audit](../../.claude/commands/portal-audit.md) — deep admin audit, dispatches three auditors in parallel, writes a dated report
- [portal-readiness](../../.claude/commands/portal-readiness.md) — consolidated headline: scorecard + audits + tranches + drift
- [portal-regression-guard](../../.claude/commands/portal-regression-guard.md) — dispatch regression-sentinel; fail on baseline drift
- [portal-scorecard](../../.claude/commands/portal-scorecard.md) — recompute 10-category readiness JSON + markdown mirror
- [portal-tranche-fix](../../.claude/commands/portal-tranche-fix.md) — execute tranche NNN as ONE bounded commit set with verification
- [portal-tranche-plan](../../.claude/commands/portal-tranche-plan.md) — propose next tranche from top scorecard gap

## Subagents
- [portal-admin-surface-auditor](../../.claude/agents/portal-admin-surface-auditor.md) — admin-as-superuser depth audit
- [portal-flow-continuity-auditor](../../.claude/agents/portal-flow-continuity-auditor.md) — end-to-end journey walkability
- [portal-regression-sentinel](../../.claude/agents/portal-regression-sentinel.md) — baseline + quarantine drift detector
- [portal-route-auditor](../../.claude/agents/portal-route-auditor.md) — structural route + nav surface audit
- [portal-tranche-verifier](../../.claude/agents/portal-tranche-verifier.md) — post-fix verification gate

## Hooks
- [pre_tool_use.sh](../../.claude/hooks/pre_tool_use.sh) — tranche manifest + quarantine + secrets structural backstop
- [session_start.sh](../../.claude/hooks/session_start.sh) — scorecard + active tranche + drift opening context
- [stop.sh](../../.claude/hooks/stop.sh) — no-dead-air: requires a Next action: line
- [subagent_stop.sh](../../.claude/hooks/subagent_stop.sh) — PASS/complete claims require an Evidence: path

## Workflows
- [claude.yml](../../.github/workflows/claude.yml) — @claude mention handler (mobile-primary entry)
- [portal-drift-weekly.yml](../../.github/workflows/portal-drift-weekly.yml) — weekly drift + readiness; opens issue on regression
- [portal-pr-guard.yml](../../.github/workflows/portal-pr-guard.yml) — typecheck + vitest + playwright + registry presence on every PR

## Canonical artifacts
- [baseline.json](baseline.json) — frozen repo-truth snapshot; regression-sentinel compares against it
- [quarantine.json](quarantine.json) — dead/fake/quarantined path list + forbidden_strings
- [route-manifest.json](route-manifest.json) — canonical list of live routes, roles, status
- [scorecard.json](scorecard.json) — 10-category readiness score (machine-readable)
- [scorecard.md](scorecard.md) — human-readable mirror of scorecard.json

## Tranches
- [000-template.md](tranches/000-template.md) — tranche template (do not set status=proposed on this file)
- [_active.txt](tranches/_active.txt) — contains the currently active tranche number, or empty
