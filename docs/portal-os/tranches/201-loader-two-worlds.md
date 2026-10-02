# Tranche 201 — One loader, two worlds

**Status:** in progress on `claude/gt-loader-two-worlds`.
**Origin:** Tom, 2026-10-02. Loading should look like Factory on the factory routes and like the GT CRM (GT Pulse D1 visual system) on `/sales/*`. Today Sales inherits the Production colours, the GT logo looks small with a visible square artifact, and the motion is busy. Same brand, two environments; premium, calm, fast, smooth, phone-first. No generic spinner, no game-like effects.

**Name (Tom, 2026-10-02):** the sales system is called **GT CRM** in the product ("בוא נקרא לילד בשמו"). The loader label, the app name, the page titles, the installed-app name, the `/apps` card and the factory TopBar switch say GT CRM / CRM. Routes stay `/sales/*`.

## Before

- One always-dark loader (petrol-teal and moss-amber counter-rotating conic rings, dot grid, overshoot pop, three bouncing dots, "Initializing…", a progress bar that fills to 88% and stalls). Sales screens showed it in the Production palette.
- The logo read as small. `public/brand/logo.png` is 971×960 but the mark occupies only ~52% of the width (alpha bbox 235,172 to 736,788), so at 92 px the glyph was ~47 px wide.
- The "square" was the shimmer: a translucent skewed white band swept inside a 92×92 `overflow:hidden` box, visible over the transparent padding as a moving rectangle.
- `NavigationLoader` showed the loader on clicks that never navigate in this tab (ctrl/meta/shift/alt-click, middle-click) and on query-only links, leaving it stuck until the 6 s safety valve. It chose no palette from the destination.
- A direct load of `/sales/*` rendered a blank screen while the session loaded, because `RoleGate` returns `null` during `isLoading`.

## Change

- One `GTLoader` with a `variant`: `factory` (the current warm graphite with petrol-teal accent) or `sales` (deep petrol with electric turquoise, the GT Pulse opening tokens, copied as loader-local custom properties because the loader renders outside the sales layout). Default variant comes from `usePathname()`; `loaderVariantFor` is "sales" only for `/sales` and `/sales/*`.
- Styling moves from inline styles into a `.gt-loader` block in `globals.css`. Same structure in both worlds: backdrop, mark, one thin orbit (track plus one arc), a breathing glow, a glyph-only light sweep, a small letter-spaced label ("GT FACTORY OS" / "GT CRM"), and a 2 px travelling progress segment. Motion is transform and opacity only. The conic rings, bouncing dots, overshoot pop, dot grid and stalled progress fill are gone.
- Logo: new `public/brand/logo-mark.png`, a pixel-exact crop of `logo.png` to its alpha bbox plus an 8 px transparent margin, no resampling. `logo.png` is unchanged (TopBar and login use it). The mark is sized by height `clamp(96px, 28vw, 128px)`: on a 390 px phone the glyph is about 89 px wide against 47 px before. The light sweep is a gradient layer masked by `logo-mark.png`, so it only lights glyph pixels and never a rectangle.
- Entrance: invisible and non-interactive for the first 120 ms (so fast navigations never flash), then a 200 ms fade. Exit: 180 ms fade when `leaving`, done on an inner stage so a loader that is still fading in cannot jump to full opacity on its way out. Reduced motion: a static composition (full faint track, static arc, steady glow, slow-pulsing progress line), fades kept.
- A11y: `role="status"`, `aria-live="polite"`, accessible name and a visually hidden text node inside the status: "Loading GT Factory OS" (factory) or "טוען את GT CRM" with `lang="he"` (sales); the stage and all decoration stay `aria-hidden`; no focusable element except the stuck-load Reload button; nothing faster than 1 Hz.
- `NavigationLoader` picks the variant from the destination at click time and skips modified clicks, non-primary buttons, `target=_blank`, `download`, non-`/` hrefs and links whose destination pathname equals the current one. On a pathname commit it fades out and unmounts after 180 ms (a commit inside the 120 ms entrance window removes it at once, since nothing was ever visible); the 6 s safety valve fades out too. Repeated clicks re-target the variant and timers are always cleared.
- `RoleGate` takes an optional `fallback` rendered while the session loads (default `null`, so every other caller is unchanged). The sales layout passes the sales loader, so a direct `/sales/*` load shows it instead of a blank screen.
- `globals.css`: the loader-only keyframes (`gt-spin`, `gt-spin-r`, `gt-pulse-glow`, `gt-logo-in`, `gt-fade-up`, `gt-bounce`, `gt-progress`) are removed. `gt-shimmer` stays: skeletons in `states.tsx`, `FlowNode.tsx` and `WeekPanel.tsx` still use it.

### UX gate round 1 (L1 to L8)

- **One continuous loader across the route boundary (L1).** Root `loading.tsx` and the RoleGate fallback are boundary loaders (`data-gt-loader-boundary`). The `NavigationLoader` overlay (`data-gt-loader-nav`, stamped with `data-t0`) no longer starts its exit at the pathname commit: it waits, with a `MutationObserver`, until no non-leaving boundary remains, then runs its 180 ms exit (a boundary that clears inside the invisible 120 ms removes the overlay at once). The 6 s valve still ends it. A boundary that mounts under a running overlay adopts the overlay's clock through `--gt-elapsed`, which every animation delay subtracts, so both sit on the same frame instead of restarting the invisible phase; this replaces "skip the entrance", which would flash a boundary during the overlay's own invisible phase. The RoleGate fallback, when it is a `GTLoader`, stays mounted above the freshly rendered children and fades out (same node, so nothing restarts); if it never became visible it is removed at once. A leaving loader is removed 280 ms after the exit starts (180 ms fade plus 100 ms of slack: the transition begins a frame or two after the state change, and removing on the dot cut it at about 0.3 opacity). On a **hard load** of `/sales/*` the server HTML already carries the RoleGate loader; React then suspends, hides it, mounts root `loading.tsx`'s loader (restarting its invisible phase) and finally removes both in one commit. The overlay therefore takes over at hydration (before the first paint, on the server loader's real animation clock) and supplies the exit fade. The overlay's watcher is a `MutationObserver` with a 50 ms poll as backup.
- **No mixed fade (L2).** `[data-leaving]` pauses the root entrance (`animation-play-state: paused`) and only the stage fades.
- **Click on the current page (L3).** A click whose destination is the current pathname while an overlay is up fades it out (or removes it, if it was never visible) instead of waiting for the 6 s valve.
- **Inert page (L4).** While the overlay is visibly up, everything outside its ancestor chain is `inert` (not the route announcer, not what was already inert). It is applied after the 120 ms invisible phase and released as the exit starts, and on unmount.
- **Announcement (L5).** See A11y above.
- **A way out (L6).** The sales RoleGate fallback offers, after 8 s, "לוקח יותר זמן מהרגיל" and a "טעינה מחדש" button (factory style: "Taking longer than usual" / "Reload"). It sits outside the `aria-hidden` stage.
- **Wording (L7).** "Sales workspace access" is "CRM access" in the role-gate labels; the two role blurbs in `admin/users/page.tsx` say "CRM".
- **Known, not changed here:**
  - After the 6 s safety valve the page behind is shown as it is, with no further signal (FLOW-A-003). Accepted.
  - A failed `/api/me` shows the English "Access restricted" card (INT-14b, FLOW-A-004). Pre-existing; it moves to the queued system-wide UX pass.

Not changed: `SeedGate` and its own loading state, the factory palette, `logo.png`, TopBar, login.

## Manifest

manifest:
  - docs/portal-os/tranches/201-loader-two-worlds.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - public/brand/logo-mark.png
  - src/components/ui/loader-variant.ts
  - src/app/loading.tsx
  - src/app/(admin)/admin/users/page.tsx
  - src/components/ui/GTLoader.tsx
  - src/components/ui/NavigationLoader.tsx
  - src/app/globals.css
  - src/lib/auth/role-gate.tsx
  - src/app/(sales)/layout.tsx
  - tests/unit/loader-variant.test.ts
  - tests/unit/navigation-loader.test.tsx
  - tests/unit/gt-loader.test.tsx
  - tests/unit/role-gate-fallback.test.tsx
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/sales/attention/layout.tsx
  - src/app/(sales)/sales/orgs/[id]/layout.tsx
  - src/app/(sales)/sales/orgs/review/layout.tsx
  - src/app/(sales)/sales/orgs/layout.tsx
  - src/app/(sales)/sales/leads/layout.tsx
  - src/app/(sales)/sales/settings/layout.tsx
  - src/app/(sales)/sales/today/layout.tsx
  - public/sales-manifest.webmanifest
  - src/app/apps/page.tsx
  - src/components/layout/TopBar.tsx
  - src/components/layout/TopBar.switch.test.tsx
  - tests/unit/sales/manifest.test.ts
  - tests/unit/sales/labels.test.ts

## Gates

- Red-first unit tests:
  - variant table, including `/sales`, `/sales/x?y`, `/salesy`, `/home`, `/apps`;
  - factory to sales click shows the sales loader, sales to `/home` shows the factory one;
  - modified click, middle click, and same-pathname-with-query show nothing;
  - pathname commit leaves, then unmounts after the fade; the safety timeout removes it;
  - a second click while visible re-targets the variant;
  - `RoleGate` renders `fallback` while loading, `null` without one, and is unchanged once loaded;
  - L1 to L7: the overlay waits for boundaries, a boundary joins the overlay's clock, the fallback fades out, a same-page click releases the overlay, the page behind is inert, the announcement and the Reload notice, the CSS rules (paused entrance, delay clock).
- Rendered evidence (not committed): both variants and reduced motion at 320, 390, 430 and 1280 px, re-rendered at the round-1 HEAD; and a per-frame timeline of a cold entry to `/sales` in a production build, before and after.
- vitest (full suite), typecheck, eslint on changed files, and `tests/e2e/sales-today.spec.ts`.

## Rollback

Revert the merge commit. `logo-mark.png` is an additive asset and is harmless if left behind.
