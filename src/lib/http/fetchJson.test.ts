import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson } from "./fetchJson";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJson", () => {
  it("returns the parsed body on a 2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ rows: [1, 2] }),
        } as unknown as Response),
      ),
    );
    const out = await fetchJson<{ rows: number[] }>("/api/x");
    expect(out.rows).toEqual([1, 2]);
  });

  it("requests JSON via the Accept header", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", spy);
    await fetchJson("/api/x");
    expect(spy).toHaveBeenCalledWith("/api/x", {
      headers: { Accept: "application/json" },
    });
  });

  it("throws an operator-facing error with the status on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve(null),
        } as unknown as Response),
      ),
    );
    await expect(fetchJson("/api/x")).rejects.toThrow(/HTTP 503/);
    await expect(fetchJson("/api/x")).rejects.toThrow(/try refreshing/);
  });
});
