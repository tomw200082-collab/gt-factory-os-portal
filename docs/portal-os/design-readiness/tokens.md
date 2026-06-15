# Design tokens — canonical reference (the restyle knobs)

> Every visual value resolves through these. Values are HSL channels (`H S% L%`)
> consumed as `hsl(var(--token) / <alpha>)`. Defined in `src/app/globals.css`
> (`:root` = light, `:root.dark` = dark); mapped to Tailwind in
> `tailwind.config.ts`. To restyle: change values here, not in surfaces.

## Color — surfaces (`bg`)
| Token | Tailwind | Light | Dark | Role |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `42 18% 95%` | `30 10% 10%` | app background (warm bone / warm graphite) |
| `--bg-subtle` | `bg-bg-subtle` | `42 16% 92%` | `30 8% 13%` | subtle fill, row hover |
| `--bg-muted` | `bg-bg-muted` | `42 14% 88%` | `30 6% 16%` | muted fill |
| `--bg-raised` | `bg-bg-raised` | `42 20% 98%` | `30 8% 15%` | cards, inputs, raised surfaces |
| `--bg-deep` | `bg-bg-deep` | `40 10% 86%` | `30 12% 6%` | deepest recess |

## Color — foreground / ink (`fg`)
| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--fg` | `text-fg` | `30 10% 10%` | `42 14% 88%` |
| `--fg-strong` | `text-fg-strong` | `30 14% 6%` | `42 18% 95%` |
| `--fg-muted` | `text-fg-muted` | `30 6% 38%` | `42 8% 66%` |
| `--fg-subtle` | `text-fg-subtle` | `30 5% 54%` | `42 6% 52%` |
| `--fg-faint` | `text-fg-faint` | `30 4% 68%` | `42 5% 38%` |
| `--fg-inverted` | `text-fg-inverted` | `42 20% 98%` | `30 14% 6%` |

## Color — borders
| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--border` | `border-border` | `30 8% 82%` | `30 8% 22%` |
| `--border-strong` | `border-border-strong` | `30 10% 70%` | `30 10% 32%` |
| `--border-faint` | `border-border-faint` | `30 8% 88%` | `30 6% 18%` |
| `--border-focus` | `border-border-focus` | `186 42% 24%` | `186 50% 50%` |

## Color — accent (petrol teal, the signature) & semantics
Each family has `DEFAULT / soft / softer / fg / border` (accent also `hover`).
Restyle the brand by moving **`--accent`** (and its dark lift).

| Family | Token base | Light DEFAULT | Dark DEFAULT | Meaning |
|---|---|---|---|---|
| accent | `--accent` | `186 42% 24%` | `186 50% 50%` | primary brand / CTA |
| success | `--success` | `146 34% 30%` | `146 40% 56%` | moss — ok/covered |
| warning | `--warning` | `32 78% 42%` | `32 75% 56%` | amber — caution |
| danger | `--danger` | `4 66% 40%` | `4 66% 56%` | oxide red — risk/destructive |
| info | `--info` | `210 32% 38%` | quiet slate (≈`210` lifted) | informational |

`*-soft` / `*-softer` = tinted backdrops; `*-fg` = readable text on tint;
`*-border` = hairline. Full set in `globals.css` lines ~70-103 (light) and the
`:root.dark` mirror.

## Color — inventory-flow 5-tier gradient
`--tier-{critical,at-risk,low,medium,healthy}-{bg,fg}` — red→orange→yellow→
yellow-green→green, tuned per theme. Used by `/planning/inventory-flow` cells.

## Color — per-drink brand families
`--family-{calm,consciousness,cosmo,desertea,detox,energy,fresh,matcha,muza,
namastea,nonomimi,odk,pink-sangria,red-sangria,revive,white-sangria}` — one hue
per product line. Used for family chips/accents. Restyle = retune these hues.

## Typography
Base **14px** (operational density, not 16px consumer). Fonts: `--font-public-sans`
(sans), `--font-plex-mono` (mono/tabular numerics).

| Class | Size | Line | Tracking |
|---|---|---|---|
| `text-3xs` | 0.625rem | 0.875rem | 0.04em |
| `text-2xs` | 0.6875rem | 1rem | 0.02em |
| `text-xs` | 0.75rem | 1.1rem | — |
| `text-sm` | 0.8125rem | 1.2rem | — |
| `text-base` | 0.875rem | 1.35rem | — |
| `text-md` | 0.9375rem | 1.45rem | — |
| `text-lg` | 1.0625rem | 1.55rem | — |
| `text-xl` | 1.25rem | 1.75rem | — |
| `text-2xl` | 1.5rem | 1.95rem | -0.01em |
| `text-3xl` | 1.875rem | 2.3rem | -0.015em |
| `text-4xl` | 2.25rem | 2.6rem | -0.02em |

Letter-spacing tokens: `tracking-tightish/-tight/-tighter` (headings),
`tracking-ops` (0.08em), `tracking-sops` (0.12em — uppercase eyebrow labels).

## Radius
`rounded-none/xs(3px)/sm(4px)/DEFAULT(6px)/md(6px)/lg(8px)/xl(12px)/2xl(16px)`.
The global `--radius` is 6px.

## Shadow (deliberately minimal — premium = restraint)
| Class | Use |
|---|---|
| `shadow-hairline` / `shadow-hairline-strong` | 1px ring via border token |
| `shadow-raised` | cards (very soft 1px + 2px) |
| `shadow-pop` | popovers/menus (layered, with ring) |
| `shadow-focus-ring` | `0 0 0 3px accent/0.18` — focus |
| `shadow-danger-ring` | destructive focus |

Shadow color tokens: `--shadow-color`, `--shadow-color-deep`.

## Spacing (extends Tailwind)
Extra steps: `4.5 5.5 6.5 7.5 13 15 17 18 22` (rem-based). Otherwise standard scale.

## Motion
Easing: `ease-out-quart` `cubic-bezier(0.165,0.84,0.44,1)`, `ease-out-expo`.
Animations: `animate-fade-in-up` (320ms), `animate-fade-in` (200ms),
`animate-pulse-soft` (2.4s). Keep a restyle calm: prefer these over ad-hoc.

## Misc tokens
`--dot-grid`, `--selection-bg/fg`, `--scrollbar-thumb*`, `--grid-line`,
`--stripe`, `--kbd-shadow`, `--btn-highlight`, `--btn-primary-highlight/shadow`,
`--focus-ring-bg`, `--brand-mark-gloss`.

---
**Restyle leverage order:** `--accent` (brand identity) → `--bg*` + `--fg*`
(mood/contrast) → type scale + tracking (voice) → radius + shadow (softness) →
semantics + tiers (signal palette). Turning these five groups is ~90% of a
premium reskin — *if* surfaces consume them (see `design-debt.md`).
