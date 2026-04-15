"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  CheckSquare,
  ClipboardCheck,
  Cog,
  Factory,
  FileText,
  Hammer,
  Home,
  Inbox,
  LayoutDashboard,
  LineChart,
  Link2,
  Lock,
  Network,
  Package,
  PackageOpen,
  Plug,
  ShoppingCart,
  Sliders,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/lib/auth/session-provider";
import type { Role } from "@/lib/contracts/enums";
import { cn } from "@/lib/cn";

interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  icon: LucideIcon;
  blocked?: "backend" | "ledger" | "planning";
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["operator", "planner", "admin", "viewer"] },
      { label: "Exceptions", href: "/exceptions", icon: TriangleAlert, roles: ["planner", "admin"] },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Home", href: "/home", icon: Home, roles: ["operator"] },
      { label: "Goods Receipt", href: "/ops/receipts", icon: PackageOpen, roles: ["operator"], blocked: "ledger" },
      { label: "Waste / Adjustment", href: "/ops/waste-adjustments", icon: Sliders, roles: ["operator"], blocked: "ledger" },
      { label: "Physical Count", href: "/ops/counts", icon: ClipboardCheck, roles: ["operator"], blocked: "ledger" },
      { label: "Production Actual", href: "/ops/production-actual", icon: Factory, roles: ["operator"], blocked: "ledger" },
      { label: "My Submissions", href: "/my-submissions", icon: Inbox, roles: ["operator"] },
    ],
  },
  {
    title: "Planning",
    items: [
      { label: "Forecast", href: "/planning/forecast", icon: LineChart, roles: ["planner", "admin", "viewer"], blocked: "backend" },
      { label: "Purchase Recs", href: "/planning/purchase-recommendations", icon: ShoppingCart, roles: ["planner", "admin", "viewer"], blocked: "planning" },
      { label: "Production Recs", href: "/planning/production-recommendations", icon: Hammer, roles: ["planner", "admin", "viewer"], blocked: "planning" },
      { label: "Approvals", href: "/approvals", icon: CheckSquare, roles: ["planner", "admin"] },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { label: "PO Creation", href: "/purchasing/po", icon: FileText, roles: ["planner", "admin"], blocked: "backend" },
    ],
  },
  {
    title: "Master data",
    items: [
      { label: "Items", href: "/admin/items", icon: Package, roles: ["admin", "planner"] },
      { label: "Components", href: "/admin/components", icon: Cog, roles: ["admin", "planner"] },
      { label: "BOMs", href: "/admin/boms", icon: Network, roles: ["admin", "planner"] },
      { label: "Suppliers", href: "/admin/suppliers", icon: Building2, roles: ["admin", "planner"] },
      { label: "Supplier items", href: "/admin/supplier-items", icon: Link2, roles: ["admin", "planner"] },
      { label: "Planning policy", href: "/admin/planning-policy", icon: Sliders, roles: ["admin", "planner"] },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Users", href: "/admin/users", icon: Users, roles: ["admin"] },
      { label: "Jobs", href: "/admin/jobs", icon: Activity, roles: ["admin", "planner"] },
      { label: "Integrations", href: "/admin/integrations", icon: Plug, roles: ["admin"], blocked: "backend" },
    ],
  },
];

const BLOCKED_LABEL: Record<NonNullable<NavItem["blocked"]>, string> = {
  backend: "backend contract",
  ledger: "stock-ledger phase",
  planning: "planning engine phase",
};

export function SideNav() {
  const { session } = useSession();
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter((i) => i.roles.includes(session.role));
        if (visible.length === 0) return null;
        return (
          <div key={group.title}>
            <div className="mb-2 flex items-center gap-2 px-2">
              <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                {group.title}
              </div>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <ul className="flex flex-col gap-px">
              {visible.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-fg transition-colors duration-150 ease-out-quart",
                        active
                          ? "bg-accent-soft text-accent"
                          : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                      )}
                    >
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
                            : "text-fg-faint group-hover:text-fg-subtle"
                        )}
                        strokeWidth={active ? 2 : 1.75}
                      />
                      <span
                        className={cn(
                          "flex-1 truncate text-[0.8125rem]",
                          active && "font-semibold tracking-tightish"
                        )}
                      >
                        {item.label}
                      </span>
                      {item.blocked ? (
                        <span
                          className="flex items-center gap-0.5 text-3xs font-semibold uppercase tracking-sops text-fg-faint"
                          title={`Blocked — ${BLOCKED_LABEL[item.blocked]}`}
                        >
                          <Lock className="h-2.5 w-2.5" strokeWidth={2.25} />
                        </span>
                      ) : null}
                    </Link>
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
            {session.display_name.split(" (")[0]}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-3xs uppercase tracking-sops text-fg-muted">
          role · {session.role}
        </div>
      </div>
    </nav>
  );
}
