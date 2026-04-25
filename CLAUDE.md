# GT Factory OS Portal — Improvement OS

> Thin pointer. Do not inline prose. Authority is distributed across the files below.

## UI language exception (Recipe-Readiness corridor, 2026-04-25)

The durable contract states "English-first UI with plain, accessible English labels; Hebrew appears only in data values." The Recipe-Health surface (`/admin/masters/items/[item_id]` for MANUFACTURED items, plus the BOM draft editor at `/admin/masters/boms/[bom_head_id]/[version_id]/edit` and the quick-fix drawer) uses Hebrew operator labels (e.g., "מתכון ייצור", "מוכן לייצור עם אזהרות", "אני מאשר את האזהרות הללו") per Tom's UX target. This is an explicit, scoped deviation from English-first, not a general policy change.

## Read these, in order, at the start of any portal session
1. `docs/portal-os/registry.md` — index of all OS artifacts (≤1 line per entry).
2. `docs/portal-os/scorecard.md` — current readiness, last updated.
3. `docs/portal-os/tranches/_active.txt` — the active tranche number (may be empty).
4. If a tranche is active: `docs/portal-os/tranches/<NNN>-*.md` — its manifest + checklist.

## What this repo is
The canonical, production-target Window 2 portal for GT Everyday. Next.js 15 App Router, React 18, TanStack Query, shadcn/ui primitives, Supabase SSR auth, Zod, Playwright, Vitest.

## What the Portal Improvement OS is
A GitHub-first, mobile-driveable operating layer for making this portal production-grade through bounded, verified tranches.
- Commands: `/portal-audit`, `/portal-scorecard`, `/portal-tranche-plan`, `/portal-tranche-fix`, `/portal-regression-guard`, `/portal-readiness`.
- Agents: `portal-route-auditor`, `portal-admin-surface-auditor`, `portal-flow-continuity-auditor`, `portal-tranche-verifier`, `portal-regression-sentinel`.
- Hooks: session_start, pre_tool_use (tranche-scope enforcement), subagent_stop (evidence required), stop (no dead air).
- GitHub Actions: `claude.yml` (@claude trigger), `portal-pr-guard.yml`, `portal-drift-weekly.yml`.

## Relationship to the PRODUCTION multi-lane harness
This portal repo and its `.claude/` config is **portal-only**. It does NOT author backend contracts, schema, or integrations. Those lanes (W1 / W4) remain governed by the PRODUCTION harness at `PRODUCTION/.claude/`. The Portal OS honors W2 Mode A / Mode B semantics via a manually-synced snapshot in `docs/portal-os/runtime_ready.snapshot.json`.

## The six ways to use this OS
- Open a PR comment `@claude /portal-audit` — mobile-friendly, CI-driven.
- Open a PR comment `@claude /portal-scorecard` — refresh readiness.
- Open a PR comment `@claude /portal-tranche-plan <focus>` — propose next batch.
- Open a PR comment `@claude /portal-tranche-fix NNN` — execute approved tranche.
- Every PR auto-runs `/portal-regression-guard` via `portal-pr-guard.yml`.
- Weekly cron runs `/portal-readiness` via `portal-drift-weekly.yml`.

## Invariants this OS enforces
1. Every portal change is scoped to exactly one tranche (PreToolUse hook).
2. Every "done" claim carries an evidence path (SubagentStop hook).
3. Dead / quarantined / fake-session surfaces never re-enter primary nav (regression-sentinel + PR gate).
4. Scorecard is a versioned JSON file; drift is detectable by diff.
5. No destructive operations run without explicit human merge approval.
6. Every response ends with "Next action: …" (Stop hook).

## What Claude must not do in this repo
- Do not author backend contracts or schema (wrong lane).
- Do not promote files from `window2-portal-sandbox/` sandbox paths into `gt-factory-os/` canonical paths.
- Do not touch `.env*`, `.vercel/`, or any secret path.
- Do not edit files outside the active tranche manifest.
- Do not reintroduce `X-Fake-Session` or `X-Test-Session` patterns to previously-cleaned files.
- Do not bypass `portal-pr-guard` via `--no-verify`, `skip ci`, or similar.

## Escalation
If a request conflicts with these invariants, stop and propose a tranche plan instead.

---
last_reviewed: 2026-04-22
