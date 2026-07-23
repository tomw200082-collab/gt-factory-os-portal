// ---------------------------------------------------------------------------
// Sidebar visibility — pure helpers over NAV_MANIFEST (tranche 138).
//
// SideNav is a React component and hard to snapshot per role. This module
// factors the *visibility decision* out of it into a pure function the
// component consumes and unit tests assert against, so "which rows does role R
// see in the sidebar?" has ONE answer, testable without rendering.
//
// A row is a SIDEBAR row when it clears three gates, in order:
//   1. placement — only "side" (the default) renders in the rail; "top" lives
//      in the TopBar, "command" is ⌘K / deep-link only (tranche 138 fold).
//   2. role      — navItemAllowsRole: min_role floor, or the exact `roles`
//      allow-list when present (tranche 138).
//   3. capability truthfulness (tranche 138 / D2) — a row whose
//      required_capability the role can NEVER gain is HIDDEN; a row the role
//      could still gain stays visible-but-subdued (the padlock).
//
// Pure module: no React, no DOM — unit-tested in tests/unit/nav.
// ---------------------------------------------------------------------------

import { authorizeCapability, isCapabilityPermanentlyUnreachable } from "@/lib/auth/authorize";
import type { Role } from "@/lib/contracts/enums";
import { NAV_MANIFEST, navItemAllowsRole, type NavItem } from "./manifest";

export interface SidebarRow {
  item: NavItem;
  /** True when the role passes the role gate but lacks (yet could gain) the
   *  required capability — rendered with the padlock. Never-grantable rows are
   *  not returned at all (they're hidden), so `subdued` here is always the
   *  truthful "you could unlock this" state. */
  subdued: boolean;
}

/** Does this manifest entry render as a SideNav row for `role`? */
export function isSidebarRowVisible(role: Role, item: NavItem): boolean {
  if ((item.placement ?? "side") !== "side") return false;
  if (!navItemAllowsRole(role, item)) return false;
  if (
    item.required_capability &&
    isCapabilityPermanentlyUnreachable(role, item.required_capability)
  ) {
    return false; // D2 — never-grantable ⇒ hidden, not padlocked
  }
  return true;
}

/** Every sidebar row a role sees, in manifest order, with its subdued flag. */
export function sidebarRowsForRole(role: Role): SidebarRow[] {
  const rows: SidebarRow[] = [];
  for (const group of NAV_MANIFEST) {
    for (const item of group.items) {
      if (!isSidebarRowVisible(role, item)) continue;
      const cap = item.required_capability;
      rows.push({ item, subdued: cap ? !authorizeCapability(role, cap) : false });
    }
  }
  return rows;
}

/** Convenience: just the hrefs a role sees in the sidebar (for snapshots). */
export function sidebarHrefsForRole(role: Role): string[] {
  return sidebarRowsForRole(role).map((r) => r.item.href);
}
