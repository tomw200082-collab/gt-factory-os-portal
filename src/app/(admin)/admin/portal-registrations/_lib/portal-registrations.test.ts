import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortalRequestError,
  byOldestFirst,
  formatWhen,
  ordersLabel,
  portalFailure,
  postPortal,
  shopifyCustomerNumber,
} from "./portal-registrations";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shopifyCustomerNumber", () => {
  it("reads the number out of a Shopify customer GID", () => {
    expect(shopifyCustomerNumber("gid://shopify/Customer/7012345678901")).toBe(
      "7012345678901",
    );
  });

  it("returns anything that is not a customer GID unchanged", () => {
    expect(shopifyCustomerNumber("gid://shopify/Order/5")).toBe(
      "gid://shopify/Order/5",
    );
    expect(shopifyCustomerNumber("")).toBe("");
  });
});

describe("ordersLabel", () => {
  it("says order for one and orders otherwise", () => {
    expect(ordersLabel(1)).toBe("1 order");
    expect(ordersLabel(0)).toBe("0 orders");
    expect(ordersLabel(42)).toBe("42 orders");
  });
});

describe("formatWhen", () => {
  it("renders a timestamp day first, with the year", () => {
    const out = formatWhen("2026-09-24T09:30:00Z");
    expect(out).toMatch(/^\d{1,2} \w+ 2026/);
  });

  it("shows input it cannot read as-is instead of 'Invalid Date'", () => {
    expect(formatWhen("not a date")).toBe("not a date");
  });
});

describe("byOldestFirst", () => {
  it("puts the request that has waited longest first", () => {
    const rows = [
      { created_at: "2026-09-24T10:00:00Z", id: "new" },
      { created_at: "2026-09-20T08:00:00Z", id: "old" },
      { created_at: "2026-09-22T08:00:00+03:00", id: "mid" },
    ];
    expect([...rows].sort(byOldestFirst).map((r) => r.id)).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });
});

describe("portalFailure", () => {
  it("explains a registration someone already decided (409)", () => {
    const f = portalFailure("approve", 409, { error: "already decided" });
    expect(f.status).toBe(409);
    expect(f.message).toMatch(/already approved or rejected/);
    expect(f.detail).toBeUndefined();
  });

  it("names the missing thing on a 404, per action", () => {
    expect(portalFailure("reject", 404, null).message).toMatch(
      /registration no longer exists/,
    );
    expect(portalFailure("login-link", 404, null).message).toMatch(
      /no longer approved/,
    );
    expect(portalFailure("revoke", 404, null).message).toMatch(
      /already revoked/,
    );
  });

  it("keeps 'already decided' for registrations only", () => {
    expect(portalFailure("revoke", 409, null).message).toBe(
      "Could not revoke this access (HTTP 409). Try again.",
    );
  });

  it("keeps the server's reason as a detail on a 422", () => {
    const f = portalFailure("approve", 422, {
      error: "shopify_customer_id is required",
    });
    expect(f.message).toMatch(/approval was not accepted/);
    expect(f.detail).toBe("shopify_customer_id is required");
  });

  it("sends an expired session back to sign-in and a non-admin away", () => {
    expect(portalFailure("approve", 401, null).message).toMatch(/Sign in again/);
    expect(portalFailure("login-link", 403, null).message).toBe(
      "Only an admin can create a login link.",
    );
    expect(portalFailure("revoke", 403, null).message).toBe(
      "Only an admin can revoke this access.",
    );
  });

  it("falls back to the action and the status, never a raw body", () => {
    const f = portalFailure("login-link", 502, { error: "upstream unreachable" });
    expect(f.message).toBe("Could not create a login link (HTTP 502). Try again.");
    expect(f.detail).toBe("upstream unreachable");
    expect(portalFailure("reject", 500, "<html>").detail).toBeUndefined();
  });
});

describe("postPortal", () => {
  it("posts JSON and returns the parsed body on success", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, wa_link: null }),
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", spy);
    const out = await postPortal<{ ok: boolean }>(
      "/api/portal/registrations/r1/decide",
      { decision: "reject" },
      "reject",
    );
    expect(out.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith("/api/portal/registrations/r1/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ decision: "reject" }),
    });
  });

  it("sends a revoke as an empty JSON object with a JSON content-type", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", spy);
    await postPortal("/api/portal/access/a1/revoke", {}, "revoke");
    expect(spy).toHaveBeenCalledWith("/api/portal/access/a1/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
  });

  it("throws the mapped failure on a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: "already decided" }),
        } as unknown as Response),
      ),
    );
    const err = await postPortal("/x", {}, "approve").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PortalRequestError);
    expect((err as PortalRequestError).status).toBe(409);
  });

  it("says the server could not be reached when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    await expect(postPortal("/x", {}, "login-link")).rejects.toThrow(
      /Could not reach the server/,
    );
  });
});
