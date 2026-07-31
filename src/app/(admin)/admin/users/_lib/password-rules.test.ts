import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  localPasswordError,
} from "./password-rules";

describe("localPasswordError", () => {
  it("accepts an ordinary password an admin would actually type", () => {
    expect(localPasswordError("gt-factory-2026")).toBeNull();
    expect(localPasswordError("מפעל2026")).toBeNull();
  });

  it("accepts exactly the boundary lengths", () => {
    expect(localPasswordError("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(localPasswordError("a".repeat(MAX_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects anything shorter than the minimum, including empty", () => {
    expect(localPasswordError("")).toContain(String(MIN_PASSWORD_LENGTH));
    expect(localPasswordError("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain(
      String(MIN_PASSWORD_LENGTH),
    );
  });

  it("rejects anything past bcrypt's 72-byte ceiling", () => {
    expect(localPasswordError("a".repeat(MAX_PASSWORD_LENGTH + 1))).toContain(
      String(MAX_PASSWORD_LENGTH),
    );
  });

  it("rejects surrounding whitespace rather than trimming it", () => {
    // Trimming would store something different from what the admin read out.
    expect(localPasswordError(" gt-factory-2026")).toBe(
      "Cannot start or end with a space.",
    );
    expect(localPasswordError("gt-factory-2026 ")).toBe(
      "Cannot start or end with a space.",
    );
    // Interior spaces are a legitimate passphrase, not an error.
    expect(localPasswordError("gt factory 2026")).toBeNull();
  });

  it("counts whitespace toward length before judging it, so ' ' is too short", () => {
    expect(localPasswordError("  ")).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
