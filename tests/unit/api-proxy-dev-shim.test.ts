// The dev-shim sends a fixed admin identity upstream. It is for local runs only: a production
// deployment with the flag set by mistake must never act as that admin (tranche 198).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSession = vi.hoisted(() => vi.fn(async () => ({ data: { session: null } })));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getSession } }),
}));

import { proxyRequest } from "@/lib/api-proxy";

const fetched: Array<{ url: string; headers: Record<string, string> }> = [];

beforeEach(() => {
  fetched.length = 0;
  vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH", "true");
  vi.stubEnv("API_BASE", "http://api.invalid");
  vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://api.invalid");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    fetched.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const call = () =>
  proxyRequest(new Request("http://localhost/api/x"), { method: "GET", upstreamPath: "/api/v1/queries/x", errorLabel: "x" });

describe("api proxy dev-shim", () => {
  it("is ignored on a production deployment: no session means 401, nothing goes upstream", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = await call();
    expect(r.status).toBe(401);
    expect(fetched).toHaveLength(0);
  });

  it("still serves a local run", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    await call();
    expect(fetched).toHaveLength(1);
    expect(fetched[0].headers["x-test-session"]).toBeTruthy();
  });
});
