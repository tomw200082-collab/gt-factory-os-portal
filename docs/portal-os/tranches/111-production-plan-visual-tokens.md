# Tranche 111: production-plan — visual token hygiene

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / technical_substrate
expected_delta: 0 (design-token hygiene — no behavior change)
sizing: XS (5 files; no backend)
source: /ux-release-gate on /planning/production-plan (2026-06-26) — Batch 4 of
the approved 7-batch plan. Findings: VISUAL-001 (shadow-2xl), VISUAL-002
(text-[9px]), plus tracking-wider off-system consistency.

## The fixes (off-system arbitrary values → scale tokens)
1. **VISUAL-001 — `shadow-2xl` → `shadow-pop`.** All nine modal/overlay
   containers on this surface (the 6 inline page modals + the 2 recipe-panel
   overlays) used Tailwind's stock `shadow-2xl` instead of the design system's
   `shadow-pop` (the token `.popover` and every other raised surface uses). The
   containers already carry their own `border`, so the token's hairline ring is
   harmless.
2. **VISUAL-002 — `text-[9px]` → `text-3xs`.** 13 micro-labels used a below-scale
   arbitrary 9px size; snapped up to the smallest scale token `text-3xs` (10px).
   The explicit `tracking-sops` / `tracking-wider` and `leading-none` classes
   already on these spans win over the token's baked-in letter-spacing /
   line-height, so the only rendered change is the 9→10px scale-snap.
3. **`tracking-wider` → `tracking-sops`.** 4 uppercase eyebrow labels (day names,
   "Today", "N overdue") used stock `tracking-wider`; `tracking-sops` is the
   system token for exactly these uppercase micro-labels.

Left as follow-up (no matching scale token / intentional): the `text-[26px]`
hero quantity and the WeekTimelineRail inline `style={{height}}` bars — no scale
token exists for those, so snapping them would invent values rather than adopt
the system.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_components/WeekTimelineRail.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/111-production-plan-visual-tokens.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (no test asserts these utility classes;
  pure presentation token swap).

## Checklist
- [x] shadow-2xl → shadow-pop (9 containers) · verified
- [x] text-[9px] → text-3xs (13 labels) · verified
- [x] tracking-wider → tracking-sops (4 eyebrows) · verified
- [ ] Tom review / merge · follow-up: text-[26px] hero + rail inline heights
