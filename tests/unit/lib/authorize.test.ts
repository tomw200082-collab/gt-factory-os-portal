// ---------------------------------------------------------------------------
// authorizeCapability lattice tests.
//
// authorize.ts is the portal-side authorization primitive: every
// capability-gated layout, the sidebar, and <RoleGate> route through
// authorizeCapability(role, required). It was previously untested despite
// encoding the role×capability hard-locks from the production refactor plan
// (§B.2). These tests pin the full truth table so any accidental widening of a
// grant — especially the planner-stock-override and admin-only locks — fails
// loudly here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  authorizeCapability,
  capabilitiesFor,
  ROLE_CAPABILITY_LATTICE,
  type CapabilityRequirement,
} from "@/lib/auth/authorize";
import { ROLES, type Role } from "@/lib/contracts/enums";

describe("authorizeCapability — synthetic viewer:read tier", () => {
  it("grants every authenticated role", () => {
    for (const role of ROLES) {
      expect(authorizeCapability(role, "viewer:read")).toBe(true);
    }
  });
});

describe("authorizeCapability — stock axis", () => {
  it("viewer has read but not execute", () => {
    expect(authorizeCapability("viewer", "stock:read")).toBe(true);
    expect(authorizeCapability("viewer", "stock:execute")).toBe(false);
    expect(authorizeCapability("viewer", "stock:execute+override")).toBe(false);
  });

  it("operator has execute but not override", () => {
    expect(authorizeCapability("operator", "stock:read")).toBe(true);
    expect(authorizeCapability("operator", "stock:execute")).toBe(true);
    expect(authorizeCapability("operator", "stock:execute+override")).toBe(false);
  });

  it("admin has override (the top stock grant)", () => {
    expect(authorizeCapability("admin", "stock:execute+override")).toBe(true);
  });
});

describe("authorizeCapability — planning axis", () => {
  it("operator is read-only on planning (does NOT inherit execute)", () => {
    expect(authorizeCapability("operator", "planning:read")).toBe(true);
    expect(authorizeCapability("operator", "planning:execute")).toBe(false);
    expect(authorizeCapability("operator", "planning:execute+override")).toBe(false);
  });

  it("planner has full planning override", () => {
    expect(authorizeCapability("planner", "planning:execute")).toBe(true);
    expect(authorizeCapability("planner", "planning:execute+override")).toBe(true);
  });
});

describe("authorizeCapability — admin axis hard lock", () => {
  it("admin is the ONLY role with any admin-axis execute grant", () => {
    for (const role of ROLES) {
      const expected = role === "admin";
      expect(authorizeCapability(role, "admin:execute")).toBe(expected);
      expect(authorizeCapability(role, "admin:execute+override")).toBe(expected);
    }
  });

  it("viewer has admin:read (read-only on all three axes)", () => {
    expect(authorizeCapability("viewer", "admin:read")).toBe(true);
    expect(authorizeCapability("viewer", "stock:read")).toBe(true);
    expect(authorizeCapability("viewer", "planning:read")).toBe(true);
  });

  it("operator and planner have NO admin-axis grant at all", () => {
    for (const role of ["operator", "planner"] as Role[]) {
      expect(authorizeCapability(role, "admin:read")).toBe(false);
    }
  });
});

describe("authorizeCapability — planner does NOT inherit operator stock-execute as override", () => {
  // The plan's named hard lock: planner gets stock:execute but must NOT be
  // silently promoted to stock:execute+override.
  it("planner stock grant is exactly execute, not override", () => {
    expect(authorizeCapability("planner", "stock:execute")).toBe(true);
    expect(authorizeCapability("planner", "stock:execute+override")).toBe(false);
  });
});

describe("capabilitiesFor", () => {
  it("returns the verbatim lattice row for each role", () => {
    for (const role of ROLES) {
      expect(capabilitiesFor(role)).toEqual(ROLE_CAPABILITY_LATTICE[role]);
    }
  });
});

describe("authorizeCapability — monotonicity invariant", () => {
  // For any role/axis, a grant at a higher minimum implies the grant at every
  // lower minimum on that axis. Guards against a future LEVEL_ORDER regression.
  const ladders: CapabilityRequirement[][] = [
    ["stock:read", "stock:execute", "stock:execute+override"],
    ["planning:read", "planning:execute", "planning:execute+override"],
    ["admin:read", "admin:execute", "admin:execute+override"],
  ];

  it("a higher granted level always implies all lower levels", () => {
    for (const role of ROLES) {
      for (const ladder of ladders) {
        let sawDenied = false;
        for (const req of ladder) {
          const granted = authorizeCapability(role, req);
          if (!granted) sawDenied = true;
          // Once denied at some level, must stay denied at stricter levels.
          if (sawDenied) expect(granted).toBe(false);
        }
      }
    }
  });
});
