# Tranche 181: The rest of the review

status: built
created: 2026-09-26
scorecard_target_category: ops_surface
expected_delta: +0 on ops_surface (what two screens say about data they already have; dead code out; no route, role or data change)
sizing: M

**Origin:** code review of tranches 176–179 (2026-09-26). Tranche 180 fixed the highest-severity finding. This
tranche fixes the other verified findings (P2, P4–P10), each re-read against the current code first.

## Why this tranche

- **P2, `/inventory`:** a row with no value row (never counted, or `/api/stock/value` not loaded yet) is `na`.
  Since tranche 177 every status except `has_cost` said "No cost". In prod, 77 of 276 rows said "No cost" for
  good, 40 of them with a configured cost, and every row said it while the value read loaded. The Missing cost
  filter never included `na`.
- **P7, `/inventory` Cost coverage:** the numerator and the text came from the value rollup, which leaves out
  never-counted items. The denominator came from the stock lists, which include them. Prod showed "196 / 276"
  next to "3 items have no cost yet", and the card would turn green with "Every item has a cost" while the
  ratio was below 1.
- **P6, `/inventory` Stock value:** removing the trust strip in 177 also removed the only display of `as_of`.
  When a background refetch fails, TanStack keeps the cached value and nothing said it was old.
- **P4, inventory-movement approval:** the success state read only `credit_tasks.supplied`. The backend also
  returns `not_supplied` with a reason (`NOT_FOUND`, `STATUS_<status>`, `ITEM_NOT_SUPPLIED`, `QTY_NOT_COVERED`;
  gt-factory-os `api/src/inventory-movements/handler.ts`, `schemas.ts`), so a reviewer was never told that a
  linked picking shortage stayed open.
- **P5, inventory-movement approval:** open questions are headed "answer before approving", but Approve ignored
  them and closed the proposal with the questions unanswered.
- **P8, docs:** three docs still said tranche 179 was unmerged and awaiting D1. It merged in `0fc9f6b` (#230)
  with D1 approved (Tom, 2026-09-25).
- **P9, dead code:** `ensureSeeded` still wrote `SEED_SUPPLIERS`, `SEED_POLICIES` and `SEED_USERS` into
  IndexedDB stores nothing reads (their repos went in 178). `KeyValueIdbRepo` had no importer. `dailyFlow` and
  `FlowDayBucket` were used only by their own test.
- **P10, scorecard:** `scorecard.json` said the env helper was "removed in 176"; it went in tranche 178
  (`f9359cc`).

## Scope

- **P2:** a row with no value row shows `—`, as before 177. "No cost" means only `missing_cost` or
  `pending_rollup`, which are the rows the Missing cost filter keeps. This applies to the table cell and the
  mobile card.
- **P7:** Cost coverage reads numerator, denominator and text from the value rollup only:
  `items_with_cost / (items_with_cost + items_without_cost)`. The text says "counted", because the rollup
  covers counted items only. It turns green only when nothing is missing, which is when the ratio is full.
  The card no longer depends on the stock lists, so it loads and fails with the value read alone.
- **P6:** only while the value query has an error and is showing cached data, the Stock value card says
  "Couldn't refresh — showing HH:MM" (with the date when the data is from an earlier day) in the warning
  tone. The `loading` and `unavailable` states from 180 are unchanged, and no permanent label is added.
- **P4:** the approve success state lists each linked shortage approval did not mark supplied, with a
  plain-English reason ("Still open — the Out quantity is less than what was missing.", "Already credited.",
  and so on): no UUIDs and no raw enums, per `portal_ux_standard.md` §1.
- **P5:** when `open_questions` is non-empty, Approve (and the confirm step's "Yes, approve") stays disabled
  until the reviewer ticks "I've checked the open questions". A line under the button says why.
- **P8:** the tranche 179 doc, its registry line and the route-manifest note now say it merged with D1 approved.
- **P9:** remove the three seed writes and the fixtures only they used (`fixtures/users.ts`,
  `fixtures/planning-policy.ts`, `SEED_SUPPLIERS`), `UserDto` (its last user was `fixtures/users.ts`),
  `KeyValueIdbRepo` with the `KeyValueRepository` contract only it implemented, and `dailyFlow` /
  `FlowDayBucket` with their test case. `bucketTotal` loses the `inbound`/`outbound` fields only
  `FlowDayBucket` had. The three IndexedDB stores stay declared in `idb.ts`: dropping a store is a schema
  change that needs a `DB_VERSION` bump and a migration, for no gain. They are simply never written again.
  The e2e comment naming `KeyValueIdbRepo` is corrected (that page reads the API).
- **P10:** "removed in 176" becomes "removed in tranche 178".

## Manifest (files that may be touched)
manifest:
  - src/app/(shared)/inventory/page.tsx
  - src/app/(inbox)/inbox/approvals/inventory-movement/[submission_id]/page.tsx
  - src/lib/repositories/index.ts
  - src/lib/repositories/generic-repo.ts
  - src/lib/repositories/types.ts
  - src/lib/fixtures/suppliers.ts
  - src/lib/fixtures/planning-policy.ts
  - src/lib/fixtures/users.ts
  - src/lib/contracts/dto.ts
  - src/app/(shared)/dashboard/_lib/trends.ts
  - tests/unit/stock/inventory-cost-and-freshness.test.tsx
  - tests/unit/inbox/inventory-movement-review.test.tsx
  - tests/unit/features/dashboard-trends.test.ts
  - tests/e2e/admin-routes-smoke.spec.ts
  - docs/portal-os/tranches/179-portal-registrations.md
  - docs/portal-os/registry.md
  - docs/portal-os/route-manifest.json
  - docs/portal-os/scorecard.json

## Revive directives (if any)
revive: []

## Out-of-scope

- A stale note on Cost coverage or on the stock-list cards. The finding and `as_of` are about the value read.
- `SupplierDto` / `PlanningPolicyDto` in `contracts/dto.ts`: still pinned by `tests/unit/contracts/dto-shape.test.ts`.
- Linking each open shortage to `/credit-tracking`: the approve response carries only ids, and that page has
  no deep link.
- Historical tranche docs that mention removed code (e.g. 039's `dailyFlow`) stay as written, as in 178.

## Tests / verification

- typecheck clean; eslint 0 errors on the changed files
- vitest: full run, plus
  - `tests/unit/stock/inventory-cost-and-freshness.test.tsx` (new): a never-counted row shows `—`, never
    "No cost", in the table and on the card, and the missing-cost row shows "No cost". While the value read
    loads, no row says "No cost". Cost coverage reads "2 / 3" and "1 counted item has no cost yet" from the
    rollup, next to four stock rows. It gives the all-clear only at a full ratio. A failed refetch over cached
    value data keeps the value and says "Couldn't refresh — showing HH:MM", with the date for an earlier day.
  - `tests/unit/inbox/inventory-movement-review.test.tsx`: Approve is disabled until the open questions are
    ticked, and there is no tick box when there are none. The approve-as-edited case ticks it first. The success
    state lists the shortages not marked supplied, with plain reasons, and no list when all were supplied.
  - `tests/unit/features/dashboard-trends.test.ts`: the `dailyFlow` case goes with the function.
- playwright: selectors untouched; one comment in `admin-routes-smoke.spec.ts`

## Rollback

Revert the commit (or its PR) on main. Two client pages, docs, and deletions of code nothing imports; no
data-layer change.

## Operator approval

- [x] Dispatched with the verified findings list (2026-09-26); no separate plan step.

## Actual evidence (filled in by the run)

Run with `NODE_ENV=test` (this container sets `NODE_ENV=production`).

- `tsc --noEmit`: 0 errors
- `eslint` on the 12 changed source and test files: 0 errors, 7 warnings. All 7 are in `inventory/page.tsx` and
  are the same 7 that `main` shows (`allRows` / `labelForRow` hook deps, one unused disable directive).
- `vitest run`: 1472/1472 in 159 files (`main` 1462/1462 in 158: −1 `dailyFlow` case, +7 new inventory cases,
  +4 new review cases; the approve-as-edited case now ticks the box).
- On the pre-181 pages all 7 new inventory cases fail, and 4 of the 9 review cases fail: 3 of the 4 new ones
  and the adjusted approve case. The new no-open-questions case passes on both, as a guard against
  over-gating.
