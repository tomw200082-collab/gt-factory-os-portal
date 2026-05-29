// ---------------------------------------------------------------------------
// proxyRequest tests.
//
// api-proxy.ts is the single forwarding path behind every src/app/api/**/route.ts
// (all 119 portal API routes call proxyRequest). It was previously untested, so
// auth-header forwarding, the 401/500/502 error contract, query/body forwarding
// rules, the API_BASE fallback, and the dev-shim bypass were unverified despite
// gating the entire backend surface. These tests pin that contract.
//
// @/lib/supabase/server is mocked so we never touch a real Supabase backend;
// global fetch is stubbed so we control (and assert on) the upstream call.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetSession = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateClient(),
}));

import { proxyRequest } from "@/lib/api-proxy";

const ORIGINAL_ENV = { ...process.env };

function withSession(accessToken: string | null) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getSession: mockGetSession,
    },
  });
  mockGetSession.mockResolvedValue({
    data: { session: accessToken ? { access_token: accessToken } : null },
  });
}

/** Build an upstream fetch mock returning the given status/body/content-type. */
function stubFetch(opts: {
  status?: number;
  body?: string;
  contentType?: string | null;
  throws?: Error;
}) {
  const fn = vi.fn(async () => {
    if (opts.throws) throw opts.throws;
    const headers = new Headers();
    if (opts.contentType !== null) {
      headers.set("content-type", opts.contentType ?? "application/json");
    }
    return new Response(opts.body ?? "{}", {
      status: opts.status ?? 200,
      headers,
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.API_BASE = "https://api.test";
  process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
  delete process.env.NEXT_PUBLIC_API_BASE;
  mockGetSession.mockReset();
  mockCreateClient.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("proxyRequest — configuration guard", () => {
  it("returns 500 when neither API_BASE nor NEXT_PUBLIC_API_BASE is set", async () => {
    delete process.env.API_BASE;
    delete process.env.NEXT_PUBLIC_API_BASE;
    const req = new Request("https://portal.test/api/x");
    const res = await proxyRequest(req, {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "API_BASE env var not configured on server",
    });
  });

  it("falls back to NEXT_PUBLIC_API_BASE when API_BASE is unset", async () => {
    delete process.env.API_BASE;
    process.env.NEXT_PUBLIC_API_BASE = "https://public-api.test";
    withSession("jwt-123");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://public-api.test/api/v1/x");
  });
});

describe("proxyRequest — authentication", () => {
  it("returns 401 when there is no session access_token", async () => {
    withSession(null);
    stubFetch({ status: 200 });

    const res = await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Not authenticated" });
  });

  it("returns 500 with the error label when the supabase client throws", async () => {
    mockCreateClient.mockRejectedValue(new Error("cookie boom"));
    stubFetch({ status: 200 });

    const res = await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "planning runs list",
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("planning runs list session error");
    expect(body.detail).toBe("cookie boom");
  });

  it("forwards the JWT as an Authorization: Bearer header", async () => {
    withSession("jwt-abc");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer jwt-abc",
    );
  });
});

describe("proxyRequest — dev-shim bypass", () => {
  it("uses x-test-session and does NOT call supabase when dev-shim is on", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "true";
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });

    expect(mockCreateClient).not.toHaveBeenCalled();
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["x-test-session"]).toBeTruthy();
    expect(JSON.parse(headers["x-test-session"]).role).toBe("admin");
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("proxyRequest — query forwarding", () => {
  it("forwards the querystring for GET by default", async () => {
    withSession("jwt");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(
      new Request("https://portal.test/api/x?status=open&limit=50"),
      { method: "GET", upstreamPath: "/api/v1/x", errorLabel: "x" },
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test/api/v1/x?status=open&limit=50",
    );
  });

  it("does NOT forward the querystring for mutations by default", async () => {
    withSession("jwt");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(
      new Request("https://portal.test/api/x?status=open", {
        method: "POST",
        body: "{}",
      }),
      { method: "POST", upstreamPath: "/api/v1/x", errorLabel: "x" },
    );

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/api/v1/x");
  });

  it("honors an explicit forwardQuery override on a mutation", async () => {
    withSession("jwt");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(
      new Request("https://portal.test/api/x?a=1", {
        method: "POST",
        body: "{}",
      }),
      {
        method: "POST",
        upstreamPath: "/api/v1/x",
        errorLabel: "x",
        forwardQuery: true,
      },
    );

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/api/v1/x?a=1");
  });
});

describe("proxyRequest — body forwarding", () => {
  it("forwards a non-empty body and content-type for a POST", async () => {
    withSession("jwt");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(
      new Request("https://portal.test/api/x", {
        method: "POST",
        body: JSON.stringify({ qty: 5 }),
        headers: { "content-type": "application/json" },
      }),
      { method: "POST", upstreamPath: "/api/v1/x", errorLabel: "x" },
    );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe('{"qty":5}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("omits the body for a GET even if forwardBody is requested implicitly", async () => {
    withSession("jwt");
    const fetchMock = stubFetch({ status: 200 });

    await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
  });
});

describe("proxyRequest — upstream response passthrough", () => {
  it("preserves the upstream status and content-type", async () => {
    withSession("jwt");
    stubFetch({
      status: 422,
      body: JSON.stringify({ error: "validation" }),
      contentType: "application/json",
    });

    const res = await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "x",
    });

    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toMatchObject({ error: "validation" });
  });

  it("returns 502 with the error label when the upstream fetch throws", async () => {
    withSession("jwt");
    stubFetch({ throws: new Error("ECONNREFUSED") });

    const res = await proxyRequest(new Request("https://portal.test/api/x"), {
      method: "GET",
      upstreamPath: "/api/v1/x",
      errorLabel: "stock ledger",
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("stock ledger upstream unreachable");
    expect(body.detail).toBe("ECONNREFUSED");
  });
});
