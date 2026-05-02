# Design — Middleware: return 401/403 JSON for `/api/*` instead of redirecting to /login

**Date:** 2026-05-02
**Owner:** portal (window2-portal-sandbox)
**Approved by:** Tom (interactive, 2026-05-02)
**Risk:** LOW — single file, ~15 LOC, defensive fallback already in place

## Problem

`src/middleware.ts:86-91` 307-redirects every unauthenticated request to `/login`, including `/api/*` calls.

When a Supabase access_token expires mid-session, the page-level `fetch('/api/production-plan?...')` follows the redirect transparently, receives the `/login` page as HTML (HTTP 200, `text/html`), then fails to JSON-parse it. The thrown `SyntaxError` is not a `FetchError`, so `usePlans.ts:27-39` defaults the error category to `"other"` and the page renders the generic copy "We couldn't load the production plan." — instead of the auth-aware copy "Your session expired. Sign in again." that the page already supports.

This affects **every API call in the portal**, not just `/planning/production-plan`. Reproduction:
```
$ curl -i -L https://gt-factory-os-portal.vercel.app/api/production-plan?from=2026-04-26&to=2026-05-02
HTTP/1.1 307 Temporary Redirect
Location: /login?...
→ followed → HTTP/1.1 200 OK
Content-Type: text/html
<!DOCTYPE html>...
```

## Change

In `src/middleware.ts`:
1. Add a small helper `isApiPath(pathname: string): boolean` returning `pathname.startsWith("/api/")`.
2. In the auth-failure branch (currently `:86-91`): if `isApiPath`, return `NextResponse.json({ error: "Not authenticated", code: "session_expired" }, { status: 401 })`. Otherwise keep the existing 307-to-login redirect.
3. In the role-gate forbidden branch (currently `:100-111`): if `isApiPath`, return `NextResponse.json({ error: "Forbidden", code: "role_forbidden" }, { status: 403 })`. Otherwise keep the existing 307-to-`/dashboard?forbidden=...` redirect.

## Why this is the right fix

- `usePlans.ts:27-39` already maps 401 → `category: "auth"` and 403 → `category: "permission"`.
- `production-plan/page.tsx:1756-1771` already renders correct copy for both: "Your session expired. Sign in again." with a Sign in link, and "You don't have permission to view this plan." with a Back-to-dashboard link.
- Every other proxy route under `src/app/api/**/route.ts` benefits automatically — the fix is symptomatic at the right layer (middleware), not per-route.

## Out of scope

- **`SessionProvider` refresh on 401.** When session expires, the header still shows the cached "Tom ADMIN" while the page shows "Your session expired." Cosmetic, not blocking. Separate tranche.
- Backend changes. Supabase changes. Page-level changes. None are needed.

## Edge cases

| Case | Old behavior | New behavior |
|---|---|---|
| Unauthenticated GET `/api/production-plan` | 307 → `/login` (then HTML 200 → JSON parse fail) | **401 JSON** |
| Unauthenticated GET `/dashboard` | 307 → `/login?redirectTo=/dashboard` | unchanged |
| Authenticated POST `/api/production-plan`, role=`viewer` (forbidden) | 307 → `/dashboard?forbidden=/api/...` (then HTML 200 → JSON parse fail) | **403 JSON** |
| Authenticated GET `/admin`, role=`operator` (forbidden) | 307 → `/dashboard?forbidden=/admin` | unchanged |
| `/api/auth/*` (already in `isPublicPath`) | passes through | unchanged |
| Dev-shim flow (`NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`) | bypass at `:78-80` | unchanged |
| `updateSupabaseSession` throws | try/catch fallback at `:114-122` lets request through | unchanged |

## Verification gates

1. `curl -i https://gt-factory-os-portal.vercel.app/api/production-plan?from=2026-04-26&to=2026-05-02`
   → expect HTTP `401`, `Content-Type: application/json`, body `{"error":"Not authenticated","code":"session_expired"}`
2. `curl -i https://gt-factory-os-portal.vercel.app/dashboard`
   → expect HTTP `307`, `Location: /login?redirectTo=/dashboard` (no regression on web pages)
3. After Supabase token expiry, refresh `/planning/production-plan` in the browser
   → expect "Your session expired. Sign in again." copy with Sign in button (not the generic "We couldn't load the production plan.")
4. Existing portal smoke flows (Goods Receipt form, dashboard) keep working when authenticated
5. If `middleware.test.ts` exists, run it; otherwise smokes 1–3 are sufficient for a change of this size

## Rollback

`git revert <commit>`. The change is a single self-contained commit on `window2-portal-sandbox/main`.

## Effort

~30 minutes: edit, push, smokes 1–3.
