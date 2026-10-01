# Tranche 186 — GT Pulse D, phase 1: visual pass on Today, the lead and the result sheet

**Status:** in progress on `feat/gt-pulse-d1-visual`; not deployed.
**Origin:** Tom, 2026-10-01: "קודם A ואז D שלב 1, תמשיך בכל הכוח", under the GT Pulse program spec §8 he approved on 2026-09-29. Unit A is live (portal `eb36b83`).
**Spec:** Sales-Machine `docs/superpowers/specs/2026-10-01-gt-pulse-d1-visual-design.md` (V1–V7).
**Scope:** colour tokens of the sales corridor, Today opening band, mini journey rail on Today cards, primary action colour. No new copy (existing register strings only), no backend change, no factory screen.

## Manifest (every path this tranche may touch)

manifest:
  - docs/portal-os/tranches/186-gt-pulse-d1-visual.md
  - docs/portal-os/tranches/_active.txt
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_lib/leadMilestones.ts
  - src/app/(sales)/_components/MiniRail.tsx
  - src/app/(sales)/_components/TaskCard.tsx
  - src/app/(sales)/_components/TodayCard.tsx
  - src/app/(sales)/sales/today/page.tsx
  - tests/unit/sales/mini-rail.test.tsx
  - tests/unit/sales/sales-tokens-contrast.test.ts
  - tests/unit/sales/today-queue.test.tsx

## Gates

Unit tests (row → rail nodes, accessible names, token contrast ≥ 4.5:1 for every text pair, light and dark); full sales unit and mocked e2e; typecheck, lint, build; fixture render before/after at 390 and 1280; Tom sees before/after before merge.

## Rollback

Revert the merge commit; tokens and components are presentation-only.
