# Tranche 081: decision-board-premium

status: landed-pending-review
created: 2026-06-19
landed: 2026-06-19
pr:
scorecard_target_category: economics_surface
expected_delta: +2 (decision-board promoted from functional v1 to a premium, decision-grade surface; first @mocked e2e coverage for it)
sizing: M (1 page rebuilt in place, 1 new e2e spec; no backend change)

## Why this tranche
Tom 2026-06-19: "פשוט תשפר אותו בצורה מטורפת … תעשה איטרציות מאוד מאוד משמעותיות עם
playwright." Tranche 080 shipped a correct-but-flat decision board. This tranche
rebuilds the surface into a decision-grade instrument and was iterated visually
through a real Playwright loop (dev-shim auth + browser-level API mocks +
desktop/mobile/element screenshots reviewed between edits).

## Scope (rebuild in place + new test — no backend change)
- **Rebuilt** `src/app/(economics)/admin/decision-board/page.tsx`:
  - **Verdict band** — the single most important thing right now, money-framed:
    "N products sell below cost · leaking ~₪X/yr" (danger) → "N need data"
    (warning) → "all priced above cost; top-3 drive Y% of an annual ₪Z pool"
    (success), with a one-click CTA that filters the table to the offenders.
  - **Six clickable decision segments** (Star / Gem / Workhorse / Drag / Loss /
    Dormant) — each shows count + total contribution and filters the table.
  - **Upgraded quadrant** (zero-dependency SVG): margin-% Y gridlines + ticks,
    units X ticks, quadrant tints, dashed median/healthy-margin reference lines
    (labelled), red below-cost zone, staggered bubble entrance animation,
    top-5 contributor name labels (edge-clamped), hover crosshair + active ring.
  - **Richer inspector**: decision chip + action + plain-language why, a monthly
    units sparkline, and a stat grid incl. annualised contribution.
  - **Sparkline trend column** in the table; sortable headers; segment filter.
  - **30 / 90 / 180-day window toggle** feeding the velocity query + annualiser.
- **New e2e** `tests/e2e/decision-board.spec.ts` (`@mocked`): mocks
  `/api/economics` + `/api/orders/by-item-and-period` with a 15-product GT
  Everyday catalogue spanning every decision category; asserts verdict band,
  segments, quadrant, and a known product row render; captures review shots.

### Data sources (unchanged from 080; both already live)
- `GET /api/economics` · `GET /api/orders/by-item-and-period`. Client-side join.
  Products missing cost/price stay "Needs data" and are excluded from the plot.

### Out of scope
- No backend change (no migration / view / endpoint).
- No write actions (read-only decision surface).
- No new runtime dependency (quadrant + sparklines are hand-rolled SVG).

## Manifest
manifest:
  - src/app/(economics)/admin/decision-board/page.tsx
  - tests/e2e/decision-board.spec.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/081-decision-board-premium.md
  - docs/portal-os/tranches/_active.txt

## Tests / verification
- typecheck clean (`tsc --noEmit` → 0).
- eslint clean (page + spec → 0).
- Playwright `@mocked` decision-board spec passes (chromium); desktop, hover,
  quadrant close-up, and mobile screenshots reviewed during iteration.

## Rollback
Revert the page to its 080 form and delete the new spec. No backend or
shared-component changes to unwind.

## Operator approval
- [x] Tom 2026-06-19: "תשפר אותו בצורה מטורפת … איטרציות מאוד משמעותיות עם playwright."

## Actual evidence
- (to be filled at push: typecheck exit, eslint exit, playwright pass, PR link)
