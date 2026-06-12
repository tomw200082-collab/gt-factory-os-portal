# Tranche 064 — ux-flow-audit round-2: state legibility + node-universe truth fix

status: implemented (branch `claude/dashboard-ui-audit-pc60ck`)
approved_by: Tom (2026-06-12 — "בצע סבב 2… ותמזג ותעלה הכל לפרודקשן לאחר מכן")
source: /ux-flow-audit round 2 (ux-flow-architect, findings FLOW-E01..E10)

## Headline truth fix (discovered during E05)
`/api/inventory/flow` is the **FG projection** ("Daily FG stock projection —
at-risk products"); the RM/PKG universe lives on `/api/inventory/supply-flow`.
The MATERIALS ribbon node had been fed FG data under a materials label.
Now: MATERIALS ← supply-flow (components, new `useSupplyFlow({})` on the
page, href → /planning/inventory-flow/supply); FG ← flow (products), with
risk state + worst-item drill (E05) instead of hardcoded green.

## What landed (all 10 findings)
- **E01** state pill = workload meter: "N actions today" (warning) /
  "N actions today · M critical" (danger) / "Floor is clear" only when the
  queue is truly empty. New `queueTotal` prop replaces `slipped`.
- **E02** Today's-Work instruction is dismissible (× → localStorage
  `gt-dash-queue-hint-dismissed`, never returns).
- **E03** vocabulary unified: ribbon "slipped" → "overdue"; Focus Engine
  "no posted actual" → "production runs are overdue — post actuals or
  reschedule"; "past expected receipt" → "deliveries are late from
  suppliers"; srSummaries updated. (2 focus-engine tests updated.)
- **E04** `refetchOnMount: "always"` on critical-today / slipped-plans /
  production-plan / purchase-orders — in-app return reflects a completed
  transaction within seconds; hint copy drops "next refresh" passivity.
- **E05** FG node: danger/warn from FG risk tiers + "N at risk" sub +
  top-3 drill (was hardcoded ok).
- **E06** "Today's focus" chip merged inline with the sentence — Band 0
  carries a single eyebrow-level label.
- **E07** procurement queue badges encode urgency: "Order overdue" /
  "Order due today" / "Order ahead (urgent)" via new optional
  `QueueRowSpec.badge`.
- **E08** Production node disambiguates time windows: "today done · N prior
  runs overdue" when today is complete but the 7-day window has overdue runs.
- **E09** since-chips name kinds: "+N shipment picks", "+N stock
  adjustments" (no more "other movements").
- **E10** procurement Week tile: card is a div, CTA row is the tile link,
  "Awaiting receipt" row deep-links to /purchase-orders.

## File manifest
- `page.tsx` — supplyQ + universe rewiring, E01/E03/E04/E07/E08/E09.
- `bands/VerdictBand.tsx` — E01 workload pill, E06 inline chip.
- `bands/TodaysWork.tsx` — E02 dismissible hint, E07 badge override.
- `bands/WeekPanel.tsx` — E10 restructure + row link.
- `_lib/queue.ts` — optional `badge` field.
- `_lib/focus-engine.ts` + `.test.ts` — E03 vocabulary.
- `globals.css` — `.dash-week-row.is-link` hover.
- `tests/e2e/dashboard.spec.ts` — supply-flow mock, FG/materials truth
  assertions, workload-pill + dismiss assertions.

## Verification gates
tsc clean · vitest 622/622 · eslint clean · Playwright @mocked 4/4 ·
screenshots delivered.

## Behaviour preserved
Queue ranking contract, Focus Engine rule order/ids, role gating, ILS
guards, reduced-motion gating — unchanged.
