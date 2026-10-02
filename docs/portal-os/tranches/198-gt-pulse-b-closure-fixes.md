# Tranche 198 — GT Pulse Unit B: closure fixes

**Status:** in progress on `claude/gt-pulse-b-closure-fixes`.
**Origin:** The Unit B closure page, approved by Tom on 2026-10-02 ("מאשר הכל"), section C.

## Change

- **The decision names the holder it saw.** A link or merge posts `expected_holder`: the org the card showed holding the customer, or `null` when it showed none. It is left out when the API did not say. The backend (gt-factory-os #341) refuses with `SALES_IDENTITY_HOLDER_CHANGED` when the holder differs at write time, and the card says so in Hebrew. A merge is irreversible, so it is now checked on the server and not only on screen.
- **Dev-shim guard.** `proxyRequest` ignores `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` when `VERCEL_ENV` is `production`. If the flag were set there by mistake, a request with no session gets a 401 instead of acting as the shim's fixed admin.

## Manifest

manifest:
  - docs/portal-os/tranches/198-gt-pulse-b-closure-fixes.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_components/org/IdentityReview.tsx
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/lib/api-proxy.ts
  - tests/unit/sales/identity-review.test.tsx
  - tests/unit/api-proxy-dev-shim.test.ts

## Gates

- Red-first unit tests: holder posted (an org, or null), the Hebrew refusal, and the shim ignored in production while still serving a local run.
- vitest, typecheck, lint, and `sales-orgs.spec`.

## Rollback

Revert the merge commit. The backend field is optional, so either side can be reverted alone.
