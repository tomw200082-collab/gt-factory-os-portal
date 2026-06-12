# Tranche 063 — ux-flow-audit round-1 fixes + LionWheel OUTBOUND activation

status: implemented (branch `claude/dashboard-ui-audit-pc60ck`)
approved_by: Tom (2026-06-12 — "בצע ותפעיל את המראה של LionWheel. תבצע הכל")
source: /ux-flow-audit round 1 (ux-flow-architect, 10 findings FLOW-D01..D10)

## What landed

All 10 audit findings + the OUTBOUND node activation:

- **FLOW-D01** TodaysWork: visible working instruction above the rows
  ("Start at the top — the list is ranked by urgency… a finished item
  disappears on the next refresh"); jargon labels renamed: "Slipped plan" →
  "Production overdue", "Late PO" → "Late delivery".
- **FLOW-D02** WeekPanel: "Approved, not recorded as PO" → "Agreed with
  supplier, not in the system yet".
- **FLOW-D03** post-action freshness: critical-today + slipped-plans now
  30s interval + refetchOnWindowFocus; production-plan + purchase-orders
  gain refetchOnWindowFocus (the global provider default disables it).
- **FLOW-D04** VerdictBand: tone-matched "Today's focus" eyebrow chip marks
  the Focus Engine sentence as THE daily directive.
- **FLOW-D05** WeekPanel: "Slipped — planned, no posted actual" →
  "Production overdue — N runs need reporting".
- **FLOW-D06** FlowNode: drill rows render inline under the node on <sm
  (hover does not exist on touch); desktop hover card unchanged.
- **FLOW-D07** since-last-look threshold 30min → 5min.
- **FLOW-D08** TodaysWork: per-source error props (criticalError /
  slippedError) with inline error rows; full-panel error only when both fail.
- **FLOW-D09** Materials node sub-line names the worst item + its
  days-of-cover when strained ("Lime juice: 1.4d · 3 critical · 142 SKUs").
- **FLOW-D10** WeekPanel: "Still to order this week" label adjacent to the
  big ₪ number.
- **OUTBOUND activation**: new proxy `/api/orders/outbound-summary` →
  upstream `GET /api/v1/queries/orders/outbound-summary` (authored in
  gt-factory-os, same branch — counts over the LionWheel mirror). Node
  shows open orders + due today + picked today (picks from the ledger,
  stock truth). Degrades to quiet on any upstream failure — **requires a
  Railway redeploy of the API to light up in production**.

## File manifest
- `src/app/api/orders/outbound-summary/route.ts` — NEW proxy.
- `src/app/(shared)/dashboard/page.tsx` — D03/D07/D09 + outbound query/node + pickedToday.
- `_components/bands/TodaysWork.tsx` — D01/D08.
- `_components/bands/VerdictBand.tsx` — D04.
- `_components/bands/WeekPanel.tsx` — D02/D05/D10.
- `_components/bands/FlowNode.tsx` — D06.
- `src/app/globals.css` — `.dash-focus-eyebrow`.
- `tests/e2e/dashboard.spec.ts` — outbound mock + hint/eyebrow/outbound assertions.
- Backend (gt-factory-os, same branch): `api/src/orders/handler.outboundSummary.ts`,
  `schemas.ts`, `route.ts` — typecheck clean.

## Verification gates
- tsc clean · vitest green · eslint clean · Playwright @mocked green ·
  screenshots delivered.

## Behaviour preserved
- Queue ranking, Focus Engine rules, role gating, ILS guards — unchanged.
- OUTBOUND degrades gracefully until the backend deploy; no fabrication.
