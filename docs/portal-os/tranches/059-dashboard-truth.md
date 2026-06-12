# Tranche 059 — dashboard-truth: the trust floor (Phase 1 of 4)

status: proposed (plan approved in principle by Tom 2026-06-12 — "מאשר"; execution awaits /portal-tranche-fix 059 dispatch)
phase: dashboard convergence, Phase 1 (see ../dashboard-target-design.md §6)
source audit: ../audit-reports/2026-06-12-dashboard-ui-audit.md (DASH-T1…T6)

## Design thesis
Before the dashboard can be reorganized (Phase 2) or calmed (Phase 3), every
number and timestamp on it must be *believable*. Phase 1 fixes the six
portal-side trust defects with zero layout/visual-identity change — a reviewer
should see an identical dashboard that is simply no longer wrong.

## What lands

1. **DASH-T1 — live clock.** New `useNow(intervalMs=30_000)` hook (single
   shared ticker). `DashboardPage` consumes it instead of
   `useMemo(() => new Date(), [])`. All `fmtRelative` labels, the greeting,
   urgent-procurement day math, and `weekRange` re-derive as time passes.
   Guard: interval pauses when `document.hidden` (no background churn).
2. **DASH-T2 — honest count-up.** `CountUp` keeps a `prevNumberRef`; on value
   change it tweens previous → new (300ms) instead of 0 → new (800ms).
   0 → value remains only for true first paint. Null/"—" passthrough kept.
3. **DASH-T3 — exceptions headline = critical.** The Exceptions KPI big number
   becomes `criticalN` (tone danger when >0); legend continues to show the
   full critical/warning/info breakdown; sub line gains "N total open".
4. **DASH-T4 — PO value currency guard.** `poStats.openValue` sums ILS POs
   only (`currency` null/"ILS"); when foreign-currency open POs exist the sub
   line appends "+N foreign" instead of silently mixing currencies under ₪.
5. **DASH-T5 — local-time day boundaries.** `weekRange()` and the PO "late"
   comparison use the existing `isoDateLocal()` instead of
   `toISOString().slice(0,10)` (UTC). Israel's day flips at midnight, not
   02:00/03:00.
6. **DASH-T6 — working deep links.** `/inventory` reads `?item_id=` (scrolls
   to / filters the item); the exceptions deep link target honors `?id=`
   (lands on the specific exception via the inbox path). Critical-Today CTAs
   stop dropping the operator on generic lists.

Out of scope (backend lane, filed not built): aggregate KPI endpoint,
data-age freshness, LionWheel-mirror read API, price-update path.

## File manifest
- `src/app/(shared)/dashboard/_lib/useNow.ts` — NEW shared ticker hook.
- `src/app/(shared)/dashboard/_lib/useNow.test.ts` — NEW unit tests (tick,
  hidden-tab pause, single shared interval).
- `src/app/(shared)/dashboard/page.tsx` — consume `useNow`; T3 headline; T4
  currency guard; T5 `isoDateLocal` in `weekRange`/`poStats`.
- `src/app/(shared)/dashboard/_components/CountUp.tsx` — prev→new tween.
- `src/app/(shared)/dashboard/_components/CountUp.test.tsx` — NEW/extended
  tests (first paint from 0, change from prev, reduced-motion, passthrough).
- `src/app/(shared)/inventory/**` — read `?item_id=` (smallest change that
  focuses/filters the row; exact file(s) confirmed at fix time within this
  glob).
- `src/app/(inbox)/**` or `src/app/(shared)/**` exceptions-redirect target —
  honor `?id=` (exact file confirmed at fix time within these globs).
- `src/app/(shared)/dashboard/_lib/trends.test.ts` — extend if `weekRange`
  moves into `_lib` for testability (optional, same-tranche).

## Verification gates
- `npx tsc --noEmit` clean; `vitest` green including new tests (N/N reported).
- Playwright `@mocked` dashboard spec still green.
- Manual evidence: screenshot pair — dashboard left open 10+ min shows
  advancing "ago" labels; KPI change tweens without crashing to 0.
- No visual diff beyond the Exceptions headline number and PO sub line
  (explicitly listed for reviewer).

## Behaviour preserved
- Layout, band order, all styling untouched (Phase 2/3 territory).
- Query keys, cadences (60s), and role gating unchanged.
- Compact-ILS + tooltip pattern unchanged.
