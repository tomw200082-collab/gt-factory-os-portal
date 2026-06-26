# Tranche 091: decision-board UI amplify — premium decision-grade instrument

status: in-progress
created: 2026-06-26
scorecard_target_category: economics_surface
expected_delta: +1 (decision-board elevated from premium-v1 (081) to a signature,
decision-grade instrument — the most impressive instance of the "Operational
Precision" system; Playwright-iterated visually)
sizing: M (1 page rebuilt in place + e2e fixture refresh; no backend change, no
shared-component / globals / tailwind change)
source: Tom-directed (2026-06-26): "אני רוצה לשפר משמעותית את ה-UI של ה-DECISION
BOARD … להוסיף קומפוננטות ותבניות מדהימות שיגרמו לו להיראות מדהים." (Significantly
improve the Decision Board UI; add amazing components/templates; make it look
amazing.) Continues the 080→081 line.

## Why this tranche
Tranche 081 made the board correct-and-premium. Tom wants the next leap: a
surface that *looks amazing* — a signature, decision-grade instrument, not just a
competent dashboard. The work is visual design + presentation ONLY, executed to
the top of the established "Operational Precision" identity (warm-bone / petrol
teal / semantic moss-amber-oxide), with boldness spent on one signature element
and everything around it kept disciplined. Iterated through a real Playwright
desktop+mobile screenshot loop (the same loop 081 used).

## §G — what "amazing" means here (design intent)
1. A clear visual hero / signature: the margin × velocity **portfolio map**
   (quadrant) reads as the centerpiece instrument — depth, calm glow on the
   high-value stars, gradient-bodied bubbles, refined grid + quiet zone labels,
   orchestrated entrance — tightly coupled to a readout-style inspector.
2. A **decision headline** (verdict) that reads as a status readout, not a
   marketing banner: the one money-framed call to make now, with a thin animated
   profit-pool meter and a one-click filter CTA.
3. The six decision buckets become a cohesive **portfolio strip** — count +
   money + a share-of-portfolio micro-bar each, tactile and filterable.
4. Premium finish: animated number count-ups (reduced-motion respected),
   skeleton loaders replacing "Loading…" text, refined type scale / eyebrows /
   dividers that encode meaning, depth via existing hairline/raised/pop shadows,
   correct dark mode, crisp hover/active micro-interactions.

## §C — constraints
1. Visual design + presentation ONLY. No backend, no new endpoint, no route
   change, no write actions (read-only decision surface). Data contract
   unchanged (`GET /api/economics`, the Shopify-sourced 90d read model).
2. Stay inside the "Operational Precision" token system. Do **not** edit
   `src/app/globals.css` or `tailwind.config.ts` (shared, high blast radius);
   compose with existing tokens + page-local SVG/inline styles only.
3. No new runtime dependency (quadrant + sparklines + meters stay hand-rolled
   SVG/CSS).
4. Keep all `data-testid`s the existing e2e spec relies on
   (`decision-board`, `verdict-band`, `segments`, `quadrant`) so coverage holds.
5. Quality floor: responsive to mobile, visible keyboard focus, reduced-motion
   honored.

## Scope (rebuild in place + e2e fixture refresh — no backend change)
- **Rebuilt** `src/app/(economics)/admin/decision-board/page.tsx` per §G.
- **Refreshed** `tests/e2e/decision-board.spec.ts`: bring the `@mocked`
  `/api/economics` fixture in sync with the current read model (add
  `qty_sold_90d` / `order_count_90d` / `units_prev_90d`, which 081's fixture
  predates), so the Playwright visual loop renders a populated board across every
  decision category. Assertions/testids preserved.

### Data sources (unchanged from current page)
- `GET /api/economics` → COGS, margin, price, inventory value + Shopify trailing
  90d sales (`qty_sold_90d`, `order_count_90d`, `units_prev_90d`). Client-side
  derivation only. Products missing cost/price stay "Needs data" / off the plot.

### Out of scope
- No backend change (no migration / view / endpoint).
- No shared component, globals.css, or tailwind.config.ts change.
- No write actions.

## Manifest
manifest:
  - src/app/(economics)/admin/decision-board/page.tsx
  - tests/e2e/decision-board.spec.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/091-decision-board-ui-amplify.md
  - docs/portal-os/tranches/_active.txt

## Tests / verification
- typecheck clean (`npm run typecheck` → 0).
- eslint clean (`npm run lint` on page + spec → 0).
- Playwright `@mocked` decision-board spec passes (chromium); desktop, hover,
  quadrant close-up, and mobile screenshots reviewed during iteration.

## Rollback
Revert the page to its 081 form and revert the e2e fixture. No backend or
shared-component changes to unwind.

## Operator approval
- [x] Tom 2026-06-26: "תשפר משמעותית את ה-UI של ה-DECISION BOARD … קומפוננטות
  ותבניות מדהימות … שיראה מדהים."

## Actual evidence
- `npx tsc --noEmit` → exit 0.
- `npx eslint <page> <spec>` → exit 0.
- `npx vitest run` → 789/789 passed (102 files); no regressions.
- Playwright `@mocked` `decision-board.spec.ts` (chromium) → 1 passed; desktop,
  hover (inspector + crosshair), quadrant close-up, and mobile (390px) shots
  reviewed in-loop. Ran with `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true` +
  `PW_CHROME_PATH` (pre-provisioned Chromium) per the sandbox escape hatch.
- PR: (filled after push)
