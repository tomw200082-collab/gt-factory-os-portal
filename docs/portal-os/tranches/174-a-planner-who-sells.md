# Tranche 174 — a planner who sells

**Status:** built — see the PR for CI.
**Origin:** Tom, 2026-08-25. "אני רוצה להוסיף למערך המכירות את אלכס ואבי" — avi@gteveryday.com and
alex.berov@gmail.com — followed by the shape he wants them in: Alex "צריך להישאר כמו עכשיו בייצור
ולמכירות גם לקבל הרשאות מלאות שנוכל לשייך אליו לידים", Avi "PLANNER בצד הייצור וכל ההרשאות שיש
במכירות".
sizing: S
scorecard_target_category: ops_surface
expected_delta: the two people who both plan production and work leads can hold one role that says
so, instead of a choice between losing the factory and handing the lead queue to the bookkeeper.

## The defect

Tranche 173 landed the `sales` axis and one role to hold it — `sales_rep`, narrow on purpose: leads
and no standing anywhere in the factory. Its own note recorded what it deliberately did not do:

> planner deliberately does NOT get it — making planner a sales role would also hand the workspace
> to the accounting planner, which nobody asked for.

That was right for the case in front of it and leaves no row for the case in front of this one. A
user holds exactly one role, and the two people being added do both jobs. Against the live directory
(`private_core.app_users`, 7 active rows) the three ways to answer Tom's request with the roles that
exist today are:

- `sales_rep` — Alex loses `planner`, so the person who plans production stops being able to.
- `admin` — hands two people user management and system config to get a lead queue, which is the
  exact trade 173 existed to end.
- widen `planner` — grants the sales workspace to `accounting@greentea-everyday.com`, who did not
  ask for it. This is the alternative 173 refused, one day earlier.

None of the three is what Tom asked for.

## The fix

**S1 — a fifth preset, and no new grants.** `sales_planner` is the union of `planner` and
`sales_rep`: `stock:execute` + `planning:execute+override` + `sales:execute`, and `admin: null`,
which is in neither parent. Nothing in the lattice becomes reachable that was not reachable before;
what changes is that one user can now hold both halves. `planner` keeps `sales: null`, so the
bookkeeper's access is unchanged and the 173 decision stands.

**S2 — the nav rank is planner's, not a rung above it.** `NAV_ROLE_ORDER.sales_planner = 3`, level
with `planner`. The factory rails floor at viewer and the sales tile is gated on the capability, so
the rank needs to say "planner" and nothing more; a rank of its own between planner and admin would
have silently promoted them past every `min_role: "planner"` entry in the manifest.

**S3 — the middleware gate is derived, not retyped.** `ROLE_GATES` had nine rows naming `planner`.
Nine copies of one fact is nine chances to add a tenth row and forget, so the table is now the
`planner` truth expanded once: every gate admitting `planner` admits `sales_planner`. The two rows
that do not mention `planner` — `/sales` and `/apps` — name it explicitly, because there it is
admitted for the sales axis and not as a planner.

**S4 — the backend halves.** `roleAllowsSales` (the server half of the lattice), the `AppRole`
union, the two admin-user zod enums, the `/me` role enum, and the roster derivation in
`handleSalesSettings` — which must stay the same predicate as `sales_core.assert_assignee`, or the
picker offers a name the assignment gate rejects. Migration `0336` widens the role CHECK and moves
the gate; both ship in `gt-factory-os`.

## Manifest

```
src/lib/contracts/enums.ts
src/lib/auth/authorize.ts
src/lib/auth/fake-auth.ts
src/lib/nav/manifest.ts
src/middleware.ts
src/features/home/cockpit.ts
src/app/(admin)/admin/users/page.tsx
tests/unit/sales/sales-capability.test.ts
tests/unit/nav/manifest-visibility.test.ts
docs/portal-os/tranches/174-a-planner-who-sells.md
docs/portal-os/registry.md
docs/portal-os/tranches/_active.txt
```

Backend half (`gt-factory-os`, same branch): `db/migrations/0336_app_users_sales_planner_role.sql`,
`db/tests/0336_app_users_sales_planner_role.test.sql`, `api/src/db/schema.ts`,
`api/src/auth/session.ts`, `api/src/users/schemas.ts`, `api/src/me/schemas.ts`,
`api/src/sales/queries_handler.ts`.

## Checklist

- [x] `sales_planner` added to `ROLES`; every `Record<Role, …>` in the tree completed (the compiler
      enumerated them: lattice, `NAV_ROLE_ORDER`, `ROLE_RANK`, `ROLE_COCKPIT`, `FAKE_USERS`).
- [x] Lattice row is exactly `planner ∪ sales_rep`, asserted field-by-field rather than by literal,
      so widening either parent later cannot leave this row behind.
- [x] `admin: null` asserted — the one grant in neither parent.
- [x] `planner.sales` is still `null`; the 173 test that guards it is unchanged and still passes.
- [x] Middleware `/sales` and `/apps` admit the role; the nine planner gates admit it by derivation.
- [x] Admin users screen offers the role and describes it; the local `ROLES` duplicate updated (it
      shadows the contracts type, so the compiler does not catch it).
- [x] tsc 0 · eslint 0 errors on changed files · vitest green (2 pre-existing assertions rewritten
      to the new truth, 4 new).

## Not executed here

- **The data change.** Alex's role change and Avi's row are a production write, and they must land
  AFTER this deploys: a `sales_planner` in the directory while the portal still has five roles is a
  `ROLE_CAPABILITY_LATTICE[role]` miss and a rejected `/me` payload — a lockout, not a downgrade.
  Sequence: merge → deploy → migration 0336 → the two rows.
- **Avi has no Supabase auth user.** There is no create-user endpoint; a row is provisioned by hand
  and `resolveAppUser` rebinds `user_id` on his first magic-link sign-in. Until he signs in once,
  the row is a roster entry and not a login.
- **Playwright** was not run in this session (no browser install here). The changed surfaces are
  gate tables and enums, covered by vitest; CI runs the `@mocked` suite.
- **pgTAP** was not run in this session: `pg_prove` is not installed in this image and the api test
  runner's deps (`kysely`) are absent, so `test/admin_user_update.test.ts` and
  `test/me_set_theme.test.ts` fail to import here on a clean checkout too. Stated rather than
  claimed — the file is a deliverable for CI.
