# Tranche 197 — GT Pulse Unit B: keep a business as a lead

**Status:** in progress on `claude/gt-pulse-b-keep-as-lead`.
**Origin:** Tom, 2026-10-02 ("מאשר הכל"). Eight businesses in the identity review hold a Shopify account that never became a customer (`customer_not_verified`). A Shopify read on 2026-10-02 found that seven of them have no orders and one has a single order from 2021. Until now the review card was a dead end ("you can't decide from here"). The decision is: these are leads, not customers.
**Backend:** gt-factory-os `resolveIdentity` accepts `reject` for `customer_not_verified`. It unlinks the account and closes the task. It keeps no rejection, so an account that later buys can link again.

## Change

- A `customer_not_verified` card explains the situation and offers one action, "לא לקוח, להשאיר כליד". A confirmation names the business and says what happens to it. The call is `{ action: "reject" }`, and on success a toast says the business stays a lead.
- Cards that still can't be decided from the portal keep the blocked banner.
- **CI fix, journey A.** The first click into a business waited 5s for the URL. Under `next dev` that first entry compiles the workspace route, and on the CI runner it took longer. Reproduced pinned to one core: 5s fails and 30s passes, with the same click. The wait on that one entry is now 30s. Production serves a prebuilt route.

## Manifest

manifest:
  - docs/portal-os/tranches/197-gt-pulse-b-keep-as-lead.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_components/org/IdentityReview.tsx
  - src/app/(sales)/_lib/labels.ts
  - tests/unit/sales/identity-review.test.tsx
  - tests/e2e/sales-orgs.spec.ts

## Gates

- A unit test that fails first: the card offers the action, confirms it, posts `reject` and shows the toast.
- vitest, typecheck, lint, and `sales-orgs.spec`.

## Rollback

Revert the merge commit. The backend change is independent; without the portal action, the cards fall back to the blocked banner.
