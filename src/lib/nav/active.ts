// ---------------------------------------------------------------------------
// Active-nav resolution — pure helpers over NAV_MANIFEST (Tranche 056,
// mobile nav redesign).
//
// With the bottom tab bar removed, the TopBar shows the current page's nav
// label on phone widths so the operator always knows where they are without
// opening the drawer. This module answers "which manifest entry owns this
// pathname?" with the same exact-or-path-segment-prefix rule SideNav uses
// for its active highlight, picking the LONGEST matching href when entries
// nest (e.g. /planning vs /planning/production-plan).
//
// Pure module: no React, no DOM — unit-tested in active.test.ts.
// ---------------------------------------------------------------------------

import { NAV_MANIFEST, type NavGroup, type NavItem } from "./manifest";

export interface ActiveNavEntry {
  item: NavItem;
  group: NavGroup;
}

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Resolve the manifest entry that owns `pathname`, or null when no entry
 * matches (login, signout, routes intentionally outside primary nav).
 * Longest-href match wins so nested entries beat their section root.
 */
export function findActiveNavEntry(
  pathname: string | null,
): ActiveNavEntry | null {
  if (!pathname) return null;
  let best: ActiveNavEntry | null = null;
  for (const group of NAV_MANIFEST) {
    for (const item of group.items) {
      if (!matches(pathname, item.href)) continue;
      if (!best || item.href.length > best.item.href.length) {
        best = { item, group };
      }
    }
  }
  return best;
}

/**
 * Human label for the current page, or null when the pathname is not owned
 * by any manifest entry.
 */
export function activeNavLabel(pathname: string | null): string | null {
  return findActiveNavEntry(pathname)?.item.label ?? null;
}
