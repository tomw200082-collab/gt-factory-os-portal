# Portal OS Registry

Index of every operating artifact. Entries use repo-root-relative paths so the PR guard's registry presence check (`grep -Fq` on path) passes on every new artifact.

## Commands
- `.claude/commands/portal-audit.md` — deep admin audit, dispatches three auditors in parallel
- `.claude/commands/portal-readiness.md` — consolidated headline: scorecard + audits + tranches + drift
- `.claude/commands/portal-regression-guard.md` — dispatch regression-sentinel; fail on baseline drift
- `.claude/commands/portal-scorecard.md` — recompute 10-category readiness JSON + markdown mirror
- `.claude/commands/portal-tranche-fix.md` — execute tranche NNN as ONE bounded commit set with verification
- `.claude/commands/portal-tranche-plan.md` — propose next tranche from top scorecard gap

## Subagents
- `.claude/agents/portal-admin-surface-auditor.md` — admin-as-superuser depth audit
- `.claude/agents/portal-flow-continuity-auditor.md` — end-to-end journey walkability
- `.claude/agents/portal-regression-sentinel.md` — baseline + quarantine drift detector
- `.claude/agents/portal-route-auditor.md` — structural route + nav surface audit
- `.claude/agents/portal-tranche-verifier.md` — post-fix verification gate

## Hooks
- `.claude/hooks/pre_tool_use.sh` — tranche manifest + quarantine + secrets structural backstop
- `.claude/hooks/session_start.sh` — scorecard + active tranche + drift opening context
- `.claude/hooks/stop.sh` — no-dead-air: requires a Next action: line
- `.claude/hooks/subagent_stop.sh` — PASS/complete claims require an Evidence: path

## Workflows
- `.github/workflows/claude.yml` — @claude mention handler (mobile-primary entry)
- `.github/workflows/portal-drift-weekly.yml` — weekly drift + readiness; opens issue on regression
- `.github/workflows/portal-pr-guard.yml` — typecheck + registry presence on every PR

## Canonical artifacts
- `docs/portal-os/baseline.json` — frozen repo-truth snapshot; regression-sentinel compares against it
- `docs/portal-os/quarantine.json` — dead/fake/quarantined path list + forbidden_strings
- `docs/portal-os/route-manifest.json` — canonical list of live routes, roles, status
- `docs/portal-os/scorecard.json` — 10-category readiness score (machine-readable)
- `docs/portal-os/scorecard.md` — human-readable mirror of scorecard.json

## Migration docs
- `docs/portal-os/MIGRATION-HISTORY.md` — history of OS merges onto main (what was imported, what was kept, rationale)

## Background packages
- `docs/portal-os/backend-package-admin-superuser-depth.md` — 5-deliverable backend package to move admin_superuser_depth to 10/10

## Tranches (history + state)
- `docs/portal-os/tranches/000-template.md` — tranche template (do not set status=proposed on this file)
- `docs/portal-os/tranches/_active.txt` — contains the currently active tranche number, or empty
- `docs/portal-os/tranches/001-bootstrap-truthfulness.md` — (PR #3 branch history) truthfulness of OS files vs code
- `docs/portal-os/tranches/002-fake-auth-identifier-rename.md` — (PR #3 branch history) FakeSession → DevShimSession rename
- `docs/portal-os/tranches/003-role-gate-manifest-alignment.md` — (PR #3 branch history) manifest pinned to layouts
- `docs/portal-os/tranches/004-physical-count-cancel-wire.md` — (PR #3 branch history) stop leaking server snapshots
- `docs/portal-os/tranches/005-planning-ux-polish.md` — (PR #3 branch history) cache + link hygiene
- `docs/portal-os/tranches/006-ops-banner-deep-links.md` — (PR #3 branch history) pending approvals clickable
- `docs/portal-os/tranches/007-stale-e2e-cleanup.md` — (PR #3 branch history) delete obsolete goods-receipt spec
- `docs/portal-os/tranches/008-mobile-parity.md` — mobile/tablet experience (MobileNav + TopBar + AppShellChrome)
- `docs/portal-os/tranches/009-error-boundaries.md` — error.tsx + global-error.tsx + obs/report.ts
- `docs/portal-os/tranches/010-dashboard-live-kpis.md` — KpiTiles component (three live counts above the fold)
- `docs/portal-os/tranches/011-security-hardening.md` — env.ts header + env validation
- `docs/portal-os/tranches/012-po-detail-page.md` — (superseded by main's Tranche D; plan preserved as history)
- `docs/portal-os/tranches/013-receipt-po-linkage.md` — (PR #3 branch history) close PO chain break
- `docs/portal-os/tranches/014-inbox-federation.md` — (superseded by main's Tranche B 4-stream federation)
- `docs/portal-os/tranches/015-role-boundary-e2e.md` — role-boundaries.spec.ts 12-test matrix
- `docs/portal-os/tranches/016-middleware-role-gates-and-manifest-completeness.md` — middleware scaffold for layer 3 role gating
- `docs/portal-os/tranches/017-deploy-unblock-dashboard-dynamic.md` — (superseded by main's Tranche C making dashboard "use client")
- `docs/portal-os/tranches/018-public-landing-preview-resilience.md` — public landing at / resilient to auth failures
- `docs/portal-os/tranches/019-bulletproof-root.md` — hardened root page (static, middleware-bypass)
