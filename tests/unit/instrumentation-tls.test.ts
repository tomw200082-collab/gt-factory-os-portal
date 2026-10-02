// tranche 199
import { describe, it, expect, vi, afterEach } from "vitest";
import { register } from "@/instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("instrumentation: TLS verification", () => {
  it("removes the flag on a Vercel deployment, and says so once", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    register();
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("leaves a local run alone", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    register();
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");
  });
});
