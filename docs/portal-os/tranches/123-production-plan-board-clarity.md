# Tranche 123: production-plan-board-clarity

status: landed-pending-review
created: 2026-07-03
scorecard_target_category: planning_surface
expected_delta: +0 on planning_surface (already 10/10 after tranche 121; this closes P1 backlog, not a new category ceiling)
sizing: M (5 files)

## Renumbering note

Implements what DR-018 labeled "Tranche 118". See tranche 121's renumbering
note for the full explanation. Renumbered to 123.

## Why this tranche

DR-018's P1 backlog on `/planning/production-plan`: the done state was
color-only (no text signal); "Report Production" read as a command to
produce, not to open the reporting screen; drafts had no path back to the
"done editing" handshake (chat-only, per the skill contract); destructive
confirms could leak a raw `item_id`; two modals could discard unsaved edits
silently on Escape/backdrop-click/Cancel; and the save-in-flight state on
two of the five dialogs was text-only (no spinner, unlike the third that
already had one).

## Scope

- `is_user_modified?: boolean` added to the portal's `ProductionPlanRow`
  type (backend companion: `gt-factory-os` mini-PR, separate repo — this
  field is optional so the UI degrades gracefully if this portal deploys
  first).
- "Report Production" → "Open Production Report" (COPY-003).
- "Completed" chip on done rows — the state was color/icon-only (COPY-007).
- Draft chip upgraded to an info-toned variant + a "Confirm via Weekly
  Meeting → Lock" link (VISUAL-006, FLOW-007) + an "Edited" badge when
  `is_user_modified` (INTER-002).
- Raw `item_id` fallback → `"this item"` in the Cancel and Delete confirm
  modals (COPY-008).
- "Add from recommendations" → "Add from Recommendations" (COPY-009,
  header button + week-empty-state button).
- Non-dismissible draft-review banner in the command header when any draft
  rows exist, linking to Weekly Meeting (FLOW-007).
- Toast close button gets a focus-visible ring (A11Y-004).
- `EditModal` and `EditNoteModal` guard a dirty close (Escape / backdrop
  click / Cancel) with an inline "Discard unsaved changes? / Keep editing"
  confirm instead of discarding silently (INTER-007); their "Saving…" state
  gains a `Loader2` spinner matching the pattern `ManualAddModal` already
  used (INTER-008).

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/card-actual-qty.test.tsx  # optional — not touched; grepped first, no assertion on the changed strings
  - src/app/(planning)/planning/production-plan/_components/card-delete.test.tsx  # optional — not touched; grepped first, no assertion on the changed strings
  - src/app/(planning)/planning/production-plan/_lib/types.ts
  - docs/portal-os/tranches/123-production-plan-board-clarity.md
  - docs/portal-os/tranches/_active.txt
  - tests/e2e/production-plan-board.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- INTER-010 touch-target sizing — `ProductionJobCard`'s action-strip buttons
  already carry `min-h-[32px] min-w-[32px]` from a prior tranche (grepped
  and confirmed); no new instance found in this tranche's files.
- The line-2160 "Today strip" `item_name ?? item_id` fallback — not a
  destructive-confirm context (the two the finding names are both fixed);
  left as a smaller, separate follow-up if desired.
- The `is_user_modified` backend field itself — separate `gt-factory-os`
  mini-PR (this run's Phase 0).

## Tests / verification
- typecheck clean
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked` chromium: new `tests/e2e/production-plan-board.spec.ts`
- regression-sentinel: no baseline regressions
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. Presentation + copy + an additive optional type field; no
data-layer changes.

## Operator approval
- [x] Tom approves this plan — blanket authorization from the DR-018
  execution-plan message, 2026-07-03 (see tranche 121 for the exact quote).

## Actual evidence (filled in by execution)

**Files touched:**
- EDIT `_lib/types.ts` — `is_user_modified?: boolean` added to
  `ProductionPlanRow`.
- EDIT `ProductionJobCard.tsx`:
  - "Report Production" → "Open Production Report".
  - New "Completed" chip (`chip chip-success`, `CheckCircle2` icon,
    `data-testid="plan-card-completed-chip"`) rendered whenever `isDone`,
    alongside the existing variance badge (not replacing it).
  - Draft chip: `chip gap-1 ... text-fg-muted` → `chip chip-info ...`
    (visible info-toned signal, was effectively unstyled); a
    `"Confirm via Weekly Meeting → Lock"` link added next to it; an
    "Edited" badge (`data-testid="plan-card-edited-badge"`) added when
    `plan.is_user_modified === true`.
- EDIT `page.tsx`:
  - `Info` icon imported.
  - `draftCount` derived from `productionPlans` alongside the existing
    `plannedCount`/`doneCount`/`cancelledCount`.
  - New non-dismissible banner (`data-testid="draft-review-banner"`,
    `role="status"`) rendered between the command header and the existing
    status bar when `draftCount > 0`, with the exact copy specified and a
    link to `/planning/meeting`.
  - `plan.item_name ?? plan.item_id` → `plan.item_name ?? "this item"` in
    both the Cancel-plan and Delete-record confirm modals (2 occurrences,
    `replace_all`).
  - "Add from recommendations" → "Add from Recommendations" (2 occurrences
    — header button + the week-empty-state action button — for
    consistency; the instruction named one location but leaving the other
    lowercase would have been an obvious residual inconsistency).
  - `Toast`'s close button gained
    `focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`.
  - `EditModal` and `EditNoteModal`: both gained a `confirmingDiscard`
    state + `requestClose()` guard (wired into `useDialogA11y`'s `onClose`,
    the backdrop-click handler, and the Cancel button); an inline
    "Discard unsaved changes? / Keep editing / Discard" row replaces the
    normal button row while `confirmingDiscard` is true. Both submit
    buttons gained a `Loader2` spinner (`h-3 w-3 animate-spin
    motion-reduce:animate-none`) beside "Saving…", matching
    `ManualAddModal`'s existing pattern (confirmed by grep before writing —
    `ManualAddModal` already had one at line ~553; `EditModal`/
    `EditNoteModal` did not).
- NEW `tests/e2e/production-plan-board.spec.ts` — 3 tests: draft banner +
  Edited badge + Completed chip all visible together; banner absent with no
  draft rows; the dirty-close guard end-to-end (Escape shows the guard,
  "Keep editing" dismisses it without losing the edit, Cancel re-triggers
  it, "Discard" actually closes).
- `card-actual-qty.test.tsx` / `card-delete.test.tsx` — grepped first for
  any assertion on the changed strings (`Report Production`, the draft chip
  markup); none found, correctly left untouched (annotated `# optional` in
  the manifest per tranche 122's established convention).

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched files: 0 errors. 1 pre-existing, unrelated
`react-hooks/exhaustive-deps` warning on `page.tsx` (confirmed via diff —
the flagged `useEffect`/line is outside every hunk this tranche touched).

**`npx vitest run`**: **872/872** passed, 111/111 files (0 regressions; no
existing test asserted on any of the changed strings/markup).

**Playwright** (`tests/e2e/production-plan-board.spec.ts`, `@mocked`,
chromium, `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`): **3/3 passed**.

**portal-tranche-verifier**: **PASS** on the first pass. typecheck 0, eslint
0 (1 pre-existing unrelated warning), vitest 872/872, playwright 3/3, all 10
finding IDs diff-verified (including checking both `EditModal` and
`EditNoteModal` independently for INTER-007/INTER-008), no baseline
regressions, INTER-010 out-of-scope claim confirmed accurate (touch targets
already present in the tranche-122 base). One cosmetic evidence-prose note
(mislabeled the second "Add from Recommendations" button as "KPI-strip"
when it's the week-empty-state button) — fixed above, not a functional gap.

**PR**: filled in after push.
