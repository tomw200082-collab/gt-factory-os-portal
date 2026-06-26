# Tranche 101: admin master-data save feedback (success confirmation + visible errors)

status: in-progress
created: 2026-06-26
scorecard_target_category: admin_superuser_depth
expected_delta: 0 (feedback completeness — operator confidence on a data-entry surface)
sizing: XS (2 files; no backend)
source: /portal-audit interaction-design-specialist on admin master-data (2026-06-26)

## Why
On the admin master-data detail pages, inline field saves told the operator
"Saving…" and showed errors, but rendered **nothing on success** — after a save
the field silently returned to read mode with no "Saved" confirmation, so the
operator couldn't be sure the change persisted. One error was also tooltip-only.

## Landed (verified against code)
- **INTER-003** — `/admin/masters/items/[item_id]`: the inline-save `role="status"`
  aria-live region had `isPending`/`isError` branches but no success branch. Added
  `itemFieldMutation.isSuccess → "Saved"` (text-success-fg).
- **INTER-008** — `/admin/masters/suppliers/[supplier_id]`: the field-save
  feedback `<p>` rendered only on `isError || isPending`. Extended to include
  `isSuccess → "Saved"` with the right tone.
- **INTER-009** — same supplier page, `CostEditCell`: the save error was shown as
  `Error saving` with the real message only in a `title=` tooltip (inaccessible on
  touch / to screen readers). Now renders the actual error message as visible
  text.

## Scope (manifest)
manifest:
  - src/app/(admin)/admin/masters/items/[item_id]/page.tsx
  - src/app/(admin)/admin/masters/suppliers/[supplier_id]/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/101-admin-save-feedback.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 errors (pre-existing exhaustive-deps warnings unrelated) ·
  vitest 790/790.
- `text-success-fg` is an existing token (tailwind.config.ts + globals.css),
  already used by the component detail editBanner — no ghost token introduced.

## Remaining admin-feedback follow-up
- INTER-001 (status toggle disables ALL rows — per-row `pendingIds`), INTER-002
  (group-assign per-row saving indicator), INTER-004 (archive drawer success
  banner on the 3 detail pages), INTER-011 (shared editBanner leaks across tabs),
  INTER-005 (assign-supplier drawer error path — needs drawer-internal check).

## Checklist
- [x] item + supplier inline-save success confirmation · cost-edit visible error
- [ ] Tom review / merge · follow-up: remaining admin-feedback items
