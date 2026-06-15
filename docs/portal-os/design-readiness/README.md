# GT Portal Design System — restyle-readiness foundation

> Purpose: make a **system-wide, premium visual upgrade** a *token + primitive*
> change, not a thousand-file slog. This folder is the blueprint Tom uses when
> he does the visual pass. Authored 2026-06-15 (Tranche 072 design-prep).

## The one idea
The portal already has a mature, fully **semantic, CSS-variable-driven** token
layer ("Operational Precision" design system). Visuals are *not* hardcoded into
surfaces — they resolve through tokens:

```
surface markup  →  Tailwind semantic class (bg-bg-subtle, text-fg, .btn)
                →  CSS variable (--bg-subtle, --fg, --accent)
                →  one value in globals.css  :root  and  :root.dark
```

Change a token once → the whole app (both themes) updates. That is the leverage
a restyle rides on.

## Files
- `tokens.md` — canonical reference of every design token (the restyle knobs):
  color, type, radius, shadow, spacing, motion. Single source of truth pointer.
- `primitives.md` — the reusable component vocabulary (`.btn`, `.card`,
  `.chip`, `.input`, `.stat-card`, `Badge`) surfaces should compose, and where
  the React-primitive layer is thin. _(added with the readiness audit)_
- `design-debt.md` — the values that BYPASS tokens (arbitrary Tailwind values,
  hardcoded colors, hand-rolled buttons) and must be cleaned for a clean
  restyle, with file:line. _(added with the readiness audit)_
- `restyle-playbook.md` — step-by-step: to go premium, turn these knobs, clean
  this debt first, give these surfaces manual attention. _(added with audit)_

## Where the truth lives
- **Token values:** `src/app/globals.css` — `@layer base`, defined twice
  (`:root` = light, `:root.dark` = dark). ~80 variables.
- **Token → Tailwind mapping:** `tailwind.config.ts` — `theme.extend`
  (colors, fontSize, letterSpacing, borderRadius, boxShadow, spacing, motion).
- **Component classes:** `src/app/globals.css` — `@layer components`
  (`.btn*`, `.card*`, `.chip*`, `.input`/`.textarea`, `.stat-card`, table, kbd…).
- **React primitives:** `src/components/ui/**` (currently thin — see
  `primitives.md`).

## Readiness at a glance (2026-06-15)
- Token architecture: **strong** — semantic, dual-theme, complete categories.
- Component-class vocabulary: **good** — rich `.btn/.card/.chip/.input/.stat`.
- React-primitive layer: **thin** — only `Badge`; buttons/cards/inputs are CSS
  classes applied inline, so adoption varies surface to surface.
- Main restyle-resistance: token-bypassing debt + hand-rolled markup + a
  3000+-line `globals.css` that mixes system primitives with per-surface CSS.
  Quantified in `design-debt.md`.
