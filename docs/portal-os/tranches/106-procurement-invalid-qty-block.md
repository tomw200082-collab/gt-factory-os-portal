# Tranche 106: procurement focus — block save on invalid quantity

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / data_truthfulness
expected_delta: 0 (silent-failure correctness fix)
sizing: XS (1 file; no backend)
source: /portal-audit interaction-design-specialist INTER-005 (2026-06-26)

## Why (the bug)
In the procurement focus line editor, `saveEdit` silently fell back to the saved
quantity (`l.final_qty`) when a line's draft input was non-numeric/blank, then
posted "successfully". The planner who typed an invalid value and pressed save
saw the editor close as if it worked — but the backend received the OLD quantity.
Invisible failure on the money surface.

## The fix
`saveEdit` now validates every NON-dropped line (a dropped line's qty is
irrelevant). If any kept line's qty is not a finite number ≥ 0, the save is
**blocked** and an inline error appears under the save button
("יש כמות לא תקינה. הזן מספר אפס ומעלה, או סמן את השורה כהוסרה.",
`role="alert"`, `data-testid="focus-edit-error"`). The error clears on the next
qty edit and on Cancel; a valid save proceeds as before.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/procurement/_components/FocusCard.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/106-procurement-invalid-qty-block.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (valid-save path unchanged; all tests pass).

## Procurement audit — status after this tranche
Landed: INTER-010 (104), INTER-004 (105), INTER-005 (this). All correctness/
data-loss findings on this surface are now closed. Remaining:
- INTER-002 (place confirm) + INTER-003 (skip confirm) — HELD for Tom (confirm
  family).
- INTER-008 (stale cross-mutation error), INTER-006 (date min), INTER-009
  (busy-scope) — minor polish follow-up.

## Checklist
- [x] invalid-qty save blocked with inline error · verified
- [ ] Tom review / merge
