# Tranche 110: production-plan — accessibility pass

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / technical_substrate
expected_delta: 0 (WCAG correctness — keyboard, non-color status, ARIA validity)
sizing: S (5 files; no backend)
source: /ux-release-gate on /planning/production-plan (2026-06-26) — Batch 5 of
the approved 7-batch plan. Findings: A11Y-001/002 (touch targets), A11Y-004
(color-only status), A11Y-006 (keyboard scroll), A11Y-008 (invalid ARIA role),
plus decorative-icon labelling.

## The fixes
1. **A11Y-002 — touch targets + day context on the day-lane footer.** The
   "Production" / "Note" footer buttons gained `min-h-[32px]` and day-scoped
   `aria-label`s ("Add production for Mon Jun 29" etc.), matching the empty-state
   buttons. Their icons are now `aria-hidden`.
2. **A11Y-004 — color-only notch status.** `WeekTimelineRail`'s notch dots
   distinguished all-completed / overdue by color alone; the meaningful states
   now carry `role="img"` + `aria-label` ("All completed" / "Overdue"). The
   neutral default dot is `aria-hidden`.
3. **A11Y-006 — keyboard-scrollable board.** The horizontally-scrolling weekly
   board was not keyboard operable (axe `scrollable-region-focusable`). It is now
   `tabIndex={0}` with `role="region"` + an accessible name and a visible
   focus ring, so arrow keys scroll it.
4. **A11Y-008 — invalid ARIA role in SearchableSelect (shared primitive).**
   Options were `<button role="option">` — `option` is not an allowed role for
   `button`. They are now non-focusable `<div role="option">` items (keyboard
   nav already lives on the search input via `handleKey` + `activeIndex`, mouse
   selection via `onClick` — behaviour unchanged). Added `aria-activedescendant`
   on the search input (now `role="combobox"` + `aria-controls` +
   `aria-autocomplete="list"`) so a screen reader follows the highlighted option.
5. **Decorative icons.** The card's top-right status icons (Clock / CheckCircle2
   / Ban) are `aria-hidden` — the state is already in text (status chips + hero
   color), so a bare unlabelled icon shouldn't be announced.

## Note on blast radius
`src/components/fields/SearchableSelect.tsx` is a SHARED primitive (used on this
surface via the recipe panel's "Add a component" select, and elsewhere). The
A11Y-008 fix is a pure correctness improvement that benefits every consumer;
role="option" + the option testids/`data-search-idx` are preserved, so existing
queries and click paths are unchanged. Full suite re-run to confirm no consumer
regressed.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_components/WeekTimelineRail.tsx
  - src/components/fields/SearchableSelect.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/110-production-plan-accessibility.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (shared SearchableSelect change broke no
  consumer test; option role + testids preserved).

## Checklist
- [x] day-lane footer min-h-[32px] + day-context aria-labels · verified
- [x] NotchDot non-color status (role=img + aria-label) · verified
- [x] board keyboard-scrollable (tabindex/role/label/focus-ring) · verified
- [x] SearchableSelect button→div role=option + aria-activedescendant · verified
- [x] decorative status icons aria-hidden · verified
- [ ] Tom review / merge
