# Portal OS — Migration history

## 2026-04-22 — Full merge (PR #3 → main)

The Portal Improvement OS + compatible src/ tranches were merged onto `main` from PR #3 (`claude/audit-all-VuctU`, 32 commits).

### What was merged (this PR on `portal-os/full-merge`)

**OS infrastructure (fully imported, no conflict):**
- `CLAUDE.md` — thin pointer to Portal OS
- `.claude/` — 6 commands, 5 agents, 4 hooks, settings.json, README
- `.github/workflows/` — claude.yml + portal-pr-guard.yml + portal-drift-weekly.yml

**Portal OS documentation (fully imported):**
- `docs/portal-os/audit-reports/2026-04-22-all.md` + `-reaudit.md` — historical audits (PR #3 branch state)
- `docs/portal-os/backend-package-admin-superuser-depth.md` — 5-deliverable package for admin_superuser_depth = 10/10
- `docs/portal-os/tranches/001-*.md` through `019-*.md` — 19 tranche plans (specification documents)
- `docs/portal-os/registry.md` + tranches/{000-template, _active}

**src/ changes from PR #3 that came in cleanly (23 files, zero-conflict with main's Tranches B/C/D/E):**

New files (from tranches 008, 009, 010, 011, 018, 019):
- `src/app/error.tsx` + `src/app/global-error.tsx` (tranche 009 error-boundaries)
- `src/lib/obs/report.ts` (tranche 009 observability)
- `src/lib/env.ts` (tranche 011 security-hardening)
- `src/components/dashboard/KpiTiles.tsx` (tranche 010 dashboard-live-kpis)
- `src/components/layout/MobileNav.tsx` (tranche 008 mobile-parity)
- `src/components/layout/TopBar.tsx` + `AppShellChrome.tsx` (tranche 008)
- `src/app/(inbox)/inbox/approvals/layout.tsx` (tranche 006)
- `src/app/not-found.tsx` (tranche 018 root resilience)
- `tests/e2e/role-boundaries.spec.ts` (tranche 015 role-boundary-e2e)

Modified files:
- `src/app/layout.tsx`, `src/app/page.tsx` (root landing — tranches 018/019)
- `src/middleware.ts` (tranche 016 middleware-role-gates)
- `src/lib/api-proxy.ts`, `src/lib/auth/fake-auth.ts`, `src/lib/auth/session-provider.tsx` (tranche 002 FakeSession → DevShimSession rename; backward-compat `Session` alias preserved)
- `src/app/(admin)/admin/integrations/page.tsx`
- `src/app/(ops)/stock/{physical-count,receipts,waste-adjustments}/page.tsx`
- `src/app/(planning)/planning/forecast/new/page.tsx`, `runs/[run_id]/page.tsx`
- `src/app/api/purchase-orders/[po_id]/route.ts` (tranche 012 PO detail proxy)

**1 surgical compatibility fix added during merge:**
- `src/components/layout/SideNav.tsx` — added optional `onNavigate?: () => void` prop to let PR #3's MobileNav close the drawer on nav-link click. Zero impact on existing consumers (prop defaults to undefined).

### What was NOT merged (7 file conflicts, all kept at main's version)

Main's Tranches B/C/D/E touched these files and are architecturally superior to PR #3's tranche-012-016 edits:

| File | Main's version kept | Why |
|---|---|---|
| `src/app/(inbox)/inbox/page.tsx` | Tranche B 4-stream federation (736 lines) | Superset of PR #3 tranche 014's single-stream federation (299 lines) |
| `src/app/(planner)/exceptions/page.tsx` | Tranche B redirect to /inbox (13 lines) | Intentional — exceptions rehomed into unified inbox |
| `src/app/(po)/purchase-orders/[po_id]/page.tsx` | Tranche D detail page (413 lines) | Directly competes with PR #3 tranche 012 (467 lines) — main's is current |
| `src/app/(po)/purchase-orders/page.tsx` | Tranche D list (310 lines) | Near-identical size to PR #3; main is current |
| `src/app/(shared)/dashboard/page.tsx` | Tranche C control tower (1089 lines) | PR #3 was Tranche-A-era stub (82 lines) + tranche 017's 1-line force-dynamic fix, which main's "use client" makes unnecessary |
| `src/components/layout/SideNav.tsx` | Main's manifest-driven (Tranche A/B) | Main aligns with current manifest structure; onNavigate prop added for compat |
| `src/lib/nav/manifest.ts` | Main's manifest | Correct URLs (e.g., `/admin/masters/boms` not `/admin/boms`); more admin items |

### Runtime-sensitive OS files reset to blank baseline (avoid truth-lying)

- `scorecard.json` + `scorecard.md` — blank. PR #3's 86/100 was measured against PR #3's src state. Main has different src (some PR #3 tranches landed, others superseded by B-E). First `/portal-audit all` on main produces the real score.
- `route-manifest.json` — blank. Will be populated by first audit.
- `baseline.json` — blank. `anchor_sha` will be set by first audit on main.
- `quarantine.json` — standard forbidden_strings only, no entries.

### Required first action after merge

Run `@claude /portal-audit all` on main. This will:
1. Produce the first fresh audit report against current main.
2. Seed a real scorecard (likely 65-80 range — main has Tranches A-E + several PR #3 tranches already).
3. Anchor baseline at current `main` HEAD.
4. Identify which of the 19 tranche plans (001-019) are still relevant vs obsoleted by Tranches B-E.

### Verification performed before committing this merge

- `git diff --name-only --diff-filter=U` = empty (all 7 conflicts resolved)
- `npx tsc --noEmit` = 0 errors (after SideNav onNavigate fix)
- `npm run build` = success, all 40+ routes compiled
- 0 `.env*` touched, 0 secrets exposed, 0 destructive operations

last_reviewed: 2026-04-22
