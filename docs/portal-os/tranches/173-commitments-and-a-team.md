# Tranche 173 — a promise is shown, and four people can work the queue

**Status:** built — CI green. eslint 0 errors · tsc 0 · vitest 1434/1434 ·
playwright @mocked 102/102 · registry check passed (PR #220, `ci` run 32767230689)
**Origin:** the 2026-08-24 sales-queue-integrity masterprompt, written from live measurement of
Postgres `rvadsozabmxkkrktwgnv`, the Shopify Admin API and the Make API. It overturns one sentence
this repo's own tranche 164 specified, checked it out, and shipped.
sizing: L
scorecard_target_category: ops_surface
expected_delta: a callback the rep promised is the first thing they see on the day they promised it,
and the sales workspace stops being reachable only by a system administrator.

## The defect

**A commitment is silently deferred, and the requirement passed review.**

`CAPPED_SECTIONS = ['new_lead', 'due_follow_up']` share one budget, drained in render order.
Against the live shape (189 new leads, cap 15) that computes to:

```
cards rendered = { new_lead: 15, due_follow_up: 0 }
```

Tranche 164 **specified** this. Its prose classifies `due_follow_up` as backlog, its checklist ticks
"the new-lead and follow-up sections cap at `daily_cap`", a unit test asserts
`UI.dailyCommitment(0, 20)` for the starved section, and a source comment in `_lib/labels.ts`
rationalises it. Implementation, test, checklist and the author's reasoning agree with each other and
are wrong together — which is why reviewing an implementation against its spec could never find it.

The origin is recorded in 164's own test comment: an earlier bug made a cap of 15 mean 15 + 15 = 30
calls, the release gate flagged it P1, and the fix over-corrected from "two budgets" to "one budget,
and follow-ups lose."

The one sentence that overturns it: **a callback you promised is not discretionary workload; it is a
commitment already made, and it belongs on the never-capped side with conversions and returning
customers.**

Not hypothetical. At 16:44Z on 2026-08-24 the rep called a lead, got no answer, and scheduled a
callback for 2026-08-25 06:00Z. That is the only `next_touch_at` in the database, and on the day it
comes due it renders zero cards.

**Three more, on the same workspace:**

- Marking a lead אבוד is reversible from exactly one of the three paths that set it.
- The outcome sheet's root-step "שנה תאריך" reaches the date step with no outcome declared, and
  every date button there submits `{ result: 'answered_progressing' }` — so a no-answer with a custom
  date is recorded as a conversation that went well. An outcome nobody chose.
- The sales workspace bypassed the capability lattice entirely and hardcoded `session.role !== 'admin'`
  on the backend plus `<RoleGate minimum="admin:execute">` on the layout. There is no `sales_rep`
  role, and three registries claim to hold "who works leads" without anything checking that they
  agree: `private_core.app_users`, `requireSalesAccess`, and `app_setting('assignees')`.

## The fix

**S1 — a commitment is never deferred.** `due_follow_up` leaves `CAPPED_SECTIONS` and moves above
`new_lead` in `SECTION_ORDER`; the server's `ORDER BY CASE` agrees, and gains a section-scoped
most-overdue-first key ahead of the global direction (which stays `newest_first`, locked by tranche
164 D3). `dailyCapRule`'s Hebrew string stays true and is untouched; only the stale English source
comment above it is corrected.

**S2 — every destructive path is reversible, and no outcome is invented.** `setUndo` fires for
`result === 'lost'` in the queue's own `submitOutcome`, not only on the card's אבוד button; the leads
drawer gains the undo state, the Toast action and the revert mutation it never had; and the outcome
sheet is restructured so the outcome is declared first and the date step is a disclosure under it.

**S3 — one roster, four people.** A `sales` axis joins the capability lattice, a `sales_rep` role
joins the role enum in all five places that must agree, `requireSalesAccess` checks the capability
instead of `role === 'admin'`, and the sales layout's `RoleGate` — the gate that actually holds —
moves to `sales:execute`. The roster is then derived from `private_core.app_users`, and the
`assignees` key and its editor are deleted, so there is exactly one place a person exists.

**S5 — a phone close is a real close.** `sales_core.convert_lead` is extended with an evidence-kind
parameter rather than making `set_lead_status` a second writer of `won`: the `converted` event is
what `api_read.v_sales_today`'s conversion branch keys off, so a lead marked won without one has
`status='won'`, matches no WHERE branch, and vanishes from the queue entirely.

Backend, schema and Edge-Function halves (S1 sort, S3 migration + handlers, S4 digest, S5
`convert_lead`) ship as their own PR in `gt-factory-os`, cross-linked, so each repo's guards see a
diff that respects its own lane.

## Manifest

```
src/app/(sales)/_lib/queue.ts
src/app/(sales)/_lib/queue.test.ts
src/app/(sales)/_lib/labels.ts
src/app/(sales)/_lib/types.ts
src/app/(sales)/_lib/api.ts
src/app/(sales)/_components/TodayQueue.tsx
src/app/(sales)/_components/OutcomeSheet.tsx
src/app/(sales)/_components/SettingsForm.tsx
src/app/(sales)/sales/today/page.tsx
src/app/(sales)/sales/leads/page.tsx
src/app/(sales)/sales/attention/page.tsx
src/app/api/sales/leads/[lead_id]/convert/route.ts
src/app/(sales)/layout.tsx
src/lib/auth/authorize.ts
src/lib/contracts/enums.ts
src/lib/auth/fake-auth.ts
src/lib/nav/manifest.ts
src/features/home/cockpit.ts
src/app/(admin)/admin/users/page.tsx
tests/unit/sales/today-queue.test.tsx
tests/unit/sales/outcome-sheet.test.tsx
tests/unit/sales/gate-remediation.test.tsx
tests/unit/sales/lost-is-reversible.test.tsx
tests/unit/sales/sales-capability.test.ts
tests/unit/sales/labels.test.ts
tests/e2e/sales-assignment.spec.ts
tests/e2e/sales-outcome-integrity.spec.ts
playwright.config.ts
docs/portal-os/tranches/173-commitments-and-a-team.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

Five files beyond the planned list, all of them `Record<Role, …>` sites the
typechecker found the moment `sales_rep` joined `ROLES` — which is the useful
half of encoding the lattice as a total map: `fake-auth.ts` (the dev-shim
session the @mocked e2e signs in as), `nav/manifest.ts` (`NAV_ROLE_ORDER`, plus
the `/apps` fork that was `roles: ["admin"]` and would have stranded the one
role that lives on the far side of it), `features/home/cockpit.ts` (`ROLE_RANK`
and `ROLE_COCKPIT`), `gate-remediation.test.tsx` (three cases that asserted the
roster editor S3 deletes), and `lost-is-reversible.test.tsx` (new — D3 needed a
page-level harness the sales suite did not have).

## Checklist

- [x] D1 — a due follow-up is never suppressed by the daily cap
      (`tests/unit/sales/today-queue.test.tsx` "never defers a promised callback behind the
      daily cap" — written first and watched fail; `_lib/queue.test.ts` "never caps a
      promised callback, even at a cap of zero")
- [x] D2 — due follow-ups sort above new leads, most-overdue first
      (the handler's exact ORDER BY run against `api_read.v_sales_today` with three
      synthetic due rows unioned in, read-only: positions 14/15/16 are the follow-ups at
      5d → 2h → 20m overdue, and new leads begin at 17)
- [x] D3 — אבוד is reversible from all three paths that set it
      (`tests/unit/sales/lost-is-reversible.test.tsx`, one case per door, each asserting
      the reversal actually writes `status:'working'` with the prior date — and verified
      to FAIL on doors 2 and 3 with the page fixes stashed)
- [x] D4 — an outcome is never recorded that the user did not choose
      (`tests/unit/sales/outcome-sheet.test.tsx` "records the outcome the user chose, not
      the one the date step assumed": לא ענה → custom date → `result: "no_answer"`)
- [ ] D5 — a non-admin sales user can work a lead end to end — **blocked on Tom**: needs a
      Supabase `auth.users` row created in Studio (service key; `0331:23-25`). Code, gate
      and migration are in place.
- [x] D6 — there is exactly one roster (roster derived from `private_core.app_users` in
      `handleSalesSettings`; the `assignees` key deleted by migration 0333, dropped from
      the settings PUT schema, and the editor replaced by a read-only list that points at
      `/admin/users`)
- [x] D8 — a phone-closed deal is recorded as won, and stays visible (portal + endpoint +
      `convert_lead` evidence kind; pgTAP `db/tests/0335_*.test.sql` asserts both events
      and the `conversion` row in `v_sales_today` — **not executed here**, see below)
- [x] The three tranche-164 tests that encode the old doctrine are rewritten, none deleted
- [x] tsc 0 · eslint 0 errors · vitest 1434/1434 · playwright @mocked 101/102

## An adversarial review of this tranche, and what it found

Because two things in this change could not be verified locally — the three
migrations (no `pg_prove`, no DB connection) and the Edge Function (no Deno) — the
diff was put through a five-dimension adversarial review with a skeptic per
finding. It found defects that a green suite could not, several of them
production-breaking. Every one below was reproduced first-hand before it was
fixed.

**The worst of them were invisible to every check that was passing.**

- **`assert_assignee` still read the roster this tranche deletes.** 0333 dropped
  `app_setting('assignees')`, but `sales_core.assert_assignee` (0325) — the gate
  every `assign_lead` and `bulk_assign` passes through — validated against that
  exact key. Deleting it makes the subquery NULL, `jsonb_array_elements(NULL)`
  yield nothing, and the function raise `SALES_UNKNOWN_ASSIGNEE` **for
  everybody**. Every assignment in the product would have broken on apply, with
  no way back through the API: the settings PUT no longer accepts a roster and
  the editor is read-only. 0333 now replaces the function's body in the same
  transaction, reading `private_core.app_users` with the same predicate
  `handleSalesSettings` uses — which is what 0325's own header said the upgrade
  would look like.
- **The reminders cron would have died on its first statement, every morning.**
  `routeReminders` opens with `startRun(c, 'reminders')`, and
  `sales_core.poll_run`'s CHECK permits only
  `('poll','daily','ingest','probe','backfill')`. Verified against the live
  constraint. 0334 widens it. Because `startRun` sits outside the route's try
  block, it would not even have recorded the run it failed to open.
- **`/apps` still hard-coded `role === "admin"`.** The nav entry gained
  `sales_rep`; the page behind it did not. `/apps` is the default post-login
  destination, so a sales rep signing in was forwarded straight past the only
  screen offering their workspace into a factory `/home` with empty rails — D5
  could not have passed however correct the API was.
- **The undo outlived the toast that offered it.** `undo` was sibling state no
  toast owned, so the 4.5s timer cleared the message and left the target; the
  next toast inherited it and rendered a "בטל" button, beside a message about
  lead B, that wrote `status='working'` to lead A. Both pages now route every
  toast through one `showToast(message, undoTarget)`, so raising one always
  replaces the way back or removes it.
- **A close that did not happen was announced as one.** `convert_lead` returns
  `false` — not an error — when the lead is no longer open, and all three sheets
  discarded the response and toasted "נסגר ✓". This is precisely the race S3
  creates by putting a second person on the queue. All three now branch on
  `res.converted`, keep the sheet open and say why; the close also finally
  carries `busy` and `error`, so a failed one is no longer silent.

Also fixed: the digest grouped by raw assignee and applied the
inactive-assignee fallback afterwards, so Tom would have received one partial
email per departed rep, each claiming to be the whole day; `staffAllowlist` had
no role filter, quietly re-creating the third registry D6 removes; the 0333
pgTAP contained a hard `42601` (an `UPDATE` in a `FROM` subquery) that would have
aborted the file; the 0325 pgTAP asserted the deleted key; `SalesSwitch`, the
middleware role table, the `RoleGate` capability labels and the route manifest
all still said admin-only.

**And the API was never typechecked.** The root `tsconfig.json` includes only
`scripts/**/*.ts`, and CI runs that root typecheck — so `api/src` and `api/test`
are outside the one gate the backend repo has. Installing the API's own
dependencies and running its typecheck surfaced three real compile errors this
change had introduced (`me/schemas.ts` role enum, a `Record<AppRole, …>`
fixture, and `sales_v2.test.ts` still passing `assignees`). Every earlier
"backend typecheck clean" in this work proved nothing about the backend. Two
further errors are pre-existing and untouched here
(`purchase-session/handler.actions.ts:183`, `production_plan_base_batch.test.ts:523`).

**One fix in this list was itself wrong on the first attempt**, and the suite
caught it: the `/home` TodayBoard gate moved from `role !== "viewer"` to
`stock:read` — but viewer *holds* `stock:"read"`, so the factory briefing would
have started rendering for the bookkeeper. `stock:execute` is the level that
means {operator, planner, admin}. `home.spec.ts:321` failed exactly as it should.

### Left for Tom rather than decided here

- `demo@gteveryday.com` is an active admin, so the derived roster offers "GT
  Sales Demo" as a person who works leads. The clean fix is to make it a
  `sales_rep`, or deactivate it — but §6.C of the driving masterprompt reserves
  the demo account's lifecycle for Tom.
- `viewer:read` is a synthetic always-true tier, so `sales_rep` still reaches the
  `(shared)`, `(inbox)` and `(po)` layouts by URL despite holding nothing on
  those axes. Narrowing it is a portal-wide decision, not a sales one.
- `/sales/settings` — the daily cap, the SLA, the lost-reason vocabulary — became
  writable by `sales_rep` when the layout gate widened. The lattice already
  supports splitting it (`sales:execute` for reps, `sales:execute+override` for
  admin); whether a rep may change the queue's shape is Tom's call.

## A second review pass, and a false sentence it caught

A review of the driving masterprompt found four defects in the *instructions*, two of
which had already been faithfully implemented. Both are fixed here.

**`dailyCapRule` was left saying something that stopped being true.** The original S1
instruction was explicit — "Leave `dailyCapRule` alone. Its Hebrew string … stays true
after this change" — and it was followed, with a source comment written to defend it. It
does not stay true. The string read *"מתוך מכסה יומית של N לכל התור"*: a daily quota **for
the whole queue**. That held while new leads and follow-ups shared one budget, and this
tranche is precisely the change that ends the sharing. Afterwards the quota governs
untouched new leads alone and a promised callback passes it untouched, so the sentence
overstated what it caps — on the one screen whose first rule is that nothing on it may be
false. Now:

```
מתוך מכסה יומית של N לידים חדשים · מעקבים שהתחייבת אליהם אינם נספרים
```

and the test no longer just calls `UI.dailyCapRule(cap)` — it asserts the rendered string
names new leads and does **not** claim "לכל התור", so the false version cannot come back.

Worth naming plainly: an instruction being explicit is not the same as it being right, and
this one was carried into the product because it was followed rather than checked.

**`playwright.config.ts` is hardened** so the trap described below cannot be re-sprung: the
correct `PW_CHROME_PATH` binary is named next to the escape hatch, and the webServer now
pins `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` — without it every @mocked sales spec 307s to the
sign-in wall and fails on locators that never existed, a harness failure that reads exactly
like a feature failure.

(The other two defects were in the backend half — the reminder de-duplication was not
atomic, and the digest cron drifted an hour every winter. Both fixed in
`gt-factory-os#236`, migration 0334.)

## A wrong call, corrected — twice

While this tranche was being built, `tests/e2e/sales-today.spec.ts:297` ("the card leaves
the queue optimistically on שלי") failed deterministically in the authoring sandbox — nine
times per run, and identically **with every change in this tranche stashed**. It was
reported as a pre-existing regression of the tranche-172 INTER-NEW-2 fix, and left alone.

**Wrong once:** the test passes in CI — line 95 of the `ci` run, 102/102. The stash
experiment was sound as far as it went and did prove this tranche did not cause the
failure, but it cannot distinguish "broken on main" from "broken on this machine", and
the conclusion overreached in exactly that gap.

**Wrong twice:** the first correction blamed the version — "Chromium 1194 while Playwright
1.59.1 expects 1217" — and called the effect "timing-sensitive". Both halves are wrong,
and each sends the next person somewhere useless: the version framing invites installing
1217, and the timing framing invites waits, retries and `expect.poll`, none of which can
ever work here.

**What it actually is.** Two binaries of the *same* revision 1194 ship in this image, and
only one of them fails:

```
PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome                 → 5 passed, 1 failed
PW_CHROME_PATH=/opt/pw-browsers/chromium_headless_shell-1194/.../headless_shell   → 6 passed
```

Same tree, same commit, same env. The revision is not the variable; the **mode** is. On the
full Chromium build (new-headless) **no synthesised mouse event is delivered to the page at
all while a fixed overlay is mounted** — measured with capture-phase listeners on both the
button and `document`: `locator.click()` → `[]`, `page.mouse.click()` → `[]`,
`dispatchEvent` → the handler fires. It is not a race and not a hit-test interception; it is
total input suppression, gated on the presence of the overlay. So the outcome POST never
fires, the optimistic drop never happens, and the assertion after it fails while pointing
squarely at `_lib/api.ts`, which is correct.

**The tranche-172 INTER-NEW-2 fix is present and correct** — verified behaviourally, not
just read: `TODAY_PREFIX = ["sales","today"]` and `dropFromTodayCaches` uses
`qc.getQueriesData({ queryKey: TODAY_PREFIX })`, a TanStack v5 prefix match, so it patches
`["sales","today","<email>"]` as well as `["sales","today","all"]`. **No regression exists
in `_lib/api.ts` and nobody should go looking for one.**

`playwright.config.ts` is hardened in this tranche so the trap cannot be re-sprung: the
correct binary is named next to the `PW_CHROME_PATH` comment, and the webServer now pins
`NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` (without it every @mocked sales spec 307s to the sign-in
wall and fails on locators that never exist — a harness failure that reads as a feature
failure, and plausibly part of how the original wrong conclusion was reached).

**The lesson worth keeping:** a red local suite and a green local suite are both claims
about *this machine* until CI has spoken; "fails with my changes stashed" narrows a cause
without locating it; and a correction issued fast can be as wrong as what it replaced —
this one had to be made twice.

## Not executed here

`pg_prove` is not installed in this image, `DATABASE_URL` is unset and
`DATABASE_URL_POOLED` does not connect, so the three pgTAP files written for migrations
0333/0334/0335 are deliverables for CI or for Tom, not results. Deno is likewise absent,
so the Edge Function itself was not typechecked — its pure builder was, through the
existing Node harness (`api/test/sales_leads_poll_alerts.test.ts`, 26/26).
