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
- `docs/portal-os/tranches/020-economics-page-ux-polish.md` — Economics page filters + cost-gaps drawer + publish affordance + UX sweep
- `docs/portal-os/tranches/021-receipt-smart-picker.md` — Smart Picker + PO Ledger + per-line progress pills for /stock/receipts
- `docs/portal-os/tranches/022-format-qty-sweep.md` — fmtNumStr() applied portal-wide to strip 8-dp noise from qty displays
- `docs/portal-os/tranches/023-ux-pro-polish.md` — replace emoji decorations with Lucide icons across receipts surface
- `docs/portal-os/tranches/024-operator-forms-design-pass.md` — operator forms: hero numerics, typography, primary CTA, step-indicator
- `docs/portal-os/tranches/025-physical-count-pro-redesign.md` — physical-count: pro-grade redesign, unified banner, cancel polish
- `docs/portal-os/tranches/026-economics-pl-coverage.md` — Economics Overview: P&L Coverage frame (dual-axis revenue+SKU), demand-weighted sort, chip taxonomy split, honest inventory totals
- `docs/portal-os/tranches/027-procurement-shared-line-editor.md` — extract mode-aware PoLineEditor + useOrderables from /new (pure refactor); foundation for the procurement-merge epic (028–030: unified action-list page, focus mode + inline create, ad-hoc in session)
- `docs/portal-os/tranches/028-procurement-unified-action-list.md` — new /planning/procurement merged page; default view = action list grouped by decision (must-today / can-wait / handled) with a derived "why now"; nav swaps Purchase Session + Calendar for one Procurement entry; entry point for focus mode (029)
- `docs/portal-os/tranches/029-procurement-focus-mode.md` — full-screen one-order-at-a-time focus overlay (approve→place→next, auto-advance, keyboard, order document) reusing the session mutations; launched from the 028 action list
- `docs/portal-os/tranches/030-procurement-adhoc-in-session.md` — ad-hoc add-a-line inside focus mode via the shared useOrderables picker + add_lines; one-off new-supplier order routes to the manual PO form; closes the procurement-merge epic
- `docs/portal-os/tranches/031-procurement-focus-hardening.md` — post-merge hardening of the focus mode: mobile table scroll, dialog focus-trap + initial focus, mobile footer, remaining-aware completion screen (+ remainingCount helper/test)
- `docs/portal-os/tranches/032-procurement-test-coverage.md` — direct ActionList + FocusMode integration tests (controller/grouping), Hebrew day-grammar in "why now", progressbar a11y; triage of the 35 pre-existing unrelated failures
- `docs/portal-os/tranches/033-procurement-calendar-view.md` — folds the calendar timeline into /planning/procurement as a secondary view (toggle: action list / calendar), derived from session.pos with a pure tested grid engine; day chips open focus mode
- `docs/portal-os/tranches/034-recipe-health-test-repair.md` — repairs 7 stale recipe-health-card assertions (label-in-two-places idiom + `{row}` clone envelope); flags 1 genuine draft-exists-modal discrepancy as FIXME; full suite 35→28 fails (phase 1 toward green + CI-gated vitest)
- `docs/portal-os/tranches/035-test-suite-green-sweep.md` — drives the whole unit suite red→green (35 fails → 0; 30 stale-assertion fixes + 5 documented obsolete-doctrine skips) and wires `vitest` into portal-pr-guard so the suite can't silently rot again
- `docs/portal-os/tranches/036-focus-e2e-doctrine-ci.md` — route-mocked focus-mode e2e (approve→place→done), re-anchors the items-bom doctrine to the products surface (0 skips), and gates the `@mocked` e2e in CI (chromium + dev-shim, no backend)
- `docs/portal-os/tranches/037-weekly-meeting-ux-a11y.md` — accessibility + interaction pass over the `/planning/meeting` cockpit (cadence-rail step semantics, live-region announcements, aria-busy, labelled day groups, disabled-reason, confirm-focus); +9 meeting-a11y unit tests; suite 395→404
