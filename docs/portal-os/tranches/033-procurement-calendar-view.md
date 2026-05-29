# Tranche 033: procurement-calendar-view

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: flow_continuity
expected_delta: +1 on flow_continuity
sizing: S  (≤5 files)

## Why this tranche
Completes the "one merged procurement page" vision: the de-linked Purchase
Calendar timeline becomes a **secondary view inside `/planning/procurement`**.
The planner toggles between the decision-ordered **action list** (default) and a
forward-looking **month calendar** of order-by dates — without a second page or
a second fetch. Calendar entries are derived from the open session's `pos` the
page already holds, so both views are one source of truth.

## Scope
- `_lib/calendar-grid.ts` — pure, tested helpers: `buildGrid(todayISO, weeks)`
  (Sunday-aligned day grid), `posToCalEntries(pos)` (session POs → calendar
  entries; line_count from active lines), `groupByDay(entries)` (tier-sorted),
  `calTotals(entries)`.
- `_components/CalendarView.tsx` — the month grid (DOW header, day cells, tier
  dots, per-day order chips, summary strip), Hebrew, Sunday-first; a day chip
  opens focus mode at that order via `onOpen`.
- `page.tsx` — a segmented **view toggle** ("רשימת פעולה" / "לוח"); renders
  ActionList (default) or CalendarView from the same `session.pos`.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/procurement/_lib/calendar-grid.ts
  - src/app/(planning)/planning/procurement/_lib/calendar-grid.test.ts
  - src/app/(planning)/planning/procurement/_components/CalendarView.tsx
  - src/app/(planning)/planning/procurement/_components/CalendarView.test.tsx
  - src/app/(planning)/planning/procurement/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Retiring/redirecting the standalone /planning/purchase-calendar (stays live,
  de-linked; its own grid copy untouched to keep this bounded).
- Backend/endpoint/schema changes (none — derives from session.pos).

## Tests / verification
- typecheck clean.
- vitest: calendar-grid.test.ts (grid alignment/length, pos→entries mapping,
  grouping/tier-sort, totals).
- production build clean.
- regression-sentinel: additive view; route + nav unchanged.

## Exit evidence
- vitest pass count + build result + PR link.

## Rollback
Revert the PR; toggle + calendar view are additive to the procurement page.

## Operator approval
- [ ] Tom approves (comment `@claude /portal-tranche-fix 033`)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29.

**Delivered:**
- `_lib/calendar-grid.ts` (+test, 5) — pure `buildGrid` / `posToCalEntries` /
  `groupByDay` / `calTotals` (UTC, deterministic).
- `_components/CalendarView.tsx` (+test, 2) — Sunday-first month grid, tier
  summary, per-day order chips that open focus mode; derived from session.pos.
- `page.tsx` — segmented view toggle (רשימת פעולה / לוח); both views share the
  same `session.pos` and the same `onOpenById` → focus mode.

**Verification:**
- typecheck → clean.
- procurement suite → 44 tests across 8 files (incl. 7 new).
- full vitest → 336 passed (+7); 35 pre-existing unrelated failures unchanged.
- production build → clean (117 static pages; /planning/procurement 18 kB).
- hygiene + url-guard → clean.
- No second fetch (calendar reuses the session query); standalone
  /planning/purchase-calendar left untouched (de-linked, slated for later
  retirement).

**Scorecard delta:** +1 flow_continuity — the merged page now offers both the
decision action list and the forward calendar, completing the "one procurement
page" vision.
