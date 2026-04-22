# Tranche 008: mobile-parity

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: ops_surface + technical_substrate + dashboard_truth
expected_delta: +5 total (ops_surface 5→7, technical_substrate 7→8, dashboard_truth 6→7)
sizing: M (6 files)

## Why this tranche
The portal is used primarily by warehouse operators on phones (iPhone / Android, ~390-412px viewport). The deep mobile audit found two **CRITICAL** blockers: (1) no viewport meta tag, so mobile browsers assume 980px width and render everything at 2.5× zoom-out; (2) SideNav is permanently 232px wide on every viewport, stealing 59% of a 390px screen and leaving 158px for the main content. Forms themselves already use mobile-first grid patterns (`grid-cols-1 sm:grid-cols-2`), but the layout shell neutralizes that work. This tranche fixes the shell, unlocks every downstream page, and converts the sidebar into a hamburger drawer on `<md`.

## Scope
- Add `viewport` + `themeColor` metadata to root `src/app/layout.tsx` (width=device-width, initial-scale=1, viewport-fit=cover for notched phones).
- `AppShellChrome.tsx`: hide desktop `<aside>` on `<md`; compress horizontal padding on mobile (`px-4` vs `px-8`); drop `gap-10` to `gap-6` on mobile.
- New `src/components/layout/MobileNav.tsx`: hamburger button + slide-in drawer (self-contained useState, closes on link click, closes on Escape, closes on backdrop click, closes on viewport resize to md+). Wraps the existing SideNav so navigation logic stays in one place.
- `SideNav.tsx`: accept optional `onNavigate?: () => void` prop that callers can pass to close their drawer after a link click; bump nav item padding from `px-2.5 py-1.5` to `px-3 py-2` so tap targets meet the ≥36px height floor.
- `TopBar.tsx`: render MobileNav at leftmost position (visible `<md`, hidden `md:hidden`); compress gap from `gap-5` to `gap-2 sm:gap-5`; bump review button from `.btn-sm` to `.btn` so it meets tap target minimum; brand subtext hidden on xs.
- `src/app/(ops)/stock/receipts/page.tsx`: adjust the line-item grid from a cramped 5-column layout at md to a looser `grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]` with `gap-3` so inputs have room.

## Manifest (files that may be touched)
manifest:
  - src/app/layout.tsx
  - src/components/layout/AppShellChrome.tsx
  - src/components/layout/MobileNav.tsx
  - src/components/layout/SideNav.tsx
  - src/components/layout/TopBar.tsx
  - src/app/(ops)/stock/receipts/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Admin domain pages (items, components, suppliers list tables) — tables need a separate card-stack-at-sm pattern that's its own tranche.
- Admin detail pages (products/[id], boms/[id]) — large surfaces; defer.
- Bottom-nav pattern — evaluated and rejected: 7 groups × 2-6 items each doesn't fit a 4-5-tab bottom nav gracefully.
- Searchable select dropdowns for item/component pickers with 1000+ rows — deferred to a dedicated tranche (ties into a shared Combobox primitive).
- Pull-to-refresh, install-to-home-screen, service worker — deferred.

## Tests / verification
- typecheck clean.
- Manual viewport sweep: 390×844 (iPhone 14), 412×915 (Pixel 7), 768×1024 (iPad portrait), 1440×900 (desktop). On every viewport: TopBar fits, nav is reachable, ops forms stack correctly, submit buttons on-screen.
- keyboard: Escape closes drawer, Tab order logical.
- A11y: hamburger button has `aria-label`, drawer has `role="dialog"` + `aria-modal="true"`.

## Rollback
Revert the single tranche commit — no data-layer changes, new file isolates the drawer logic, the rest are additive responsive classes.

## Operator approval
- [x] Tom approves this plan (session directive "תעשה הכל לפי הסדר אבל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
