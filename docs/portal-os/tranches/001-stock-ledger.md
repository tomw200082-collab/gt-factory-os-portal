# Tranche 001: stock-ledger read-only surface

status: blocked-pending-backend-probe
created: 2026-04-22
scorecard_target_category: ops_surface
expected_delta: +2 on ops_surface, +1 on data_truthfulness
sizing: M  (8 files in manifest)

## Why this tranche

The portal exposes four write-time stock surfaces (receipts, waste, count, production) but has no read-time surface. Operators and planners cannot see current on-hand inventory, cannot trace a submission into the ledger, and cannot audit historical movements without pulling from the backend DB directly. This tranche adds a read-only `/stock/ledger` page with Tabs (Inventory + Log) accessible to all roles (viewer / operator / planner / admin), wired exclusively to backend GET endpoints — zero mutations, zero backend contract authorship (W2 boundary respected per CLAUDE.md).

## Scope

- One URL: `/stock/ledger` served from a new `(stock-read)` route group.
- Two Tabs in a single page: `inventory` (on-hand + valuation at std_cost) and `log` (ledger movements with filters).
- Two GET proxies: `/api/stock/ledger`, `/api/stock/on-hand` using existing `proxyRequest()` pattern.
- Zod contracts mirroring backend response shape (shape to be captured in Step 0 probe).
- Nav entry in the Stock group under `stock:read` capability.

## Preflight blocker (Step 0) — **must clear before edit phase begins**

Planned probe:
```
GET https://gt-factory-os-api-production.up.railway.app/api/v1/queries/stock-ledger?limit=1
GET https://gt-factory-os-api-production.up.railway.app/api/v1/queries/stock-on-hand?limit=1
```

Probe result from Claude's sandbox (2026-04-22): **blocked**. All endpoints return `HTTP 403 "Host not in allowlist"` — including endpoints known to exist (`/api/v1/queries/items`). This is a network-level allowlist, not an endpoint-existence signal.

Required action from a permitted host (Tom's dev machine or CI) before continuing:

1. Run both probes while logged in (Supabase cookie) OR from an allowlisted host with a valid bearer.
2. Expected outcomes:
   - **200** with JSON body → capture the shape into `docs/portal-os/runtime_ready.snapshot.json` under keys `stock_ledger` and `stock_on_hand`, mode `A`. Proceed with edit phase.
   - **404 / "route not found"** → endpoint missing. This tranche pivots to a W1/W4 backend request. Update this file to `status: waiting-on-backend`, open a note in `docs/portal-os/readiness/` describing the contract needed, and halt.
   - **401 "unauthorized"** → endpoint exists but auth must be fixed first. Rerun with a real session.

Paste the literal response envelopes into a comment on the tranche PR; `/portal-tranche-fix 001` will read them and proceed.

## Manifest (files that may be touched)

manifest:
  - src/app/(stock-read)/layout.tsx
  - src/app/(stock-read)/stock/ledger/page.tsx
  - src/app/api/stock/ledger/route.ts
  - src/app/api/stock/on-hand/route.ts
  - src/lib/contracts/stock-ledger.ts
  - src/components/stock/StockLedgerTabs.tsx
  - src/components/stock/StockLedgerViews.tsx
  - src/lib/nav/manifest.ts

Always-allowed edits not counted in manifest (per `.claude/hooks/pre_tool_use.sh`):
  - docs/portal-os/route-manifest.json  (add `/stock/ledger` entry)
  - docs/portal-os/runtime_ready.snapshot.json  (create + populate from Step 0)
  - docs/portal-os/tranches/001-stock-ledger.md  (this file)
  - docs/portal-os/tranches/_active.txt
  - tests/unit/stock-ledger-schema.test.ts
  - tests/unit/stock-ledger-valuation.test.ts
  - tests/e2e/stock-ledger-viewer-readonly.spec.ts
  - tests/e2e/stock-ledger-operator.spec.ts

## Revive directives

None. `quarantine.json.entries` is empty; no prior implementation to revive (confirmed via `git log --all --oneline -- '*ledger*' '*inventory*'` — no matches).

## Out-of-scope (explicit)

- Shopify monthly-avg-price integration (backend W1/W4).
- Green Invoice webhook ingestion (backend W1/W4).
- Price-change approval inbox type (portal, but requires inbox substrate; separate tranche).
- BOM cost rollup / COGS (backend rollup job).
- RTL / Hebrew root-layout migration (cross-cutting; separate substrate tranche).
- Ledger row editing or reversal (`stock:execute+override`; separate tranche).
- `/stock/submissions` consolidation — remains in Tranche F scope per `src/lib/nav/manifest.ts:131` comment.

## Tests / verification

- typecheck: `pnpm tsc --noEmit` clean.
- vitest: `pnpm vitest run tests/unit/stock-ledger-*` green (schemas, valuation math).
- playwright: `pnpm playwright test tests/e2e/stock-ledger-*` green on viewer + operator personas.
- regression-sentinel: `/portal-regression-guard` reports no baseline drift.
- manual smoke: viewer reaches `/stock/ledger`, both Tabs render real data from proxy, URL `?tab=` round-trips, filters apply, no 401/403/500 in network tab.

## Exit evidence

- Playwright trace for viewer flow attached to PR.
- Screenshot of Inventory tab (grouped RM/FG/PKG with std_cost × qty totals) and Log tab (filtered date range) attached to PR.
- `docs/portal-os/runtime_ready.snapshot.json` diff committed (Step 0 result).
- Scorecard delta ≥ +3 (+2 ops_surface, +1 data_truthfulness) recorded by `/portal-scorecard` after merge.
- PR link.

## Rollback

Revert the PR on main. No data-layer change, no migrations, no new persisted state — revert is clean.

## Operator approval

- [ ] Tom approves this plan and has run Step 0 probe from an allowlisted host (comment `@claude /portal-tranche-fix 001` on the PR with probe output pasted).

## Actual evidence (filled in by `/portal-tranche-fix 001` run)

_pending_
