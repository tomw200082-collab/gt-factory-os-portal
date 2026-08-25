# Tranche 175 — the bookkeeper sees a lead queue

**Status:** built — see the PR for CI.
**Origin:** Tom, 2026-08-25, after tranche 174 shipped and the gap in it was found before the data
change that would have exposed it: "אני רוצה שנעשה את זה פשוט ללא סיכוי לסיבוכים. תן ל-PLANNER את
המכירות."
sizing: S
scorecard_target_category: ops_surface
expected_delta: Alex and Avi work leads and plan production under the role they already hold, and no
new role has to be re-proved in sixty-one places.

## What 174 got wrong

174 added `sales_planner` — `planner` ∪ `sales_rep` — so the two people who do both jobs would not
have to choose. The lattice row was right. The premise underneath it was not.

**This portal is not the only gate.** `api/src` carries **61 `role === 'planner'` literals across 35
files**: `roleAllowsPlanningRun`, `roleCanRead` (×6 distinct copies), `roleAllowsFirmWeek`,
`roleAllowsCancelWeek`, `roleAllowsGenerate`, `roleAllowsConvertToPO`, `roleAllowsGoodsReceipt`,
`requireEconomicsEditor`, the four `*_ALLOWED_ROLES` sets, and the self-approval guards. A new role
inherits none of them.

So a `sales_planner` would have had the planning rails rendered for them by this repo and been
refused by every planning endpoint behind them. The factory half of the role was decoration. 174's
own checklist says the compiler enumerated every `Record<Role, …>` — it did, and that was the
wrong question: the api does not key those checks off a `Record<Role, …>`, it compares to a string
literal, and a literal comparison is invisible to exhaustiveness.

The gap was found before Alex's role was changed, so nobody was ever locked out. Avi's row existed
for eleven minutes as `sales_planner` and is now `planner`.

## The fix

**S1 — `planner` holds `sales:execute`.** One row of the lattice. `planner` already passes all 61
factory checks, on both halves, because it is the role those checks were written for. The change is
to grant the sales axis to the role these people already hold rather than to mint a role that has to
be taught what `planner` means.

**S2 — the cost is named, not discovered.** 173 left `planner` out precisely because the accounting
planner is a planner and would get the workspace as a side effect. She does. Tom was given both
costs — one bookkeeper seeing a lead queue, against a role whose factory standing needs re-proving
in 61 places — and chose this one. The test that used to assert `planner.sales === null` now asserts
the widening, and carries the trade in its comment so it stays a decision rather than becoming an
accident. Customer-facing outreach is behind `SALES_CUSTOMER_OUTREACH_WRITE_ENABLED` either way.

**S3 — the widening stops at planner.** `operator` and `viewer` still hold `null` on the axis, with
a test that says so. "Widen it" was one row, not everyone authenticated.

**S4 — 174 is reverted, not amended.** `sales_planner` is gone from `ROLES`, the lattice,
`FAKE_USERS`, `NAV_ROLE_ORDER`, `ROLE_RANK`, `ROLE_COCKPIT`, the middleware table and the admin
screen. A role that grants exactly what `planner` grants is a duplicate, and a duplicate role is the
kind of complication this tranche was asked to avoid. 174's manifest and registry entry stay in
place as the record.

## Manifest

```
src/lib/auth/authorize.ts
src/lib/contracts/enums.ts
src/lib/auth/fake-auth.ts
src/lib/nav/manifest.ts
src/middleware.ts
src/features/home/cockpit.ts
src/app/(admin)/admin/users/page.tsx
src/app/(sales)/layout.tsx
src/components/layout/TopBar.switch.test.tsx
tests/unit/sales/sales-capability.test.ts
tests/unit/sales/apps-switchboard.test.tsx
tests/unit/nav/manifest-visibility.test.ts
tests/unit/middleware.test.ts
docs/portal-os/tranches/175-the-bookkeeper-sees-a-lead-queue.md
docs/portal-os/registry.md
docs/portal-os/tranches/_active.txt
```

Backend half (`gt-factory-os`, same branch): `db/migrations/0337_planner_holds_sales.sql`,
`db/tests/0337_planner_holds_sales.test.sql`, `api/src/auth/session.ts`,
`api/src/sales/queries_handler.ts`, plus the revert of 0336's code half. Migration `0336` stays in
the repo — it was applied to production, and an applied migration is never deleted; `0337` reverses
it and re-roles any row that still holds the value.

## Checklist

- [x] `planner.sales = "execute"`; `operator` and `viewer` still `null`, asserted.
- [x] `/sales` middleware prefix and the `/apps` switcher allow-list admit `planner`.
- [x] The TopBar sales switch renders for `planner` — asserted positively, and `planner` removed
      from the "renders nothing for" loop it was in.
- [x] Three tests named `planner` as their example of a role *without* sales. Each was rewritten to
      `operator`, keeping the behaviour under test (a cookie losing to a capability, a prefix gate
      turning someone away) rather than deleting the coverage.
- [x] `sales_planner` fully removed; no `Record<Role, …>` left with a stale key.
- [x] tsc 0 · vitest 1438/1438 · eslint 0 errors on changed files.

## Not executed here

- **Playwright** — no browser install in this session; CI runs the `@mocked` suite.
- **pgTAP** — `pg_prove` is not installed in this image; `db/tests/0337` is a deliverable for CI.
- **The 61 literals are still 61 literals.** This tranche did not name them behind a predicate,
  because `planner` needs no predicate — it already matches. The next role that needs factory
  standing will have to, and that is the work 174 underestimated. Recorded here rather than fixed,
  because doing it now would be a 35-file refactor nobody asked for.
