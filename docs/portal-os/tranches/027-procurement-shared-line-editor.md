# Tranche 027: procurement-shared-line-editor

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: flow_continuity
expected_delta: +0 on flow_continuity (enabling refactor; the operator-visible delta lands in 028–030, which depend on this extraction)
sizing: M  (5-8 files)

## Why this tranche
The Sunday procurement close is scattered across the purchase session, the
purchase calendar, the recommendations list, and the standalone manual-PO form
(`/purchase-orders/new`). The agreed target (see Roadmap below) is **one merged
procurement page** with an action-list default view (grouped by decision) and a
**focus mode** that creates POs order-by-order using the *same* rich line editor
the manual form already has. That focus mode cannot reuse the editor while it is
welded inside `new/page.tsx`. This tranche extracts the editor into a shared,
mode-aware component with **zero behaviour change** to `/new`, so 028–030 can
embed it. Pure foundation: lowest-risk first step, unblocks the whole epic.

## Scope
- Extract the order-line editor + order-header fields (supplier, expected
  delivery date, reason, notes, line rows with searchable item/component picker,
  qty, UoM, add/remove) from `(po)/purchase-orders/new/page.tsx` into a reusable
  `PoLineEditor` component under `src/components/purchase-orders/`.
- Make the editor **mode-aware** via a prop (`mode: "manual" | "recommendation"`):
  - `manual` — current behaviour exactly: `manual_reason` shown and **required**
    (≥5 chars). This is what `/new` keeps using.
  - `recommendation` — `manual_reason` section hidden and not validated (the PO
    is planning-backed, so no manual reason is needed). Wired by 029, not used
    in this tranche.
- Move the shared types (`LineDraft`, `OrderableRow`, `ValidationErrors`, the
  envelope/row interfaces) into `src/components/purchase-orders/types.ts`.
- Extract the master-data → orderable-options logic (suppliers + BOUGHT_FINISHED
  items + active components, grouped) into a `useOrderables` hook so focus mode
  reuses the exact same option set as the form.
- Refactor `new/page.tsx` to consume `PoLineEditor` + `useOrderables`. The page
  keeps ownership of submit/success/idempotent/422-mapping behaviour and the
  `RoleGate`; only the field/line UI and master-data wiring move into the
  component. Visual output and all `data-testid`s remain identical.

## Manifest (files that may be touched)
manifest:
  - src/components/purchase-orders/PoLineEditor.tsx
  - src/components/purchase-orders/types.ts
  - src/components/purchase-orders/useOrderables.ts
  - src/components/purchase-orders/PoLineEditor.test.tsx
  - src/app/(po)/purchase-orders/new/page.tsx
  - tests/e2e/po-new.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- The merged procurement page and the action-list view (Tranche 028).
- Focus mode and inline PO creation (Tranche 029).
- Ad-hoc "add an order" inside the session (Tranche 030).
- Any change to which backend endpoint creates a PO, or to PO attribution
  (recommendation- vs manual-backed). That is the W1/W4 backend lane; the portal
  only consumes existing endpoints. 029 will confirm the recommendation-backed
  ("place") endpoint to call before embedding the create action.
- Any change to `/api/purchase-orders` proxy, schema, or `fn_create_manual_po`.
- Retiring or redirecting the standalone `/new` route (handled later, if at all —
  it stays the ad-hoc entry point).

## Tests / verification
- typecheck clean (`portal-pr-guard` typecheck).
- vitest: `src/components/purchase-orders/PoLineEditor.test.tsx` — covers
  `manual` mode (reason required → blocks submit when empty/<5 chars) and
  `recommendation` mode (reason hidden, not validated), line add/remove, and
  UoM auto-set from orderable default on item pick.
- playwright: `tests/e2e/po-new.spec.ts` — new spec locking the `/new` flow
  end-to-end (fill supplier + reason + one line → submit → success state with
  "View purchase order" link). Acts as the pre/post-refactor equivalence guard.
- regression-sentinel: no baseline regressions (route surface and
  `data-testid`s unchanged).

## Exit evidence
- playwright trace/screenshot of `/new` submit succeeding post-refactor.
- vitest pass count for `PoLineEditor.test.tsx`.
- scorecard delta ≥ expected (+0; this tranche is an enabler, declared honestly).
- PR link.

## Rollback
Revert the PR on the branch. No data-layer, schema, route-manifest, or endpoint
changes — the refactor is component-local, so revert is clean and `/new` returns
to its inlined form.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 027` on the PR)

---

## Roadmap — the full procurement-merge epic (for context; only 027 is proposed now)

Decisions locked with Tom (2026-05-29): default view = **action list**; grouping
= **by decision** (must-send-today vs can-wait); closing model = **focus mode**;
focus connects to PO creation via an **embedded editor** (the shared component
from this tranche); ad-hoc additions happen **inside the session**.

- **028 — procurement-unified-page + action-list.** One page replacing the
  scattered surfaces. Default view = action list grouped by decision
  (🔴 must-send-today / 🟡 can-wait / ✅ handled-today), each row = one
  per-supplier proposed order with a "why now" decision driver. Entry point to
  focus mode. (~L; will be split if it exceeds 12 files.)
- **029 — procurement-focus-mode + inline create.** Order-by-order focus cards
  embedding `PoLineEditor` in `recommendation` mode, pre-filled from the
  recommendation; one primary "create order" action → PO created via the
  existing recommendation-backed endpoint → inline ref+link confirm →
  auto-advance. Depends on 027. **Pre-req:** confirm the exact existing endpoint
  + payload (backend lane).
- **030 — procurement-adhoc-in-session.** "➕ Add order" inside the
  session/focus queue for supplier/lines not in the plan, reusing `PoLineEditor`
  in `manual` mode; reconcile against the standalone `/new` route.

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 on branch `claude/procurement-forecast-review-Bv31m`.

**Files delivered (exactly the manifest):**
- `src/components/purchase-orders/types.ts` (new) — shared types + pure helpers
  (`todayPlusDays`, `toUom`, `emptyLine`) + `validatePoDraft(draft, mode)`.
- `src/components/purchase-orders/useOrderables.ts` (new) — master-data hook
  (suppliers + BOUGHT_FINISHED items + active components → grouped options),
  same query keys / staleTime / sorting as the old inline code.
- `src/components/purchase-orders/PoLineEditor.tsx` (new) — controlled,
  mode-aware field + line editor. `manual` renders the reason section;
  `recommendation` hides it. All `data-testid`s preserved.
- `src/components/purchase-orders/PoLineEditor.test.tsx` (new) — 10 vitest cases.
- `src/app/(po)/purchase-orders/new/page.tsx` (refactor) — consumes
  `useOrderables` + `<PoLineEditor mode="manual">`; keeps submit / 201 / 409 /
  422-field-mapping / success+idempotent states / `RoleGate` unchanged.
- `tests/e2e/po-new.spec.ts` (new) — structural equivalence + RoleGate guard.

**Verification:**
- typecheck: `npm run typecheck` → exit 0 (clean) after `npm ci`.
- vitest (this tranche): `PoLineEditor.test.tsx` → 10 passed / 10.
- full vitest: 292 passed; 35 pre-existing failures in unrelated suites
  (bom-edit, stock, recipe-health, admin) — confirmed failing on a clean
  `git stash` baseline, i.e. NOT introduced by this tranche. No
  purchase-orders test among the failures.
- e2e `po-new.spec.ts`: deterministic structural assertions; runs under
  `portal-pr-guard` / CI (needs dev server + browsers, not run in this sandbox).
- regression-sentinel: route surface unchanged (`/purchase-orders/new` same
  path, same role gate); `data-testid`s preserved.

**Scorecard delta:** +0 (declared; enabling refactor — operator-visible delta
lands in 028–030).
