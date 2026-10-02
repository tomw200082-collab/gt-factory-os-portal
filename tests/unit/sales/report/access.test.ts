import { describe, it, expect, vi } from "vitest";
import { SalesApiError, shouldRetryReport } from "@/app/(sales)/_lib/api";

vi.mock("@/lib/api-proxy", () => ({
  proxyRequest: vi.fn(async () => new Response(JSON.stringify({ state: "never" }), { status: 200, headers: { "content-type": "application/json" } })),
}));

describe("the report read", () => {
  it("retries a server error once, and never a refusal", () => {
    expect(shouldRetryReport(0, new SalesApiError("x", undefined, 500))).toBe(true);
    expect(shouldRetryReport(1, new SalesApiError("x", undefined, 500))).toBe(false);
    expect(shouldRetryReport(0, new SalesApiError("x", undefined, undefined))).toBe(true); // the network dropped
    expect(shouldRetryReport(0, new SalesApiError("x", undefined, 401))).toBe(false);
    expect(shouldRetryReport(0, new SalesApiError("x", undefined, 403))).toBe(false);
  });

  it("is never cached by a shared cache: it carries the whole customer book", async () => {
    const { GET } = await import("@/app/api/sales/report/route");
    const res = await GET(new Request("http://x/api/sales/report"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ state: "never" });
  });
});
