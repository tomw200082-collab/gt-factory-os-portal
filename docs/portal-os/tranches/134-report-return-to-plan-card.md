# Tranche 134 — Production Report: return to the exact plan card

**Status:** implemented (pending merge)
**Origin:** Tom-directed (2026-07-21 chat): "לאחר שמזינים ייצור מהדף של התכנון ייצור היומי — אני רוצה שהניווט יחזיר אותי לאותו מקום שהייתי בו בדף התכנון היומי לפני שנכנסתי להזין ייצור בתכנון מוצר הספציפי. תתקן את זה מקצה לקצה."
**Scope:** the report-from-plan round trip only — `/planning/production-plan` (board) ↔ `/stock/production-actual` (report form). No backend change; pure portal navigation.

## The problem

A plan card's "Open Production Report" link carries `?from_plan_id=` OUT, but every link back was a bare `/planning/production-plan`: the board re-opened on the **current** week (the `?week=` the operator had navigated to was lost) and auto-centered the **TODAY** lane. An operator reporting a plan on any other day/week landed somewhere else entirely and had to re-navigate + re-scroll to confirm the card flipped to done.

## Changes

1. **`planBoardReturnHref(planId, planDate)`** (`production-actual/_lib/report-helpers.ts`, unit-tested): builds `/planning/production-plan?week=<Sunday-of-plan-week>&focus_plan=<plan_id>`. Week math is **imported from the board's own `_lib/helpers`** (`startOfWeek`/`toIsoDate`) so the Sunday-first convention can never drift between the two surfaces. Degrades: no/invalid date → no `week` param; no plan id → plain board href.
2. **Four report-form links now deep-link** (`production-actual/page.tsx`): the success panel's "← Back to the daily plan" (built from the captured `committedPlan`), the pre-submit plan-link banner's "View on the daily plan board", and the two plan-conflict links (`PLAN_ALREADY_COMPLETED`, `PLAN_ITEM_MISMATCH` — land on the conflicting plan's own card). The submission-detail (`?submission_id=`) view's board link is deliberately unchanged — that's a different journey with no "place the operator left".
3. **The board consumes `?focus_plan=`** (`production-plan/page.tsx`): read in the same SSR-safe mount effect as `?week=`. Once plans land, the card (`[data-plan-id]` **inside `boardRef`** — the attribute also exists on today-strip rows, which are correctly out of scope) is `scrollIntoView`'d on both axes (horizontal lane inside the board container + vertical page position), flashes a ~2.5s highlight ring, and the param is stripped via `replaceState` (keeping `week`) so refresh/back doesn't re-jolt. The TODAY auto-center effect skips while a focus is pending; a stale id (plan deleted / moved out of the week) falls back to normal today-centering.
4. **Highlight ring** (`ProductionDayLane` → `ProductionJobCard`, new optional props): static `ring-2 ring-accent` + `data-return-focus="true"` on the focused card. No animation — no reduced-motion concern.

## Files

- `src/app/(ops)/stock/production-actual/_lib/report-helpers.ts` (+ test — `planBoardReturnHref`, 6 new cases)
- `src/app/(ops)/stock/production-actual/page.tsx` (4 links)
- `src/app/(planning)/planning/production-plan/page.tsx` (focus consume + today-center guard)
- `src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx` (prop pass-through)
- `src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx` (ring + data attr)
- `tests/e2e/production-plan-board.spec.ts` (+1 @mocked test)
- `docs/portal-os/tranches/134-report-return-to-plan-card.md` (this file)

## Evidence

- `npx tsc --noEmit` → clean.
- `npx vitest run` → 925/932; the 7 failures (recipe-health-card ×4, bom-line-real-shape ×2, bom-line-row ×1 — all admin Recipe-Health family, untouched by this diff) **reproduce identically on clean origin/main** via `git stash` base runs — pre-existing date-drift in that family's fixtures (the sandbox clock advanced past their pinned dates), not a regression. Report-helpers scope: 22/22.
- `npx playwright test tests/e2e/production-plan-board.spec.ts --grep @mocked` → **5/5** (real dev server, sandbox Chromium), including the new test: card scrolled into viewport, `data-return-focus` on exactly the reported card, URL cleaned, ring transient.
- **Full-journey proof** (throwaway stubbed spec, not committed, screenshots reviewed): opened the real form via a card's `?from_plan_id=` link → banner link already deep-linked → filled qty, submitted → success panel's "← Back to the daily plan" href = `?week=<plan week>&focus_plan=<plan id>` → clicked it → board landed on the plan's week with the card in-viewport and ringed.

## Deliberately NOT in this tranche

- Restoring exact scroll-position pixels — the anchor is the reported card (what the operator actually left), which is strictly more useful than a pixel offset and stable across viewport sizes.
- The post-submit "re-plan remainder" link (points at a *newly created tomorrow plan*, not the place the operator left) and submission-detail board links — different journeys.
- The pre-existing Recipe-Health test-fixture date drift (needs its own small fix pass; flagged above).
