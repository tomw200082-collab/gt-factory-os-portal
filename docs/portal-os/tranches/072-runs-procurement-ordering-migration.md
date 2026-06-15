# Tranche 072 — complete the runs→procurement ordering migration

status: implemented (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: planning UX/UI audit (2026-06-14, `docs/ux/planning-pages-uxui-audit-2026-06-14.md`)
FLOW-002 / VISUAL-006, executed per Tom's decision (2026-06-14, option C).

## Decision & evidence
The audit found `/planning/runs/[run_id]` shows a "diagnostic only — not for
ordering" banner (Tranche 045) yet carried working Approve / Dismiss /
Convert-to-PO buttons. Diligence showed the recommendation→PO conversion
(`/api/planning/recommendations/[id]/convert-to-po`) lived ONLY on the runs
surfaces — nothing else converts recs to POs — so deleting runs would have
orphaned a core capability. The Tranche 045 demotion ("Order through
Procurement →") was never completed on the procurement side.

Tom chose: complete the demotion — build the conversion into Procurement, then
make runs diagnostic-only. The convert-to-po backend + portal proxy already
exist, so this is portal-only.

## Changes
NEW (Procurement — Hebrew/RTL surface, per the locked exception):
- `_lib/recommendations.ts` — `fetchApprovedPurchaseRecs` (latest completed run →
  `?type=purchase` → filter approved + unconverted) + `convertRecToPO` + types.
- `_lib/recommendations.test.ts` — locks the filtering rule (4 tests).
- `_components/RecommendationsToConvert.tsx` — Hebrew section listing approved
  purchase recs with a "המר להזמנה" action (useConfirm, Hebrew labels). On
  success invalidates the session + every downstream PO surface (PO list,
  goods-receipt open-PO dropdown) + the inbox — closing audit gaps F1 / F2.
  Renders nothing when there is nothing to convert.
- `procurement/page.tsx` — renders the new section above the session view; also
  fixes the broken `btn btn-accent` → `btn btn-primary` (VISUAL-006: `.btn-accent`
  is undefined).

Runs become diagnostic-only:
- `runs/[run_id]/page.tsx` — removed Approve / Dismiss / Convert mutations +
  buttons + dead helpers/toast; recommendation table is read-only (drill-in
  link only). The existing "Order through Procurement →" banner is now accurate.
- `runs/[run_id]/recommendations/[rec_id]/page.tsx` — action card replaced with a
  read-only "Converted → Open PO" block (when converted) or diagnostic guidance
  pointing to the Inbox (approve/dismiss) and Procurement (convert). All write
  mutations / helpers / dead state removed.
- `tests/e2e/planner-runs-real.spec.ts` — T04/T05 (approve/dismiss on runs)
  `.skip`ped; those actions no longer live on runs (CI runs @mocked only).

Approve / dismiss of recommendations continue to live in the Inbox
(`RecommendationInlineCard`), unchanged.

## Verification
tsc --noEmit clean · vitest 677/677 (+4 new) · next build OK · eslint 0 errors
(268 warnings = baseline). Playwright @mocked unaffected; the real-backend
runs spec's approve/dismiss tests were retired.
