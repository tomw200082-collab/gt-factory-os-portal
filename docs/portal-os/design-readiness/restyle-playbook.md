# Restyle playbook — how to go premium, system-wide

> The ordered procedure for a future top-tier visual upgrade, plus the
> preparation backlog that makes it a token/primitive change rather than a
> per-file slog. Source: visual-system-designer readiness audit, 2026-06-15
> (readiness **72/100**). `[NOW]` = safe, no design decision; `[DECIDE]` = needs
> Tom to set a token value first.

## Part A — the restyle itself (once prep is done)
Turn these knobs (in `globals.css` `:root` + `:root.dark`, and `tailwind.config.ts`);
they cascade through tokens → classes → every surface. Leverage order:

1. **`--accent`** (+ `-hover/-soft/-softer/-fg/-border`) → the brand identity.
2. **`--bg*` + `--fg*`** → mood, depth, contrast (warmth, paper vs ink).
3. **Type scale + tracking** (`tailwind.config.ts fontSize`, `letterSpacing`) → voice.
4. **`borderRadius` + shadows** (`shadow-raised/pop`, `--shadow-color*`) → softness/elevation.
5. **Semantic + tier + family palettes** → the signal language.

If every surface consumes tokens, this is ~90% of a premium reskin from a handful
of files. The prep backlog below closes the gap to that "if".

## Part B — preparation backlog (do before / alongside the restyle)
Ordered by leverage. Detail + file:line in `design-debt.md`.

| # | Item | Tag | Why it matters |
|---|---|---|---|
| PREP-01 | Declare `--bg-base` / `--bg-elevated` tokens (or replace usages) | `[DECIDE]` | **Live bug** — undefined → transparent backgrounds |
| PREP-02 | Migrate `credit-tracking` page off raw palette + ghost shadcn tokens | `[NOW]` | **Live bug** (no focus ring) + fully off-system page |
| PREP-03 | `shadow-sm/md/lg/xl/2xl` → `shadow-raised` (cards) / `shadow-pop` (floating) | `[NOW]` | 29 theme-blind shadows |
| PREP-04 | `text-[Npx]` → named type tokens | `[NOW]`* | 113 brackets bypass the scale (*sub-10px needs PREP-07 decision) |
| PREP-05 | `tracking-[…]` → `tracking-ops`/`-sops` | `[NOW]` | 7 trivial |
| PREP-06 | Resolve `--bg-base`/`--bg-elevated` call sites | after 01 | clears the live bug |
| PREP-07 | globals.css 50+ raw `font-size:Npx` → `@apply text-{step}` | `[DECIDE]` | **#1 blocker** — type-scale changes don't reach these today |
| PREP-08 | Bespoke inline cards → `<SectionCard>`/`.card` | `[NOW]` | hand-rolled markup |
| PREP-09 | Document inline-style shell pages (`page.tsx`, `global-error`, `signout`) value↔token map | `[DECIDE]` | render pre-CSS; manual-update note |
| PREP-10 | Add `<Button>` React primitive wrapping `.btn` | `[NOW]` | **done in this tranche** — TS-enforced variants, restyle isolation |

## Part C — owner decisions blocking full readiness
These need Tom to choose a value before code can land:
1. **`--bg-base` / `--bg-elevated` values** — declare (proposed light/dark in
   `design-debt.md`) or collapse onto `--bg-raised`. (live bug)
2. **Sub-10px type step** — does `text-3xs` drop to 9px, or add a `text-micro`
   (9px) step? Decides PREP-04 + PREP-07. Recommended: add `text-micro`.
3. **`tracking-soft` (0.06em)?** — appears 3×; add the step or fold into `ops`.
4. **Shell pages (PREP-09)** — accept as permanently off-system with a documented
   value map, or inject inheritable CSS vars from `layout.tsx`.

## Part D — convention rules to lock in (prevents future drift)
- Shadows: cards → `shadow-raised`; floating → `shadow-pop`. Never `shadow-{lg,xl,2xl}`.
- Type: only named steps; no `text-[Npx]`. Layout `w/h-[…]` allowed.
- Color: only semantic tokens (`bg-*`, `text-fg*`, `*-soft/-fg/-border`).
  Never raw palette (`emerald/slate/sky/amber`) or shadcn defaults
  (`muted-foreground`, `bg-background`, `ring-ring`).
- Buttons → `<Button>`; cards → `<SectionCard>`/`.card`; inputs → `.input`;
  chips → `.chip*`/`<Badge>`.
- Add a `grep` gate (see `design-debt.md`) to CI once cleaned, to hold the line.

## Status
Prep started in Tranche 072: `<Button>` primitive shipped (PREP-10); this
blueprint + token/debt/primitive references authored. Remaining PREP items await
Tom's go-ahead (the `[NOW]` ones can run as a bounded tranche; the `[DECIDE]`
ones need the value calls in Part C).
