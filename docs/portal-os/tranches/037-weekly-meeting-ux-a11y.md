# Tranche 037: weekly-meeting cockpit — UX + a11y pass

status: landed-pending-review
created: 2026-05-30
activated: 2026-05-30
landed: 2026-05-30
scorecard_target_category: accessibility
expected_delta: +1 accessibility, +1 ux_polish
sizing: S

## Why this tranche
The new `/planning/meeting` cockpit (landed via #60) is functionally complete but
shipped with thin accessibility + interaction polish: the cadence rail is a set of
plain buttons with no step semantics, async state changes (generate / firm / errors)
are visually styled but not announced to assistive tech, and the inline firm-confirm
does not move focus. This tranche makes a bounded, verified pass over that ONE surface.

Each change is a real semantic/interaction improvement, not a restyle:

1. **Cadence rail → step semantics.** Wrap in `nav[aria-label]`; each step button gets
   `aria-current="step"` when it is today, and `aria-pressed` to reflect the active view.
2. **Async announcements.** Generate result, firm result → `role="status"`
   `aria-live="polite"`; error banners → `role="alert"`. Screen readers now hear the
   outcome instead of silence.
3. **Pending = `aria-busy`.** Generate / firm buttons expose busy state to AT.
4. **Focus management.** When the inline firm-confirm appears, focus lands on the
   confirm button so keyboard users don't have to hunt for it.
5. **Disabled-reason tooltip.** The disabled "Firm week" button explains *why*
   (nothing to firm) via `title`, instead of a dead control.
6. **Big-number labels.** KPI / commitment headline numbers get `aria-label` so the
   value + unit are read as one phrase, not a bare number.
7. **Week-board grouping.** Each day column is a labelled group (`role="group"`
   `aria-label="<day> <date>"`) so the board is navigable by region.
8. **Batch chip label.** `BatchChip` exposes its pack breakdown via `aria-label`
   (today it's only a hover `title`, invisible to keyboard / SR users).

## Scope
- `src/app/(planning)/planning/meeting/page.tsx` — the cockpit surface (all of the above).
- `tests/unit/features/meeting-a11y.test.tsx` — NEW: assert the roles / aria-current /
   live regions / disabled-reason render (locks the behavior against regression).

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/meeting/page.tsx
  - tests/unit/features/meeting-a11y.test.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Any logic change to the cadence engines, hooks, or proxies (pure presentation/a11y).
- The inventory-flow surfaces (separate components; not this tranche).
- Visual redesign / token changes — semantics + interaction only.

## Tests / verification
- typecheck clean.
- full vitest green, including the new meeting-a11y spec.
- production build clean.

## Exit evidence
- one combined verification run (typecheck + vitest + build) pasted on the PR.

## Rollback
Revert the PR; changes are additive aria/role attributes + one new test file.

## Operator approval
- [x] Tom approved in-session (reframed "50 iterations" → one verified tranche).
