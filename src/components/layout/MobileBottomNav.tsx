"use client";

// ---------------------------------------------------------------------------
// MobileBottomNav — fixed bottom tab bar, visible on <md only (Tranche 051,
// FLOW-016).
//
// Five curated tabs (Dashboard / Production / Procurement / Inventory /
// Inbox) defined in src/lib/nav/bottom-nav.ts, role-filtered with the SAME
// session source SideNav uses (useSession → /api/me role). The role IS
// available client-side; while it is loading we render nothing rather than
// flash the wrong tab set (AppShellChrome reserves the bar's space with a
// static mobile bottom padding, so there is no layout shift). On a session
// load error we fall back to showing all five — middleware remains the real
// gate either way.
//
// Active tab: usePathname prefix match (exact or path-segment child).
//
// Touch targets: each tab is min-h-[56px] and flex-1 wide (≥72px on a 375px
// viewport) — comfortably over the 44px minimum.
//
// Z-order: z-30 sits BELOW the MobileNav drawer backdrop (z-[45]) and panel
// (z-50), so the open drawer darkens and covers this bar — no conflict, no
// explicit hide needed. It sits above page content (sticky toolbars in
// pages use z-10).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/lib/auth/session-provider";
import {
  bottomTabTestId,
  filterBottomNavByRole,
  isBottomTabActive,
} from "@/lib/nav/bottom-nav";
import { cn } from "@/lib/cn";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { session, isLoading, loadError } = useSession();

  // No tabs until the session resolves (the provider's placeholder role is
  // "viewer", which would briefly hide planner tabs from planners).
  if (isLoading) return null;

  const tabs = filterBottomNavByRole(loadError ? null : session.role);
  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="Quick navigation"
      data-testid="mobile-bottom-nav"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-border/70 bg-bg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex">
        {tabs.map((tab) => {
          const active = isBottomTabActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                data-testid={bottomTabTestId(tab.href)}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5",
                  "text-[10px] font-medium leading-none transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
                  active
                    ? "font-semibold text-accent"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                <Icon
                  className="h-5 w-5"
                  strokeWidth={active ? 2.25 : 2}
                  aria-hidden
                />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
