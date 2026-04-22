# Tranche 017: deploy-unblock-dashboard-dynamic

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: regression_resistance
expected_delta: +0 (unblocks merge; already-counted in existing category evidence)
sizing: XS (1 file, 2 lines)

## Why this tranche
The Vercel preview deploy is failing with `Error occurred prerendering page "/dashboard"` → `Supabase env vars missing`. Root cause: `/dashboard` is an async server component that calls `createSupabaseServerClient()` at render time; Next.js attempts static-site generation of every page during build, which fails when Supabase env vars aren't available to the build step. Fix = tag the page `export const dynamic = "force-dynamic"` so it's skipped at SSG time and rendered per-request (which is correct anyway — it reads the per-user Supabase session).

This is a pure deploy-unblock. No product-logic change. Not included in Tranche 016 per the operator's explicit scope-lock; isolated here so it can land as a clean one-line patch.

## Scope
- `src/app/(shared)/dashboard/page.tsx` — add `export const dynamic = "force-dynamic";` near the top of the module.

## Manifest (files that may be touched)
manifest:
  - src/app/(shared)/dashboard/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Every other server component using `createSupabaseServerClient` — only `/dashboard` does today (verified via grep).
- Broader SSG strategy review.

## Tests / verification
- `npm run build` completes without the prerender error.
- `/dashboard` still renders for authenticated users (behavior unchanged at request time).

## Rollback
Revert the single line; deploy returns to its prior failing state.

## Operator approval
- [x] Tom approves this plan (session directive 2026-04-22: "ותסגור את בעיית דיפלוי" — explicit deploy-fix authorization).

## Actual evidence
Filled in post-land.
