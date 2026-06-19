# Tranche 066 — procurement urgency: order-by countdown chip

status: in-progress (branch `claude/medical-projects-architecture-d6qn3r`; Tom merges)
source: supplier-ordering improvement backlog (Group A, IMPROVEMENT-02) —
`PRODUCTION/docs/superpowers/specs/2026-06-13-supplier-order-draft-engine-spec.md` §11.
A one-owner factory scanning 6 supplier rows needs to triage in seconds; the
decision engine already computes `daysUntilOrderBy` (negative = overdue) but it
is only embedded in the Hebrew "why now" prose. This tranche surfaces it as a
scannable, colour-coded chip on every actionable row and on the focus card.
No backend change — pure display of an already-computed value.

language policy (locked for this tranche): `/planning/procurement` and its
components REMAIN Hebrew (Tom's deliberate operator experience — scoped
exception, per tranche 065). New chip strings are Hebrew, matching the register
of the existing copy (`daysHe`).

evidence (to fill at close): tsc clean · vitest green (+ decision.ts unit tests
for `orderByCountdown` / `daysUntil`). Playwright not runnable here — skipped.

manifest:
- src/app/(planning)/planning/procurement/_lib/decision.ts
- src/app/(planning)/planning/procurement/_lib/decision.test.ts
- src/app/(planning)/planning/procurement/_components/CountdownChip.tsx
- src/app/(planning)/planning/procurement/_components/ActionList.tsx
- src/app/(planning)/planning/procurement/_components/FocusCard.tsx

## File manifest (human-readable)
- `…/_lib/decision.ts` — NEW exports: `CountdownLevel`, `daysUntil(orderByDate, today?)`, `orderByCountdown(days)` (pure, UI-free, Hebrew label + urgency level).
- `…/_lib/decision.test.ts` — unit tests for the two new helpers (overdue / today / soon / later / null).
- `…/_components/CountdownChip.tsx` — NEW shared chip: maps urgency level → Badge tone, renders the Hebrew countdown; renders nothing when the date is unparseable.
- `…/_components/ActionList.tsx` — render `<CountdownChip>` in the row badge cluster for actionable (non-handled) rows. Additive; existing badges unchanged.
- `…/_components/FocusCard.tsx` — render `<CountdownChip>` in the header badge cluster. Additive.

## Checklist
- [ ] decision.ts helpers added, UI-free, pure
- [ ] decision.test.ts covers overdue/today/soon/later/null + grammar (יום/יומיים/N ימים)
- [ ] CountdownChip renders correct tone per level; null-safe
- [ ] ActionList + FocusCard render the chip; no existing behaviour removed
- [ ] tsc clean; vitest green
- [ ] no regressions to baseline (regression-sentinel)

## Out of scope (follow-up tranches in Group A)
- Urgency summary on the session strip/banner (IMPROVEMENT-04/12).
- Capture skip reasons (IMPROVEMENT-03).
- Closing-loop receipt-status panel (IMPROVEMENT-09).
