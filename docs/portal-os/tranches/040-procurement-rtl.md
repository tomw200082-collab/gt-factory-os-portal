# Tranche 040: Procurement page RTL

status: in-progress
created: 2026-06-01
activated: 2026-06-01
scorecard_target_category: ux_polish
expected_delta: +0 (single-surface direction fix; reading correctness for the Hebrew procurement screen)
sizing: S

## Why this tranche
The `/planning/procurement` surface is a **fully-Hebrew** operator screen (title
"רכש", decision-grouped action list, summary, states — all Hebrew copy), but the
page itself rendered **left-to-right**: the header, summary card, view toggle and
error banner laid out LTR while the text read RTL. The sub-overlays already opt
into RTL (`FocusMode`, `FocusCard` both carry `dir="rtl"`), so only the page body
was inconsistent. Tom asked to keep the screen in Hebrew but flip **only this
screen** to RTL.

## Non-negotiable: zero logic change
The entire change is a single attribute — `dir="rtl"` on the procurement page's
root `<div>`. No copy changes (stays Hebrew), no handlers, no state, no data
layer, and every `data-testid` (`procurement-start`, `procurement-summary`,
`procurement-view-list`, `procurement-view-calendar`, `procurement-start-focus`,
`procurement-manual-order`, …) is preserved — `dir` does not alter DOM order or
ids. Matches the existing `dir="rtl"` convention already used by
`FocusMode.tsx`, `FocusCard.tsx`, and `purchase-session/page.tsx`.

## Scope
- `src/app/(planning)/planning/procurement/page.tsx` — add `dir="rtl"` to the
  page root container (plus a one-paragraph comment explaining the scoping).

## Out-of-scope
- The app shell (TopBar, group nav tabs, contextual sidebar) — stays LTR; the
  attribute is scoped to the page body only, verified by screenshot.
- Every other route's direction — untouched.
- Translating any Hebrew surface to English — explicitly NOT this tranche (Tom
  asked to keep procurement in Hebrew).

## Tests / verification
- typecheck clean — `npx tsc --noEmit` → exit 0
- vitest: full suite 55 files / 416 tests passing (incl. all 44 procurement specs:
  ActionList, FocusMode, FocusCard, CalendarView, AddLineForm, decision,
  calendar-grid, focus-queue) — no regression
- visual: desktop (1440×900) + mobile (iPhone 14) screenshots confirm the page
  body reads RTL while the shell stays LTR

## Rollback
Remove the `dir="rtl"` attribute (one-line revert); no data-layer changes.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 040` on the PR)

## Actual evidence
- typecheck: `npx tsc --noEmit` → exit 0
- unit suite: `npx vitest run` → Test Files 55 passed (55), Tests 416 passed (416)
- procurement subset: `npx vitest run procurement` → 8 files / 44 tests passed
- visual: procurement-rtl-desktop.png + procurement-rtl-mobile.png (shell LTR, body RTL)
- branch: `claude/great-shannon-X02VD`
