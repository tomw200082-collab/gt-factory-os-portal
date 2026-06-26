# Tranche 102: admin list per-row status-toggle disable

status: in-progress
created: 2026-06-26
scorecard_target_category: admin_superuser_depth
expected_delta: 0 (responsiveness — table no longer freezes during one row's mutation)
sizing: XS (3 list pages, 2 buttons each; no backend)
source: /portal-audit interaction-design-specialist INTER-001 (2026-06-26)

## Why
On the items / components / suppliers admin LIST pages, the per-row
Deactivate/Activate button used `disabled={statusMutation.isPending}` against the
single shared mutation — so toggling row A disabled EVERY other row's toggle
while A's network call was in flight. On a 50-row list the whole table froze.

## The fix
Gate each row's disabled on whether THAT row is the one mutating, using the
mutation's own `variables` (no new state needed; same idiom as the inbox ackBusy
and the component-detail field mutation):
`disabled={statusMutation.isPending && statusMutation.variables?.<id> === r.<id>}`
applied to both the table-row and mobile-card toggle on all three pages
(`item_id` / `component_id` / `supplier_id`).

## Scope (manifest)
manifest:
  - src/app/(admin)/admin/items/page.tsx
  - src/app/(admin)/admin/components/page.tsx
  - src/app/(admin)/admin/suppliers/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/102-admin-per-row-status-disable.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 errors (pre-existing warnings unrelated) · vitest 790/790.

## Remaining admin-feedback follow-up
INTER-002 (group-assign per-row saving indicator), INTER-004 (archive drawer
success banner on the 3 detail pages), INTER-011 (shared editBanner across tabs),
INTER-005 (assign-supplier drawer error path).

## Checklist
- [x] per-row disable on items + components + suppliers (table + mobile)
- [ ] Tom review / merge
