# Tranche 192 — GT Pulse Unit B: the orders timeline, the circle's second view

**Status:** built on `claude/gt-pulse-b-portal`; ships in the same release PR as tranches 189 to 191.
**Origin:** Tom, 2026-10-02, in the Session 2 conversation: the two-year circle should switch, at the press of a button, to a timeline chart. It should show the trend of orders month by month over two years, let him go down to the orders themselves, and zoom in and out on the order-count scale, all as in the circle. Design and copy are the executor's under Tom's 2026-10-02 delegation.
**Backend:** none. Same facts as the circle: `circle.months` for orders and cancellations, `river.pending_drafts` for open drafts (design F1).
**Scope:**
- A two-way switch in the circle panel: "עיגול" and "ציר זמן". The choice is remembered per viewer in local storage, only as a convenience.
- **The timeline.**
  - One column per month over 24 months, the newest at the left (a right-to-left time axis).
  - Stacked in the circle's language: filled orders, hollow cancellations, amber open drafts.
  - Zoomed in far enough, each order is its own block.
  - The trend is a trailing three-month average of clean orders.
  - Gridlines and whole-order ticks; year boundaries are marked.
- **Zoom on the count scale:** in, out, and back to fit. A month taller than the scale is cut and marked, with its true count where the column is wide enough. The trend line leaves the plot instead of flattening.
- **Going down to the orders:**
  - A tap selects a month and states its counts; a 44px button opens the month sheet, then each order's lines.
  - On a keyboard, Enter opens and the arrows walk through time.
- Reduced motion: no animation. Dark mode from the same tokens.

## Copy register (executor, under Tom's 2026-10-02 delegation)

`UI.ordersViewLabel`, `viewCircle`, `viewTimeline`, `timelineChartLabel`, `timelineScale`, `timelineZoomIn`, `timelineZoomOut`, `timelineZoomFit`, `timelineZoomFitShort`, `timelineTrend`, `timelinePick`, `timelineOpenMonth`, `timelineAxisHint`.

## Manifest

manifest:
  - docs/portal-os/tranches/192-gt-pulse-b-orders-timeline.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/timeline.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/org/OrdersTimeline.tsx
  - src/app/(sales)/_components/org/BusinessCircle.tsx
  - tests/unit/sales/timeline.test.ts
  - tests/unit/sales/orders-timeline.test.tsx
  - tests/unit/sales/business-circle.test.tsx
  - tests/e2e/sales-orgs.spec.ts

## Gates

- Red first: scale and zoom steps, the right-to-left axis, the trend, named month targets, select then open, keyboard, zoom bounds, overflow count, legend, remembered view.
- Typecheck, lint, vitest, build; mocked e2e, including the timeline journey; no sideways scroll at 320 to 1440px.

## Rollback

Revert the release merge commit. Presentation only.
