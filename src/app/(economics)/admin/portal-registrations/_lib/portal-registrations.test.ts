import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortalRequestError,
  formatWhen,
  postPortal,
  shopifyCustomerNumber,
} from "./portal-registrations";

afterEach(() => {
  vi.restoreAllMocks();
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

describe("formatWhen", () => {
  it("renders a timestamp day first, with the year", () => {
    const out = formatWhen("2026-09-24T09:30:00Z");
    expect(out).toMatch(/^\d{1,2} \w+ 2026/);
  });

  it("shows input it cannot read as-is instead of 'Invalid Date'", () => {
    expect(formatWhen("not a date")).toBe("not a date");
  });
});

type Action = Parameters<typeof postPortal>[2];

/** What postPortal throws when the server answers `status` with `body`. */
async function refusal(
  action: Action,
  status: number,
  body: unknown = null,
): Promise<PortalRequestError> {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status }),
  );
  const err: unknown = await postPortal("/api/portal/x", {}, action).catch(
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PortalRequestError);
  return err as PortalRequestError;
}

describe("postPortal refusals", () => {
  it.each(["approve", "reject"] as const)(
    "explains a registration already decided the other way (%s, 409) and marks the row stale",
    async (action) => {
      const err = await refusal(action, 409, { error: "already_decided" });
      expect(err.status).toBe(409);
      expect(err.message).toMatch(/already approved or rejected/);
      expect(err.detail).toBeUndefined();
      expect(err.stale).toBe(true);
    },
  );

  it.each([
    ["reject", /registration no longer exists/],
    ["login-link", /no longer approved/],
    ["revoke", /^No access row with that id\.$/],
  ] as const)(
    "names the missing thing on a 404 and marks the row stale (%s)",
    async (action, message) => {
      const err = await refusal(action, 404, { error: "not_found" });
      expect(err.message).toMatch(message);
      expect(err.stale).toBe(true);
    },
  );

  it("says the portal is closed to the customer when a login link is refused (409)", async () => {
    const err = await refusal("login-link", 409, {
      error:
        "the portal is closed to this customer: the launch flag is off or they are not on its allowlist",
    });
    expect(err.message).toBe(
      "The portal is closed to this customer: the launch flag is off or they are not on its allowlist.",
    );
    expect(err.stale).toBe(false);
  });

  it("keeps 'already decided' for registrations only", async () => {
    const err = await refusal("revoke", 409);
    expect(err.message).toBe(
      "Could not revoke this access (HTTP 409). Try again.",
    );
    expect(err.stale).toBe(false);
  });

  it("keeps the server's reason as a detail on a 422", async () => {
    const err = await refusal("approve", 422, {
      error: "shopify_customer_id is required",
    });
    expect(err.message).toMatch(/approval was not accepted/);
    expect(err.detail).toBe("shopify_customer_id is required");
    expect(err.stale).toBe(false);
  });

  it("tells a non-admin who may do it (403)", async () => {
    expect((await refusal("login-link", 403)).message).toBe(
      "Only an admin can create a login link.",
    );
    expect((await refusal("revoke", 403)).message).toBe(
      "Only an admin can revoke this access.",
    );
  });

  it.each([
    [
      { error: "portal login link upstream unreachable", detail: "fetch failed" },
      "portal login link upstream unreachable: fetch failed",
    ],
    ["<html>", undefined],
  ])(
    "falls back to the action and the status, never a raw body (%j)",
    async (body, detail) => {
      const err = await refusal("login-link", 502, body);
      expect(err.message).toBe(
        "Could not create a login link (HTTP 502). Try again.",
      );
      expect(err.detail).toBe(detail);
      expect(err.stale).toBe(false);
    },
  );

  it("says the server could not be reached when fetch itself fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(postPortal("/x", {}, "login-link")).rejects.toThrow(
      /Could not reach the server/,
    );
  });
});
