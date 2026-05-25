# Tranche 025: Physical Count — pro-grade end-to-end redesign

status: in-progress
created: 2026-05-25
scorecard_target_category: ux_polish
expected_delta: major (deep visual + flow polish; no behavior change)
sizing: M (1 file, focused redesign)

## Why this tranche

Tom feedback after Tranche 024 landed: "the physical count form is not
beautiful enough and not comfortable enough. Improve its UX/UI
significantly at the highest professional level you know."

The 024 pass did a typography + hero-numerics + CTA lift across all
five operator forms, but the Physical Count layout has shape problems
that a typography lift alone does not fix:

- Step 1 picker is a vertical list inside a single SectionCard with a
  search input on top. The "scan + select" interaction is the operator's
  primary daily action; it deserves a richer presentation than a
  generic dropdown.
- The snapshot context card (the proof that "this count is locked to
  this item") is dense + textual; the item name, snapshot id, and
  opened-at time fight for the same visual weight.
- The Step 2 counted-quantity hero is well-sized after 024 but the
  surrounding fields (unit chips, event-time, notes, snapshot card,
  pre-submit panel) compete with it for attention. The operator's eye
  should land on the qty input first, then sweep the supporting
  context.
- The blind-count invariant is the most important rule on this form
  and the existing UI states it only in the page description. It should
  feel like the operator is in a calm, focused counting mode.

## Design goals

**Single focus per moment.** Step 1 is "find the item". Step 2 is
"type the number". Nothing else should be louder than the active
action.

**Operator confidence.** The blind-count rule is reassuring once you
trust it; the form should signal "yes, expected qty is intentionally
hidden — that's the whole point" not "we forgot to show it".

**Visual rhythm.** Big input → small context → action. Not a wall of
equal-sized cards.

**Mobile-first.** The operator is often on a phone with a clipboard
and a scanner. Step 2 has to feel like a calculator app, not a
spreadsheet.

## Scope

Files included:
- `src/app/(ops)/stock/physical-count/page.tsx` (whole-page rework
  inside the existing component — same imports, same handlers, same
  state, same submit envelope; new layout and refined visuals)

Out of scope (preserved verbatim):
- Snapshot-open + submit handlers (`handleOpen`, `handleSubmit`).
- Cancel snapshot logic.
- Contract types + the inlined waste-adjustment mirror.
- Idempotency key generation.
- All API routes consumed (`/api/items`, `/api/components`,
  `/api/physical-count/open`, `/api/physical-count`, cancel).
- All testIds (operators of automated tests rely on these).
- All `role=status`, `aria-live`, `aria-label`, `data-testid` attrs.
- Blind-count invariant (no expected qty ever surfaced).
- Result-banner copy semantics (the verified-correct messages that
  Tranche A established stay as-is; only the layout improves).
- Self-approval policy (UI guard is on the approval page, not this
  form).

## Verification

- `npx tsc --noEmit` clean.
- `npm run test` unit tests in scope (waste-adjustment-schema,
  production-simulation-grouping, mobile-zoom CSS test) pass.
- Mobile smoke test `tests/e2e/mobile-operator-forms-smoke.spec.ts`
  continues to pass — the operator-form route at
  `/ops/stock/physical-count` must still render the WorkflowHeader
  heading and meet the iOS-zoom font-size floor.
