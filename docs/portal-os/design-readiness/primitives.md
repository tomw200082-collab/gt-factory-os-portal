# Component vocabulary & primitive coverage

> What surfaces should COMPOSE so a restyle changes one file, not a hundred.
> Source: visual-system-designer readiness audit, 2026-06-15.

## Two component layers exist

### 1. CSS-class primitives (`globals.css` → `@layer components`) — rich, token-driven
The portal's main primitive system is CSS classes, not React components. All
are token-driven (a token change restyles them):

| Group | Classes |
|---|---|
| Buttons | `.btn` + `.btn-primary` `.btn-danger` `.btn-ghost` `.btn-outline` + sizes `.btn-sm` `.btn-xs` `.btn-lg` |
| Inputs | `.input` `.textarea` `.input-error` `.label` `.field-error` `.field-hint` |
| Cards | `.card` `.card-raised` `.well` `.surface` |
| Chips | `.chip` + `.chip-accent` `.chip-warning` `.chip-info` `.chip-success` `.chip-danger` |
| Tables | `.table-base` `.table-dense` |
| Misc | `.eyebrow` `.eyebrow-strong` `.dot` `kbd` `.divider-dot` `.stat-card` |

These are consumed via `className` strings across the app.

### 2. React primitives (`src/components/ui/**`) — THIN (the gap)
Only 5 files: `Badge.tsx` (full-featured: tone/variant/size/dot/icon/tooltip),
`dropdown-menu.tsx` (Radix), `NavigationLoader.tsx`, `GTLoader.tsx`,
`ScrollFade.tsx`. **No `Button`, `Input`, `Card`, `Dialog`, `Select`, `Tabs`.**

Reusable patterns living elsewhere (good, token-driven):
`components/workflow/{WorkflowHeader,SectionCard,SectionHeading,FieldGrid,Wizard,
FormActionsBar,ApprovalBanner}`, `components/feedback/states` (Empty/Loading),
`components/overlays/{Drawer,ConfirmDialog}` (Radix), `components/patterns/
{ListPage,FormPage,DetailPage}`, `components/badges/*` (wrap `Badge`).

## Why the thin React layer matters for a restyle
With buttons as a CSS class applied inline, variant choice is distributed across
100+ call sites and cannot be enforced by TypeScript. A `Button` React wrapper
gives: (1) type-enforced variants, (2) one callsite to evolve loading/disabled/
asChild, (3) restyle isolation. Same logic for `Input`, `Card`. **This is the
highest-leverage additive prep (PREP-10).**

## Adoption state (restyle-resistance hotspots)
- `.btn` is used correctly in most of the app. ~16 hand-rolled `<button>` with
  bespoke class strings remain across ~6 files (worst:
  `(planning)/planning/production-plan/page.tsx` ×7, `(inbox)/inbox/page.tsx` ×3).
- Bespoke inline cards (`rounded-md border bg-bg-raised shadow-lg p-5`) instead
  of `SectionCard`/`.card` in BOM-edit + recipe-health components.
- `RecipeHealthCard.tsx:194` defines an un-systematized 5th button variant.
- `(shared)/credit-tracking/page.tsx` is fully off-system (see `design-debt.md`).

## Target end-state
Every button → `<Button>`; every card → `<SectionCard>`/`.card`; every input →
`.input`/future `<Input>`; every chip → `.chip*`/`<Badge>`. Then a premium
restyle = edit tokens + the primitive files, and it cascades everywhere.
