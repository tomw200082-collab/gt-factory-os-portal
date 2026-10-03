// @vitest-environment node
// UX gate P1-1 (tranche 205): the middleware rewrites /sales/control to an unmatched path for
// anyone but Tom, so the portal answers its own 404 before anything streams.
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const user = vi.hoisted(() => ({ email: null as string | null }));
vi.mock("@/lib/supabase/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    updateSupabaseSession: async (request: NextRequest) => ({
      response: NextResponse.next({ request }),
      user: user.email ? { email: user.email, app_metadata: {} } : null,
    }),
  };
});

import { middleware } from "@/middleware";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; user.email = null; });
const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "http://portal.test"), { headers: cookie ? { cookie } : {} });
const rewrittenTo = (r: Response) => r.headers.get("x-middleware-rewrite");

describe("middleware: /sales/control", () => {
  it("signed in as another admin: rewritten to a path no route matches (the portal's 404)", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
    user.email = "admin@gteveryday.com";
    expect(rewrittenTo(await middleware(req("/sales/control")))).toMatch(/\/__not-found$/);
    // other sales routes are untouched
    expect(rewrittenTo(await middleware(req("/sales/today")))).toBeNull();
  });

  it("Tom passes, whatever the case of the email", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
    user.email = "Tom@GTEveryday.com";
    expect(rewrittenTo(await middleware(req("/sales/control")))).toBeNull();
  });

  it("dev-shim: the shim's email cookie decides", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "true";
    expect(rewrittenTo(await middleware(req("/sales/control")))).toMatch(/\/__not-found$/);
    expect(rewrittenTo(await middleware(req("/sales/control", "gt.devshim.email=admin%40fake.gtfactory")))).toMatch(/\/__not-found$/);
    expect(rewrittenTo(await middleware(req("/sales/control", "gt.devshim.email=tom%40gteveryday.com")))).toBeNull();
  });
});
