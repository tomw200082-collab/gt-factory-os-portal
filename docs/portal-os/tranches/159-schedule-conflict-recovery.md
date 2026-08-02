# Tranche 159 — the schedule save that could never succeed, and the error that told nobody why

**Status:** built — tsc 0, eslint 0, vitest 1159/1159 (+4)
**Origin:** Tom, 2026-08-02, with a screenshot of the schedule panel showing the bare string
`PO_CHANGED_REVIEW_REQUIRED`: *"לא עובד לי לתזמן הזמנת רכש. תתקן את זה כי שמתי REVIEW."*
sizing: S
scorecard_target_category: ops_surface
expected_delta: the office manager can schedule a purchase order at all — and on the one failure she
can genuinely clear herself, she reads a Hebrew sentence and her next save goes through.

## Two defects, one screenshot

### 1. The save could never succeed (root cause — backend, shipped separately)

`gt-factory-os` PR #202 (merged `1c00291`). The placement-queue read selected `q.updated_at` **raw** —
the only timestamp in that `SELECT` not cast to `::text`. With no `setTypeParser` anywhere in the API,
the pg driver returns a JS `Date` (millisecond), Postgres stores `timestamptz` (microsecond), and the
sub-millisecond digits are gone before the value ever reaches the portal. The portal sends the
truncated value back as `expected_updated_at`; `fn_schedule_purchase_order` (migration 0301) compares
it `IS DISTINCT FROM` the full-precision column and raises `PO_CHANGED_REVIEW_REQUIRED`.

Any PO whose `updated_at` carried non-zero microseconds — nearly all of them — **could never be
scheduled**. Not a race; deterministic. The concurrency guard was correct all along; it was being fed
a lossy value.

### 2. The failure was unreadable and had no way out (this tranche — portal)

Even with the backend fixed, a genuine concurrent edit still hits that guard, and what the office
manager saw was the raw enum. Two things were wrong with that:

**The code reached the screen.** These endpoints return `{ error: <CODE>, detail: <raw exception
text> }` and the raw text *contains the code*, so `jsonOrThrow` preferring `detail` — on the
assumption it was the more human field — printed the machine code verbatim. Fixed with a
`REASON_TEXT` map covering every reason code this surface can hit, plus a `looksLikeCode` guard so an
unrecognised SCREAMING_SNAKE string degrades to the Hebrew fallback instead of being shown. Genuinely
human `detail` still passes through untouched.

**The conflict was a dead end.** The queue is cached (`staleTime` 30s) and FLOW-001 deliberately
stopped refetching on window focus so in-flight price/term/date edits survive. So a row left open a few
minutes carries an `updated_at` the backend will keep rejecting — every retry 409s, forever, with no
action available to her. `useScheduleOrder` now invalidates the queue on that specific code: the row
refreshes underneath the open panel and her next save — same date, nothing re-typed — goes through.

`ApiError` gained an optional `code` so callers can react to a specific failure. It is for code, never
for display; nothing renders it.

## Manifest
manifest:
- src/app/(po)/purchase-orders/placement-queue/_lib/api.ts
- src/app/(po)/purchase-orders/placement-queue/_lib/api.test.ts
- docs/portal-os/tranches/159-schedule-conflict-recovery.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- The backend cast — different lane, shipped as `gt-factory-os` #202 and merged first.
- The other reason codes' recovery paths: only `PO_CHANGED_REVIEW_REQUIRED` refetches, because it is
  the only one the operator can clear by retrying. The rest are Hebrew sentences that say what to do.
- Tokens / `globals.css` / `tailwind.config.ts` (frozen).

## Language
`/purchase-orders/placement-queue` is Hebrew+RTL (authorized).

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint .` → 0 errors.
- `npx vitest run` → 1159/1159, with a new `_lib/api.test.ts` (4 cases): the raw code is never shown
  even when the backend puts it in **both** `error` and `detail` while `.code` still carries it for
  code; the queue is refetched on the staleness conflict so the next save can land; an unknown bare
  machine code degrades to the Hebrew fallback; genuinely human `detail` still passes through.
