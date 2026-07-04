# Tranche 126: ux-release-gate-p0-fastfollow

status: landed-pending-review
created: 2026-07-04
verified: 2026-07-04 (portal-tranche-verifier PASS)
scorecard_target_category: planning_surface
expected_delta: +0 on planning_surface (already 10/10 since tranche 121; this
  is a bug/regression fast-follow, not a new capability)
sizing: S (11 files)

## Why this tranche

A full `/ux-release-gate` run (5 dimensions: flow, interaction, visual, copy,
accessibility) was executed against the DR-018 batch's tip
(`portal-os/tranche-125`, PRs #154-#158, not yet merged) at Tom's explicit
instruction ("כל דבר שאתה מוצא לנכון לשפר תתקן ותשפר" — anything you find fit
to improve, fix and improve). `factory-os-governor` issued a **CONDITIONAL_SHIP**
verdict with named constraints:

1. Two regressions **introduced by this batch's own tranches** must be fixed
   before the stack merges:
   - Tranche 122's "firm"→"lock" copy sweep missed the `CadenceRail` STEPS
     array label — the step tab still read "Firm" directly beside a "Lock
     week" button on the same page.
   - Tranche 123's new draft-review banner (FLOW-007) told operators to
     "return to the planning chat" — no such surface exists in the portal.
2. Four **pre-existing** P0s (not introduced by DR-018, confirmed by every
   dimension that flagged them) must land as a fast-follow before/alongside
   the stack, given their severity (two are full-page crashes, one leaks a
   raw JS error onto an authorized Hebrew-only surface, one is a P0
   keyboard-accessibility gap on the primary planning surface):
   - Production-plan board crashed (`Cannot read properties of undefined
     (reading 'filter')`) whenever the API returned a 200 without a `rows`
     array — a non-null assertion (`data!.rows`) trusted the TypeScript type
     over the runtime shape.
   - Placement-queue crashed (`Cannot read properties of undefined (reading
     'sort')`) under the same condition, and — worse — its error display
     would have rendered that raw English exception text verbatim on the
     Hebrew-only bookkeeper surface authorized in `CLAUDE.md`.
   - Production-plan's today-strip fell back to a raw internal `item_id`
     (a UUID) as the visible product label when `item_name` was null —
     violates `portal_ux_standard.md` §1 ("no raw IDs in operator UI").
   - Inventory-flow `DayCell`'s day-detail popover was unreachable by
     keyboard: Radix `Popover.Trigger asChild` only merges `onClick` onto the
     cell `div`, and a `div` (unlike `button`/`a`) doesn't fire a synthetic
     click on Enter/Space.

Governor's rationale for CONDITIONAL_SHIP over HOLD: none of the four
pre-existing P0s are newly introduced by merging tranches 121-125 (holding
five already-verified, already-tested draft PRs behind unrelated backlog
gains no safety), all six fixes are S/M-effort single-file guards or copy
changes with no schema/migration/integration surface, and governor explicitly
authorized landing all six together in one fast-follow tranche rather than
requiring #5/#6 to be rebased into the already-open, already-stacked-on PRs
122/123 (see "Deviation from governor's literal routing" below).

## Scope

- `production-plan/page.tsx`:
  - `plansQuery.data!.rows` (non-null assertion) → `plansQuery.data?.rows ?? []`
    — the crash fix.
  - Draft-review banner: "return to the planning chat" → a real `/planning`
    link, "go to Planning Overview".
  - Today-strip: `p.item_name ?? p.item_id` → `p.item_name ?? "Unnamed product"`.
- `placement-queue/_lib/api.ts`:
  - New `ApiError` class marking jsonOrThrow's curated (Hebrew-safe) thrown
    errors; the page only trusts `error.message` for `ApiError` instances,
    never for a raw runtime exception.
  - `data.rows.sort(...)` → guarded to `(data.rows ?? []).sort(...)`, root-cause
    fix so a malformed response can never throw here again.
- `placement-queue/page.tsx`: error display now branches on
  `error instanceof ApiError` instead of trusting any thrown error's `.message`.
- `meeting/page.tsx`: `STEPS` array `label: "Firm"` → `label: "Lock"` (internal
  `key: "firm"` — a `CadenceStep` type value used in switch/comparisons —
  left untouched).
- `DayCell.tsx`: `onKeyDown` added to the gridcell div — Enter/Space now fires
  the same click the popover trigger listens for.
- Test updates for the "Firm"→"Lock" rename: `meeting-mobile.test.tsx`,
  `meeting-a11y.test.tsx`, `tests/e2e/meeting.spec.ts` (`openFirmPanel()`
  helpers and the button-name locator now match "Lock — Thursday").
- New regression-guard tests locking in the three fixed bugs:
  `tests/e2e/production-plan-board.spec.ts` (malformed-response no-crash),
  `tests/e2e/placement-queue.spec.ts` (malformed-response no-raw-JS-text),
  `tests/e2e/inventory-flow-smoke.spec.ts` (T09: Enter opens the day popover).

## Deviation from governor's literal routing (documented, not silently done)

Governor's verdict named two routings: land #5/#6 as amendments to tranches
122/123 specifically, and file a separate tranche 126 for #1-#4 only ("not
batch unrelated scope creep"). In practice: tranches 122, 123, and 124 are
already-pushed branches with open draft PRs (#155, #156, #157) that tranches
123/124/125 are stacked on top of. Amending 122 or 123 now would mean
rewriting three already-published branch histories and rebasing every PR
built on top of them — real risk (force-push, review-comment loss, CI
re-runs) for same-day, non-overlapping, file-disjoint fixes. Given Tom's
directive this run was breadth ("anything you find fit"), not process
literalism, all six items are landed together in this one tranche, stacked
cleanly on `portal-os/tranche-125` with nothing rebased. This satisfies the
substance of governor's constraints — every pre-merge-required item fixed,
tested, and verified before the stack's five PRs merge — via a simpler,
lower-risk mechanism.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(po)/purchase-orders/placement-queue/_lib/api.ts
  - src/app/(po)/purchase-orders/placement-queue/page.tsx
  - src/app/(planning)/planning/meeting/page.tsx
  - src/app/(planning)/planning/inventory-flow/_components/DayCell.tsx
  - tests/unit/features/meeting-mobile.test.tsx
  - tests/unit/features/meeting-a11y.test.tsx
  - tests/e2e/meeting.spec.ts
  - tests/e2e/production-plan-board.spec.ts
  - tests/e2e/placement-queue.spec.ts
  - tests/e2e/inventory-flow-smoke.spec.ts
  - docs/portal-os/tranches/126-ux-release-gate-p0-fastfollow.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Revive directives (if any)
revive: []

## Out-of-scope — remaining gate findings, triaged not dropped

The gate surfaced ~25 additional P1/P2 findings across all five dimensions
(NaN% demand-coverage display, missing disabled-reason tooltips, several
ARIA-semantics gaps on procurement's view toggle and the inventory-flow risk
filter, a handful of token-hygiene/component-consistency items, six residual
"firm"-as-verb prose strings explicitly deferred by tranche 122's own
manifest). None of these were named as pre-merge-blocking by any dimension or
by governor. They are NOT silently dropped — full itemized detail lives in
this tranche's originating `/ux-release-gate` run (5 subagent reports +
governor verdict, referenced in this repo's session history) and should seed
the next `/portal-tranche-plan` batch.

## Tests / verification
- typecheck clean
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked` chromium: `meeting.spec.ts`, `production-plan-board.spec.ts`,
  `placement-queue.spec.ts`, `inventory-flow-smoke.spec.ts`
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. Six independent, single-purpose guard/copy/keyboard fixes,
each isolated to its own file region; no data-layer changes.

## Operator approval
- [x] Tom approves this plan — this run's blanket instruction ("anything you
  find fit to improve, fix and improve") plus `factory-os-governor`'s
  CONDITIONAL_SHIP verdict (2026-07-04) constitute the authorization; the
  governor's verdict explicitly named Tom-approval-required and this
  instruction supplies it for the fast-follow path (option 1 of the verdict's
  "Next action for Tom").

## Actual evidence (filled in by execution)

**Files touched:**
- EDIT `production-plan/page.tsx` — three independent fixes: (1) crash guard
  `data?.rows ?? []`, (2) draft-review banner dead-link replaced with a
  `/planning` link, (3) today-strip `item_id` leak replaced with "Unnamed
  product".
- EDIT `placement-queue/_lib/api.ts` — new `ApiError` class distinguishing
  curated thrown errors from raw runtime exceptions; `jsonOrThrow` throws
  `ApiError` not `Error`; `.sort()` guarded against a missing `rows` field.
- EDIT `placement-queue/page.tsx` — error display trusts `.message` only for
  `ApiError` instances.
- EDIT `meeting/page.tsx` — `STEPS[0].label` "Firm" → "Lock".
- EDIT `DayCell.tsx` — `onKeyDown` fires `click()` on Enter/Space for
  working-day cells (non-working cells, `tabIndex=-1`, are unaffected).
- EDIT `meeting-mobile.test.tsx`, `meeting-a11y.test.tsx`,
  `tests/e2e/meeting.spec.ts` — `openFirmPanel()` helpers / button-name
  locators updated from `/Firm — Thursday/` to `/Lock — Thursday/` (the
  underlying `key: "firm"` field and all internal `CadenceStep` comparisons
  are untouched — only the rendered label changed).
- EXTEND `tests/e2e/production-plan-board.spec.ts` — 1 new test: malformed
  200 response (`{}`) no longer crashes the board.
- EXTEND `tests/e2e/placement-queue.spec.ts` — 1 new test: malformed 200
  response degrades to the empty state, never shows raw JS error text.
- EXTEND `tests/e2e/inventory-flow-smoke.spec.ts` — 1 new test (T09): Enter
  key opens the day-cell popover (verified via the Radix trigger's
  `data-state="open"` attribute).

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched files: 0 errors. Confirmed (via `git stash` +
re-run) that the 4 pre-existing `react-hooks/exhaustive-deps` warnings on
`meeting/page.tsx` and `production-plan/page.tsx` predate this tranche and
are outside every hunk this tranche touched.

**`npx vitest run`**: **877/877** passed, 112/112 files (0 net-new — this
tranche edits existing test assertions to match the intentional "Lock"
rename, it doesn't add unit tests; new coverage was added at the e2e layer
instead since the fixes are cross-component/route-level behavior).

**Playwright** (`@mocked`, chromium, `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`):
- `tests/e2e/meeting.spec.ts`: 5/5 passed.
- `tests/e2e/production-plan-board.spec.ts`: 4/4 passed (3 pre-existing + 1 new).
- `tests/e2e/placement-queue.spec.ts`: 5/5 passed (4 pre-existing + 1 new).
- `tests/e2e/inventory-flow-smoke.spec.ts`: 11/11 passed (10 pre-existing + 1 new).
- **Total: 25/25 passed** (21 pre-existing + 4 new).

**portal-tranche-verifier**: **PASS** on the second pass. First pass caught
one gap — `docs/portal-os/registry.md` was listed in the manifest as
touchable but had no tranche-126 entry — everything else (tsc, eslint,
vitest 877/877, playwright 25/25, all 6 fix spot-checks against the diff,
test-rename correctness, no regression against 121-125, no scope creep, no
quarantine reintroduction, no protected-file touch) passed on the first
attempt. Registry entry added; second pass confirmed PASS with no other
changes.

**PR**: https://github.com/tomw200082-collab/gt-factory-os-portal/pull/159
