# Tranche 015: role-boundary-e2e

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: regression_resistance + role_gate_correctness
expected_delta: +2 (regression_resistance 8→9, role_gate_correctness 8→9)
sizing: S (1 file)

## Why this tranche
Re-audit found a hard gap: the only role tests verify nav-link visibility (`tests/e2e/role-switch.spec.ts:11-45`) and one direct-URL block (operator → `/admin/items` shows "Not available for your role"). **Zero tests verify role boundaries at the layout-RoleGate level for newly-tightened surfaces** (T003's `/inbox/approvals/*` subtree) **or for direct API mutation attempts** (viewer cannot approve, operator cannot trigger run, planner cannot PATCH item). The defense-in-depth claim from T011 is incomplete without these. This single-file tranche adds the missing matrix.

## Scope
- New `tests/e2e/role-boundaries.spec.ts` covering:
  - **UI gate (T003 reverification)**: viewer hitting `/inbox/approvals/waste/{any-id}` → "Not available for your role" card; same for `/inbox/approvals/physical-count/{any-id}`.
  - **UI gate**: operator hitting `/admin/items/[id]` (detail-page) → blocked.
  - **UI gate**: viewer hitting `/admin/items` → blocked (extends existing operator-only test).
  - **UI gate**: operator hitting `/planning/runs` page → either blocked or button to trigger run is hidden (depending on the actual policy in `(planning)/layout.tsx`).
  - **API gate (direct fetch)**: viewer POST to `/api/planning/runs/execute` → expect non-2xx.
  - **API gate**: operator POST to `/api/planning/runs/execute` → expect non-2xx.
  - **API gate**: viewer PATCH to `/api/items/{id}/status` → expect non-2xx.
  - **API gate**: operator PATCH to `/api/items/{id}/status` → expect non-2xx.
  - **API gate**: viewer POST to `/api/waste-adjustments/{any-id}/approve` → expect non-2xx.
- Tests are marked with `test.describe.configure({ mode: "serial" })` to share role-switch state cleanly.
- API-call tests use `request.fetch` against the running portal proxy (which forwards to upstream); they assert `status >= 400` rather than any specific code so they pass with either layout-redirect or upstream-403, both being valid defenses.

## Manifest (files that may be touched)
manifest:
  - tests/e2e/role-boundaries.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Backend-side role enforcement is not tested here directly (those tests live in the API repo); we test that the **portal-side** end-to-end wire correctly returns a non-2xx for the unauthorized role, which exercises any link in the chain (UI gate, middleware, proxy, upstream).
- Smoke tests for the full planner→PO→GR loop — separate Tranche 016 candidate.

## Tests / verification
- typecheck clean (test files are typescript).
- Spec runs against `npx next dev -p 3737` (per existing `playwright.config.ts`).
- Each test asserts: either UI-side block (text "Not available for your role") OR API status >= 400.

## Rollback
Revert; no production-code changes.

## Operator approval
- [x] Tom approves this plan (session directive 2026-04-22 — explicit "audit all and start the loop").

## Actual evidence
Filled in post-land.
