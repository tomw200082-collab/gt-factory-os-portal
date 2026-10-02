# Tranche 189 — GT Pulse Unit B: the business list, its routes and search

**Status:** built on `claude/gt-pulse-b-portal`; ships in one release PR with tranches 190 and 191.
**Origin:** Unit B spec v2 (Sales-Machine `docs/superpowers/specs/2026-10-01-gt-pulse-b-design.md` §3.8, §3.10; Tom "מאשר הכל" 2026-10-01). The portal design and copy are delegated to the executor by Tom's Session 2 masterprompt of 2026-10-02 (§1). Portal design: Sales-Machine `docs/superpowers/specs/2026-10-02-gt-pulse-b-portal-design.md` §3.1, §3.8.
**Backend:** gt-factory-os `main` `893b3701` (the org routes, live since 2026-10-02). No backend change.
**Scope:**
- Proxies for every Unit B route, so tranches 190 and 191 add none.
- The paged business list on `/api/v1/queries/sales/orgs/page`: server-side filter, sort and cursor, a correct total, three distinct empty states, and server search through `/orgs/search`.
- Bulk owner assignment for managers (one transaction, T9).
- The command palette searches businesses through `/orgs/search` and opens `/sales/orgs/[id]`.
- The legacy org drawer (`OrgCard`), `useOrgs` and the snapshot-era `OrgRow` are removed. `orgs.test.tsx` is replaced: this is the D8 carve-out for the snapshot word "נטש" named in the build plan Task 24.

## Copy register (executor, under Tom's 2026-10-02 delegation)

Recorded in `src/app/(sales)/_lib/labels.ts` under the `// Unit B` keys: `ORG_FILTER_LABELS`, `ORG_SORT_LABELS`, `UI.orgsShowing`, `UI.orgsCount`, `UI.orgsFilterEmpty`, `UI.orgsShowAll`, `UI.orgOpenLead`, `UI.orgOwner`, `UI.orgNoOwner`, `UI.orgLastOrder`, `UI.orgNoOrders`, `UI.orgValue12m`, `UI.exVat`, `UI.orgsSelect`, `UI.orgsSelectDone`, `UI.selectOrgNamed`, `UI.ownerAssign`, `UI.ownerAssigned`, `UI.ownerPick`, `UI.ownerFailed`, `UI.ownerTooMany`, `UI.ownerPickPlaceholder`, `UI.orgsSearch`, `UI.showMoreOrgs`, `UI.reviewQueueLink`, `UI.sortLabel`, `UI.filterLabel`, and the badge words in `ORG_STATE_LABELS`.

## Manifest (every path this tranche may touch)

manifest:
  - docs/portal-os/tranches/189-gt-pulse-b-org-list.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/api/sales/orgs/route.ts
  - src/app/api/sales/orgs/page/route.ts
  - src/app/api/sales/orgs/search/route.ts
  - src/app/api/sales/orgs/owner/route.ts
  - src/app/api/sales/orgs/[id]/route.ts
  - src/app/api/sales/orgs/[id]/orders/route.ts
  - src/app/api/sales/orgs/[id]/orders/[gid]/route.ts
  - src/app/api/sales/orgs/[id]/river/route.ts
  - src/app/api/sales/orgs/[id]/contacts/route.ts
  - src/app/api/sales/orgs/[id]/circle/route.ts
  - src/app/api/sales/orgs/[id]/identity/route.ts
  - src/app/api/sales/identity-review/route.ts
  - src/app/api/sales/contacts/[id]/[action]/route.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/format.ts
  - src/app/(sales)/_lib/useDebounced.ts
  - src/app/(sales)/_components/EmptyStates.tsx
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/OrgList.tsx
  - src/app/(sales)/_components/OrgCard.tsx
  - src/app/(sales)/_components/OrgStateBadge.tsx
  - src/app/(sales)/_components/BulkOwnerBar.tsx
  - src/app/(sales)/_components/CommandK.tsx
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/sales/orgs/page.tsx
  - tests/unit/sales/orgs.test.tsx
  - tests/unit/sales/command-k.test.tsx
  - tests/unit/sales/sales-shell.test.tsx
  - tests/unit/sales/api-stubs.test.ts
  - tests/unit/sales/sales-tokens.test.ts

## Gates

- Red first: the list's request, paging, empty states, row links; the palette's search endpoint.
- Typecheck, lint, vitest, build; mocked sales e2e.
- No horizontal overflow at 320/390/430/1280.

## Rollback

Revert the release merge commit. Presentation only; the backend routes stay as they are.
