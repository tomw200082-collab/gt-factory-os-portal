# Design debt — what bypasses tokens (clean before a restyle)

> Every item here is a value that will NOT update when tokens change. Source:
> visual-system-designer readiness audit, 2026-06-15. Readiness score: **72/100**.
> Tags: `[NOW]` safe mechanical fix, no design decision · `[DECIDE]` needs Tom to
> set a token value/scale step first · `[BUG]` broken at runtime today.

## P0 — live bugs (broken now, not just restyle-blocking)

### Ghost tokens — undefined → transparent / no-color  `[BUG] [DECIDE]`
- `--bg-base` — referenced 6× in `globals.css` (`fc-list-row-hero` block: lines
  ~2588, 2625, 2725, 2740, 2915, 2929), never declared. Renders transparent.
  Proposed: declare `--bg-base` (e.g. light `42 18% 96%`, dark `30 10% 12%`) or
  replace each use with `--bg`/`--bg-raised`. _(still open — globals.css, Tom's call)_
- `--bg-elevated` / the `bg-bg-base` & `bg-bg-elevated` Tailwind classes — these
  classes were NOT defined in `tailwind.config.ts` (only `bg/subtle/muted/raised/
  deep` exist), so they rendered **no background** across the whole `/me/activity`
  surface + `SupplyFlowClient`/`click-to-signin`. **FIXED 2026-06-15:** all TSX
  usages repointed to the existing `bg-bg-raised` token (8 sites). The CSS-var
  `--bg-base` usages inside `globals.css` remain open (above).

### `credit-tracking` page — off-system + undefined shadcn token names  `[BUG] [NOW]`  — **FIXED 2026-06-15**
`(shared)/credit-tracking/page.tsx` used shadcn defaults that don't exist here
(`text-muted-foreground`, `bg-background`, `text-foreground`, `bg-card`,
`bg-muted`, `focus:ring-ring`, `hover:bg-accent`) + raw palette (emerald/sky/
amber/rose/slate). **FIXED:** all 87 class usages repointed to the system's own
tokens (emerald→success, sky→info, amber→warning, rose→danger, slate→neutral;
shadcn ghosts→fg/bg/ring tokens) via a boundary-safe pass — no new colors. The
page now responds to a restyle and its focus rings work. Remaining polish
(raw `<input>` → `.input` class) is optional, not a bug.

## P1 — restyle blockers (highest leverage)

### globals.css raw font-sizes  `[DECIDE]` — the #1 blocker
`@layer components` has **50+ bare `font-size: Npx`** (9, 9.5, 10, 10.5, 11,
11.5, 12, 12.5, 13, 14.5, 15, 17, 22, 32, 36, 40 px) in `.fc-*`, `.stat-card`,
etc. A `tailwind.config.ts` type-scale change touches NONE of these. Fix =
define any missing scale steps (9px/9.5px have no token), then `@apply text-{step}`.

### `text-[Npx]` arbitrary type sizes  `[NOW]` (sub-10px: `[DECIDE]`)
**113 occurrences / 30 files.** Worst:
`(planning)/planning/production-plan/_components/ProductionJobCard.tsx` (16),
`(planning)/planning/production-plan/page.tsx` (10). Map `[9px]/[10px]`→`text-3xs`,
`[11px]`→`text-2xs`, `[22px]`→`text-xl/2xl`, `[26px]`→`text-3xl`. 9px has no exact
token → decide whether to add `text-micro` (9px) or accept `text-3xs` (10px).

### Off-system shadows  `[NOW]`
**29 occurrences / 19 files** of `shadow-sm/md/lg/xl/2xl` (fixed px, theme-blind)
vs system `shadow-raised`/`shadow-pop` (used correctly 42×). Worst:
`production-plan/page.tsx` (7× `shadow-2xl`). Rule: card = `shadow-raised`,
floating (modal/popover/sheet) = `shadow-pop`. Arbitrary
`shadow-[0_-4px_12px_rgba(0,0,0,0.08)]` (`(ops)/stock/waste-adjustments/page.tsx:977`)
→ `hsl(var(--shadow-color-deep)/0.08)`.

## P2 — consistency

### Bespoke cards  `[NOW]`
Inline `rounded-md border bg-bg-raised shadow-lg p-5` instead of `SectionCard`/
`.card`: `components/bom-edit/BomDraftEditorPage.tsx:485,505`,
`PublishConfirmModal.tsx:67`, `admin/recipe-health/QuickFixDrawer.tsx:198`,
`RecipeHealthCard.tsx:194,204,294`.

### Hand-rolled buttons  `[NOW]`
~16 raw `<button>` with bespoke classes / ~6 files (worst
`production-plan/page.tsx` ×7, `inbox/page.tsx` ×3). 5th button variant at
`RecipeHealthCard.tsx:194`. Fix once `<Button>` primitive exists (PREP-10).

### `tracking-[...]`  `[NOW]`
7× arbitrary tracking where `tracking-ops` (0.08em)/`tracking-sops` (0.12em)
exist (e.g. `forecast/[version_id]/_components/ItemAutocompleteAdder.tsx:279`).
`tracking-[0.06em]` appears 3× → consider a `tracking-soft` step.

### Layout brackets (mostly OK, not tokenized)  `[DECIDE]`
~60 `w/h/max-w/min-w-[...]` are fixed layout constraints (sidebar `w-[232px]`,
max content `max-w-[1440px]`, drawer widths). Legitimate, but a structural
restyle (sidebar width, content max) is a file-hunt. Optional: tokenize as
`--layout-*` later.

## Defensible / not debt
- `style={{ ['--family-*']: … }}` dynamic CSS-var injection (inventory-flow
  family tints) — correct pattern.
- `style={{ paddingTop: 'env(safe-area-inset-top) }}` (`TopBar.tsx:59`).
- `page.tsx` / `global-error.tsx` / `auth/signout/page.tsx` inline styles —
  render pre-CSS-shell; off-system by necessity. Keep a value-correspondence note
  (PREP-09) so they're updated as a known manual step.

## Quick greps to re-measure
```
text-\[[0-9]      # arbitrary type sizes
shadow-(sm|md|lg|xl|2xl)\b   # off-system shadows
bg-(emerald|sky|amber|slate|zinc|gray|neutral)-   # raw palette
(muted-foreground|bg-background|text-foreground|ring-ring)  # ghost shadcn tokens
```
