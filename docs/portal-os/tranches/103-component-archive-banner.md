# Tranche 103: component-detail archive success banner

status: in-progress
created: 2026-06-26
scorecard_target_category: admin_superuser_depth
expected_delta: 0 (feedback completeness)
sizing: XS (1 file; no backend)
source: /portal-audit interaction-design-specialist INTER-004 (2026-06-26)

## Why
After archiving/restoring a component on `/admin/masters/components/[component_id]`,
the confirm drawer closed and queries invalidated, but no success banner appeared
— the only signal was the status badge re-rendering, easily missed. The page
already owns an `editBanner` used by every other mutation on it, so the status
mutation was simply not wired to it.

## Landed
- `statusMutation.onSuccess` now also sets `editBanner` ("Component deactivated."
  / "Component reactivated.", derived from `variables.newStatus`), matching the
  page's existing field-edit / promote banners.

## Scope (manifest)
manifest:
  - src/app/(admin)/admin/masters/components/[component_id]/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/103-component-archive-banner.md
  - docs/portal-os/tranches/_active.txt

## Scope note (why components only)
The component detail page has a shared `editBanner` — a clean 1-line wire. The
ITEM and SUPPLIER detail pages have NO page-level banner state (only their
per-field aria-live regions), so giving them the same archive feedback needs a
new banner element placed in the header — deferred to a follow-up to keep this
tranche clean and single-file. INTER-011 (editBanner leaking across tabs) was
also deferred: the active tab is URL-derived via a shared component, so a clean
fix needs `useSearchParams` here (Next 15 Suspense considerations) — not worth
the risk for a P2 in this tranche.

## Verification
- tsc 0 · eslint 0 errors · vitest 790/790.

## Checklist
- [x] component archive/restore success banner wired to existing editBanner
- [ ] Tom review / merge · follow-up: item + supplier archive banners, INTER-011
