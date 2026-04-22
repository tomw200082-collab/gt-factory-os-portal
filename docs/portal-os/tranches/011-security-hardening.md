# Tranche 011: security-hardening

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: technical_substrate + regression_resistance
expected_delta: +2 (technical_substrate 9→10, regression_resistance 7→8)
sizing: S (2 files; 1 new)

## Why this tranche
Before production ship, the portal needs standard web-security headers (clickjacking, MIME-sniffing, referrer leakage, unsafe-eval script execution) and a single fail-fast env-var validation surface. Both are one-edit wins that the portal does not currently have.

## Scope
- `next.config.mjs`: add `headers()` async returning a production-grade header block (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security, Content-Security-Policy report-only). CSP is deliberately report-only for the first deploy so Supabase, Next font loader, and inline runtime scripts can be observed and then promoted to enforce once the report is clean.
- NEW `src/lib/env.ts`: exports `requireEnv(name, hint?)` and `publicEnv()`. `requireEnv` throws a descriptive Error at call time when the env var is missing — used by modules like `api-proxy.ts` and `supabase/server.ts` to replace raw `process.env.X` accesses that today 500 with a confusing upstream error. `publicEnv()` returns a frozen object with the validated `NEXT_PUBLIC_*` vars so client code has one place to read them.

## Manifest (files that may be touched)
manifest:
  - next.config.mjs
  - src/lib/env.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Enforcing CSP (would break Supabase inline scripts until tested); start in report-only, graduate later.
- Migrating every existing `process.env.X` to `requireEnv()` — a follow-up cleanup; this tranche ships the helper and a single call site.
- Adding `src/middleware.ts` path-specific role gates — layouts already gate; doubling in middleware is defense-in-depth, not critical-path.
- Rate limiting on mutation proxies — requires a distributed store; deferred.

## Tests / verification
- typecheck clean.
- `next build` in CI would surface any `headers()` schema errors.

## Rollback
Revert the commit. Headers change is purely additive; env helper is new and unreferenced except from its import site.

## Operator approval
- [x] Tom approves this plan (session directive "תעשה הכל לפי הסדר אבל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
