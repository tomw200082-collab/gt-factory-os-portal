import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  localPasswordError,
  passwordOpErrorMessage,
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

describe("passwordOpErrorMessage", () => {
  const FALLBACK = "Could not set a new password.";

  it("never shows an admin an environment-variable name on NOT_CONFIGURED", () => {
    // The exact payload the deployed API sent on 2026-07-31, which reached the
    // Users page verbatim and told an admin about SUPABASE_SERVICE_ROLE_KEY.
    const msg = passwordOpErrorMessage(
      {
        reason_code: "NOT_CONFIGURED",
        detail:
          "Password control is not configured on this deployment (SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD_DISPLAY_KEY missing).",
      },
      FALLBACK,
    );
    expect(msg).not.toMatch(/SUPABASE|ADMIN_PASSWORD_DISPLAY_KEY|_KEY|env/i);
    expect(msg).toContain("redeployed");
  });

  it("also covers the reworded NOT_CONFIGURED detail, not just the old one", () => {
    const msg = passwordOpErrorMessage(
      {
        reason_code: "NOT_CONFIGURED",
        detail:
          "Password control is not configured on this deployment: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set on this deployment.",
      },
      FALLBACK,
    );
    expect(msg).not.toMatch(/SUPABASE/);
  });

  it("keeps Supabase's own words when it is the password that was refused", () => {
    // REJECTED_BY_AUTH detail is about the value the admin typed, so it is
    // exactly what they need to read — replacing it would lose information.
    expect(
      passwordOpErrorMessage(
        {
          reason_code: "REJECTED_BY_AUTH",
          detail: "Password is known to be weak and easy to guess",
        },
        FALLBACK,
      ),
    ).toBe("Password is known to be weak and easy to guess");
  });

  it("prefers a validation message over the generic detail", () => {
    expect(
      passwordOpErrorMessage(
        {
          detail: "Unprocessable Entity",
          validation_errors: [{ message: "At least 6 characters." }],
        },
        FALLBACK,
      ),
    ).toBe("At least 6 characters.");
  });

  it("falls back to detail, then error, then the caller's default", () => {
    expect(passwordOpErrorMessage({ detail: "d", error: "e" }, FALLBACK)).toBe("d");
    expect(passwordOpErrorMessage({ error: "e" }, FALLBACK)).toBe("e");
    expect(passwordOpErrorMessage({}, FALLBACK)).toBe(FALLBACK);
    expect(passwordOpErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(passwordOpErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
