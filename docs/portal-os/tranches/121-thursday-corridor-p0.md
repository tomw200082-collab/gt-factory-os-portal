# Tranche 121: thursday-corridor-p0

status: landed-pending-review
created: 2026-07-03
scorecard_target_category: planning_surface
expected_delta: +1 on planning_surface (9 -> 10)
sizing: M  (8 files)

## Renumbering note

This tranche implements what DR-018 (`gt-factory-os-production-brain/docs/phase8/dry-runs/DR-018-ux-release-gate-thursday-corridor-2026-07-03.md`)
labeled "Tranche 116" in its remediation plan. At execution time
`docs/portal-os/tranches/_active.txt` was `120` (not the stale `115` assumed
by the plan) — tranches **114-120 already exist** in this repo's history
(Decision Board, production-plan visual amplify, movement-log, home UX-gate),
fully merged into `origin/main`. Numbers 116/117/119/120 are taken by
unrelated, already-shipped work. This tranche and its four siblings are
renumbered to the next available slots: **121** (was 116, this file),
**122** (was 117, meeting-lock-language), **123** (was 118,
production-plan-board-clarity), **124** (was 119, hebrew-surfaces-precision),
**125** (was 120, validation-surfaces-orientation). Manifests, fixes, and
finding IDs are otherwise implemented exactly as specified.

## Why this tranche

`/ux-release-gate` (DR-018, 2026-07-03) returned **HOLD** with 5 P0 findings
against the Thursday→Sunday production-planning corridor
(`/planning/meeting`, `/planning/procurement`, `/purchase-orders/placement-queue`,
`/planning/inventory-flow`). This tranche closes all 5: the Thursday "firm
the week" cockpit was undiscoverable (no nav entry), 10+ primary CTAs across
procurement rendered unstyled (`.btn-accent` referenced but never defined),
the single most destructive action in the corridor ("Generate / refresh
drafts", which silently wipes hand-edited drafts) fired with zero
confirmation, and two dialogs had broken keyboard/AT semantics (FocusMode's
focus never moved into the overlay or back out; the inventory-flow grid's
`role="gridcell"` cells had no `role="grid"` ancestor).

## Scope

- Nav: add "Weekly Meeting" entry to the Planning group (FLOW-001).
- CSS: alias `.btn-accent` to `.btn-primary` (VISUAL-001, Tom-locked decision).
- Meeting cockpit: two-step confirm on "Generate / refresh drafts" (INTER-001).
- Procurement FocusMode: real focus-in/restore (A11Y-001) — plus a latent
  stacking-context bug found while implementing the fix (see below).
- Inventory-flow desktop grid: `role="grid"` + row/col counts (A11Y-002).

## Manifest (files that may be touched)
manifest:
  - src/lib/nav/manifest.ts
  - src/app/globals.css
  - src/app/(planning)/planning/meeting/page.tsx
  - src/app/(planning)/planning/procurement/_components/FocusMode.tsx
  - src/app/(planning)/planning/procurement/_components/FocusMode.test.tsx
  - src/app/(planning)/planning/inventory-flow/_components/FlowGridDesktop.tsx
  - src/app/(planning)/planning/inventory-flow/_components/FlowGridDesktop.rowvis.test.tsx  # not touched — kept green, no change needed
  - src/app/(planning)/planning/inventory-flow/_components/DayCell.tsx  # not touched — role="gridcell" was already correct; only the role="grid" ancestor was missing
  - docs/portal-os/tranches/121-thursday-corridor-p0.md
  - tests/unit/features/meeting-a11y.test.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/scorecard.json
  - docs/portal-os/scorecard.md
  - docs/portal-os/tranches/_active.txt
  - tests/e2e/meeting.spec.ts
  - tests/e2e/procurement-focus.spec.ts
  - tests/e2e/inventory-flow-smoke.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Everything DEFERRED per the run's locked decisions: VISUAL-003/004/005/007/008,
  INTER-009, FLOW-010, backend done-editing flag.
- All P1/P2 findings not listed above — covered by tranches 122-125.
- Backend `is_user_modified` (separate mini-PR in `gt-factory-os`, not this repo).

## Tests / verification
- typecheck clean (`npx tsc --noEmit`)
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked`, chromium, `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`:
  `tests/e2e/meeting.spec.ts` (new), `tests/e2e/procurement-focus.spec.ts`
  (extended), `tests/e2e/inventory-flow-smoke.spec.ts` (extended)
- regression-sentinel: no baseline regressions
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. No data-layer changes; `.btn-accent` alias is additive (no
existing class renamed); nav entry is additive; FocusMode's portal-mount
change is presentation-only (same DOM subtree, now attached to `document.body`
instead of inline). Revert is clean.

## Operator approval
- [x] Tom approves this plan — blanket authorization given in the DR-018
  execution-plan message, 2026-07-03: "I (Tom) approve all tranche plans in
  this message — treat this as the 'Operator approval' checkbox for portal
  tranches 116-120" (renumbered 121-125; see renumbering note above).

## Actual evidence (filled in by execution)

**Files touched** (manifest + this doc + the one pre-existing test file the
UI change required updating):
- EDIT `src/lib/nav/manifest.ts` — `CalendarCheck` import + "Weekly Meeting"
  nav entry (planner min_role) between "Daily Production Plan" and
  "Procurement".
- EDIT `src/app/globals.css` — `.btn-accent` added directly after
  `.btn-primary`, identical `@apply` + box-shadow, per Tom's locked alias
  decision.
- EDIT `meeting/page.tsx` — `confirmingGen` state + two-step inline confirm
  (mirrors the existing "Firm week" `confirming` pattern) gating
  `gen.mutate()`; the trigger button no longer fires the mutation directly.
- EDIT `FocusMode.tsx` — focus captured at **render time** (not inside a
  `useEffect`, which would race `FocusCard`'s own child-effect autofocus and
  capture the wrong element — caught by the new M7 unit test); focus moves
  into the overlay via `queueMicrotask` on open; restored to the trigger on
  close/unmount. **Also**: the overlay is now rendered via `createPortal` to
  `document.body` (mirrors the existing `MobileNav` pattern). This was not
  in the original fix description — it was required to actually fix A11Y-001
  in a real browser: `AppShellChrome`'s `isolate` root, combined with
  `TopBar`'s explicit `z-40` and FocusMode being nested several
  non-positioned ancestors deep, trapped the whole `position: fixed; z-50`
  overlay **below** the header in real paint order (confirmed with
  `document.elementFromPoint` in a live chromium instance — the header logo
  intercepted clicks meant for the overlay's own close button). Escape-based
  closing always worked; only the mouse-clickable "×" was silently broken.
  `tabIndex={-1}` + `outline-none` added to the container so it's
  programmatically focusable without a visible default outline.
- EDIT `FocusMode.test.tsx` — new M7 test (focus-in on open via a realistic
  parent-harness trigger button, restore on close/unmount).
- EDIT `FlowGridDesktop.tsx` — `role="grid"` + `aria-rowcount` +
  `aria-colcount` + `aria-label` on the scroll container. Item rows already
  carried `role="row"` and the header rows already carried
  `role="row"`/`role="columnheader"` (prior tranches) — only the grid root
  was missing.
- `DayCell.tsx` — no change needed; `role="gridcell"` was already correct,
  it just had no `role="grid"` ancestor (now fixed above).
- EDIT `tests/unit/features/meeting-a11y.test.tsx` — the pre-existing
  "exposes aria-busy on the generate button while pending" test asserted the
  old one-click behavior; updated to click the trigger first (opening the
  confirm), matching the new two-step flow. No other existing test broke.
- NEW `tests/e2e/meeting.spec.ts` — FLOW-001 (sidebar nav) + INTER-001
  (confirm gate: 0 POSTs on first click, exactly 1 on confirm, "Keep current
  drafts" dismisses without posting).
- EXTEND `tests/e2e/procurement-focus.spec.ts` — A11Y-001 focus-in assertion
  in the existing approve→place→completion flow, plus a new dedicated test
  for close→restore (the original flow's PO resolves to zero remaining
  actionable orders, which un-mounts the trigger button entirely — a second,
  minimal fixture keeps the trigger present to prove the restore behavior).
- EXTEND `tests/e2e/inventory-flow-smoke.spec.ts` — new T07:
  `getByRole("grid")` resolves, `getByRole("row").count() > 0`.

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched source files: 0 errors, 0 warnings (one
`react-hooks/exhaustive-deps` warning on the focus-restore effect was fixed
by copying the ref to a local `const` inside the effect, per the lint's own
suggestion).

**`npx vitest run`**: **872/872** passed, 111/111 files (0 regressions; +1
net-new test file was not created — the new M7 case was added to the
existing `FocusMode.test.tsx`, and `meeting-a11y.test.tsx` was fixed in
place, not added to).

**Playwright** (`PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true npx playwright test tests/e2e/meeting.spec.ts tests/e2e/procurement-focus.spec.ts tests/e2e/inventory-flow-smoke.spec.ts --project=chromium`): **12/12 passed** (3 new/extended files: meeting.spec.ts 3 tests, procurement-focus.spec.ts 2 tests, inventory-flow-smoke.spec.ts 7 tests including the new T07).

**portal-tranche-verifier**: **PASS.** typecheck 0 errors, eslint 0 errors (3
pre-existing unrelated `react-hooks/exhaustive-deps` warnings on
`meeting/page.tsx` confirmed via `git stash` to predate this diff), vitest
872/872, playwright 12/12, all 5 finding IDs spot-checked present and
correctly attributed, `baseline.json`/`quarantine.json` untouched, no
forbidden strings, scorecard delta matches exactly (+1, planning_surface
9→10). One non-blocking manifest-hygiene note (the OS-artifact/e2e paths
weren't individually enumerated in the manifest, even though the
`pre_tool_use.sh` hook always-allows those path prefixes regardless) — fixed
above by listing them explicitly, matching tranches 119/120's convention.

**PR**: filled in after push (see follow-up commit).
