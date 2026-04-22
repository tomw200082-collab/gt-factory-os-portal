# Tranche 001: bootstrap-truthfulness

status: proposed
created: 2026-04-22
scorecard_target_category: nav_integrity + data_truthfulness
expected_delta: +8 total (nav_integrity 3→6, data_truthfulness 5→8, admin_superuser_depth 3→4, regression_resistance 3→4)
sizing: M (5 files)

## Why this tranche
The baseline audit showed the OS's own truth files disagree with `src/` on six routes and one surface is actively fabricating state — regression-sentinel and scorecard cannot do their jobs until the manifest matches code and `/admin/integrations` stops lying. This tranche is pure "read-with-a-pen": it aligns route-manifest paths to reality, removes quarantined admin shells from primary nav, replaces the INTEGRATIONS fabrication with an honest `QuarantinedPage`, paraphrases the api-proxy forbidden-string comment, and gates the "FAKE SESSION" topbar pill behind the dev-shim env flag. No new product surface; just pruning.

## Scope
- Correct route-manifest paths for the 4 /ops/stock/* operator routes (currently declared as `/ops/stock/*`, code lives at `/stock/*`).
- Reclassify route-manifest status for `/admin/jobs` and `/admin/users` from `live` to `quarantined` (they render QuarantinedPage).
- Reclassify route-manifest status for `/admin/integrations` from `live` to `quarantined` (surface is fabricated; real health endpoint deferred).
- Add manifest rows for `/inbox` (live, inbox group, viewer+) and `/admin/products/[item_id]` (legacy redirect target).
- Replace the INTEGRATIONS fabrication at `src/app/(admin)/admin/integrations/page.tsx` with `<QuarantinedPage>` pointing at live modules.
- Remove `/admin/jobs`, `/admin/users`, and `/admin/integrations` entries from SideNav (`src/lib/nav/manifest.ts`) since they are now all quarantined.
- Paraphrase the forbidden-string comment at `src/lib/api-proxy.ts:14` so the literal tokens `X-Fake-Session` / `X-Test-Session` no longer appear in src/.
- Gate the "FAKE SESSION" pill at `src/components/layout/TopBar.tsx:74-118` behind `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true"` so it cannot leak to production.

## Manifest (files that may be touched)
manifest:
  - docs/portal-os/route-manifest.json
  - src/app/(admin)/admin/integrations/page.tsx
  - src/lib/nav/manifest.ts
  - src/lib/api-proxy.ts
  - src/components/layout/TopBar.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Freezing `baseline.json` from this audit (requires a separate `kind=baseline-update` ritual — Tranche 002 candidate).
- Populating `quarantine.json.entries[]` with pending-cleanup for the `FakeSession`/`fakeAuth` identifier vestiges (requires a separate `kind=quarantine-update` ritual — Tranche 003 candidate).
- Renaming `FakeSession` → `Session` and `isFakeAuthEnabled` → `isDevShimAuthEnabled` across `src/lib/auth/*` (architecturally larger; defer until quarantine seed lands).
- Building detail pages for `/admin/items/[id]`, `/admin/components/[id]`, `/admin/suppliers/[id]` (Tranche 004 candidate).
- Building `/stock/submissions` read-back and unified inbox listing (Tranche 005 + 006 candidates).
- Wiring Physical Count Cancel to `/api/physical-count/[id]/cancel` (Tranche 007 candidate).
- Deleting stale `tests/e2e/goods-receipt-success.spec.ts` and stale `quarantine.json._todo_after_bootstrap[1]`.

## Tests / verification
- typecheck clean (`npx tsc --noEmit`).
- vitest: full unit suite clean (no unit tests are expected to change in scope).
- playwright: spot-check operator login → SideNav does not show jobs/users/integrations; `/admin/integrations` renders QuarantinedPage; TopBar pill is absent when `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` is unset. Specific spec: `tests/e2e/nav-admin-quarantine.spec.ts` (add a lightweight spec if none exists; else extend an existing smoke).
- regression-sentinel: no new `/src/` forbidden-string hits; manifest routes reconcile against `src/app/**/page.tsx` with zero drift for the 4 corrected paths.
- `grep -rn 'X-Fake-Session\|X-Test-Session' src/` returns 0.

## Exit evidence
- Screenshot of SideNav without jobs/users/integrations links.
- Screenshot of `/admin/integrations` rendering `<QuarantinedPage>`.
- `docs/portal-os/scorecard.md` regenerated with expected deltas.
- PR link.

## Rollback
Revert the single tranche commit on `claude/audit-all-VuctU`; no data-layer changes and no new API routes, so revert is clean.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 001` on the PR)

## Actual evidence (filled in by /portal-tranche-fix run)
