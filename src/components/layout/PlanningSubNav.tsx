"use client";

// ---------------------------------------------------------------------------
// PlanningSubNav — horizontal tab strip rendered on every /planning/* page.
//
// Sits just above page content. Gives planners instant cross-page navigation
// without hunting the sidebar. Auto-highlights the active route; scrolls
// horizontally on narrow viewports.
//
// Blockers tab shows a live critical-blocker badge when fail_hard count > 0.
// Uses a minimal dedicated query (["blockers-badge"]) with 2-min staleTime so
// every planning page doesn't thrash the server — one fetch every two minutes.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  CalendarCheck,
  CalendarRange,
  Factory,
  FlaskConical,
  Layers,
  LineChart,
  ListChecks,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface PlanningTab {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  exact?: boolean;
  badgeKey?: "blockers";
}

const PLANNING_TABS: PlanningTab[] = [
  {
    href: "/planning",
    label: "Overview",
    shortLabel: "Overview",
    icon: LineChart,
    exact: true,
  },
  {
    href: "/planning/meeting",
    label: "Weekly Meeting",
    shortLabel: "Meeting",
    icon: CalendarCheck,
  },
  {
    href: "/planning/forecast",
    label: "Forecast",
    shortLabel: "Forecast",
    icon: TrendingUp,
  },
  {
    href: "/planning/runs",
    label: "Run History",
    shortLabel: "Runs",
    icon: ListChecks,
  },
  {
    href: "/planning/production-plan",
    label: "Production Plan",
    shortLabel: "Plan",
    icon: Factory,
  },
  {
    // Tranche 028 — merged procurement front door (action list by decision).
    href: "/planning/procurement",
    label: "Procurement",
    shortLabel: "Procure",
    icon: ShoppingCart,
  },
  {
    href: "/planning/production-simulation",
    label: "Production Simulation",
    shortLabel: "Simulation",
    icon: FlaskConical,
  },
  {
    href: "/planning/weekly-outlook",
    label: "Weekly Outlook",
    shortLabel: "Outlook",
    icon: CalendarRange,
  },
  {
    href: "/planning/inventory-flow",
    label: "Inventory Flow",
    shortLabel: "Flow",
    icon: Layers,
  },
  {
    href: "/planning/blockers",
    label: "Blockers",
    shortLabel: "Blockers",
    icon: AlertOctagon,
    badgeKey: "blockers",
  },
];

function isTabActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

// ---------------------------------------------------------------------------
// Minimal badge query — fetches only fail_hard count (page_size=1 is enough
// to get the total_blocker_count from the response envelope).
// ---------------------------------------------------------------------------

interface BlockersBadgeResponse {
  total_blocker_count: number;
}

function useBlockersBadge(): number {
  const { data } = useQuery<BlockersBadgeResponse>({
    queryKey: ["blockers-badge"],
    queryFn: async () => {
      const res = await fetch(
        "/api/planning/blockers?severity=fail_hard&page_size=1",
        { method: "GET" },
      );
      if (!res.ok) return { total_blocker_count: 0 };
      return (await res.json()) as BlockersBadgeResponse;
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
    // Don't throw — badge is non-critical; fail silently
    throwOnError: false,
  });
  return data?.total_blocker_count ?? 0;
}

export function PlanningSubNav() {
  const pathname = usePathname();
  const criticalBlockerCount = useBlockersBadge();

  return (
    <nav aria-label="Planning sections" className="relative">
      {/* Subtle wash to distinguish sub-nav from page content */}
      <div className="absolute inset-0 bg-bg-raised/50" aria-hidden />

      <div className="relative overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-end gap-0 border-b border-border/60">
          {PLANNING_TABS.map((tab) => {
            const active = isTabActive(tab.href, pathname, tab.exact);
            const Icon = tab.icon;
            const badgeCount =
              tab.badgeKey === "blockers" ? criticalBlockerCount : 0;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Base layout
                  "group relative flex shrink-0 items-center gap-1.5 px-3.5 py-2.5",
                  "text-xs font-medium",
                  // Transitions
                  "transition-colors duration-150",
                  // Focus ring
                  "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                  // State-based backgrounds (active tab gets subtle tint)
                  active
                    ? "text-accent"
                    : "text-fg-muted hover:bg-bg-subtle/60 hover:text-fg",
                  // Active tint
                  active && "bg-accent-soft/50",
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
                    active
                      ? "text-accent"
                      : "text-fg-faint group-hover:text-fg-subtle",
                  )}
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />

                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>

                {/* Critical blockers badge — red pill on the Blockers tab */}
                {badgeCount > 0 ? (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                      "bg-danger text-fg-inverted text-3xs font-bold tabular-nums leading-none",
                      "animate-fade-in",
                    )}
                    aria-label={`${badgeCount} critical blockers`}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                ) : null}

                {/* Active indicator line at bottom of tab */}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-[2px] rounded-t-full",
                    "transition-colors duration-150",
                    active ? "bg-accent" : "bg-transparent group-hover:bg-border/40",
                  )}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
