# Tranche 042 — Refresh/invalidation truth sweep + design P0s (Phases 2/7)

status: executed 2026-06-11 (commit c1b8d0a) — pending merge
phase: improvement-plan-2026-06 Phase 2 (portal items 7-8) + Phase 7 item 1 (P0s)
approved_by: Tom (2026-06-11 — plan approved; globals.css P0 edits explicitly covered by plan approval)

## Goal
Make displayed stock/price data refresh continuously and honestly (Tom: "inventory doesn't
update on an ongoing basis"), close the audited cache-invalidation gaps, and land the three
zero-risk design P0s.

## File manifest (only these files may change)
- src/app/(shared)/inventory/page.tsx — refetchInterval 60s on stock + value queries (mirror dashboard cadence)
- src/app/(economics)/admin/economics/page.tsx — cost-save invalidations: ["stock","value"], ["admin","economics","raw-materials"], ["dashboard","economics","rm-costs"]
- src/app/(inbox)/inbox/approvals/waste/[submission_id]/page.tsx — approve/reject invalidate inbox source keys before success state
- src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx — same (add queryClient)
- src/app/(ops)/stock/receipts/page.tsx — post-success invalidate ["ops","receipts"] (PO ledger pills freshness)
- src/app/(planning)/planning/purchase-session/_lib/api.ts — place/approve also invalidate ["purchase-orders"] + ["ops","receipts","open-pos"]
- src/app/(shared)/dashboard/page.tsx — value-trend honesty label ("at current prices"); replace DB view names in card footers with plain-English source labels (VISUAL-007)
- src/app/(shared)/dashboard/_lib/value-trend.ts — coverage threshold 50% → 75% (constant + JSDoc)
- src/app/globals.css — delete duplicate first .kpi-tile block (~3105-3164, VISUAL-005); remove font-style: italic from .forecast-disclosure-toggle (VISUAL-008)
- docs/portal-os/tranches/042-refresh-invalidation-design-p0.md — this file
- docs/portal-os/tranches/_active.txt — 042
- docs/portal-os/registry.md — tranche row

## Out of scope
Backend price pipeline (separate gt-factory-os package), middleware/role gates, Groups v1.

## Verification gates
- `npx tsc --noEmit` clean; `npx vitest run` green (430 baseline)
- grep: `.kpi-tile` block appears once in globals.css; no `font-style: italic` in globals.css; no `api_read.` in dashboard page text nodes

## Checklist
- [x] Fixes implemented
- [x] Typecheck clean
- [x] Vitest green
- [x] Greps clean
- [x] One bounded commit set pushed
