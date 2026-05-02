// ---------------------------------------------------------------------------
// Middleware behavior tests — auth gating + role gating × api/web matrix.
//
// Spec: docs/superpowers/specs/2026-05-02-middleware-401-json-for-api-paths-design.md
// Plan: docs/superpowers/plans/2026-05-02-middleware-401-json-for-api-paths.md
//
// We mock @/lib/supabase/middleware so the middleware can be exercised
// without a real Supabase backend. Each test sets the mock return shape
// then calls middleware against a contrived NextRequest and asserts on
// the NextResponse.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockUpdate = vi.fn();
vi.mock("@/lib/supabase/middleware", () => ({
  updateSupabaseSession: (req: NextRequest) => mockUpdate(req),
}));

beforeEach(() => {
  // Force the prod auth path; dev-shim short-circuit must not fire.
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

  // Note: the role-gate JSON branch (return 403 JSON when isApiPath +
  // forbidden role) is intentionally defensive. Today no entry in
  // ROLE_GATES matches an /api/* prefix — the gates target web routes
  // like /admin, /planning, /stock — so the branch is unreachable in v1.
  // It is kept so that a future extension of ROLE_GATES to /api/* paths
  // does not regress the API-path JSON contract by silently falling
  // back to a 307 redirect that fetch() would mis-handle. Test #1
  // already verifies the JSON-vs-redirect branching pattern in the
  // analogous auth-failure block.

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
    // Middleware returns the response from updateSupabaseSession on the
    // happy path. NextResponse.next() carries status 200 by default.
    expect(res.status).toBe(200);
  });
});
