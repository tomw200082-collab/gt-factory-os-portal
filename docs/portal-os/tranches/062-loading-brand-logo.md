# Tranche 062 — loading screen: real brand logo replaces the "GT" text monogram

status: implemented (branch `claude/dashboard-ui-audit-pc60ck`; rides PR #83)
approved_by: Tom (2026-06-12 dispatch — "במצב טעינה של דפים יש את האותיות gt. תחליף אותן בלוגו של gt שיש באתר. כך שהטעינה תהיה אותו דבר פשוט עם הלוגו שלנו")

## What landed
`GTLoader`'s center monogram — previously a 76px gradient-text "GT" — now
renders the site's real mark, `/brand/logo.png` (92×92, object-contain),
the same asset TopBar's BrandMark uses. The loader surface is always dark
and the logo asset is white-on-transparent, so no theme invert is needed
(unlike BrandMark, which inverts per theme). **Everything else is
untouched**: spinning rings, glow, shimmer sweep, entrance animation,
brand text, bouncing dots, progress bar.

## File manifest
- `src/components/ui/GTLoader.tsx` — monogram block only.
- `docs/portal-os/registry.md` — this tranche's index line.

## Verification
- tsc clean · eslint clean (`@next/next/no-img-element` disabled inline,
  matching the existing BrandMark idiom).
- Visual: loader captured with the logo centered in the ring (evidence
  screenshot delivered to Tom in-session).

## Behaviour preserved
- All animation timings, copy, a11y roles, and the NavigationLoader
  (which renders no monogram) — unchanged.
