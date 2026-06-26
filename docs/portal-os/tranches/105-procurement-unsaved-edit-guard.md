# Tranche 105: procurement focus — unsaved-edit close guard (P0)

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / data_truthfulness
expected_delta: 0 (data-loss prevention on the planner's money surface)
sizing: S (2 files; no backend)
source: /portal-audit interaction-design-specialist INTER-004 (2026-06-26)

## Why (the bug)
In the procurement focus overlay, a planner who opened "ערוך כמויות" and changed
line quantities/drops had those edits held in local draft state. Pressing Escape
or the × button called `onClose()` immediately and **silently discarded the
unsaved edits** — the planner had no warning and no idea the change was dropped.
On the money-facing what-to-order surface that is a real data-loss class (P0).

## The fix
- **FocusCard** reports unsaved edits up via a new `onDirtyChange?(dirty)` prop.
  `isDirty` = the editor is open AND at least one line's draft qty/drop differs
  from its saved value (precise — opening the editor without changing anything is
  NOT dirty).
- **FocusMode** tracks `cardDirty`; `requestClose()` shows an inline
  `alertdialog` confirm ("יש לך שינויי כמות שלא נשמרו · סגירה תבטל אותם" →
  "המשך עריכה" / "סגור בכל זאת") when dirty, else closes normally. Both the ×
  button and the Escape key now route through `requestClose`. The dirty/confirm
  flags reset when the focused order changes.

Behavior is unchanged on the non-dirty path (the common case + every existing
test): `requestClose` → `onClose()` directly.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/procurement/_components/FocusMode.tsx
  - src/app/(planning)/planning/procurement/_components/FocusCard.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/105-procurement-unsaved-edit-guard.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 — all six FocusMode tests still pass (close,
  paging, completion paths are identical when not dirty). New confirm testids:
  `focus-close-confirm` / `focus-close-keep` / `focus-close-discard`.
- Follow-up: a dedicated unit test driving the edit→dirty→close-confirm path.

## Checklist
- [x] FocusCard onDirtyChange · FocusMode requestClose + confirm overlay · verified
- [ ] Tom review / merge · follow-up: dirty-close unit test, INTER-005/008
