"use client";

// ---------------------------------------------------------------------------
// RoleGate — capability-based authorization wrapper for layouts and nested
// scopes. Updated in Tranche A of portal-full-production-refactor to accept
// `minimum` (capability-requirement string) and delegate to
// authorizeCapability from src/lib/auth/authorize.ts.
//
// Backward compatibility: the legacy `allow={[...roles]}` prop is still
// accepted. Callers passing `allow` are gated by membership in the array
// as before. New callers should pass `minimum` instead.
//
// Exactly one of `allow` or `minimum` must be provided.
// ---------------------------------------------------------------------------

import { useSession } from "./session-provider";
import { authorizeCapability, type CapabilityRequirement } from "./authorize";
import type { Role } from "@/lib/contracts/enums";
import type { ReactNode } from "react";

const CAPABILITY_LABELS: Partial<Record<CapabilityRequirement, string>> = {
  "viewer:read": "Viewer access",
  "stock:read": "Stock read access",
  "stock:execute": "Operator (stock) access",
  "planning:read": "Planner read access",
  "planning:execute": "Planner access",
  "planning:execute+override": "Planner override access",
  "admin:read": "Admin read access",
  "admin:execute": "Admin access",
  "admin:execute+override": "Admin override access",
};

type RoleGateProps =
  | {
      allow: Role[];
      minimum?: never;
      children: ReactNode;
    }
  | {
      minimum: CapabilityRequirement;
      allow?: never;
      children: ReactNode;
    };

export function RoleGate(props: RoleGateProps) {
  const { session, isLoading } = useSession();

  // While session loads, render nothing — shell chrome shows its own skeleton.
  if (isLoading) return null;

  let granted: boolean;
  let blockedLabel: string;

  if ("minimum" in props && props.minimum !== undefined) {
    granted = authorizeCapability(session.role, props.minimum);
    blockedLabel = CAPABILITY_LABELS[props.minimum] ?? props.minimum;
  } else if ("allow" in props && props.allow !== undefined) {
    granted = props.allow.includes(session.role);
    blockedLabel = props.allow.join(", ");
  } else {
    // Neither supplied — fail closed.
    granted = false;
    blockedLabel = "this section";
  }

  if (!granted) {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">Access restricted</div>
        <div className="mt-2 text-xs text-fg-muted">
          {blockedLabel} is required to view this page.
          <br />
          Your current role is <span className="font-mono text-fg">{session.role}</span>.
          Contact your administrator to request access.
        </div>
      </div>
    );
  }
  return <>{props.children}</>;
}

export function useHasRole(...roles: Role[]): boolean {
  const { session } = useSession();
  return roles.includes(session.role);
}

export function useCapability(required: CapabilityRequirement): boolean {
  const { session } = useSession();
  return authorizeCapability(session.role, required);
}
