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

## A wrong call, corrected

While this tranche was being built, `tests/e2e/sales-today.spec.ts:297` ("the card leaves
the queue optimistically on שלי") failed deterministically in the authoring sandbox — nine
times per run, twice over, and identically **with every change in this tranche stashed**.
That last fact is why it was reported as a pre-existing regression of the tranche-172
INTER-NEW-2 fix, and left alone.

**That call was wrong.** The test passes in CI: line 95 of the `ci` run, 102/102. The
stash experiment was sound as far as it went — it did prove this tranche did not cause the
failure — but it could not distinguish "broken on main" from "broken in this sandbox", and
the conclusion drawn from it overreached in exactly that gap.

The cause is environmental: this image ships Chromium 1194 while Playwright 1.59.1 expects
1217, and the local runs were forced onto the older binary through `PW_CHROME_PATH`
(the §7.7 landmine, which bites in a second way nobody had written down — it does not only
make the browser hard to find, it can change a timing-sensitive result). CI installs the
matching browser via `npx playwright install --with-deps chromium`.

**No regression exists in `_lib/api.ts`.** The lesson worth keeping: a green local suite and
a red local suite are both claims about *this machine* until CI has spoken, and "fails with
my changes stashed" narrows a cause without locating it.

## Not executed here

`pg_prove` is not installed in this image, `DATABASE_URL` is unset and
`DATABASE_URL_POOLED` does not connect, so the three pgTAP files written for migrations
0333/0334/0335 are deliverables for CI or for Tom, not results. Deno is likewise absent,
so the Edge Function itself was not typechecked — its pure builder was, through the
existing Node harness (`api/test/sales_leads_poll_alerts.test.ts`, 26/26).
