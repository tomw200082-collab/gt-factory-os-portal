// The sales proxies refuse a malformed id themselves, so a path can never be
// reshaped on its way to the API (code review M2).
import { describe, it, expect, vi, beforeEach } from "vitest";

const forwarded = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/api-proxy", () => ({
  proxyRequest: vi.fn(async (_req: Request, opts: { upstreamPath: string }) => {
    forwarded.push(opts.upstreamPath);
    return new Response("{}", { status: 200 });
  }),
}));

import { GET as orgGET } from "@/app/api/sales/orgs/[id]/route";
import { GET as orderGET } from "@/app/api/sales/orgs/[id]/orders/[gid]/route";
import { POST as contactPOST } from "@/app/api/sales/contacts/[id]/[action]/route";

const ID = "00000000-0000-4000-8000-000000000001";
const req = (m = "GET") => new Request("http://localhost/x", { method: m });

beforeEach(() => {
  forwarded.length = 0;
});

describe("sales proxy ids", () => {
  it("forwards a well-formed org id", async () => {
    expect((await orgGET(req(), { params: Promise.resolve({ id: ID }) })).status).toBe(200);
    expect(forwarded).toEqual([`/api/v1/queries/sales/orgs/${ID}`]);
  });

  it("answers 400 itself for an org id that is not a uuid", async () => {
    const r = await orgGET(req(), { params: Promise.resolve({ id: ".." }) });
    expect(r.status).toBe(400);
    expect(forwarded).toEqual([]);
  });

  it("forwards an order gid, and refuses a path dressed as one", async () => {
    expect((await orderGET(req(), { params: Promise.resolve({ id: ID, gid: encodeURIComponent("gid://shopify/Order/9000000001") }) })).status).toBe(200);
    expect(forwarded).toEqual([`/api/v1/queries/sales/orgs/${ID}/orders/${encodeURIComponent("gid://shopify/Order/9000000001")}`]);
    const r = await orderGET(req(), { params: Promise.resolve({ id: ID, gid: "%2E%2E" }) });
    expect(r.status).toBe(400);
    expect(forwarded).toHaveLength(1);
  });

  it("forwards only the contact decisions the portal makes", async () => {
    expect((await contactPOST(req("POST"), { params: Promise.resolve({ id: ID, action: "verify" }) })).status).toBe(200);
    expect((await contactPOST(req("POST"), { params: Promise.resolve({ id: ID, action: "redact" }) })).status).toBe(404);
    expect((await contactPOST(req("POST"), { params: Promise.resolve({ id: "x", action: "reject" }) })).status).toBe(400);
    expect(forwarded).toHaveLength(1);
  });
});
