# Tranche 122: meeting-lock-language

status: landed-pending-review
created: 2026-07-03
scorecard_target_category: planning_surface
expected_delta: +0 on planning_surface (already 10/10 after tranche 121; this closes P1 backlog, not a new category ceiling)
sizing: S (5 files)

## Renumbering note

Implements what DR-018 labeled "Tranche 117". See tranche 121's renumbering
note for the full explanation — 116-120 were already taken by unrelated,
already-merged work; this is renumbered to 122.

## Why this tranche

DR-018's P1 backlog: "Firm week" is lexicon-absent jargon — the `/planning`
overview's own cadence block says "lock the week" one click away from the
meeting cockpit's "Firm week" button, the exact "same concept, two words"
inconsistency the finding names. The generate-drafts error path also leaked
internal ops jargon ("break-glass") with no recovery affordance, and the
commitment card sat visually detached from the CTA that acts on it.

## Scope

- `firm` → `lock` lexicon on the enumerated action/status strings (button
  labels, banner headlines, disabled-reason text) on `/planning/meeting`
  (6+ occurrences) **and** the one-click-away `/planning`
  overview cadence block, which had the exact same-page inconsistency the
  finding describes (COPY-001).
- Map 403/503 cadence-mutation errors to plain operator copy, no "break-glass"
  jargon (COPY-002, COPY-005); add a "Try again" retry on the generate-drafts
  error banner (INTER-004).
- focus ring on the inline lock-confirm's Cancel button (A11Y-003).
- Merge the commitment card and the lock CTA into one visually contiguous
  card instead of two sections split by a divider (VISUAL-002).
- `item_name ?? "Unknown product"` instead of leaking a raw `item_id`
  (COPY-008, meeting instance).
- `sr-only` "Tea"/"Matcha" label next to the color-only track dot
  (A11Y-009).

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/meeting/page.tsx
  - src/app/(planning)/planning/meeting/_lib/cadence.ts
  - src/app/(planning)/planning/meeting/_lib/cadence.test.ts  # optional — not touched; grepped first and confirmed no existing case asserts on the changed error strings
  - src/app/(planning)/planning/page.tsx  # scope addition — see "Actual evidence"; the overview's own cadence block had the literal "Firm week" vs "lock the week" inconsistency COPY-001 describes
  - docs/portal-os/tranches/122-meeting-lock-language.md
  - tests/unit/features/meeting-a11y.test.tsx
  - tests/e2e/meeting.spec.ts
  - docs/portal-os/tranches/_active.txt

## Revive directives (if any)
revive: []

## Out-of-scope
- Everything DEFERRED per the run's locked decisions.
- `.reveal`/`useDialogA11y` reuse, tablist a11y, unicode arrows, enum
  aria-labels — covered by tranches 124/125.
- `production_plan.is_user_modified` badge / production-plan surfaces —
  tranche 123.
- Residual uses of "firm" as a verb in longer prose (`CommitmentPanel`
  titles/notes — "If you firm this week", "when you firm"; the page-header
  description "firm next week's production on Thursday") — noted by the
  verifier as out of the enumerated fix list's actual coverage. Deliberately
  left: the finding's own example (COPY-001) is specifically about the
  action-button/status-banner lexicon, not every narrative sentence
  mentioning the concept; a full prose sweep is a separate, larger copy
  pass and risks touching text outside this tranche's file scope.

## Tests / verification
- typecheck clean
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked` chromium: `tests/e2e/meeting.spec.ts` (extended)
- regression-sentinel: no baseline regressions
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. Presentation + copy only; no data-layer changes.

## Operator approval
- [x] Tom approves this plan — blanket authorization from the DR-018
  execution-plan message, 2026-07-03 (see tranche 121 for the exact quote).

## Actual evidence (filled in by execution)

**Scope note**: `src/app/(planning)/planning/page.tsx` was added to the
manifest mid-tranche. It was not in the original file list, but while fixing
`meeting/page.tsx`'s "Firm week" → "Lock week" I found the overview's own
"How planning works here" cadence block links to `/planning/meeting` with
the label "Firm week" directly above a description that already says "...
lock the week" — this **is** the literal COPY-001 finding text ("`Firm week`
is lexicon-absent jargon; overview says `lock the week` — same concept, two
words, one click apart"). Leaving it unfixed would have left the finding
only half-closed. One-line change: `Firm week` → `Lock week` in that link.

**Files touched:**
- EDIT `meeting/page.tsx`:
  - 6 "firm"→"lock" user-visible strings: `Firm week`→`Lock week`,
    `Confirm firm`→`Confirm lock`, `Firming…`→`Locking…`,
    `Week already firmed`→`Week already locked`,
    `Firmed N batch(es)`→`N batch(es) locked`, the disabled-reason title +
    inline hint `Nothing to firm`→`Nothing to lock` (×2, title attr +
    visible span). Also caught (not in the literal 6-count but directly
    adjacent, same panel, same jargon): the "Draft batches" `StatTile` meta
    line (`Nothing to firm` / `Will be locked on firm` → `Nothing to lock` /
    `Will be locked`) — leaving it would have reintroduced the exact
    inconsistency this tranche closes, one KPI tile over.
  - `CommitmentPanel` gained an optional `footer` prop (forwarded to
    `SectionCard`'s existing `footer` slot); the FIRM-action CTA row was
    extracted into a `lockActionRow` variable and passed as that footer
    when a commitment card renders, so the "what gets committed" facts and
    the CTA sit in one card. When no card renders (nothing drafted, nothing
    firmed), the CTA falls back to a standalone bordered strip.
  - Added a "Try again" button (`data-testid="meeting-gen-error-retry"`)
    to the generate-drafts error banner, re-calling `gen.mutate()`.
  - focus ring added to the lock-confirm's "Cancel" button (was the one
    button in this file missing it — confirmed by an audit of every
    `<button>` in the file).
  - `CommitmentPanel` entry row: `e.item_name ?? e.item_id` →
    `e.item_name ?? "Unknown product"`; `sr-only` "Tea"/"Matcha" span added
    next to the color-only track dot.
- EDIT `cadence.ts`: new `mapCadenceMutationErrorMessage(status, fallback)`
  helper (403 → "You don't have permission for this action — contact the
  administrator.", 503 → "The system is temporarily unavailable. Try again
  in a few minutes, or contact the system administrator."), used by both
  `useFirmWeek` and `useGenerateDrafts` — the "break-glass" string no longer
  appears anywhere in this file.
- EDIT `page.tsx` (overview) — one-line link text fix, see scope note above.
- EDIT `tests/unit/features/meeting-a11y.test.tsx` — 3 pre-existing
  assertions updated for the renamed copy (`Firm week`→`Lock week`,
  `Confirm firm`→`Confirm lock`, disabled-title regex), plus one doc
  comment. No other existing test broke.
- EXTEND `tests/e2e/meeting.spec.ts` — 2 new tests: COPY-001 (zero
  `/firm week/i` text anywhere on the panel, "Lock week" button present);
  COPY-002/005/INTER-004 (503→"temporarily unavailable" copy, zero
  "break-glass" text, "Try again" re-fires and the second call's 403 maps
  to "don't have permission" copy — `postCount` asserted at exactly 2, not
  just "> 1", to prove it's a real re-fire and not a replay).
- `cadence.test.ts` — no change needed; no existing test asserted on the
  changed error strings (grepped first to confirm).

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched files: 0 errors. Same 3 pre-existing,
unrelated `react-hooks/exhaustive-deps` warnings on `meeting/page.tsx` as
tranche 121 (confirmed pre-existing, same root cause, untouched by this
diff).

**`npx vitest run`**: **872/872** passed, 111/111 files (0 regressions; no
net-new vitest test files — only existing assertions updated).

**Playwright** (`tests/e2e/meeting.spec.ts`, `@mocked`, chromium,
`NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`): **5/5 passed** (3 from tranche 121
+ 2 new).

**portal-tranche-verifier**: **PASS** (second pass, after fixing 3 issues
from the first pass: `_active.txt` added to the manifest, `cadence.test.ts`
annotated `# optional` with reason, and a leftover "Firming is restricted…"
string fixed to "Locking is restricted…"). typecheck 0, eslint 0 (3
pre-existing unrelated warnings), vitest 872/872, playwright 5/5, all 7
finding IDs diff-verified, no baseline/quarantine regressions, no
"break-glass" string outside a removal-documenting comment. Non-blocking
note: the tranche's original "every user-visible string" phrasing overclaimed
relative to the enumerated fix list (residual "firm"-as-verb prose exists,
now explicitly called out in Out-of-scope above) — corrected wording, not a
functional gap.

**PR**: filled in after push.
