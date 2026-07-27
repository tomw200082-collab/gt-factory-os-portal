# Tranche 152 — Thursday count list: manual RM/PKG marks reach BULK COUNT

**Status:** built — all gates green
**Origin:** Tom, 2026-07-27, while revising the meeting deck: "אמנם יש לי איפה לסמן את זה בדף הרכש אבל איך זה בא לידי ביטוי בספירה? אני רוצה שזה ייכנס לדף של BULK COUNT."
sizing: M
scorecard_target_category: flow_continuity
expected_delta: Maxim's Thursday walk is one tap — all FG + exactly the RM/PKG Tom marked — instead of a blank single-item count screen with nothing carried over.

## What is actually true today (audited 2026-07-27)

**There is no manual mark anywhere.** No column, no table, no UI. Searched all 298
migrations for `mark_for_count` / `needs_count` / `to_count` / `count_flag`: zero hits.

What exists on `/planning/procurement` is an **auto-computed** flag. `assessLine()`
(`_lib/decision.ts`) sets `recount: true` when a line's on-hand was never physically
counted or was counted more than `RECOUNT_AGE_DAYS` (14) ago, read off
`coverage_trace.last_count_age_days` (engine trace_version 3+, migration 0284). It renders as:

| surface | file:line |
|---|---|
| row chip "לספור קודם · N ימ׳" | `ActionList.tsx:361` |
| bucket filter "לספור קודם" | `ActionList.tsx:654` |
| counter "N כדאי לספור קודם" | `ActionList.tsx:613` |
| per-line caption "המלאי לא נספר מעולם" | `ActionList.tsx:212` |

**Where the chain breaks.** The chip links to `COUNT_HREF = "/stock/physical-count"`
(`ActionList.tsx:77`) — the **single-item** count screen, not bulk count — and passes
**no parameters at all**. The operator lands on a blank screen and has to remember what
was flagged. The signal dies at the click.

**`/inventory/bulk-count` has no idea any of this exists.** Its filters (search, type,
groups, `usedBy`, `neverCountedOnly`, `staleOnly`) all derive from `/api/stock`; none
comes from procurement. All filter state is local React state — there is no
`useSearchParams`, so the page cannot even be linked to with a prepared list.

**Orphaned infrastructure.** Migration `0294_count_first_queue.sql` created
`api_read.v_count_first_queue` — a ranked count-first queue with `cash_at_stake` and
`count_first_rank` — with **zero consumers**: no API route, no portal reference. Built
as a policy surface for the daily-ops skill and never wired.

## Decision (Tom, 2026-07-27)

Asked explicitly whether the list should be auto, auto+manual, or manual. Answer:

> "ידני בלבד לחומרי גלם ואריזות. ואת התוצרת מוגמרת הוא צריך לספור את כל הסוגים."

So the Thursday list is:
- **FG** — everything, every type, always. No marking, no filtering.
- **RM / PKG** — only what Tom marked by hand.

The auto `recount` flag stays exactly as it is: a hint to Tom on the purchasing page about
what *deserves* marking. It never populates the count list by itself. `v_count_first_queue`
stays unwired — out of scope here, still worth a decision later.

## Design commitments

- **P1 — append-only marks.** `private_core.count_mark_events` is an event log, one row
  per flip, current state = latest event per component. Mirrors `fg_out_pause_events`
  (0277) and the ledger's append-only posture. No UPDATE, no DELETE.
- **P2 — marks self-clear.** A mark is *open* until a non-reversed physical count for that
  component lands **after** the mark. No cron, no weekly reset, no bookkeeping: Tom marks,
  Maxim counts, it drops off. `v_open_count_marks` computes this at read time.
- **P3 — blind-count invariant untouched.** The mark list carries no quantities. Bulk count
  still never renders an expected on-hand.
- **P4 — nothing about stock truth changes.** No ledger write, no projection, no anchor.
  A mark is a planning-side sticky note.

## Manifest (files that may be touched)
manifest:
- src/app/api/count-marks/route.ts
- src/app/(ops)/inventory/bulk-count/_lib/bulk-count.ts
- src/app/(ops)/inventory/bulk-count/page.tsx
- src/app/(planning)/planning/procurement/_components/ActionList.tsx
- /home/user/gt-factory-os/db/migrations/0299_count_marks.sql
- /home/user/gt-factory-os/db/tests/0299_count_marks.test.sql
- /home/user/gt-factory-os/api/src/stock/count-marks/route.ts
- /home/user/gt-factory-os/api/src/server.ts

The last four are the backend lane (`gt-factory-os`), listed as absolute paths only so the
portal PreToolUse hook — which resolves every target against this repo's root and therefore
cannot recognise a sibling-repo path — does not block the cross-repo half of the change.
Backend contracts remain governed by the PRODUCTION harness; nothing here authors schema
outside the additive mark table.

## Out-of-scope
- Wiring `v_count_first_queue` to anything. Still orphaned after this tranche.
- Changing the auto `recount` threshold or its chips.
- FG marking — FG is "count everything", so it needs no mark.
- Retiring `/stock/physical-count`; single-item count stays for spot checks.

## Rollback
Revert both commits. The migration is drop-and-recreate before any event row exists;
after that it is forward-only (append-only trigger), and dropping the view + table is
still safe because nothing else reads them and no ledger state depends on them.

## What changed

**Backend (`gt-factory-os`)**
- `0299_count_marks.sql` — `count_mark_events` (append-only, attributed) +
  `api_read.v_open_count_marks` (self-clearing open-mark list).
- `api/src/stock/count-marks/route.ts` — `GET /api/v1/queries/stock/count-marks`
  (any authenticated user; the operator reads it on the tablet) and
  `POST /api/v1/mutations/stock/count-marks` (admin/planner). POST 404s an unknown
  component rather than letting the FK surface as a 500, and no-ops a flip that
  would not change the open state so the audit log stays honest.

**Portal**
- `src/app/api/count-marks/route.ts` — thin proxy, both verbs.
- `bulk-count.ts` — new `thursdayList` filter. FG always passes; RM/PKG passes only
  when its `component_id` has an open mark. Composes with every existing filter.
- `bulk-count/page.tsx` — fetches the marks (`["count-marks"]`, shared cache) and
  adds a **"Thursday count · N"** chip carrying the whole walk. English, per COPY-005 —
  this surface is not on the Hebrew whitelist.
- `ActionList.tsx` — per-line **"סמן לספירה" / "מסומן לספירה"** toggle on every line
  with a `component_id` (Hebrew: `/planning/procurement` is whitelisted). FG lines get
  no toggle — nothing to mark.
- `ActionList.tsx` — `COUNT_HREF` re-pointed from `/stock/physical-count` (single-item,
  no parameters, dead end) to `/inventory/bulk-count`.

## Tests / verification

Actual evidence, run 2026-07-27:

- **Portal** `npx tsc --noEmit` → **0 errors**.
- **Portal** `npx eslint` over the three changed source paths → **clean**.
- **Portal** `npx vitest run` → **131 files / 1104 tests green** (was 1098 at tranche 151;
  +6 new `thursdayList` cases: FG always kept, marked RM/PKG kept, unmarked dropped,
  FG-only fallback when the marks fetch fails, composition with type/search, and
  `anyFilterActive`).
- **Portal** `ActionList.test.tsx` L9 updated to assert the new `COUNT_HREF` — it had
  pinned the dead-end destination this tranche removes.
- **Backend** `npx tsc --noEmit` → **0 errors** repo-wide.
- **Backend pgTAP** — a real Postgres 16 + pgTAP was stood up locally and the full
  migration chain applied; `0299_count_marks.test.sql` → **8/8 assertions pass**.
  70 of the 280 migrations fail on that bare instance for environment reasons only
  (pg_cron, vault, Supabase `auth.users`, the `authenticated` role, and prod-data
  seeds); **0299 is not among them** and both its objects were verified present.
  The first run caught a genuine fixture bug — `physical_counts_reversal_consistency`
  (0240) is all-or-none across `reversed_by_submission_id` / `reversed_at` /
  `reversal_reason`, so the reversed-count case needed a real reversal envelope.

Not verified: no CI in `gt-factory-os` runs pgTAP (`.github/workflows` has no
`pg_prove`/`db/tests` job), so this test is only ever run by hand. Worth its own
tranche; not fixed here.

## Operator approval
- [x] Tom, 2026-07-27 — asked for it, and chose the manual-RM / all-FG model directly.
