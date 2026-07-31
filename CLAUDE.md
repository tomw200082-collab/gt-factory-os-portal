# GT Factory OS Portal — Improvement OS

> Thin pointer. ⊥ inline prose. Authority lives in the files below.

## Read at session start, in order

1. `docs/portal-os/registry.md` — index of OS artifacts.
2. `docs/portal-os/scorecard.md` — current readiness.
3. `docs/portal-os/tranches/_active.txt` — active tranche number (may be empty).
4. If active: `docs/portal-os/tranches/<NNN>-*.md` — manifest + checklist.

## What this is

Canonical production-target Window 2 portal for GT Everyday. Next.js 15 App Router · React 18 · TanStack Query · shadcn/ui · Supabase SSR auth · Zod · Playwright · Vitest.
The Improvement OS = GitHub-first, mobile-driveable layer for making it production-grade through bounded, verified tranches.

- **Commands:** `/portal-audit` · `/portal-scorecard` · `/portal-tranche-plan` · `/portal-tranche-fix` · `/portal-regression-guard` · `/portal-readiness`
- **Agents:** `portal-route-auditor` · `portal-admin-surface-auditor` · `portal-flow-continuity-auditor` · `portal-tranche-verifier` · `portal-regression-sentinel`
- **Hooks:** session_start · pre_tool_use (tranche-scope) · subagent_stop (evidence required) · stop (no dead air)
- **Actions:** `claude.yml` (@claude) · `portal-pr-guard.yml` (every PR) · `portal-drift-weekly.yml` (weekly `/portal-readiness`)

Drive it by PR comment: `@claude /portal-audit`, `/portal-scorecard`, `/portal-tranche-plan <focus>`, `/portal-tranche-fix NNN`.

## UI language

**English-first.** Plain, accessible English labels; Hebrew only in data values.

**Exception — these surfaces are Hebrew + `dir="rtl"` by Tom's explicit UX target.** This list is complete; anything ∉ it stays English.

| Surface | Scope | Authorized |
|---|---|---|
| `/admin/masters/items/[item_id]` (MANUFACTURED), `/admin/masters/boms/[bom_head_id]/[version_id]/edit`, quick-fix drawer | Recipe-Health corridor | 2026-04-25 |
| `/planning/procurement` + `FocusCard`, `ActionList` | weekly purchase-session flow | 2026-06-17 |
| `/credit-tracking` | picking-shortage tracking (bookkeeper) | 2026-06-17 |
| `/purchase-orders/placement-queue` + `PlacementRow` | office-manager order placement | 2026-06-20 |
| `/home` — **viewer role only** (strings in `src/features/home/cockpit.ts` `he` field) | bookkeeper cockpit; admin/planner/operator views stay English | 2026-06-26 |

`/stock/receipts` and all other operator surfaces: English.

## Lane boundary

Portal-only. ⊥ author backend contracts, schema, or integrations — those are W1/W4, governed by `gt-factory-os-production-brain/`. W2 Mode A/B semantics honored via `docs/portal-os/runtime_ready.snapshot.json` (manually synced).

## Invariants

1. Every change scoped to exactly one tranche (PreToolUse hook).
2. Every "done" claim carries an evidence path (SubagentStop hook).
3. Dead / quarantined / fake-session surfaces ⊥ re-enter primary nav.
4. Scorecard is versioned JSON — drift detectable by diff.
5. ⊥ destructive operations without human merge approval.
6. Every response ends "Next action: …" (Stop hook).

## ⊥ do

⊥ author backend contracts or schema · ⊥ promote `window2-portal-sandbox/` paths into `gt-factory-os/` canonical paths · ⊥ touch `.env*`, `.vercel/`, any secret path · ⊥ edit files outside the active tranche manifest · ⊥ reintroduce `X-Fake-Session` / `X-Test-Session` to cleaned files · ⊥ bypass `portal-pr-guard` via `--no-verify` / `skip ci`.

**Escalation:** request conflicts with an invariant → stop, propose a tranche plan instead.

---
last_reviewed: 2026-07-31 · pre-lean original: `gt-factory-os-production-brain/docs/archive/portal-CLAUDE.pre-lean-2026-07-31.md`
