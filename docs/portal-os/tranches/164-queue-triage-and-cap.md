# Tranche 164 — 188 leads become a morning you can work

**Status:** built — tsc 0, vitest green
**Origin:** the 2026-08-18 v2 audit (`gt-factory-os-production-brain/docs/audits/2026-08-18-sales-workspace-v2-audit.md`),
findings P0-1, P0-5, P1-3, P1-14 — and Tom's v2 masterprompt, which names U-011 "the single biggest
open product question".
sizing: M
scorecard_target_category: ops_surface
expected_delta: the Today queue stops being a wall of 188 and becomes a daily commitment Tom sets,
with age impossible to ignore and the morning's real numbers on the strip.

## The defect

Four of them, all on the same screen.

**The queue had no shape and no owner.** Ordering was hardcoded twice — `queries_handler.ts` sorted
`coalesce(next_touch_at, created_at) asc` on top of the view's `item_type` grouping — so the first
card every morning was the *oldest* lead in the system, a 2023 row nobody can call. The only cap was
`PAGE = 12` in this file, which is render batching: all 188 stayed "owed today". Changing either
needed a deploy.

**39 of the 188 leads have neither phone nor email.** They sat in the queue as permanent dead weight:
they cannot be called, and no outcome can ever clear them.

**Age was invisible.** `fmtRelative(created_at)` at 12px in muted ink renders "לפני 19 ימים" exactly
like "לפני יום". Speed-to-lead is the strongest predictor in the doctrine the masterprompt cites, and
the queue said nothing about it. The SLA badge did not help: with every lead untouched and past 24h,
**188 of 188 showed "עבר זמן"** — a timer on everything is a timer on nothing, which is what the
token file's own comment says the badge exists to avoid.

**The stats strip read "0 · 0 · 0".** Its three counts describe steady state — leads created this ISO
week, in working now, converted this week — and every one of them is zero while a backlog imported in
one batch is being cleared.

## The fix

Backend companions landed first (`gt-factory-os` 0326): `app_setting('queue')` holds `daily_cap` and
`order`, `v_sales_today` exposes `age_days` and `uncontactable` and stops admitting uncontactable new
leads, and `v_sales_week_stats` gained the four triage counts. This tranche is the screen.

- **A daily commitment, not a wall.** `capRows` caps the two backlog sections at the admin-owned
  `daily_cap` and reports the remainder in one line: `היום: 15 שיחות · עוד 121 ממתינות בתור`. The
  count is always the true one — nothing is hidden, it is *deferred*, which is the whole difference
  between a queue and a wall. Conversions and returning customers are never capped: they are news and
  the one case that must never go quiet, not workload.
- **Order comes from the database.** The handler reads `queue.order`; `newest_first` is the default
  (decision gate D3) because the freshest lead is the most winnable and the 2023 backlog must not
  greet anyone. Tom flips it on the settings screen in tranche 167.
- **Age carries urgency.** `agedTone` compares `age_days` against the live SLA and tints past it, and
  the card states the number outright — `בן 19 ימים` — instead of leaving it to a relative phrase.
- **The SLA badge earns its colour back.** It renders only when overdue, so the red means something
  again once the backlog is worked down.
- **The strip says what the morning holds:** queue size, overdue, unowned, never contacted.
- **The leads table is navigable at 188 rows:** the mobile card list paginates like the queue
  (20 at a time), the age column sorts, and a filter chip isolates the 39 leads nobody can call — so
  they are findable and fixable rather than silently dropped.

## Manifest

```
src/app/(sales)/_lib/api.ts
src/app/(sales)/_lib/labels.ts
src/app/(sales)/_lib/types.ts
src/app/(sales)/_lib/queue.ts
src/app/(sales)/_lib/queue.test.ts
src/app/(sales)/_components/TodayQueue.tsx
src/app/(sales)/_components/TodayCard.tsx
src/app/(sales)/_components/SlaBadge.tsx
src/app/(sales)/_components/StatsStrip.tsx
src/app/(sales)/_components/LeadsTable.tsx
src/app/(sales)/sales/today/page.tsx
src/app/(sales)/sales/leads/page.tsx
tests/unit/sales/today-queue.test.tsx
tests/unit/sales/labels.test.ts
tests/e2e/sales-queue-triage.spec.ts
tests/e2e/sales-today.spec.ts
tests/e2e/sales-leads.spec.ts
tests/e2e/mobile-sales-today.spec.ts
docs/portal-os/tranches/164-queue-triage-and-cap.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

Two deviations from the plan's manifest, both deliberate: `capRows`/`agedTone` live in
`_lib/queue.ts` rather than inside `TodayQueue.tsx`, because `TodayCard` needs `agedTone` and
importing it back out of the component that renders the card makes the two modules circular; and
`EmptyStates.tsx` is untouched — the skeleton's height belongs with the visual pass in tranche 168,
where the card's final anatomy is settled. The four test files are here because this tranche changes
the contracts they assert: the today payload gained `queue`, the stats strip split in two, and the
queue takes a cap.

## Checklist

- [x] The new-lead and follow-up sections cap at `daily_cap`; the remainder line states the true count
- [x] Conversions and returning customers are never capped
- [x] Queue order follows `app_setting('queue').order`, not a constant
- [x] Age is stated in days and tinted past the SLA
- [x] The SLA badge renders only when overdue
- [x] The stats strip carries queue / overdue / unowned / never-contacted
- [x] Leads: mobile list paginates, age column sorts, uncontactable chip filters
- [x] Registered in `docs/portal-os/registry.md` in the same commit (the PR guard fails otherwise)
- [x] tsc 0 · vitest green
