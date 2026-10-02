# Tranche 194 — GT Pulse Unit B: the orders timeline, redesigned

**Status:** built on `claude/gt-pulse-b-portal`; ships in the same release PR as tranches 189 to 193.
**Origin:** Tom, 2026-10-02, on the first timeline (tranche 192): "זה לא יפה … שהגרף יהיה ממש אלגנטי, זוהר, מושך ויפה ממש. כרגע הוא נראה גס ולא יפה ולא כל כך מובן." Design is the executor's under Tom's delegation.
**Backend:** none. The facts are the same as tranche 192.

## What changed

- **A headline before the chart.**
  - The clean orders of the two years.
  - A trend pill: up, down or steady (a change under 10%), comparing the last three full months with the three before them, with that basis stated.
  - The month in progress never counts, so a partial month is never shown as a drop.
- **The circle's language on a time axis.**
  - Zoomed in, or with four orders a month or fewer, each order is a glowing bead, as in the ring.
  - At fit, each month is a slim capsule with a green gradient.
  - Cancellations are hollow and drafts are amber. The current month is drawn dimmed and labelled in an accent chip.
- **A line of light for the trend.**
  - A smooth monotone curve (no overshoot) with a glow, a turquoise wash under it, and a breathing end point.
  - It stops at the last full month. Its current value is in the legend.
- **Selection as a beam.**
  - The chosen month is lit, gets a count bubble, and the rest dim.
  - Hover lights a month for the eye only.
  - The callout below names the month and opens its orders.
- **A quieter frame.** Dotted grid, a soft stage, month and year rows, a pill zoom bar, and the scale in words ("סולם: עד N הזמנות בחודש").
- **Motion.**
  - Months rise once, then the line draws itself and its end breathes three times.
  - None of it runs under reduced motion.
- **Accessibility, from the UX gate rerun.**
  - The chart is one tab stop with arrow navigation.
  - Hover never speaks (NEW-001).
  - The callout is not a live region, because each month's name already carries its counts (NEW-003).
  - Disabled zoom buttons say why (INTER-B-009).

## Manifest

manifest:
  - docs/portal-os/tranches/194-gt-pulse-b-timeline-redesign.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/timeline.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/org/OrdersTimeline.tsx
  - src/app/(sales)/_components/org/BusinessCircle.tsx
  - tests/unit/sales/timeline.test.ts
  - tests/unit/sales/orders-timeline.test.tsx

## Gates

- Red first:
  - The headline: total; full months only; steady under 10%; no percentage after zero.
  - The monotone curve.
  - The month in progress.
  - Silent hover.
  - One tab stop.
- Typecheck, lint, vitest (sales 488/488) and the mocked e2e (`sales-orgs.spec` 20/20, timeline journey included).
- Rendered at 320, 390 and 1280, light and dark, at fit and zoomed in.

## Rollback

Revert the release merge commit. Presentation only.
