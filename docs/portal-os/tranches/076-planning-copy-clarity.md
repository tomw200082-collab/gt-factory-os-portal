# Tranche 076 — planning copy clarity (visible abbreviation expansion)

status: in progress (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: planning UX/UI audit (2026-06-14) THEME P-F (COPY abbreviations). The
final safe, planning-scoped copy items after 072–075. Expands operator-visible
abbreviations to plain English. Portal-only; no shared components, no data
values, no authority files.

## Scope decision
Inspection narrowed the audit's "abbreviation" backlog to what is actually
operator-visible:
- "recs" — every occurrence is a code identifier (variable, queryKey, testId),
  never visible prose → left as-is (correct).
- "eod" / "FG" — appear in visible labels/descriptions → expanded here.

## Changes
- `(eod)` → `(end of day)` on the "Projected on-hand" row label
  (`inventory-flow/_components/DayPopover.tsx`, `MobileDaySheet.tsx`).
- `FG` → `finished-goods` / `Finished goods` in visible copy:
  `inventory-flow/page.tsx` metadata description, `InventoryFlowClient.tsx`
  section description, and the `planning/page.tsx` "FG evaluated" KPI label.

## Held (not a planning edit — by design)
- Status-term vocabulary (Superseded→Replaced, Discarded→Archived, "not firmed"
  →"Not yet confirmed"): these live in the SHARED `src/components/badges/
  StatusBadge.tsx` and admin surfaces. Renaming planning-only would desync the
  app. This is an app-wide terminology decision owned by `portal_ux_standard.md`
  + Tom, not a planning tranche.
- `text-[Npx]` arbitrary-bracket type on the production-plan board, `.table-base`
  / `.chip` adoption: P2 visual polish with visual-change risk — deferred.
- New design tokens, blockers due-date backend table: authority/backend, held.

## File manifest
- `docs/portal-os/tranches/076-planning-copy-clarity.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — 076 while active; cleared at close.
- `docs/portal-os/registry.md` — register this tranche.
- `src/app/(planning)/planning/inventory-flow/_components/DayPopover.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/MobileDaySheet.tsx`
- `src/app/(planning)/planning/inventory-flow/page.tsx`
- `src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx`
- `src/app/(planning)/planning/page.tsx`

## Verification
tsc --noEmit clean · vitest 677/677 (84/84 files) · next build OK · eslint 0
errors. Pure user-visible string changes (5 labels/descriptions across 5 files);
no test asserted the old strings; no identifiers/testids/data values touched.
