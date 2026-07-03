# Tranche 120: /home "Signature Glow" on the primary hero tile

status: executed
created: 2026-07-03
scorecard_target_category: (visual polish, no category delta)
source: Tom-directed via `/ui-ux-pro-max` (2026-07-03) — "יש איך לשפר את העיצוב? אני רוצה שהבית ייראה הרבה יותר מהממם, מזמין ומרשים ומודרני וזוהר" (make /home look more stunning, inviting, impressive, modern, and glowing).
approved_by: Tom — chose "Signature Glow (restrained)" over "Full Radiance", and to build immediately on top of the still-open PR #153 rather than waiting for its merge.

## Why this tranche

Follow-up visual pass on `/home` (tranche 090 Slice B + Phase 2; tranche 119 UX-gate P1s) at Tom's explicit request for a more premium, glowing feel. Ran `/ui-ux-pro-max`'s design-system search first — its raw output skewed toward generic consumer dark-mode-neon directions (Aurora/Cyberpunk/OLED), which `/frontend-design` explicitly flags as the generic AI-look default and which doesn't fit an operational tool that must stay readable in light mode across 8-hour shifts. Went looking in the repo's own design system instead and found the exact fit already shipped and validated: the dashboard's `.dash-hero` (globals.css) — a glass-and-glow hero surface with a **deliberately static** glow (the code comment there notes a continuous "breathe" pulse was retired in favor of a fixed motion budget for live-data elements only). Mirrored that established recipe rather than inventing a new visual language.

## What this tranche ships

**Scope: the primary hero tile only** (Signature Glow = restrained option — every other tile on `/home` is untouched, per Tom's choice to keep the "wow" contained to one element).

`src/app/(shared)/home/_components/HomeTile.tsx`, primary variant only:
- **Glass surface** — `bg-bg-raised/75 backdrop-blur-md backdrop-saturate-[1.4]` (`dark:bg-bg-raised/65`), mirroring `.dash-hero`'s translucency recipe.
- **Static top-anchored accent glow** — a two-stop radial-gradient wash (`hsl(var(--accent)/0.20)` + `hsl(var(--info)/0.12)`), no animation — mirrors `.dash-hero::before` and its explicit "motion budget" restraint. RTL-mirrored so the main glow falls on the icon's side in the Hebrew cockpit, matching the spine/fill/arrow's existing RTL-awareness.
- **Hairline accent line** at the tile's top edge — mirrors `.dash-hero::after`.
- **Layered ambient shadow** at rest (inset highlight + soft shadow + deep drop-shadow, using the existing `--shadow-color`/`--shadow-color-deep` tokens) — the tile now reads as elevated even before hover, not just on interaction.

All effects reference existing CSS custom properties (`--accent`, `--info`, `--shadow-color`, `--shadow-color-deep`) via inline `style` (kept out of Tailwind's arbitrary-bracket syntax since the multi-stop `hsl(var(...))` values don't survive space-escaping cleanly) or plain Tailwind utilities. Zero new tokens.

## Constraints honored

- Did **not** touch `tailwind.config.ts` or `globals.css` — every value is either an existing Tailwind utility or an inline `style` referencing an existing CSS custom property.
- No backend, no schema, no route change.
- No continuous animation added (static glow, matching the dashboard's own retired-pulse precedent) — respects the portal's per-surface motion budget and needs no new `prefers-reduced-motion` guard (nothing to reduce).
- Other tiles' spine/fill/hover treatment ("The Line") is completely unchanged.

## Manifest (files touched)

manifest:
  - docs/portal-os/tranches/120-home-signature-glow.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(shared)/home/_components/HomeTile.tsx

## Verification

- `npm run typecheck` — clean
- `npx eslint .` (changed file) — 0 errors
- `npx vitest run` — 871/871 (no test changes needed; purely visual)
- Screenshots re-rendered: admin desktop (light + dark), planner/operator/viewer desktop, viewer desktop (RTL glow mirror confirmed), operator mobile — confirmed glass/glow renders correctly in both themes, RTL, and at mobile width with no layout breakage.

## Rollback

Pure presentation change to one component's primary variant. Revert the commit — no migrations, no data impact.
