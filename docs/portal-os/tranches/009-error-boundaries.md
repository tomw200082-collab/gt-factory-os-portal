# Tranche 009: error-boundaries-and-observability

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: technical_substrate + regression_resistance
expected_delta: +2 (technical_substrate 8→9, regression_resistance 6→7)
sizing: S (4 new files)

## Why this tranche
The portal currently has **no error boundaries**. Any unhandled render exception in a client component crashes to a Next.js default red overlay in dev and to a blank white page in production, losing the operator's in-progress form state with no recovery path and no reporting. Before production ship, every operator page needs a user-friendly fallback with a "Try again" action and a structured error-reporting hook that can be pointed at Sentry/Datadog in a follow-up without touching product code.

## Scope
- `src/app/error.tsx` — segment-level error boundary. Catches errors in client components under any route group. Renders a calm fallback: short explanation, error digest for support, "Try again" button (calls Next.js `reset`), link back to /.
- `src/app/global-error.tsx` — root-level fallback that replaces the root layout when it crashes. Must render its own `<html>` + `<body>` per Next.js 15 contract.
- `src/app/not-found.tsx` — custom 404 that links to /dashboard and /exceptions.
- `src/lib/obs/report.ts` — `reportError(error, context?)` single exported function. Dev: `console.error` with a structured `{ error, context, user_agent, timestamp }` object. Prod: same shape emitted + placeholder branch for future Sentry forward (gated on `NEXT_PUBLIC_SENTRY_DSN`). Also exports `reportWarning(msg, context?)` for non-fatal signals.

## Manifest (files that may be touched)
manifest:
  - src/app/error.tsx
  - src/app/global-error.tsx
  - src/app/not-found.tsx
  - src/lib/obs/report.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Per-segment `error.tsx` files under `(ops)`, `(planning)`, `(admin)` — the single top-level `error.tsx` covers all of them; segment-specific recovery is an enhancement for later.
- Actual Sentry npm dep + instrumentation — deferred until an operator authorizes a dep add.
- Performance monitoring (web vitals, long-task reporting) — separate tranche.

## Tests / verification
- typecheck clean.
- Intentionally throwing in a page body triggers the error.tsx fallback in dev (manual check via `throw new Error("test")` temporarily planted and removed).

## Rollback
Revert the tranche commit; zero runtime behavior change to non-error paths.

## Operator approval
- [x] Tom approves this plan (session directive "תעשה הכל לפי הסדר אבל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
