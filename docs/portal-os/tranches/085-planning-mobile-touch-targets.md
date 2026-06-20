# Tranche 085: planning-subnav-mobile-touch-targets

status: landed-pending-review
created: 2026-06-19
landed: 2026-06-19
verification: tsc 0 · eslint 0 · Playwright iPhone-14 shot confirms taller tabs, no layout break
scorecard_target_category: technical_substrate / mobile
expected_delta: +0 (mobile a11y polish; mobile-perfection program — Planning)
sizing: XS (1 shared component; additive class; no backend)

## Why this tranche
Mobile-perfection program (`docs/portal-os/mobile-perfection-program.md`),
Planning group (priority #1). Verified visually with Playwright at iPhone-14
width: the `PlanningSubNav` tab strip is already well built (ScrollFade,
short labels, active-tab scroll-into-view, focus rings) — but each tab is
`py-2.5` (~38px tall), under the ui-ux-pro-max CRITICAL rule of ≥44×44px touch
targets. Shared component → fixes the touch target on EVERY `/planning/*` page.

## Scope
- **Edit** `src/components/layout/PlanningSubNav.tsx`: add `min-h-[44px]` to the
  tab `<Link>` so every planning tab meets the 44px touch-target minimum.
  Visual unchanged on desktop (content already ~38–40px; min-h only grows the
  hit area, content stays centered).

## Manifest
manifest:
  - src/components/layout/PlanningSubNav.tsx
  - docs/portal-os/mobile-perfection-program.md
  - docs/portal-os/tranches/085-planning-mobile-touch-targets.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Tests / verification
- `tsc --noEmit` → 0; `eslint` (component) → 0.
- Playwright iPhone-14 screenshot of /planning before+after (tab strip taller,
  no layout break).
