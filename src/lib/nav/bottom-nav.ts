// ---------------------------------------------------------------------------
// Bottom-nav manifest — pure helpers for <MobileBottomNav> (Tranche 051,
// FLOW-016).
//
// The five tabs are a curated mobile subset of NAV_MANIFEST (the single
// source of truth for nav role gating). Each tab's `min_role` is LOOKED UP
// from the manifest by href rather than hand-curated here, so a future
// manifest widening/narrowing (e.g. Procurement planner→viewer) flows into
// the bottom bar automatically.
//
// Pure module: no React, no DOM — unit-tested in bottom-nav.test.ts.
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
  Factory,
  Inbox,
  Layers,
  LayoutDashboard,
  ShoppingCart,
} from "lucide-react";

import type { Role } from "@/lib/contracts/enums";
import { NAV_MANIFEST } from "./manifest";

export interface BottomNavTab {
  href: string;
  /** Short label — the bar renders it at text-[10px], keep it to one word. */
  label: string;
  icon: LucideIcon;
  /** Mirrors SideNav's coarse visibility gate (manifest min_role). */
  min_role: Role;
}

// Same ordering SideNav uses; kept local so this module stays pure
// (no import from the client-only SideNav component).
const ROLE_ORDER: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  planner: 3,
  admin: 4,
};

function manifestMinRole(href: string): Role {
  for (const group of NAV_MANIFEST) {
    for (const item of group.items) {
      if (item.href === href) return item.min_role;
    }
  }
  // An href missing from the manifest is treated as viewer-visible —
  // middleware remains the real gate either way.
  return "viewer";
}

export const BOTTOM_NAV_TABS: readonly BottomNavTab[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    min_role: manifestMinRole("/dashboard"),
  },
  {
    href: "/planning/production-plan",
    label: "Production",
    icon: Factory,
    min_role: manifestMinRole("/planning/production-plan"),
  },
  {
    href: "/planning/procurement",
    label: "Procurement",
    icon: ShoppingCart,
    min_role: manifestMinRole("/planning/procurement"),
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: Layers,
    min_role: manifestMinRole("/inventory"),
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: Inbox,
    min_role: manifestMinRole("/inbox"),
  },
];

/**
 * Filter the five tabs by the signed-in role, mirroring SideNav's HIDDEN
 * rule for items below min_role. Pass `null` when the role is unknown
 * (session load error): all five render and middleware gates navigation.
 */
export function filterBottomNavByRole(role: Role | null): BottomNavTab[] {
  if (role === null) return [...BOTTOM_NAV_TABS];
  return BOTTOM_NAV_TABS.filter(
    (tab) => ROLE_ORDER[role] >= ROLE_ORDER[tab.min_role],
  );
}

/**
 * Active-route test: exact match or path-segment prefix match
 * (`/inventory` is active on `/inventory/ITEM-1` but NOT on a sibling
 * route that merely shares the string prefix).
 */
export function isBottomTabActive(
  pathname: string | null,
  href: string,
): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

/** Stable testid slug for a tab href: "/planning/production-plan" → "production-plan". */
export function bottomTabTestId(href: string): string {
  const slug = href.split("/").filter(Boolean).pop() ?? "root";
  return `mobile-bottom-nav-${slug}`;
}
