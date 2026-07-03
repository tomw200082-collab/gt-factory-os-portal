# Tranche 124: hebrew-surfaces-precision

status: landed-pending-review
created: 2026-07-03
scorecard_target_category: planning_surface
expected_delta: +0 on planning_surface (already 10/10 after tranche 121; this closes P1 backlog, not a new category ceiling)
sizing: M (6 files)

## Renumbering note

Implements what DR-018 labeled "Tranche 119". See tranche 121's renumbering
note for the full explanation. Renumbered to 124.

## Why this tranche

DR-018's P1 backlog across the Hebrew/RTL operator surfaces
(`/purchase-orders/placement-queue`, `/planning/procurement`): "בצע הזמנה"
(terminal, irreversible) was reachable with missing prices/terms —
validation only fired post-click; a blank confirmed-arrival-date was
silently omitted from the confirm dialog, reopening the no-ETA
double-order trap the office manager already got burned by once; the empty
queue state was indistinguishable from an upstream-bug state (this exact
ambiguity masked a live trigger bug until 2026-07-03); there was no
overdue/aging signal; the supersede-session warning didn't say how much
work would be lost; the view-toggle was a hand-rolled tablist with no
keyboard arrow support; and literal `←`/`→` glyphs in Hebrew copy were
unlabelled for screen readers.

## Scope

- `PlacementRow`: proactive `canPlace` disable + Hebrew tooltip (INTER-003);
  missing-ETA warning appended to the confirm description (INTER-005);
  `ConfirmDialog` gets an optional `srFallbackDescription` so a
  Hebrew-surface caller's a11y fallback never leaks English (COPY-010).
- `placement-queue/page.tsx`: empty-state honesty line (FLOW-004); overdue
  aging banner (FLOW-006).
- `procurement/page.tsx`: supersede warning names the order count
  (INTER-006); `session_date` formatted via the existing `fmtDateHe`
  helper (COPY-006); view-toggle replaced with the shared
  `useRovingTabList` hook (A11Y-006).
- `FocusMode.tsx`: literal RTL arrow glyphs wrapped in
  `<span aria-hidden="true">` at all 4 sites (A11Y-005).

## Manifest (files that may be touched)
manifest:
  - src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
  - src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx
  - src/app/(po)/purchase-orders/placement-queue/page.tsx
  - src/app/(planning)/planning/procurement/page.tsx
  - src/app/(planning)/planning/procurement/_components/FocusMode.tsx
  - src/app/(planning)/planning/procurement/_components/FocusMode.test.tsx  # optional — not touched; grepped first, no assertion on the wrapped-arrow markup
  - src/components/overlays/ConfirmDialog.tsx
  - src/components/overlays/ConfirmDialog.test.tsx
  - docs/portal-os/tranches/124-hebrew-surfaces-precision.md
  - docs/portal-os/tranches/_active.txt
  - tests/e2e/placement-queue.spec.ts
  - tests/e2e/procurement-focus.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope — genuinely backend-blocked (not silently dropped)

**FLOW-005 (session-context header row) was NOT implemented.** The spec
asked for "מושב נוצר מתוך שבוע שננעל ב-{date} · {X} אצוות" (this session
was created from the week locked on {date} · {X} batches). The
`PurchaseSession` type (`purchase-session/_lib/types.ts`) has no field
linking a session back to the production-plan week that generated it, and
no batch count — `session_id, session_type, session_date, status,
horizon_days, consolidation_window_days, rebuild_verifier_drift, warnings,
release_fence, created_at, completed_at, totals, pos`. Implementing this
honestly would require either a new backend join/endpoint (out of the
portal-only lane, and this run's authorization doesn't cover backend work
beyond the pre-approved `is_user_modified` mini-PR) or fabricating the
week-lock date and batch count, which the repo's own doctrine forbids
("no fabrications anywhere" — `scorecard.md`). Flagged here rather than
silently skipped; a real fix needs a backend field first.

## Tests / verification
- typecheck clean
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked` chromium: new `tests/e2e/placement-queue.spec.ts` +
  extended `procurement-focus.spec.ts`
- regression-sentinel: no baseline regressions
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. Presentation + validation-gate + copy only; no data-layer
changes.

## Operator approval
- [x] Tom approves this plan — blanket authorization from the DR-018
  execution-plan message, 2026-07-03 (see tranche 121 for the exact quote).

## Actual evidence (filled in by execution)

**Files touched:**
- EDIT `PlacementRow.tsx`:
  - `canPlace` derived (`lines.length > 0 && !!termLabel && lines.every(price > 0)`),
    wired to `disabled={!canPlace || placeMut.isPending}` +
    `title="יש להזין מחיר לכל השורות ולבחור תנאי תשלום"` when `!canPlace`.
    `handlePlace`'s existing inline validation kept as a backstop.
  - Confirm description gains a trailing sentence when `!confirmedDate`:
    "לא הוזן תאריך אספקה — ההזמנה תיפתח ללא צפי הגעה, ויש להוסיף אותו
    ידנית אחר כך."
  - `confirm()` call now passes `srFallbackDescription: "אשר/י פעולה זו."`.
- EDIT `PlacementRow.test.tsx` — the pre-existing single test asserted the
  *old* post-click validation error; rewritten into two tests matching the
  new proactive-disable UX: (1) disabled + Hebrew title until price+term
  are both set, place endpoint never reached; (2) submit becomes enabled
  once both are set. Net +1 test.
- EDIT `placement-queue/page.tsx` — empty-state gains a second line ("אם
  ידוע לך שאושרו הזמנות ואינן מופיעות כאן, פנו למנהל התכנון."); new
  `overdueCount`/`todayIso` derivation + a danger banner
  (`data-testid="placement-queue-overdue-banner"`) above the list reading
  "{n} הזמנות ממתינות — {overdue} באיחור" when `overdueCount > 0`.
- EDIT `procurement/page.tsx`:
  - Supersede-warning text now includes `{session?.pos.length ?? 0}`.
  - `startedSession.session_date` wrapped in `fmtDateHe(...)` (imported
    from `./_lib/decision`).
  - View-toggle tablist replaced with `useRovingTabList` — the container
    spreads `roving.tabListProps`; `ViewTab` now also accepts a `tabProps`
    object (role/tabIndex/aria-selected/ref/onKeyDown from the hook) in
    addition to its existing `onClick` (needed for mouse activation — the
    hook only drives keyboard nav + roving tabindex, same as the
    `InventoryFlowTabs` reference implementation).
- EDIT `FocusMode.tsx` — 4 literal arrow glyphs (`→ הקודם`, `Esc לסגירה ·
  ←/→ למעבר`, `הבא ←`, and the `DoneSummary` link's trailing `←`) each
  wrapped in `<span aria-hidden="true">`.
- EDIT `ConfirmDialog.tsx` — `srFallbackDescription?: string` added to
  `ConfirmOptions`; the sr-only fallback branch renders it when provided,
  else the existing English default (unchanged behavior for every other
  caller).
- NEW `tests/e2e/placement-queue.spec.ts` — 4 tests: submit disable/enable
  gate with tooltip (INTER-003); blank-date ETA warning in the confirm
  dialog (INTER-005); empty-queue honesty line (FLOW-004); overdue banner
  with correct counts (FLOW-006).
- EXTEND `tests/e2e/procurement-focus.spec.ts` — 2 new tests: supersede
  warning names the PO count (INTER-006); the view-toggle roving tablist
  responds to ArrowRight/ArrowLeft, moving both `aria-selected` and DOM
  focus, and the underlying view actually switches.
- `FocusMode.test.tsx` — grepped first for assertions on the arrow-glyph
  button text; none found (tests query by `data-testid`, not text
  content), correctly left untouched (`# optional` in the manifest).

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched files: 0 errors, 0 warnings.

**`npx vitest run`**: **873/873** passed, 111/111 files (+1 net-new test —
`PlacementRow.test.tsx` went from 1 test to 2; no regressions).

**Playwright** (`placement-queue.spec.ts` + `procurement-focus.spec.ts`,
`@mocked`, chromium, `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`): **8/8
passed** (4 new + 4 existing/extended).

**portal-tranche-verifier**: **PASS** on the first pass. typecheck 0,
eslint 0, vitest 873/873, playwright 8/8, all 9 finding IDs diff-verified,
the `PlacementRow.test.tsx` rewrite independently judged a faithful
(strengthened, not diminished) replacement of the original test's intent,
the FLOW-005 skip claim independently confirmed against the actual
`PurchaseSession` type (no week-lock or batch-count field exists), no
baseline regressions.

**PR**: filled in after push.
