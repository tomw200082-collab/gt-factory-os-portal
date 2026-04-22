# Tranche 019: bulletproof-root

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: regression_resistance
expected_delta: +0 (usability/resilience; already high)
sizing: XS (2 files, all subtractive or protective)

## Why this tranche
Tranche 018 added a public landing at `/`, but user still reports the preview URL won't open. Three possible runtime failure modes remain:

1. Middleware throws (Supabase client instantiation, network to Supabase, etc.) → every path 500s.
2. Root page is marked `force-dynamic` → runs through Node SSR on every request → any Node-level failure breaks it.
3. Middleware matcher includes `/` → middleware runs before landing page → same failure mode as #1.

This tranche closes all three:

- Root page becomes **pure static** (remove `force-dynamic`; env vars baked at build time).
- Middleware matcher **excludes `/`** so the landing page is served directly by the edge with zero middleware involvement.
- Middleware body is wrapped in **try/catch** so any internal error (Supabase timeout, env issue, unexpected throw) falls through to `NextResponse.next()` instead of returning 500.

After this tranche, if the URL still doesn't render, the failure is **categorically outside the application**: Vercel Deployment Protection, DNS, or network. That is a single dashboard toggle the operator flips — no further code work can help.

## Scope
- `src/app/page.tsx`: remove `export const dynamic = "force-dynamic"` so the root landing is fully static.
- `src/middleware.ts`: (a) exclude `/$` from the matcher; (b) wrap the middleware body in try/catch; on any exception, log to stderr and return `NextResponse.next({ request })` so the user still gets the underlying page.

## Manifest (files that may be touched)
manifest:
  - src/app/page.tsx
  - src/middleware.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Vercel Deployment Protection is a Vercel-dashboard setting; cannot be changed from code.
- Vercel preview env var scope is also dashboard-only.
- Changing where Supabase env vars live.

## Tests / verification
- typecheck clean.
- `npm run build` shows `/` as `○` (static) instead of `ƒ` (dynamic).
- Middleware bundle size roughly unchanged.

## Rollback
Revert the single tranche commit.

## Operator approval
- [x] Tom approves (session directive 2026-04-22: "אני לא מבין איך לעשות את זה. תבדוק את זה בשבילי" + "אני עדיין לא מצליח").

## Actual evidence
Filled in post-land.
