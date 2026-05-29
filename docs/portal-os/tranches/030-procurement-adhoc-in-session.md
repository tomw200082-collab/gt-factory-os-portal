# Tranche 030: procurement-adhoc-in-session

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: flow_continuity
expected_delta: +1 on flow_continuity
sizing: M  (5-8 files)

## Why this tranche
Closes the procurement-merge epic with the last agreed behaviour: **ad-hoc
additions inside the session**. During the Sunday close the planner often spots
something the plan missed — "also order X from this supplier". Today that means
leaving the flow. This tranche lets the planner add a line to an order from
inside focus mode (the orderable picker reused from Tranche 027's
`useOrderables`), and surfaces a one-tap path to a wholly-new manual order for a
supplier the session didn't include.

## Scope
- `_components/AddLineForm.tsx` — compact add-a-line form built on the shared
  `useOrderables` hook (Tranche 027): searchable item/component picker + qty +
  UoM (auto-defaulted from the orderable). Validates (orderable required, qty
  > 0) and emits a `LineAdd` ({ component_id | item_id, final_qty }).
- `FocusCard.tsx` — an "➕ הוסף שורה" affordance on an unresolved order that
  reveals the AddLineForm and commits via the existing `useEditPo` `add_lines`
  mutation. Added lines show with the existing "(נוסף)" marker.
- `page.tsx` — in the session summary, a quiet secondary link
  "הזמנה ידנית חד-פעמית" → `/purchase-orders/new` for the wholly-new-supplier
  case (which is a PO outside the session; the manual form already uses the
  shared PoLineEditor in "manual" mode — closing the 027 reuse loop).
- Unit test for AddLineForm (validation + emit).

Backend note: the session API supports adding lines to an *existing* session PO
(`add_lines`) but not injecting a brand-new supplier PO into a server-generated
session — that would be a backend (W1/W4) change, out of portal lane. Hence the
new-supplier ad-hoc routes to the standalone manual PO form rather than the
session. This is called out, not worked around.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/procurement/_components/AddLineForm.tsx
  - src/app/(planning)/planning/procurement/_components/AddLineForm.test.tsx
  - src/app/(planning)/planning/procurement/_components/FocusCard.tsx
  - src/app/(planning)/planning/procurement/page.tsx
  - tests/e2e/procurement.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Injecting a brand-new supplier order into the session (backend lane).
- Deleting/redirecting the classic session or calendar pages.
- Any backend/endpoint/schema change.

## Tests / verification
- typecheck clean.
- vitest: `AddLineForm.test.tsx` (required-field + qty validation; emits the
  correct LineAdd for an item vs a component; UoM auto-default on pick).
- playwright: `tests/e2e/procurement.spec.ts` unchanged route/gate guard holds.
- regression-sentinel: no baseline regressions; additive.

## Exit evidence
- screenshot/trace of adding a line inside focus mode.
- vitest pass count for AddLineForm.test.tsx.
- scorecard delta ≥ expected.
- PR link.

## Rollback
Revert the PR. The add-line form is additive inside the focus overlay and the
manual-order link is a single anchor; reverting removes both with no data-layer
impact.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 030` on the PR)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 on branch `claude/procurement-forecast-review-Bv31m`.

**Files delivered (exactly the manifest):**
- `_components/AddLineForm.tsx` (new) — compact add-a-line composer on the
  SHARED `useOrderables` hook (Tranche 027): searchable item/component + qty +
  UoM (auto-defaulted on pick); validates on submit; emits a `LineAdd`.
- `_components/AddLineForm.test.tsx` (new) — 4 RTL cases (validation gate,
  component vs item emit, UoM auto-default) with `useOrderables` mocked.
- `_components/FocusCard.tsx` (edit) — "➕ הוסף שורה" toggle on unresolved
  orders; commits the added line via the existing `useEditPo` `add_lines`
  mutation.
- `page.tsx` (edit) — quiet "הזמנה ידנית חד-פעמית" → `/purchase-orders/new`
  link in the summary for the wholly-new-supplier case.

**UX iteration:** the add-line submit stays enabled and validates on click
(inline guidance on what's missing) rather than sitting silently disabled — so
the planner always learns why a line can't be added yet.

**Verification:**
- typecheck: `npm run typecheck` → exit 0 (clean).
- vitest (this tranche): `AddLineForm.test.tsx` → 4 passed; the full procurement
  suite (decision + focus-queue + FocusCard + AddLineForm) → 24 passed.
- full vitest: 316 passed (312 prior + 4 new); 35 failures are the SAME
  pre-existing unrelated suites (count unchanged) — none in procurement.
- CI gate (`portal-pr-guard`): typecheck ✅; registry-presence ✅ (030 doc
  registered).
- regression-sentinel: additive; classic session/calendar untouched.

**Scorecard delta:** +1 on flow_continuity — the planner can now handle the
"plan missed something" case without leaving the close (add a line in focus
mode), and reach a one-off manual order in one click. Closes the
procurement-merge epic (027 → 030).
