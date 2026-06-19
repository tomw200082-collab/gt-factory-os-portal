import { describe, expect, it } from "vitest";
import { friendlyReverseError } from "@/lib/copy/physical-count-errors";

// The count-undo error copy must always be plain English mapped from the
// reverse endpoint's reason codes (api physical-counts §1.10) — never a raw
// code, and never empty.
describe("friendlyReverseError (count undo)", () => {
  it("maps every documented reason_code to a distinct human sentence", () => {
    const cases: Record<string, RegExp> = {
      ANCHOR_SUPERSEDED: /latest count/i,
      ALREADY_REVERSED: /already undone/i,
      COUNT_FREEZE_ACTIVE: /count is currently open/i,
      NOT_POSTED: /posted count/i,
      NO_PRIOR_ANCHOR: /previous value/i,
    };
    for (const [code, re] of Object.entries(cases)) {
      const msg = friendlyReverseError(409, { reason_code: code });
      expect(msg).toMatch(re);
      expect(msg).not.toContain(code); // never leak the raw code
    }
  });

  it("explains the operator window on a 403", () => {
    const msg = friendlyReverseError(403, { reason_code: "FORBIDDEN_BY_ROLE" });
    expect(msg).toMatch(/30 minutes/);
    expect(msg).toMatch(/planner/i);
  });

  it("falls back to a safe retry message for unknown codes / no body", () => {
    expect(friendlyReverseError(500, null)).toMatch(/could not undo/i);
    expect(friendlyReverseError(409, { reason_code: "SOMETHING_NEW" })).toMatch(/try again/i);
  });
});
