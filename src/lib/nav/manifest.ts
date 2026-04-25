// ---------------------------------------------------------------------------
// Navigation manifest — typed, capability-aware.
//
// This file is the SINGLE SOURCE OF TRUTH for the sidebar shape. The sidebar
// consumes this manifest; it does NOT hand-curate role arrays. Items without
// the current user's `min_role` or `required_capability` render in a subdued
// state with a tooltip naming the missing capability, rather than disappearing
// entirely. That design decision comes from plan §C.1 "Navigation rebuild".
//
// URL strings in this manifest are domain-first and MUST NOT contain route
// group parentheses. The CI guard `scripts/check-no-persona-in-urls.mjs`
// enforces this.
//
// Grouping:
//   Overview | Inbox | Stock | Planning | Purchase Orders | Admin
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Cog,
  Factory,
  GitBranch,
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  Link2,
  ListChecks,
  MinusCircle,
  Network,
  Package,
  PackageOpen,
  Plug,
  ScrollText,
  Settings2,
  ShoppingCart,
  Tags,
  TrendingUp,
  Users,
} from "lucide-react";

import type { Role } from "@/lib/contracts/enums";
import type { CapabilityRequirement } from "@/lib/auth/authorize";

// Badge descriptor for a nav item. When present, the sidebar reads the
// TanStack Query cache at `queryKey` and renders a count pill next to the
// label. The cached value is expected to be an array (of inbox rows, typically).
// `countSelector: "length"` means the count is `data.length`. This shape is
// intentionally minimal; extend only when a second selector is actually
// needed.
export interface NavItemBadge {
  queryKey: readonly (string | number | boolean | null | undefined)[];
  countSelector: "length";
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // The minimum role that CAN have any reason to see this entry. The real
  // gate is `required_capability`; `min_role` is a coarse filter used for
  // layout-independent filtering (e.g. hiding admin-only entries from
  // operators entirely rather than showing them subdued).
  min_role: Role;
  // When present, the entry renders subdued (not hidden) for roles that
  // have min_role access but lack this capability. When absent, the entry
  // is fully available to any role that passes min_role.
  required_capability?: CapabilityRequirement;
  // Optional count badge. The SideNav reads the cache key during render; if
  // the cache is cold or the count is 0, the label renders without a pill.
  badge?: NavItemBadge;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  // When true the group header is a toggle. defaultCollapsed sets the initial
  // state; the sidebar auto-expands if the active path is within the group.
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const NAV_MANIFEST: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        min_role: "viewer",
        required_capability: "viewer:read",
      },
    ],
  },
  {
    title: "Inbox",
    items: [
      {
        href: "/inbox",
        label: "Inbox",
        icon: Inbox,
        min_role: "viewer",
        required_capability: "viewer:read",
        // Tranche B: the inbox page seeds an ["inbox", "all_rows"] cache with
        // the merged, unfiltered row set. SideNav reads that cache here and
        // renders a count pill when rows > 0. Cold cache (sidebar rendered
        // before the first inbox visit) = no pill, which is the correct
        // visible state.
        badge: {
          queryKey: ["inbox", "all_rows"] as const,
          countSelector: "length",
        },
      },
    ],
  },
  {
    title: "Stock",
    items: [
      {
        href: "/stock/receipts",
        label: "Goods Receipt",
        icon: PackageOpen,
        min_role: "viewer",
        required_capability: "stock:execute",
      },
      {
        href: "/stock/waste-adjustments",
        label: "Waste / Adjustment",
        icon: MinusCircle,
        min_role: "viewer",
        required_capability: "stock:execute",
      },
      {
        href: "/stock/physical-count",
        label: "Physical Count",
        icon: ClipboardCheck,
        min_role: "viewer",
        required_capability: "stock:execute",
      },
      {
        href: "/stock/production-actual",
        label: "Production Actual",
        icon: Factory,
        min_role: "viewer",
        required_capability: "stock:execute",
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Layers,
        min_role: "viewer",
        required_capability: "viewer:read",
      },
      {
        href: "/stock/movement-log",
        label: "Movement Log",
        icon: ScrollText,
        min_role: "viewer",
        required_capability: "viewer:read",
      },
      {
        href: "/stock/submissions",
        label: "My History",
        icon: Clock,
        min_role: "viewer",
        required_capability: "stock:execute",
      },
    ],
  },
  {
    title: "Planning",
    items: [
      {
        href: "/planning",
        label: "Planning Overview",
        icon: LineChart,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/forecast",
        label: "Forecast",
        icon: TrendingUp,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/runs",
        label: "Run History",
        icon: ListChecks,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/boms",
        label: "BOM Simulation",
        icon: Network,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/weekly-outlook",
        label: "Weekly Outlook",
        icon: CalendarDays,
        min_role: "viewer",
        required_capability: "planning:read",
      },
    ],
  },
  {
    title: "Purchase Orders",
    items: [
      {
        href: "/purchase-orders",
        label: "Purchase Orders",
        icon: ShoppingCart,
        min_role: "viewer",
        required_capability: "viewer:read",
      },
    ],
  },
  {
    title: "Admin",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      // NOTE: admin surfaces require admin:execute to MATCH the
      // (admin)/layout.tsx gate. If the layout ever drops to admin:read
      // (allowing read-only viewer access), flip these back. Keeping them
      // aligned avoids the "sidebar links to a blocked page" anti-pattern.
      {
        href: "/admin/items",
        label: "Items",
        icon: Package,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/components",
        label: "Components",
        icon: Cog,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/masters/boms",
        label: "BOMs",
        icon: GitBranch,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/suppliers",
        label: "Suppliers",
        icon: Building2,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/supplier-items",
        label: "Supplier Items",
        icon: Link2,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/planning-policy",
        label: "Planning Policy",
        icon: Settings2,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/jobs",
        label: "Jobs",
        icon: Activity,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/integrations",
        label: "Integrations",
        icon: Plug,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        // Page currently lives at /admin/sku-aliases; plan §B.1 target URL
        // is /admin/integrations/sku-aliases. Move is a later tranche; keep
        // the current live URL to preserve zero-404.
        href: "/admin/sku-aliases",
        label: "SKU Aliases",
        icon: Tags,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/sku-map",
        label: "SKU Mappings",
        icon: ArrowLeftRight,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/masters/health",
        label: "Master Data Health",
        icon: AlertCircle,
        min_role: "admin",
        required_capability: "admin:execute",
      },
    ],
  },
];
