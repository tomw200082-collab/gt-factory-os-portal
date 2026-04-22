# GT Factory OS Portal — Claude Code config (Portal Improvement OS)

Portal-repo-scoped harness. Makes the portal improvable through bounded, verified, GitHub-driveable tranches. **Not a runtime dependency of the portal** — build tooling only.

## What this harness does
- **Scopes every edit to an active tranche** via `PreToolUse` hook.
- **Refuses "done" claims without evidence paths** via `SubagentStop` hook.
- **Refuses dead-air endings** via `Stop` hook.
- **Keeps the opening context thin** via `SessionStart` — prints scorecard summary, active tranche, drift status.
- **Provides six portal-specific slash commands** under `commands/`.
- **Provides five portal-specific subagents** under `agents/`.

## What this harness does not do
- It does not author backend contracts, schema, migrations, or integrations. Those belong to PRODUCTION's W1/W4 executors.
- It does not bypass Mode B semantics — if `docs/portal-os/runtime_ready.snapshot.json` lacks an entry for a given form, canonical authoring for that form is refused.
- It does not skip CI via `--no-verify`.
- It does not modify the baseline or quarantine files silently — those require a named, narrow ritual command.

## Files
```
.claude/
├── README.md                       this file
├── settings.json                   hooks + permissions (portal scope)
├── commands/
│   ├── portal-audit.md             /portal-audit [scope]
│   ├── portal-scorecard.md         /portal-scorecard
│   ├── portal-tranche-plan.md      /portal-tranche-plan [focus]
│   ├── portal-tranche-fix.md       /portal-tranche-fix NNN
│   ├── portal-regression-guard.md  /portal-regression-guard
│   └── portal-readiness.md         /portal-readiness
├── agents/
│   ├── portal-route-auditor.md
│   ├── portal-admin-surface-auditor.md
│   ├── portal-flow-continuity-auditor.md
│   ├── portal-tranche-verifier.md
│   └── portal-regression-sentinel.md
└── hooks/
    ├── session_start.sh
    ├── pre_tool_use.sh
    ├── subagent_stop.sh
    └── stop.sh
```

## Authority references
This harness references but does not restate:
- `CLAUDE.md` at repo root — thin pointer
- `docs/portal-os/registry.md` — index of OS artifacts
- `docs/portal-os/scorecard.md` — current readiness
- `docs/portal-os/baseline.json` — regression baseline
- `docs/portal-os/quarantine.json` — dead/fake/quarantined paths
- `docs/portal-os/tranches/_active.txt` — current tranche scope

If this harness conflicts with any of those, those files win.

---
last_reviewed: 2026-04-22