# Tranche 016: middleware-role-gates-and-manifest-completeness

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: role_gate_correctness + nav_integrity
expected_delta: +2 (role_gate_correctness 9→10, nav_integrity 8→9)
sizing: S (2 files; 1 src edit, 1 manifest edit)

## Why this tranche
Operator-mandated scope-lock: close the last two portal-native gaps before merging to main and handing off to the backend lane. (1) Middleware currently auth-only — add path-specific role-gate scaffold that reads `app_metadata.role` if present (ready for backend to populate; safe no-op today). (2) Route-manifest missing 9+ detail sub-page rows that exist on disk — enumerate them so regression-sentinel has full truth.

## Scope (strict — per explicit operator mandate)
- `src/middleware.ts`: add a `ROLE_GATES` table (prefix → allow-list) and enforce it when `user.app_metadata.role` is present on the Supabase session. When role is absent (current state — backend doesn't yet populate it), middleware falls through and layout-level RoleGate + upstream JWT scope continue to enforce. Zero functional change today; full defense-in-depth layer when backend populates the claim.
- `docs/portal-os/route-manifest.json`: add rows for `/planning/forecast/new`, `/planning/forecast/[version_id]`, `/planning/runs/[run_id]`, `/admin/items/[item_id]` (legacy redirect), `/admin/products/new`, `/admin/components/[component_id]`, `/admin/suppliers/[supplier_id]`, `/admin/boms/[head_id]`, `/admin/boms/[head_id]/versions/[version_id]`, `/inbox/approvals/waste/[submission_id]`, `/inbox/approvals/physical-count/[submission_id]`. Remove the now-stale `_todo_after_bootstrap[1]` that called this out.

## NOT in this tranche (explicit operator exclusion list)
- requireEnv sweep
- CSP graduate from report-only
- planning-policy overlay UI
- per-item planning policy
- history tabs (backend-blocked)
- any other polish or hygiene

## Manifest (files that may be touched)
manifest:
  - src/middleware.ts

## Revive directives (if any)
revive: []

## Out-of-scope (but portal-native; future tranches)
- Middleware also gating /api/* mutation paths by role (adds latency; needs benchmarking).
- Setting a role-hint cookie during login callback to avoid the app_metadata dependency.

## Tests / verification
- typecheck clean.
- `npm run build` succeeds (combined with Tranche 017 deploy-unblock).
- Existing role-boundary E2E pack (T015) still passes.

## Rollback
Revert; middleware role-gate scaffold is a no-op when role is undefined (current production state), so rollback is structurally equivalent to land.

## Operator approval
- [x] Tom approves this plan (session directive 2026-04-22: "run Tranche 016 now... scope-lock it strictly to path-specific role gates in middleware + manifest sub-pages completeness").

## Actual evidence
Filled in post-land.
