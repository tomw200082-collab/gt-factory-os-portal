# Tranche 191 — GT Pulse Unit B: the business circle and the manager's identity review

**Status:** built on `claude/gt-pulse-b-portal`; ships in one release PR with tranches 189 and 190.
**Origin:** Unit B spec v2 §3.6, §3.8, §3.10 (Tom "מאשר הכל" 2026-10-01), build plan Task 26. Design delegated to the executor by Tom's Session 2 masterprompt of 2026-10-02. Portal design: Sales-Machine `docs/superpowers/specs/2026-10-02-gt-pulse-b-portal-design.md` §2 (F1, F2), §3.3, §3.6.
**Backend:** gt-factory-os `main` `893b3701`. No backend change.
**Scope:**
- **The two-year business circle.**
  - The outer ring is the last 12 calendar months and the inner ring the 12 before (Asia/Jerusalem).
  - Each month is a named, keyboard-reachable target.
  - Marks: filled for an order or a refund, hollow for a cancellation, amber for an open draft. Open drafts come from `river.pending_drafts`, never from `circle.drafts` (F1).
  - The centre shows the last order and days since. For a chain moved to a distributor it shows the move and no days since.
  - Below 360px a grid of 24 month buttons replaces the ring.
  - Reduced motion leaves no animation.
- **A month sheet:** that month's orders, each one opening its lines.
- **`/sales/orgs/review` (managers):**
  - The coverage line.
  - One card per org: its reasons in plain Hebrew and its candidates side by side, labelled as evidence.
  - Only the actions the API accepts for those reasons, each behind a confirmation that says what will change. `customer_not_verified` is shown with no dead button (F2).
  - Unresolved mirror exceptions.
- No real identity decision is taken: mutations are exercised on synthetic fixtures only.
- Rendered-check fix: a date that follows a Latin word ("Shopify ·", "GT ·", a Latin name) is isolated in `<bdi>`, because the run reordered on screen.

## Copy register (executor, under Tom's 2026-10-02 delegation)

`ORG_UI` circle, month and review keys in `src/app/(sales)/_lib/labels.ts`, plus `RULE_MESSAGES` for the `SALES_IDENTITY_*` and `SALES_ORG_*` codes.

## Manifest

manifest:
  - docs/portal-os/tranches/191-gt-pulse-b-circle-review.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/ring.ts
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/org/BusinessCircle.tsx
  - src/app/(sales)/_components/org/MonthSheet.tsx
  - src/app/(sales)/_components/org/IdentityReview.tsx
  - src/app/(sales)/_components/org/OrgWorkspace.tsx
  - src/app/(sales)/_components/org/ContactsList.tsx
  - src/app/(sales)/_components/org/OrderSheet.tsx
  - src/app/(sales)/sales/orgs/[id]/page.tsx
  - src/app/(sales)/sales/orgs/review/page.tsx
  - src/app/(sales)/sales/orgs/review/layout.tsx
  - tests/unit/sales/ring.test.ts
  - tests/unit/sales/business-circle.test.tsx
  - tests/unit/sales/identity-review.test.tsx

## Gates

- Red first: ring geometry and month order, F1, the moved centre, the grid fallback, named targets, reduced motion, the review's per-reason actions and the confirmation before a write.
- Typecheck, lint, vitest, build; mocked sales e2e at 320/360/390/430/1280.

## Rollback

Revert the release merge commit. Presentation only.
