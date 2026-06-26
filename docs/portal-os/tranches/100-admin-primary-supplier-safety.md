# Tranche 100: admin primary-supplier safety (confirm + double-fire guard)

status: in-progress
created: 2026-06-26
scorecard_target_category: admin_superuser_depth / data_truthfulness
expected_delta: 0 (safety/correctness — protects planning-critical master data)
sizing: S (2 files; no backend)
source: /portal-audit interaction-design-specialist on admin master-data (2026-06-26)

## Why
The admin master-data interaction audit raised 11 findings. This tranche lands the
two that protect planning-critical data / prevent duplicate writes — verified
against code:

- **INTER-006** (P0 DECISION-GRADE) — on `/admin/components`, the inline
  "Save" for changing a component's **primary supplier** fired immediately with no
  confirmation, silently replacing planning-critical data (cost, lead time, MOQ).
  The component DETAIL page already confirms the SAME action ("Set as primary"),
  so the list page was an inconsistent gap, not a deliberate fast path. Added a
  `confirm()` (the existing accessible `useConfirm` already imported in the file)
  with danger tone, mirroring the detail page's wording.
- **INTER-007** (double-fire) — the component detail "Promote" button passed no
  pending state into `SupplierItemsTable`, so it stayed enabled during the
  promote mutation → a double-click sent duplicate PATCHes. Threaded
  `isPromoting={promotePrimaryMutation.isPending}` and disabled the button (+
  "Promoting…" label) while in flight.

## Scope (manifest)
manifest:
  - src/app/(admin)/admin/components/page.tsx
  - src/app/(admin)/admin/masters/components/[component_id]/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/100-admin-primary-supplier-safety.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 errors (pre-existing exhaustive-deps warnings in the detail
  page unrelated) · vitest 790/790.
- INTER-006 reuses the file's existing `useConfirm` (accessible dialog), NOT
  native `window.confirm`.

## Triage of the rest (admin master-data audit — follow-up)
Feedback/consistency cluster, candidate for a follow-up "admin feedback" tranche:
- INTER-001 (status toggle disables ALL rows while one is pending → per-row
  pendingIds), INTER-002 (group-assign per-row saving indicator), INTER-003 +
  INTER-008 (inline-save success confirmation on item + supplier detail),
  INTER-004 (archive drawer success banner on the 3 detail pages), INTER-009
  (cost-edit error in tooltip → visible text), INTER-011 (shared editBanner leaks
  across tabs). INTER-005 (assign-supplier drawer error path) needs drawer-
  internal verification first.

## Checklist
- [x] INTER-006 primary-supplier confirm · INTER-007 promote double-fire guard
- [ ] Tom review / merge · follow-up: admin feedback cluster
