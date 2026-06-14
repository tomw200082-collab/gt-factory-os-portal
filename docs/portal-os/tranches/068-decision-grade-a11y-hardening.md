# Tranche 068 — decision-grade + P0 accessibility hardening

status: implemented (branch `claude/admin-pages-uxui-testing-pyyurn`; Tom merges)
evidence: tsc --noEmit clean · vitest 673/673 (83 files) · next build OK ·
eslint 0 errors. Playwright not runnable in this environment.
source: consolidated admin UX/UI audit (2026-06-13, `docs/ux/admin-pages-uxui-audit-2026-06-13.md`).
Closes the most severe remaining items now that tranche 067 shipped the
`ConfirmDialog` primitive:
  - A11Y-007 (P0) — `ClassWEditDrawer` had no dialog semantics / focus trap /
    Escape / focus return → rebuilt on Radix Dialog (same API + visual).
  - INTER-010 (decision-grade) — cost-draft **Approve** fired with no
    confirmation (the most consequential financial action; Reject already
    confirmed) → adds a ConfirmDialog showing old → new cost + delta.
  - INTER-015 (decision-grade) — masters/archive **restore** mutations had no
    `onError` (silent failure on a correction action) and no success feedback →
    adds onError + onSuccess to an accessible (aria-live) banner.
  - INTER-012 (decision-grade, corrected) — holidays BulkImport **Commit** was
    only dimmed, never disabled. The flow is a *partial* commit (valid rows
    applied, error rows rejected), so the correct guard is "nothing valid to
    commit", not "any error" → `disabled` when `validCount === 0`.

language: English-first (no corridor surfaces touched).

## File manifest
- `docs/portal-os/tranches/068-decision-grade-a11y-hardening.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — 068 while active; cleared at close.
- `docs/portal-os/registry.md` — register this tranche.
- `src/components/admin/ClassWEditDrawer.tsx` — rebuilt on Radix Dialog (focus
  trap, Escape, aria-modal, aria-labelledby via Dialog.Title, focus return);
  same props, same visual, Saving locks Escape/outside-close.
- `src/app/(admin)/admin/cost-drafts/page.tsx` — Approve now confirms with a
  ConfirmDialog naming the target and showing current → new cost (+delta%).
- `src/app/(admin)/admin/masters/archive/page.tsx` — restore mutations gain
  onError + onSuccess feeding a new role=alert/status aria-live banner.
- `src/app/(admin)/admin/holidays/page.tsx` — BulkImport Commit `disabled` when
  `validCount === 0` (with an explanatory title), preserving partial commit.

## Verification gate
- `tsc --noEmit` clean.
- `vitest run` green.
- `next build` succeeds.
- `eslint` 0 errors.
