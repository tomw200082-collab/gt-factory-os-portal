# Tranche 112: deepen — useDialogA11y (dialog-shell consolidation)

status: in-progress
created: 2026-06-26
scorecard_target_category: technical_substrate / planning_surface
expected_delta: 0 (pure structure — behavior held, green before AND after)
sizing: M (2 files + 1 new hook + 1 new test; no backend)
source: /deepen on /planning/production-plan (2026-06-26) — Batch 6 of the
approved 7-batch plan.

## The shallow (diagnosis)
`page.tsx` (the 2,535-line god-file) held seven inline modals — ManualAddModal,
AddFromRecommendationsModal, EditModal, AddNoteModal, EditNoteModal, CancelModal,
DeleteModal — each of which hand-copied the **identical** ~26-line dialog focus
contract: three refs (`dialogRef` / `titleRef` / `previouslyFocusedRef`), a
`useFocusTrap` call, a focus capture/restore `useEffect`, and an identical
Escape+trap `onKeyDown`. That is the hardest-to-get-right code on the surface
(a11y focus management) duplicated seven times — seven chances for one copy to
drift and silently break the contract. Change amplification: any fix to the
focus behaviour meant editing seven near-identical blocks.

## The deepening
New hook `_lib/useDialogA11y.ts` pulls the hard part down behind one call:

```ts
const { dialogRef, titleRef, onKeyDown } = useDialogA11y({ onClose, closeDisabled });
```

Callers spread the returned refs + handler onto their existing dialog markup —
**the DOM and behaviour are unchanged**, only the duplication is gone. The hook
encapsulates: initial focus to the title (fallback to the container), focus
return to the opener on unmount, Escape-to-close gated by `closeDisabled`
(submit-in-flight), and the Tab/Shift+Tab trap.

- page.tsx shrinks 2535 → 2399 lines (~136 lines / seven copies removed).
- `useFocusTrap` is now imported once (inside the hook) instead of in seven spots.

## §V — invariant lock
`_lib/useDialogA11y.test.tsx` (5 tests) pins the contract so a future change
can't re-shallow it: Escape closes; Escape is ignored while `closeDisabled`;
non-Escape keys don't close; initial focus moves into the dialog; focus restores
to the trigger on unmount.

## Behavior held (deepen requirement)
Refactor, not rewrite. Full suite green before (790) AND after (795 = 790 + the
5 new §V tests). Every migrated modal's DOM, testids, ARIA wiring, and submit
behaviour are byte-for-byte what they were — the bulk replace substituted an
identical block in six modals; ManualAddModal (whose block carried extra inline
comments) was migrated by hand to the same call.

## Scope note
RecipeOverridePanel (separate file) carries the same pattern and is a natural
next adopter, deliberately left out to keep this deepen to the one module
(page.tsx) per the deepen discipline. Tracked as follow-up.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_lib/useDialogA11y.ts
  - src/app/(planning)/planning/production-plan/_lib/useDialogA11y.test.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/112-deepen-dialog-a11y-hook.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 795/795 (790 held + 5 new §V tests).

## Checklist
- [x] useDialogA11y hook extracted · 7 page.tsx modals migrated · verified
- [x] §V guard test (5 cases) locks the focus/Escape contract · verified
- [x] behavior held — DOM/testids/ARIA unchanged, suite green before+after
- [ ] Tom review / merge · follow-up: RecipeOverridePanel adopt the hook
