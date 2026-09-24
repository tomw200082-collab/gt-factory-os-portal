# Tranche 176 — the inventory-movement proposal arrives filled

**Status:** built — see the PR for CI.
**Origin:** Tom, 2026-09-23 — stock-exceptions masterprompt (brain
`docs/plans/2026-09-23-stock-exceptions-masterprompt.md`, W4): every completed non-pick LionWheel
movement reaches the inbox with its lines already filled, and the approval page shows them
pre-filled and editable before Approve.
sizing: S
scorecard_target_category: ops_surface
expected_delta: an inventory-movement approval opens with its proposed lines already in the editor,
the reason for each, and what is still unknown — Tom checks and approves instead of retyping a
delivery note.

## Why

The daily `stock-exceptions-sweep` (brain) now submits each non-pick movement with
`proposed_lines` (each with `source`, `evidence_ref`, `confidence`), a Hebrew `rationale`,
`open_questions` and `evidence` links, and the `credit_task_ids` it fills (backend migration
`0350`, `gt-factory-os` same branch). The detail query returns them.

The page already pre-filled rows — from `lines`, the **posted** audit lines. That is what made
GI-20269 post twice: lines were stuffed into the posted table at submit so the page would show
them, and approval appended a second set. The backend now refuses an approval over pre-existing
lines (`LINES_ALREADY_RECORDED`); this page stops reading `lines` for pre-fill and reads
`proposed_lines` instead.

## The change

- **Pre-fill from `proposed_lines`**, once, on first load; the rows stay fully editable and
  Approve posts them as edited. No proposal → one empty row, as before.
- **Origin badge per pre-filled row:** source (Green Invoice document / picking shortage /
  purchase order / delivery note text / manual) + confidence. The data values stay as sent.
- **Above the editor:** the rationale (Hebrew data, `dir="rtl"`), open questions (amber — answer
  before approving), evidence as links, and how many picking shortages approval will close when
  the quantity covers them.
- Kind labels for `supplement`, `free_goods`, `subcontract`; conflict copy for
  `LINES_ALREADY_RECORDED`; the success state names how many shortages were marked supplied.

UI copy is English (the surface is not on the Hebrew list); Hebrew appears only as data.

**Also — a time bomb in the suite.** `tests/unit/sales/outcome-sheet.test.tsx` typed the fixed
date `2026-09-03` into a date input whose `min` is today; from 2026-09-04 the input drops it and
the case fails on `main` too (the last green guard run was 2026-08-29, before the date passed).
The case now types a date ten days out. Test-only, one case, no product change.

manifest:
- src/app/(inbox)/inbox/approvals/inventory-movement/[submission_id]/page.tsx
- tests/unit/inbox/inventory-movement-review.test.tsx
- tests/unit/sales/outcome-sheet.test.tsx
- docs/portal-os/tranches/176-inventory-movement-proposal-prefill.md
- docs/portal-os/registry.md
- docs/portal-os/tranches/_active.txt

## Checklist

- [x] vitest `tests/unit/inbox/inventory-movement-review.test.tsx` — 5 cases, written first, red
      against the previous page (no `im-review-line`, pre-fill from posted lines)
- [x] typecheck + lint + full vitest (see PR)
