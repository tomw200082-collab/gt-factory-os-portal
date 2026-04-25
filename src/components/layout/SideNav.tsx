"use client";

// ---------------------------------------------------------------------------
// SideNav — rewritten in Tranche A of portal-full-production-refactor to
// consume src/lib/nav/manifest.ts and filter by authorizeCapability.
//
// Previous implementation hand-curated per-item `roles: [...]` arrays and
// shipped "backend" / "ledger" / "planning" blocked-tag strings that went
// stale as backend surfaces landed. The new design has a single truth
// source (the manifest) and a single decision function
// (authorizeCapability) that both sidebar and layouts consume.
//
// Rendering rules:
//   - If the signed-in role does not pass `min_role`, the item is HIDDEN.
//   - If the role passes `min_role` but NOT `required_capability`, the
//     item renders SUBDUED with a tooltip naming the missing capability.
//     (This is the truthfulness rule: we tell users why they can't do
//     something rather than pretending it doesn't exist.)
//   - If both gates pass, the item renders in full active/inactive style.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Lock, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import {
  NAV_MANIFEST,
  type NavItem,
  type NavItemBadge,
  type NavGroup,
} from "@/lib/nav/manifest";
import type { Role } from "@/lib/contracts/enums";
import { cn } from "@/lib/cn";

const ROLE_ORDER: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  planner: 3,
  admin: 4,
};

function meetsMinRole(role: Role, min: Role): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}

interface SideNavEntry {
  item: NavItem;
  subdued: boolean;
}

function readBadgeCount(
  queryClient: ReturnType<typeof useQueryClient>,
  badge: NavItemBadge | undefined,
): number {
  if (!badge) return 0;
  const data = queryClient.getQueryData<unknown>(
    badge.queryKey as readonly unknown[],
  );
  if (badge.countSelector === "length") {
    if (Array.isArray(data)) return data.length;
  }
  return 0;
}

function groupHasActivePath(group: NavGroup, pathname: string | null): boolean {
  if (!pathname) return false;
  return group.items.some(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
}

export function SideNavSkeleton() {
  return (
    <nav className="flex flex-col gap-4 animate-pulse">
      {[4, 2, 7, 5, 1].map((count, gi) => (
        <div key={gi}>
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="h-2 w-12 rounded bg-bg-subtle" />
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="flex flex-col gap-px">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-sm px-2.5 py-1.5">
                <div className="h-4 w-4 shrink-0 rounded bg-bg-subtle" />
                <div className="h-2.5 flex-1 rounded bg-bg-subtle" style={{ width: `${55 + (i * 13) % 35}%` }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function SideNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { session, isLoading } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  if (isLoading) return <SideNavSkeleton />;

  // Track which collapsible groups are expanded. Starts from defaultCollapsed
  // only — SSR-safe (no window access). Auto-expand for active path happens
  // in the useEffect below.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const group of NAV_MANIFEST) {
      if (!group.collapsible) continue;
      if (!group.defaultCollapsed) set.add(group.title);
    }
    return set;
  });

  const toggleGroup = useCallback((title: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }, []);

  // Auto-expand a collapsible group when the active path is inside it.
  // Uses a functional updater so we don't need expandedGroups in the deps.
  useEffect(() => {
    const activeGroup = NAV_MANIFEST.find(
      (g) => g.collapsible && groupHasActivePath(g, pathname),
    );
    if (!activeGroup) return;
    setExpandedGroups((prev) => {
      if (prev.has(activeGroup.title)) return prev;
      return new Set([...prev, activeGroup.title]);
    });
  }, [pathname]);

  return (
    <nav className="flex flex-col gap-4">
      {NAV_MANIFEST.map((group) => {
        const entries: SideNavEntry[] = group.items
          .filter((i) => meetsMinRole(session.role, i.min_role))
          .map((i) => {
            const grantOK =
              i.required_capability === undefined ||
              authorizeCapability(session.role, i.required_capability);
            return { item: i, subdued: !grantOK };
          });

        if (entries.length === 0) return null;

        const isCollapsible = !!group.collapsible;
        const isExpanded = !isCollapsible || expandedGroups.has(group.title);

        return (
          <div key={group.title}>
            {isCollapsible ? (
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="mb-2 flex w-full items-center gap-2 px-2 text-left"
                aria-expanded={isExpanded}
              >
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  {group.title}
                </div>
                {!isExpanded && (
                  <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-bg-subtle px-1 text-[0.625rem] font-semibold tabular-nums text-fg-muted ring-1 ring-border/60">
                    {entries.length}
                  </span>
                )}
                <div className="h-px flex-1 bg-border/50" />
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 text-fg-faint transition-transform duration-150",
                    isExpanded ? "rotate-0" : "-rotate-90",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            ) : (
              <div className="mb-2 flex items-center gap-2 px-2">
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  {group.title}
                </div>
                <div className="h-px flex-1 bg-border/50" />
              </div>
            )}
            {isExpanded && (
            <ul className="flex flex-col gap-px">
              {entries.map(({ item, subdued }) => {
                const active =
                  !subdued &&
                  (pathname === item.href ||
                    pathname?.startsWith(item.href + "/"));
                const Icon = item.icon;
                const tooltip = subdued
                  ? `Requires capability: ${item.required_capability}`
                  : undefined;

                const badgeCount = !subdued
                  ? readBadgeCount(queryClient, item.badge)
                  : 0;

                const inner = (
                  <>
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent"
                        aria-hidden
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        "h-[15px] w-[15px] shrink-0",
                        active
                          ? "text-accent"
                          : subdued
                            ? "text-fg-faint"
                            : "text-fg-faint group-hover:text-fg-subtle",
                      )}
                      strokeWidth={active ? 2 : 1.75}
                    />
                    <span
                      className={cn(
                        "flex-1 truncate text-[0.8125rem]",
                        active && "font-semibold tracking-tightish",
                        subdued && "text-fg-faint",
                      )}
                    >
                      {item.label}
                    </span>
                    {!subdued && badgeCount > 0 ? (
                      <span
                        className={cn(
                          "inline-flex min-w-[1.25rem] items-center justify-center rounded-full border px-1.5 py-0.5 text-3xs font-semibold tabular-nums",
                          active
                            ? "border-accent/40 bg-accent text-white"
                            : "border-border/70 bg-bg-subtle text-fg-strong",
                        )}
                        data-testid={`sidenav-badge-${item.href}`}
                        aria-label={`${badgeCount} pending`}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    ) : null}
                    {subdued ? (
                      <span
                        className="flex items-center gap-0.5 text-3xs font-semibold uppercase tracking-sops text-fg-faint"
                        title={tooltip}
                      >
                        <Lock className="h-2.5 w-2.5" strokeWidth={2.25} />
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <li key={item.href}>
                    {subdued ? (
                      <span
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-fg-faint",
                          "cursor-not-allowed opacity-70",
                        )}
                        title={tooltip}
                        aria-disabled="true"
                      >
                        {inner}
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-fg transition-colors duration-150 ease-out-quart",
                          active
                            ? "bg-accent-soft text-accent"
                            : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                        )}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </div>
        );
      })}

      <UserCard session={session} />
    </nav>
  );
}

// ---------------------------------------------------------------------------
// UserCard — identity footer rendered at the bottom of the sidebar.
// Shows the signed-in user's avatar (initials), display name, email, and role.
// Sign-out routes to /auth/signout which Supabase auth wires up when live.
// ---------------------------------------------------------------------------

import type { DevShimSession } from "@/lib/auth/fake-auth";

function getInitials(name: string, email: string): string {
  const clean = name.split(" (")[0].trim();
  if (clean) {
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  planner: "Planner",
  operator: "Operator",
  viewer: "Viewer",
};

function UserCard({ session }: { session: DevShimSession }) {
  const initials = getInitials(session.display_name, session.email);
  const displayName = session.display_name.split(" (")[0] || session.email;
  const roleLabel = ROLE_LABELS[session.role] ?? session.role;

  return (
    <div className="mt-4 rounded-md border border-border/60 bg-bg-subtle/60 p-3">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[0.6875rem] font-bold text-accent"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8125rem] font-semibold text-fg-strong">
            {displayName}
          </div>
          <div className="mt-0.5 truncate font-mono text-3xs uppercase tracking-sops text-fg-muted">
            {roleLabel}
          </div>
        </div>
      </div>
      <div className="mt-2.5 border-t border-border/50 pt-2">
        <Link
          href="/auth/signout"
          className="flex items-center gap-1.5 text-3xs font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <LogOut className="h-3 w-3" strokeWidth={2} aria-hidden />
          Sign out
        </Link>
      </div>
    </div>
  );
}
