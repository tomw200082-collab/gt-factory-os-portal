# Tranche 091: production-plan — visual-token cleanup (restyle-readiness)

status: in-progress
created: 2026-06-26
scorecard_target_category: design / visual_system
expected_delta: +1 (the worst token-bypass surface in the portal becomes restyle-responsive)
sizing: M (mechanical className substitutions only; no logic, no copy, no token-config changes)
source: /screen-scorecard /planning/production-plan (2026-06-26) VISUAL-001..015 + design-debt.md

## Why
This surface is the #1 token-bypass screen in the portal (design-debt.md): arbitrary
`text-[Npx]`, off-system `shadow-2xl/lg/sm`, and `tracking-wider/[…]`. None of these
respond when tokens change, so a future premium restyle would leave this screen behind.
This tranche makes every value resolve through the existing token scale — no new tokens
(Tom 2026-06-26: 9px → existing `text-3xs`, do NOT touch tailwind.config.ts).

## Substitutions (mechanical, per existing tokens only)
- `text-[10px]` (26×) → `text-3xs`   (exact 10px token)
- `text-[9px]`  (13×) → `text-3xs`   (Tom-approved nearest; no new `text-micro`)
- `text-[22px]` (4×)  → `text-2xl`   (KPI hero numbers)
- `text-[26px]` (1×)  → `text-3xl`   (card hero quantity)
- `shadow-2xl`  (8×)  → `shadow-pop` (floating modal shells)
- `shadow-lg`   (1×)  → `shadow-pop` (Toast)
- `shadow-sm`   (3×)  → `shadow-raised` (card hover lift; incl. `hover:shadow-sm`)
- `tracking-wider` (4×) → `tracking-ops`
- `tracking-[0.06em]` (1×) → `tracking-ops`

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionNoteCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
  - src/app/(planning)/planning/production-plan/_components/InventoryImpactPanel.tsx
  - src/app/(planning)/planning/production-plan/_components/WeekTimelineRail.tsx
  - docs/portal-os/registry.md

## Verification
- tsc 0 (className-only — must stay 0).
- vitest full suite green (790/790 — components unchanged in behavior).
- Vercel preview build green.
- Zero remaining `text-\[[0-9]`, `shadow-(sm|md|lg|xl|2xl)`, `tracking-wider`, `tracking-\[` on the surface.

## Checklist
- [x] all 9 substitution classes swept (text-[10px]×26, text-[9px]×13, text-[22px]×4, text-[26px]×1, shadow-2xl×8, shadow-lg×1, shadow-sm×3, tracking-wider×4, tracking-[0.06em]×1)
- [x] grep clean (0 remaining text-[N / shadow-sm|md|lg|xl|2xl / tracking-wider / tracking-[)
- [x] tsc 0 + vitest 790/790 green-after; diff confirmed token-swaps only (no logic/copy)
- [ ] Tom merge review
