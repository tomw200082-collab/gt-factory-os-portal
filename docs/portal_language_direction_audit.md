# Portal Language / Direction Audit List

**Authored 2026-04-30 (Gate 4.2)** as part of the portal-wide English/LTR standard lock.

This list inventories every surface that currently violates the standard in `docs/portal_ux_standard.md`. It is **not a rewrite plan** — it is a control surface so future tranches can normalize methodically without scope explosion.

## Scope of the audit

- 341 `.tsx`/`.ts` files in `src/` contain Hebrew characters (verified via `grep -l '[\xd7\x80-\xd7\xff]'`).
- 5 files declare `dir="rtl"` explicitly (the blockers surface).
- This means the violation is widespread but concentrated in specific surfaces.

## Severity scale

- **P0** — operator/planner sees Hebrew/RTL on a daily-use surface that the planning corridor depends on. Fix in the next tranche.
- **P1** — non-critical operator surface or admin surface used regularly. Fix in a near-future tranche.
- **P2** — admin/edge surface, low daily use. Fix when next touched.
- **P3** — error states, tooltips, edge copy. Defer until after structural normalization.
- **N/A** — data values (supplier names, addresses, customer names). These are user data, not UI copy. Standard does not require translation.

## Surface-by-surface

### Planning corridor (the active program)

| Route / Surface | Current | Severity | Recommended fix |
|---|---|---|---|
| `/planning/production-plan` | **English/LTR** ✓ (Gate 4.2 just normalized) | — | Done in this tranche |
| `/planning` (Planning Overview) | Mostly English; Hebrew may be in copy | P1 | Normalize in Phase 2 (next 5 loops) |
| `/planning/forecast` | Mixed — Hebrew "תחזית פעילה" banner; freeze copy in Hebrew | **P0** | Normalize in Phase 2 (Daily Production Plan adjacency) |
| `/planning/forecast/[version_id]` | Mostly English UI; banner + supply_method chips Hebrew (ייצור / רכש) | **P0** | Normalize in Phase 2 |
| `/planning/forecast/new` | English-leaning | P1 | Spot-fix when touched |
| `/planning/runs` | Mostly English; some Hebrew copy in run-summary card | P1 | Normalize in Phase 2 |
| `/planning/runs/[run_id]` | Mixed — Loop 8 production-tab "סיכום מוכנות" summary + recent T1 Hebrew snapshot-refs labels | **P0** | Normalize in Phase 2 |
| `/planning/runs/[run_id]/recommendations/[rec_id]` | Mostly Hebrew (rec drill-down ships Hebrew copy from T1) | **P0** | Normalize in Phase 2 — it's a primary planner decision surface |
| `/planning/blockers` | **Full Hebrew + RTL** (explicit `dir="rtl"`); 4 of 5 files in this dir use RTL | **P0** | Normalize in Phase 2 — high-impact rewrite, isolated module |
| `/planning/inventory-flow` | Mostly English; some Hebrew labels in hero | P1 | Normalize in Phase 2 |
| `/planning/inventory-flow/[itemId]` | Unknown depth | P1 | Audit + normalize in Phase 2 |
| `/planning/boms` | Unknown | P2 | Audit when touched |
| `/planning/production-simulation` | Sandbox-IDB-backed (per audit Agent 1); deprioritize | P2 | Defer |
| `/planning/weekly-outlook` | Redirect to inventory-flow; no UI | — | None |

### Operator surfaces

| Route / Surface | Current | Severity | Recommended fix |
|---|---|---|---|
| `/ops/stock/production-actual` | **Hebrew** (T1 Loop 4 translated 46 strings) | **P0** | Normalize in Phase 4 (when wiring `from_plan` link) |
| `/ops/stock/receipts` | Likely Hebrew; the GR form has been Hebrew-first since Gate 3 | P1 | Normalize in a focused operator-form tranche |
| `/ops/stock/waste-adjustment` | Likely Hebrew (mirror of GR pattern) | P1 | Same tranche as receipts |
| `/ops/stock/physical-count` | Likely Hebrew | P1 | Same tranche as receipts |

### Inbox / approvals

| Route / Surface | Current | Severity | Recommended fix |
|---|---|---|---|
| `/inbox/page.tsx` | Mixed; some Hebrew | P1 | Normalize when adjacent work touches inbox |
| `/inbox/approvals/physical-count/[submission_id]` | Hebrew | P1 | Same |
| `/inbox/approvals/waste/[submission_id]` | Hebrew | P1 | Same |

### Admin (master data + system)

| Route / Surface | Current | Severity | Recommended fix |
|---|---|---|---|
| `/admin/items`, `/admin/items/[item_id]` | Mixed | P2 | Normalize when touched |
| `/admin/components`, `/admin/components/[component_id]` | Mixed | P2 | Same |
| `/admin/boms` and nested | Mixed | P2 | Same |
| `/admin/suppliers`, `/admin/supplier-items` | Mixed | P2 | Same |
| `/admin/planning-policy` | Mixed | P2 | Same |
| `/admin/sku-aliases`, `/admin/sku-map`, `/admin/sku-health` | Mixed | P2 | Same |
| `/admin/holidays` | Mixed | P2 | Same |
| `/admin/integrations` | Mixed | P2 | Same |
| `/admin/jobs` | Mixed | P2 | Same |
| `/admin/users` | Mixed | P2 | Same |
| `/admin/products/[item_id]`, `/admin/products/new` | Mixed | P2 | Same |
| `/admin/masters/*` | Mixed | P2 | Same |
| `/admin/purchase-orders/parity-check` | Mixed | P2 | Same |

### Auth / shared shell

| Route / Surface | Current | Severity | Recommended fix |
|---|---|---|---|
| `/(auth)/layout.tsx`, `/(auth)/login/page.tsx` | Has Hebrew (login flow has Hebrew copy from prior loops) | **P0** | Normalize in Phase 1.5 — first thing users see |
| `/(admin)/layout.tsx`, `/(inbox)/layout.tsx`, `/(ops)/layout.tsx` | Mixed shell copy | P1 | Normalize alongside their child surfaces |
| `/(shared)/dashboard/page.tsx` | Mostly English; some Hebrew | P1 | Normalize in Phase 15 (dashboard integration) |

### Purchase orders

| Route / Surface | Current | Severity | Recommended fix |
|---|---|---|---|
| `/purchase-orders` | Mixed | P1 | Normalize when adjacency touches POs |
| `/purchase-orders/new` | Mixed (manual PO form) | P1 | Same |
| `/purchase-orders/[po_id]` | Mixed (Hebrew banner for manual POs) | P1 | Same |

## Components / shared

Many shared components in `src/components/` carry Hebrew strings (badges, status maps, error states). When normalizing a surface, also check:
- `src/components/badges/StatusBadge.tsx` — status label maps
- `src/components/feedback/states.tsx` — empty/error templates
- `src/components/layout/SideNav.tsx` — nav labels
- `src/components/workflow/WorkflowHeader.tsx` — header chrome
- `src/components/patterns/DetailPage.tsx` — shared detail-page template

These are leverage points: fixing one component normalizes many surfaces. **Prefer component-level fixes over per-surface fixes** when the underlying issue is shared.

## RTL declarations

Only one module currently declares explicit RTL:
- `src/app/(planning)/planning/blockers/` — 5 files use `dir="rtl"`. **P0** normalization candidate.

All other Hebrew text relies on bidi-rendering with no explicit direction; switching to LTR + English text is a copy change only.

## Data values vs UI copy

Hebrew **data** (supplier names, customer names from LionWheel, item names if Hebrew is canonical) is allowed everywhere — that's user content, not UI. The audit above only counts UI labels, copy, error messages, button text.

When touching a surface during normalization, do NOT translate Hebrew data values. The standard explicitly preserves user content.

## Recommended sequencing

Phase 2 (loops 6-10, Daily Production Plan usability hardening) — if any planning-corridor surface is touched in passing, normalize it. This includes `/planning/forecast`, `/planning/runs/[run_id]`, the rec drill-down, the blockers page, and inventory-flow.

Phase 3+ — only if a tranche directly touches a non-corridor surface, normalize as you go. Don't open a separate "translation tranche" — that's how scope explodes.

## How to use this list

1. Before starting a tranche, scan this list for surfaces in scope.
2. Normalize them as part of the tranche, not after.
3. After normalizing, mark the row here with the date + commit SHA.
4. If you find a Hebrew/RTL violation not in this list, add it.

## Updates

| Date | Surface | Action | Commit |
|---|---|---|---|
| 2026-04-30 | `/planning/production-plan` | Normalized to English/LTR + state hygiene + nav label fix + UX standard locked | (see Gate 4.2 commit) |
