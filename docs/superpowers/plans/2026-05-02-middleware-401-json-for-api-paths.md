# Middleware 401/403 JSON for `/api/*` Paths — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-02-middleware-401-json-for-api-paths-design.md`](../specs/2026-05-02-middleware-401-json-for-api-paths-design.md)

**Goal:** Stop the Next.js middleware from 307-redirecting unauthenticated `/api/*` calls to `/login` (which produces an HTML body that the page-level fetch fails to JSON-parse, falling into the generic "We couldn't load the production plan." copy). Return `401 JSON` for unauth `/api/*` and `403 JSON` for role-gate-forbidden `/api/*`. Web pages keep the existing 307 redirects.

**Architecture:** Single-file change in `src/middleware.ts`. Add a tiny `isApiPath(pathname)` helper. Branch the existing two redirect blocks: if path is API → return JSON with the right status; else → keep the existing redirect. Tests live in `tests/unit/middleware.test.ts` using vitest + Next.js `NextRequest` with mocked `updateSupabaseSession`.

**Tech Stack:** Next.js 15.5 middleware (`src/middleware.ts`), `@supabase/ssr`, vitest 2.1, happy-dom (already configured).

**Risk:** LOW. ~15 LOC change in one file. Existing behavior for web pages preserved. Defensive try/catch fallback already in middleware. Rollback = `git revert <commit>`.

**Out of scope (do not touch in this plan):**
- `SessionProvider` refresh-on-401 (cosmetic header lag — separate tranche)
- `src/lib/supabase/middleware.ts` `{response, session: null}` vs `{response, user}` return-shape inconsistency (pre-existing, unrelated bug — note in TODO, do not fix)
- Backend, Supabase, or page-level changes
- Production-plan page redesign (separate brainstorming track)

---

## File map

| Action | Path | Purpose |
|---|---|---|
| Modify | `src/middleware.ts` | Add `isApiPath` + branch the two redirect blocks |
| Create | `tests/unit/middleware.test.ts` | Five behavior tests covering API/web × auth/role-gate matrix |

---

## Task 1: Write failing middleware tests

**Files:**
- Create: `tests/unit/middleware.test.ts`

This test file mocks `@/lib/supabase/middleware` so the middleware can be exercised without a real Supabase backend. We construct `NextRequest` instances against contrived URLs and assert on the `NextResponse` shape.

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/middleware.test.ts` with:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock updateSupabaseSession before importing middleware. The mock returns
// either { user: null } (unauthenticated) or { user: { app_metadata: { role } } }
// (authenticated) based on the per-test override.
const mockUpdate = vi.fn();
vi.mock("@/lib/supabase/middleware", () => ({
  updateSupabaseSession: (req: NextRequest) => mockUpdate(req),
}));

// Force the dev-shim flag off so the prod auth path runs.
beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
  mockUpdate.mockReset();
});

async function run(pathname: string) {
  const { middleware } = await import("@/middleware");
  const req = new NextRequest(new URL(`https://portal.test${pathname}`));
  return middleware(req);
}

describe("middleware — auth gating", () => {
  it("unauthenticated /api/* → 401 JSON, not redirect", async () => {
    mockUpdate.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
    });
    const res = await run("/api/production-plan?from=2026-04-26&to=2026-05-02");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "Not authenticated",
      code: "session_expired",
    });
  });

  it("unauthenticated /dashboard → 307 redirect to /login (regression guard)", async () => {
    mockUpdate.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
    });
    const res = await run("/dashboard");
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fdashboard");
  });

  it("authenticated /api/admin with operator role → 403 JSON, not redirect", async () => {
    mockUpdate.mockResolvedValue({
      response: NextResponse.next(),
      user: { app_metadata: { role: "operator" } },
    });
    const res = await run("/api/admin/items");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "Forbidden",
      code: "role_forbidden",
    });
  });

  it("authenticated /admin (web) with operator role → 307 to /dashboard?forbidden (regression guard)", async () => {
    mockUpdate.mockResolvedValue({
      response: NextResponse.next(),
      user: { app_metadata: { role: "operator" } },
    });
    const res = await run("/admin/items");
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/dashboard");
    expect(location).toContain("forbidden=%2Fadmin");
  });

  it("authenticated /api/planning with admin role → passes through", async () => {
    const next = NextResponse.next();
    mockUpdate.mockResolvedValue({
      response: next,
      user: { app_metadata: { role: "admin" } },
    });
    const res = await run("/api/planning/runs");
    // Middleware returns the response from updateSupabaseSession on the happy path.
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /c/Users/tomw2/Projects/window2-portal-sandbox
pnpm vitest run tests/unit/middleware.test.ts
```

Expected: tests 1 and 3 FAIL — current middleware returns 307 redirects for both `/api/*` cases (where we're asserting 401 / 403 JSON). Tests 2, 4, 5 should PASS already (they assert current behavior we're keeping).

If all 5 fail, something else is wrong (mock setup, import path) — fix before proceeding.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/middleware.test.ts
git commit -m "test(middleware): add api-path 401/403 JSON behavior tests (failing)"
```

---

## Task 2: Implement the fix in `src/middleware.ts`

**Files:**
- Modify: `src/middleware.ts:1-133`

- [ ] **Step 1: Add the `isApiPath` helper and the two branched-response blocks**

Edit `src/middleware.ts`. The change has three parts: (a) a new helper near the existing `isPublicPath`, (b) branched return in the auth-failure block, (c) branched return in the role-gate forbidden block.

**Part A — add helper** (insert after `isPublicPath` at line 67):

```typescript
function isApiPath(pathname: string): boolean {
  // API routes return JSON, never HTML. Auth/role failures must surface
  // as 401/403 JSON so the page-level fetch hook can categorize them
  // correctly — a 307 redirect to /login would deliver login HTML to a
  // fetch() call that expects JSON, defeating error categorization.
  return pathname.startsWith("/api/");
}
```

**Part B — branch auth-failure block** (replace lines 86-91):

Old:
```typescript
    if (!user && !isPublicPath(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
```

New:
```typescript
    if (!user && !isPublicPath(pathname)) {
      if (isApiPath(pathname)) {
        return NextResponse.json(
          { error: "Not authenticated", code: "session_expired" },
          { status: 401 },
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
```

**Part C — branch role-gate forbidden block** (replace lines 104-109):

Old:
```typescript
        if (gate && !gate.allow.includes(role)) {
          const forbidden = request.nextUrl.clone();
          forbidden.pathname = "/dashboard";
          forbidden.searchParams.set("forbidden", pathname);
          return NextResponse.redirect(forbidden);
        }
```

New:
```typescript
        if (gate && !gate.allow.includes(role)) {
          if (isApiPath(pathname)) {
            return NextResponse.json(
              { error: "Forbidden", code: "role_forbidden" },
              { status: 403 },
            );
          }
          const forbidden = request.nextUrl.clone();
          forbidden.pathname = "/dashboard";
          forbidden.searchParams.set("forbidden", pathname);
          return NextResponse.redirect(forbidden);
        }
```

- [ ] **Step 2: Update the file header comment to reflect the new behavior**

In `src/middleware.ts:1-25`, replace the responsibility list to mention the API JSON path. Specifically update line 8 from:

Old: `// 2. Redirect unauthenticated requests for gated routes to /login.`

New:
```
// 2. Redirect unauthenticated requests for gated WEB routes to /login;
//    return 401 JSON for unauthenticated /api/* requests so page-level
//    fetch hooks can categorize the error correctly. (See
//    docs/superpowers/specs/2026-05-02-middleware-401-json-for-api-paths-design.md.)
```

- [ ] **Step 3: Run the tests — they must all pass now**

```bash
pnpm vitest run tests/unit/middleware.test.ts
```

Expected: all 5 tests PASS.

If any fail, do NOT increase timeouts or skip — read the failure, find the root cause, fix the implementation. The most likely failure mode is mock-shape drift (e.g. middleware reads a field the mock doesn't return).

- [ ] **Step 4: Run the full unit test suite to confirm no regression**

```bash
pnpm vitest run
```

Expected: all existing tests still pass. Middleware is imported transitively in some tests; fail loudly if shape changed.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit the fix**

```bash
git add src/middleware.ts tests/unit/middleware.test.ts
git commit -m "$(cat <<'EOF'
fix(middleware): return 401/403 JSON for /api/* instead of redirecting

When the Supabase session expires, middleware previously 307-redirected
every request — including /api/* — to /login. Browser fetch() follows
the redirect transparently, receives the login page as HTML 200, then
fails to JSON-parse it. The thrown SyntaxError is not a FetchError, so
usePlans (and every other page-level hook) defaults the error category
to 'other' and renders the generic "We couldn't load the …" copy
instead of the auth-aware "Your session expired. Sign in again." copy.

Now: /api/* paths return application/json with status 401 (unauth) or
403 (role-gate forbidden). Web routes keep the existing 307 redirects.
The cosmetic side-effect — SessionProvider still showing the cached
admin header after 401 — is left for a separate tranche.

Spec: docs/superpowers/specs/2026-05-02-middleware-401-json-for-api-paths-design.md
Plan: docs/superpowers/plans/2026-05-02-middleware-401-json-for-api-paths.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push to main**

```bash
git push origin main
```

This triggers a Vercel auto-deploy. Wait for the new deployment to be `Ready` before running smokes.

---

## Task 3: Smoke the deployed fix

**Goal:** confirm the live behavior matches the design contract.

- [ ] **Step 1: Wait for the new Vercel deploy**

```bash
cd /c/Users/tomw2/Projects/window2-portal-sandbox
vercel ls --prod | head -5
```

The newest deployment should be ≤2 minutes old and `● Ready`. If it's still `● Building`, wait and re-run.

- [ ] **Step 2: Smoke unauthenticated `/api/*` → 401 JSON**

```bash
curl -i --max-time 15 \
  "https://gt-factory-os-portal.vercel.app/api/production-plan?from=2026-04-26&to=2026-05-02"
```

Expected output:
```
HTTP/1.1 401
Content-Type: application/json
...
{"error":"Not authenticated","code":"session_expired"}
```

If you see `HTTP/1.1 307 Temporary Redirect` with `Location: /login?...`, the deploy did not pick up the change — re-check `vercel ls` and that the right commit is deployed.

- [ ] **Step 3: Smoke unauthenticated web page (regression guard) → 307 to /login**

```bash
curl -i --max-time 15 "https://gt-factory-os-portal.vercel.app/dashboard"
```

Expected:
```
HTTP/1.1 307 Temporary Redirect
Location: /login?redirectTo=%2Fdashboard
```

Web routes must still redirect — if you see 401 here, the `isApiPath` branch is too greedy.

- [ ] **Step 4: Smoke `/api/auth/*` (must remain public)**

```bash
curl -i --max-time 15 "https://gt-factory-os-portal.vercel.app/api/auth/callback"
```

Expected: NOT a 401. The `isPublicPath` rule for `/api/auth` runs before the `isApiPath` branch. Acceptable status: 200, 302, 400, 404 (depending on what `/auth/callback` does without code params) — anything except 401.

---

## Task 4: Browser verification — production-plan page renders auth-aware copy

**Goal:** confirm Tom's reported user-visible bug is gone.

- [ ] **Step 1: Tom — sign out completely**

In the portal, click the user avatar → Sign out. Verify URL is `/login`.

- [ ] **Step 2: Tom — open `/planning/production-plan` while signed out (deep-link)**

Visit `https://gt-factory-os-portal.vercel.app/planning/production-plan` directly.

Expected: redirected to `/login?redirectTo=/planning/production-plan` (the page itself is a web route, so 307 is correct here).

- [ ] **Step 3: Tom — sign in via magic link, return to /planning/production-plan**

Expected: page loads with day cards visible, no error banner. The new deploy and the auth fix are both live.

- [ ] **Step 4: Tom — verify the auth-aware error path manually (optional but valuable)**

In DevTools → Application → Cookies, delete the `sb-…-auth-token` cookie. Then click "This Week" or any week-nav button to trigger a refetch.

Expected: the page shows the **specific** error copy "Your session expired. Sign in again." with a Sign in link — NOT the generic "We couldn't load the production plan."

If Tom sees the generic copy here, the FetchError categorization is still broken upstream (in `usePlans.ts`) and we need a follow-up. If he sees the specific auth copy, the fix is verified end-to-end.

- [ ] **Step 5: Tom confirms the fix**

Tom replies "verified" → mark plan complete. Update `docs/portal-os/active.md` (or equivalent active log) with a one-liner: `2026-05-02: middleware 401/403 JSON for /api/* — fix landed (commit <hash>)`.

---

## Done state

- ✅ All 5 unit tests pass (`pnpm vitest run tests/unit/middleware.test.ts`)
- ✅ Full unit suite still green (`pnpm vitest run`)
- ✅ `pnpm typecheck` clean
- ✅ Live smokes (Task 3) all pass
- ✅ Tom verified the production-plan page renders the auth-aware copy on session expiry (Task 4)
- ✅ Two commits on `main`: design doc (already landed: `171a2f1`) + fix
- ✅ Spec + plan files committed under `docs/superpowers/{specs,plans}/`

## Rollback

If a regression is discovered after push:
```bash
git revert <fix-commit-hash>
git push origin main
```
Vercel auto-deploys the revert. The behavior reverts to the pre-fix 307 redirect — the original bug returns but no new bug is introduced.

## Follow-ups (for separate tranches, do not start in this plan)

1. **`SessionProvider` refresh on 401** — when an API call returns 401, the SessionProvider should clear cached state so the header stops showing "Tom ADMIN" while the page shows "Your session expired."
2. **`updateSupabaseSession` return-shape consistency** — fix the `{response, session: null}` vs `{response, user}` inconsistency in `src/lib/supabase/middleware.ts:25` (currently coincidentally correct but fragile).
3. **Production-plan page redesign** — Hero KPI band, day-card upgrade, demand context, etc. (separate brainstorming track Tom queued before this fix.)
