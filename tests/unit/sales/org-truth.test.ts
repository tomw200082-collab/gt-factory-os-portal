// What the workspace may claim about a business's Shopify history (design §4).
import { describe, it, expect } from "vitest";
import { historyView } from "@/app/(sales)/_lib/orgTruth";
import { detail } from "./_orgFixtures";

describe("historyView", () => {
  it("shows verified, published history as current", () => {
    expect(historyView(detail())).toBe("ok");
  });
  it("marks verified history older than 36 hours as stale", () => {
    expect(historyView(detail({ history_status: "stale" }))).toBe("stale");
  });
  it("says unavailable, never zero, when the comparison with Shopify is not passing", () => {
    expect(historyView(detail({ history_status: "unverified", counts: null, active: null }))).toBe("unverified");
  });
  it("shows nothing from Shopify while the identity is under review or disputed", () => {
    expect(historyView(detail({ link_status: "review", counts: null }))).toBe("identity");
    expect(historyView(detail({ link_status: "disputed", counts: null }))).toBe("identity");
  });
  it("treats an unlinked business as not yet a customer", () => {
    expect(historyView(detail({ link_status: null, counts: null }))).toBe("prospect");
  });
  it("retired wins over everything", () => {
    expect(historyView(detail({ link_status: "retired", history_status: "ok" }))).toBe("retired");
  });
  it("never trusts counts that arrive without a verified, published link", () => {
    // defence in depth: a server bug that sends counts for a review org must not leak them
    expect(historyView(detail({ link_status: "review" }))).toBe("identity");
  });
});
