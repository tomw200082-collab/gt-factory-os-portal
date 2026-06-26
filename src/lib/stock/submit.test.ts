import { describe, it, expect, vi, afterEach } from "vitest";
import { submitStockEvent } from "./submit";

function mockFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    status,
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitStockEvent", () => {
  it("classifies a posted envelope and surfaces the submission id", async () => {
    mockFetch(() =>
      jsonResponse({ status: "posted", submission_id: "S1" }),
    );
    const r = await submitStockEvent("/api/x", { a: 1 });
    expect(r.kind).toBe("posted");
    if (r.kind !== "posted") throw new Error("kind");
    expect(r.submissionId).toBe("S1");
    expect(r.idempotentReplay).toBe(false);
  });

  it("reports idempotentReplay only when the flag is exactly true", async () => {
    mockFetch(() =>
      jsonResponse({ status: "posted", submission_id: "S1", idempotent_replay: true }),
    );
    const r = await submitStockEvent("/api/x", {});
    expect(r.kind === "posted" && r.idempotentReplay).toBe(true);
  });

  it("classifies a pending (held-for-approval) envelope", async () => {
    mockFetch(() => jsonResponse({ status: "pending", submission_id: "S2" }));
    const r = await submitStockEvent("/api/x", {});
    expect(r.kind).toBe("pending");
    if (r.kind !== "pending") throw new Error("kind");
    expect(r.submissionId).toBe("S2");
  });

  it("classifies any non-posted/pending envelope as rejected with status + body", async () => {
    mockFetch(() => jsonResponse({ reason_code: "UNIT_NOT_FOUND" }, 422));
    const r = await submitStockEvent("/api/x", {});
    expect(r.kind).toBe("rejected");
    if (r.kind !== "rejected") throw new Error("kind");
    expect(r.status).toBe(422);
    expect((r.body as { reason_code?: string }).reason_code).toBe("UNIT_NOT_FOUND");
  });

  it("§1: surfaces a string `message`/`error` but NEVER a raw object", async () => {
    mockFetch(() => jsonResponse({ message: "Quantity too large" }, 400));
    const withString = await submitStockEvent("/api/x", {});
    expect(withString.kind === "rejected" && withString.serverMessage).toBe(
      "Quantity too large",
    );

    mockFetch(() => jsonResponse({ error: { nested: "object" } }, 400));
    const withObject = await submitStockEvent("/api/x", {});
    expect(withObject.kind === "rejected" && withObject.serverMessage).toBeUndefined();
  });

  it("treats an unparseable body as rejected with no leaked message", async () => {
    mockFetch(
      () =>
        ({
          status: 500,
          json: () => Promise.reject(new Error("not json")),
        }) as unknown as Response,
    );
    const r = await submitStockEvent("/api/x", {});
    expect(r.kind).toBe("rejected");
    if (r.kind !== "rejected") throw new Error("kind");
    expect(r.status).toBe(500);
    expect(r.body).toBeNull();
    expect(r.serverMessage).toBeUndefined();
  });

  it("returns network (never throws) when fetch rejects", async () => {
    const boom = new Error("offline");
    mockFetch(() => Promise.reject(boom));
    const r = await submitStockEvent("/api/x", {});
    expect(r.kind).toBe("network");
    expect(r.kind === "network" && r.error).toBe(boom);
  });
});
