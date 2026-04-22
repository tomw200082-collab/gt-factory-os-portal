// ---------------------------------------------------------------------------
// Capability-based authorization primitive — substrate for Tranche A.
//
// Implements the role×capability lattice from portal-full-production-refactor
// plan §B.2. Layouts, sidebar, and any other capability-gated surface call
// authorizeCapability(role, required) to decide whether to render.
//
// Hard locks from the plan:
//   - Planner does NOT inherit operator stock-execute. This is enforced here,
//     NOT at the call site. Call sites may not supply a wider grant than the
//     table below.
//   - Admin is the ONLY role with `admin` axis grants.
//   - Viewer is the ONLY role with strictly-read grants on all three axes.
//
// The lattice is encoded as a static truth table keyed (role, axis) → level.
// Level ordering per axis (least → most):
//   stock:    null < "read" < "execute" < "execute+override"
//   planning: null < "read" < "execute" < "execute+override" (no "approve"
//             level separately — approve is gated server-side on the
//             planning:execute capability plus self-approval block)
//   admin:    null < "read" < "execute+override"
//
// A `required` capability of the form "<axis>:<min_level>" is granted when
// the role's grant on that axis is at or above min_level.
// ---------------------------------------------------------------------------

import type { Role } from "@/lib/contracts/enums";

export type CapabilityAxis = "stock" | "planning" | "admin";

export type StockLevel = "read" | "execute" | "execute+override" | null;
export type PlanningLevel = "read" | "execute" | "execute+override" | null;
export type AdminLevel = "read" | "execute" | "execute+override" | null;

export interface CapabilityGrants {
  stock: StockLevel;
  planning: PlanningLevel;
  admin: AdminLevel;
}

// Truth table — source: plan §B.2. Changing these values changes the portal's
// effective authorization model. Backend handlers remain the belt-and-suspenders
// enforcer — this table only governs portal-side visibility and gating.
export const ROLE_CAPABILITY_LATTICE: Record<Role, CapabilityGrants> = {
  viewer: {
    stock: "read",
    planning: "read",
    admin: "read",
  },
  operator: {
    stock: "execute",
    planning: "read",
    admin: null,
  },
  planner: {
    // NOTE: planner does NOT have stock:execute. This is a hard lock from
    // the plan to prevent cross-role privilege creep. Admin is the only
    // role that can execute stock forms on behalf of an operator.
    stock: "read",
    planning: "execute+override",
    admin: null,
  },
  admin: {
    stock: "execute+override",
    planning: "execute+override",
    admin: "execute+override",
  },
};

// Minimum-level strings used as `required_capability` on nav manifest items
// and `minimum` on <RoleGate>. The string form makes call-site declarations
// readable: `<RoleGate minimum="stock:execute">`.
export type CapabilityRequirement =
  | "stock:read"
  | "stock:execute"
  | "stock:execute+override"
  | "planning:read"
  | "planning:execute"
  | "planning:execute+override"
  | "admin:read"
  | "admin:execute"
  | "admin:execute+override"
  | "viewer:read";

const LEVEL_ORDER: Record<string, number> = {
  read: 1,
  execute: 2,
  "execute+override": 3,
};

function levelRank(level: string | null): number {
  if (level === null) return 0;
  return LEVEL_ORDER[level] ?? 0;
}

function parseRequirement(
  req: CapabilityRequirement,
): { axis: CapabilityAxis | "viewer"; min: string } {
  const [axis, min] = req.split(":");
  return { axis: axis as CapabilityAxis | "viewer", min };
}

/**
 * authorizeCapability
 *
 * Returns true iff `role` has a grant on the requested axis at or above the
 * requested minimum level. The synthetic requirement "viewer:read" grants any
 * authenticated role (all four roles have a viewer:read-equivalent minimum).
 */
export function authorizeCapability(
  role: Role,
  required: CapabilityRequirement,
): boolean {
  const { axis, min } = parseRequirement(required);

  // Synthetic "viewer:read" tier — any authenticated role passes. Used by
  // the shared layout and the inbox layout where per-row enforcement happens
  // server-side.
  if (axis === "viewer") {
    return true;
  }

  const grants = ROLE_CAPABILITY_LATTICE[role];
  const granted = grants[axis as CapabilityAxis];
  return levelRank(granted) >= levelRank(min);
}

/**
 * capabilitiesFor
 *
 * Returns the full capability grants object for a role. Useful for the
 * sidebar's subdued-state tooltip logic, where we want to show WHY an item
 * is not available (which axis is missing).
 */
export function capabilitiesFor(role: Role): CapabilityGrants {
  return ROLE_CAPABILITY_LATTICE[role];
}
