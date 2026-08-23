// Regression guard for the 2026-08-23 inbox blackout.
//
// Approval streams used to fetch /api/exceptions once without a category and
// partition client-side. Upstream caps that list at 200 rows ordered by
// created_at desc (LIST_HARD_CAP, api/src/exceptions/handler.ts:73), so a
// burst of unrelated integration exceptions pushed 19 pending count approvals
// out of the response and the inbox rendered empty while stock counts sat
// unapplied. These tests fail if the category filter stops being sent.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchPendingPhysicalCountApprovals,
  fetchPendingWasteApprovals,
} from "./client";

function mockFetchCapturing(urls: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify({ rows: [], count: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("approval exception fetchers", () => {
  it("asks upstream for count_large_variance, not the unfiltered list", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", mockFetchCapturing(urls));

    await fetchPendingPhysicalCountApprovals();

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("category=count_large_variance");
  });

  it("requests one category per waste approval category", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", mockFetchCapturing(urls));

    await fetchPendingWasteApprovals();

    expect(urls).toHaveLength(2);
    expect(urls.join(" ")).toContain("category=positive_adjustment");
    expect(urls.join(" ")).toContain("category=loss_above_threshold");
  });

  it("throws when a category leg fails instead of returning a short list", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return new Response(JSON.stringify({ rows: [], count: 0 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ detail: "upstream down" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(fetchPendingWasteApprovals()).rejects.toThrow();
  });
});
