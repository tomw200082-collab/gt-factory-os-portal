# Tranche 169 — the switch Tom could not find, and a test that cried wolf

**Status:** built — tsc 0, vitest green
**Origin:** Tom, 2026-08-18, in writing, hours after tranche 163 shipped:
*"וגם תוסיף שצריך להיות מקש ברור מהחלק של התפעול למעבר למכירות. כרגע יש רק מהמכירות לתפעול"* —
recorded as audit finding **P1-19**. Plus **GAP-030** from `gt-factory-os-production-brain`.
sizing: XS
scorecard_target_category: ops_surface
expected_delta: the crossing into sales is visible to the person it was built for, and a CI failure
means something again.

## The defect

**The feature existed and read as absent.** Tranche 163 added `SalesSwitch` to the factory `TopBar`,
merged as PR #214, deployed. Hours later Tom asked for it as a missing feature. He was not wrong: the
control renders **icon-only below `sm`**, ghost-styled, in a cluster of five other topbar icons, and
its only name is an English `title` attribute — which a phone never shows. On the device he opened it
on, the tranche shipped one more grey glyph.

This is the more interesting half of the finding. "Done" was verified with `tsc`, `vitest` and a
regression guard, and every one of them was green. None of them could see that the thing was
invisible.

**And `production-picking.spec.ts` was failing on a coin flip.** It clicks a plain Next `<Link>` and
asserts `toHaveURL` with the default 5s timeout, while CI runs `next dev` — so
`/production/runs/[run_id]` compiles *at the moment of the click*. Observed passing at 4.6s on one
runner and failing on the next with byte-identical application code. A red build that is red for no
reason teaches everybody to discount red builds, which is the expensive part.

## The fix

- **The label is always rendered**, and the control carries a border so it reads as a doorway rather
  than as decoration. Still admin-only, still English (the factory shell is English-first; the
  `CLAUDE.md` Hebrew exception covers `/apps` and `(sales)`, and this control lives in neither).
- **One timeout, on one navigation**, raised to 15s with a comment naming GAP-030 and the on-demand
  compile. No other timeout in the file is touched: the wait is for a compiler, not for the app, and
  widening the rest would hide real regressions.

## Manifest

```
src/components/layout/TopBar.tsx
src/components/layout/TopBar.switch.test.tsx
tests/e2e/production-picking.spec.ts
docs/portal-os/tranches/169-shell-and-ci-hygiene.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

## Checklist

- [x] The label renders at every width, phone included
- [x] The control is visually a control, not a bare glyph
- [x] Still admin-only; operator, planner and viewer see nothing
- [x] Still points straight at `/sales/today`
- [x] `NAV_MANIFEST` untouched — no new primary-nav entry, no quarantine re-entry
- [x] Exactly one timeout raised, with the reason in the file
- [x] tsc 0 · vitest 1381/1381
