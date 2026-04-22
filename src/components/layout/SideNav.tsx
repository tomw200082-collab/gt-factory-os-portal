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
import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import {
  NAV_MANIFEST,
  type NavItem,
  type NavItemBadge,
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

export function SideNav() {
  const { session } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  return (
    <nav className="flex flex-col gap-6">
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

        return (
          <div key={group.title}>
            <div className="mb-2 flex items-center gap-2 px-2">
              <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                {group.title}
              </div>
              <div className="h-px flex-1 bg-border/50" />
            </div>
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
          </div>
        );
      })}

      <div className="mt-4 rounded-md border border-border/60 bg-bg-subtle/60 p-3">
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          You are
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="dot bg-warning" />
          <span className="text-sm font-medium text-fg-strong">
            {session.display_name.split(" (")[0] || session.email}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-3xs uppercase tracking-sops text-fg-muted">
          role · {session.role}
        </div>
      </div>
    </nav>
  );
}
