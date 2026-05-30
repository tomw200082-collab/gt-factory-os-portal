# Tranche 038: weekly-meeting cockpit — mobile + disclosure UX polish

status: active
created: 2026-05-30
activated: 2026-05-30
scorecard_target_category: ux_polish
expected_delta: +1 ux_polish
sizing: S

## Why this tranche
037 closed the keyboard/screen-reader gaps on `/planning/meeting`. This tranche
closes the three remaining *sighted/touch* UX gaps on the same surface — the
ones a phone operator hits, since this cockpit is explicitly mobile-driveable.

Each change is a real interaction improvement, not a restyle:

1. **Commitment "+N more" is a dead end.** `CommitmentPanel` shows the top 8
   finished goods then a static "+N more products" line with no way to see the
   rest. Make it a real disclosure: a button that expands the full list, with
   `aria-expanded` + a screen-reader-friendly label, collapsing back on toggle.
2. **Cadence rail cramps on narrow phones.** Three equal-width steps, each with
   icon + label + "Today" badge + sub-label, plus connecting arrows, overflow
   below ~360px. Hide the decorative connector arrows on small screens
   (`hidden sm:block`) and tighten horizontal padding so the labels breathe.
3. **Batch pack-breakdown is invisible to touch.** `BatchChip` exposes its pack
   breakdown via hover `title` (desktop) + `aria-label` (SR) but a touch user
   can see neither. For tea batches with packs, make the chip a button that
   toggles an inline pack-breakdown list (`aria-expanded`), keeping the existing
   `aria-label` intact.

## Scope
- `src/app/(planning)/planning/meeting/page.tsx` — the cockpit surface (all of the above).
- `tests/unit/features/meeting-mobile.test.tsx` — NEW: assert the disclosure
   toggles (commitment + batch chip) and that the connector arrows are
   hidden-on-mobile, locking the behavior against regression.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/meeting/page.tsx
  - tests/unit/features/meeting-mobile.test.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Any logic change to the cadence engines, hooks, or proxies (pure presentation/interaction).
- The inventory-flow / purchase surfaces (separate components; not this tranche).
- Token / color changes — layout + disclosure interaction only.

## Tests / verification
- typecheck clean.
- full vitest green, including the new meeting-mobile spec.
- production build clean.

## Exit evidence
- one combined verification run (typecheck + vitest + build) pasted on the PR.

## Rollback
Revert the PR; changes are additive disclosure state + responsive classes + one new test file.

## Operator approval
- [x] Tom approved in-session ("merge #64, then 038") and the 3-item scope as recommended.
