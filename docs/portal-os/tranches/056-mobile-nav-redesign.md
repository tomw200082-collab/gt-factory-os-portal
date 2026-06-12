# Tranche 056 — Mobile nav redesign: bottom bar removed, drawer becomes first-class

status: implemented (branch `claude/mobile-navigation-redesign-hyf5o0`; Tom merges)
phase: mobile navigation redesign
approved_by: Tom (2026-06-12 direct dispatch — "remove the mobile bottom bar, improve the whole navigation system")

## Decision
Tom requested removal of the persistent mobile bottom tab bar (Tranche 051 /
FLOW-016) and a compensating upgrade of the rest of the navigation system.
This intentionally reverses the FLOW-016 remediation: the hamburger drawer is
again the single mobile navigation surface, so this tranche makes it
first-class instead of a shrunken desktop sidebar, and adds always-visible
orientation in the TopBar.

## File manifest
- `src/components/layout/MobileBottomNav.tsx` — DELETED.
- `src/lib/nav/bottom-nav.ts` — DELETED (pure tab module).
- `src/lib/nav/bottom-nav.test.ts` — DELETED (−12 tests).
- `src/components/layout/AppShellChrome.tsx` — `<MobileBottomNav />` render removed;
  `<main>` bottom padding unified back to `pb-[max(4rem,env(safe-area-inset-bottom,0px))]`
  at all widths (the `<md` 5rem reservation existed only for the bar).
- `src/lib/nav/active.ts` — NEW pure module: `findActiveNavEntry(pathname)` /
  `activeNavLabel(pathname)` — longest exact-or-path-segment-prefix match over
  `NAV_MANIFEST` (nested entries beat section roots; null for routes outside
  the manifest).
- `src/lib/nav/active.test.ts` — NEW 8 unit tests for the above.
- `src/components/layout/TopBar.tsx` — phone widths (`<sm`) now show the current
  page's manifest label next to the logo (`topbar-mobile-page-label`, truncating,
  flex-1) so orientation never requires opening the drawer; renders nothing on
  routes outside the manifest. sm+ unchanged.
- `src/components/layout/SideNav.tsx` — new `density?: "compact" | "comfortable"`
  prop (default compact = pixel-identical desktop rendering). Comfortable:
  rows `min-h-[44px] gap-3 px-3 py-2`, labels 15px, icons 18px, collapsible
  group toggles `min-h-[44px]`, filter input `py-2.5` (16px touch font floor
  already global). Also: active item `scrollIntoView({block:"nearest"})` on
  mount / route change (Tranche 053 PlanningSubNav idiom) so deep entries are
  never hidden off-screen — both densities.
- `src/components/layout/MobileNav.tsx` — drawer renders
  `<SideNav density="comfortable" />`; panel widened `w-[min(288px,85vw)]` →
  `w-[min(320px,88vw)]` to carry the comfortable density.

## Gates / evidence
- `npx tsc --noEmit` — clean.
- `vitest` — 576 passed / 0 failed (72 files). Prior baseline 580/580; −12
  deleted bottom-nav tests, +8 new active-nav tests, zero failures.
- `eslint` on all six touched files — clean.
- Desktop md+ renders pixel-identical (density defaults to compact; AppShell
  md+ padding expression unchanged; TopBar label is `sm:hidden`).
- No remaining references: `grep -r "bottom-nav\|BottomNav" src/` → empty.

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [x] Lint  - [ ] Merged (Tom)
