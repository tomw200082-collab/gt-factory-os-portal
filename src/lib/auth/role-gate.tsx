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
import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { GTLoader, GT_LOADER_REMOVE_MS } from "@/components/ui/GTLoader";

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
  "sales:read": "Sales read access",
  "sales:execute": "CRM access",
  "sales:execute+override": "Sales override access",
};

type RoleGateProps =
  | {
      allow: Role[];
      minimum?: never;
      children: ReactNode;
      fallback?: ReactNode;
    }
  | {
      minimum: CapabilityRequirement;
      allow?: never;
      children: ReactNode;
      fallback?: ReactNode;
    };

export function RoleGate(props: RoleGateProps) {
  const { session, isLoading } = useSession();
  const { fallback } = props;

  // A GTLoader fallback does not vanish when the session lands: it stays on top
  // of the freshly rendered content and fades out (180 ms), like every other
  // GTLoader exit (UX gate L1c). It is the same element in the same slot, so its
  // animations do not restart. If it never became visible (the session beat its
  // 120 ms invisible phase) it is removed at once. Other fallbacks just drop.
  const fadeable = isValidElement(fallback) && fallback.type === GTLoader;
  const [prevLoading, setPrevLoading] = useState(isLoading);
  const [exiting, setExiting] = useState(false);
  if (prevLoading !== isLoading) {
    setPrevLoading(isLoading);
    if (!isLoading && fadeable) setExiting(true);
    if (isLoading) setExiting(false);
  }
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exiting) return;
    const loader = hostRef.current?.querySelector(".gt-loader");
    if (!loader || getComputedStyle(loader).visibility === "hidden") {
      setExiting(false);
      return;
    }
    const id = setTimeout(() => setExiting(false), GT_LOADER_REMOVE_MS);
    return () => clearTimeout(id);
  }, [exiting]);

  // The fallback keeps slot 0 and the content slot 1 in every phase, so React
  // updates the loader in place instead of remounting it.
  const overlay =
    fallback == null
      ? null
      : isLoading
        ? fallback
        : exiting && isValidElement(fallback)
          ? cloneElement(fallback as ReactElement<{ leaving?: boolean }>, {
              leaving: true,
            })
          : null;
  const host = (
    <div ref={hostRef} style={{ display: "contents" }}>
      {overlay}
    </div>
  );

  // While the session loads, render `fallback` — nothing unless a caller gives
  // one (shell chrome shows its own skeleton; the sales layout passes its loader
  // so a direct /sales/* load is not a blank screen).
  if (isLoading) return fallback == null ? null : host;

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

  const body = !granted ? (
    <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
      <div className="text-sm font-semibold text-fg">Access restricted</div>
      <div className="mt-2 text-xs text-fg-muted">
        {blockedLabel} is required to view this page.
        <br />
        Your current role is <span className="font-mono text-fg">{session.role}</span>.
        Contact your administrator to request access.
      </div>
    </div>
  ) : (
    <>{props.children}</>
  );

  return fallback == null ? (
    body
  ) : (
    <>
      {host}
      {body}
    </>
  );
}

export function useCapability(required: CapabilityRequirement): boolean {
  const { session } = useSession();
  return authorizeCapability(session.role, required);
}
