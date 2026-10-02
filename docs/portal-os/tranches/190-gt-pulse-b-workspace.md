# Tranche 190 — GT Pulse Unit B: the business workspace

**Status:** built on `claude/gt-pulse-b-portal`; ships in one release PR with tranches 189 and 191.
**Origin:** Unit B spec v2 §3.8, §3.10 (Tom "מאשר הכל" 2026-10-01), build plan Task 25. Design and copy are delegated to the executor by Tom's Session 2 masterprompt of 2026-10-02. Portal design: Sales-Machine `docs/superpowers/specs/2026-10-02-gt-pulse-b-portal-design.md` §2, §3.2, §3.4, §3.5, §3.7, §4.
**Backend:** gt-factory-os `main` `893b3701`. No backend change.
**Scope:**
- `/sales/orgs/[id]`, a full route, replaces the old 448px drawer.
- First viewport at 390px: header, next action, primary verified contact, summary.
- Below it: the river, the contacts and the org's leads.
- One source sheet and one order sheet.
- Designed states: loading, error, 403, 404, retired and merged, review, stale, unverified, prospect.
- Managers verify or reject a contact that awaits review.
- The lead card links to its business.
- The floating quick-add stays off a business page, where it covered the contact buttons.
- **Fix found in the rendered check:** inside the petrol band `--s-fg` is the band's light ink, so text typed into a band field (the Leads and Businesses search, the sort select) rendered at about 1:1 on white. `--s-field-fg` resolves the ink before the band remaps it. This also fixes the Unit A Leads search.

## Truth rules this tranche enforces

- Nothing derived from Shopify shows unless the link is verified (gate 4) and history is published. "Unavailable" never renders as "0".
- Stale history is shown under a stale banner, never as current.
- Every money value says "לפני מע״מ"; its source sheet says Shopify, customer price.
- An unverified contact renders no `tel:`, `wa.me` or `mailto:` link, even when a value exists.
- The next action is real task or promise state only (design §2 F4).
- A 403 shows the same words whether the org is missing or not this rep's.

## Copy register (executor, under Tom's 2026-10-02 delegation)

In `src/app/(sales)/_lib/labels.ts`: `RIVER_EVENT_LABELS` (every lead_event and org_event type), `ORDER_CLASS_LABELS`, `DRAFT_STATUS_LABELS`, `RIVER_CHIP_LABELS`, `CONTACT_KIND_LABELS`, `CONTACT_SOURCE_LABELS`, `IDENTITY_REASON_LABELS`, and the `ORG_UI` workspace keys.

## Manifest

manifest:
  - docs/portal-os/tranches/190-gt-pulse-b-workspace.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/_lib/format.ts
  - src/app/(sales)/_lib/orgTruth.ts
  - src/app/(sales)/_lib/nextAction.ts
  - src/app/(sales)/_lib/israelTime.ts
  - src/app/(sales)/_lib/israelTime.test.ts
  - src/app/(sales)/_lib/useAutoClear.ts
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/sales/orgs/page.tsx
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/LeadDrawer.tsx
  - src/app/(sales)/_components/EventTimeline.tsx
  - src/app/(sales)/_components/org/Sheet.tsx
  - src/app/(sales)/_components/org/SourceSheet.tsx
  - src/app/(sales)/_components/org/OrderSheet.tsx
  - src/app/(sales)/_components/org/OrgHeader.tsx
  - src/app/(sales)/_components/org/NextAction.tsx
  - src/app/(sales)/_components/org/PrimaryContact.tsx
  - src/app/(sales)/_components/org/OrgSummary.tsx
  - src/app/(sales)/_components/org/ContactsList.tsx
  - src/app/(sales)/_components/org/OrderRiver.tsx
  - src/app/(sales)/_components/org/OrgLeads.tsx
  - src/app/(sales)/_components/org/OrgStates.tsx
  - src/app/(sales)/_components/org/OrgWorkspace.tsx
  - src/app/(sales)/sales/orgs/[id]/page.tsx
  - src/app/(sales)/sales/orgs/[id]/layout.tsx
  - tests/unit/sales/org-labels.test.ts
  - tests/unit/sales/org-truth.test.ts
  - tests/unit/sales/next-action.test.ts
  - tests/unit/sales/org-workspace.test.tsx
  - tests/unit/sales/_orgFixtures.ts
  - tests/unit/sales/leads.test.tsx
  - tests/unit/sales/sales-shell.test.tsx
  - tests/unit/sales/sales-tokens.test.ts

## Gates

- Red first: label completeness, the truth table, next-action selection, workspace states, contact links, money basis.
- Typecheck, lint, vitest, build; mocked sales e2e.
- No horizontal overflow at 320/390/430/1280 with a 64-character name, ten contacts, twelve unverified rows and 300 river items.

## Rollback

Revert the release merge commit. Presentation only.
