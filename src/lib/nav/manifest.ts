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
  AlertOctagon,
  Archive,
  ArrowLeftRight,
  Building2,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Cog,
  Factory,
  GitBranch,
  Home,
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  Link2,
  MinusCircle,
  Network,
  Package,
  PackageOpen,
  Plug,
  Scale,
  ScrollText,
  Settings2,
  Shapes,
  ShieldCheck,
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
  // Tranche 138 — optional EXACT role allow-list. `min_role` is only a floor
  // and cannot exclude a middle role (e.g. keep viewer + planner + admin but
  // drop operator). When `roles` is present it OVERRIDES `min_role`: the entry
  // is curated only for the listed roles. This is a nav-visibility filter
  // only — it never changes route access (middleware + layout RoleGate are
  // unchanged), so every URL stays reachable via ⌘K / deep link. Applied
  // identically by SideNav, TopBar, and CommandPalette (see navItemAllowsRole).
  roles?: Role[];
  // When present, the entry renders subdued (not hidden) for roles that
  // have min_role access but lack this capability. When absent, the entry
  // is fully available to any role that passes min_role.
  required_capability?: CapabilityRequirement;
  // Optional count badge. The SideNav reads the cache key during render; if
  // the cache is cold or the count is 0, the label renders without a pill.
  badge?: NavItemBadge;
  // Tranche 090 — placement. "top" renders the item in the TopBar primary nav
  // (the universal pulse: Dashboard, Inbox) instead of the SideNav. The item
  // STAYS in the manifest so active-path resolution + breadcrumb labels keep
  // working; the SideNav simply skips "top" items. Default/absent = "side".
  //
  // Tranche 138 — "command": a demoted-but-live surface. It renders in NEITHER
  // the SideNav nor the TopBar, but STAYS in the manifest so the CommandPalette
  // (⌘K) and active-path/breadcrumb resolution keep finding it, and the URL
  // stays a live deep link. Used for diagnostic-only pages folded out of
  // primary nav (production-simulation, blockers) without deleting the route.
  placement?: "top" | "side" | "command";
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  // When true the group header is a toggle. defaultCollapsed sets the initial
  // state; the sidebar auto-expands if the active path is within the group.
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

// Coarse role rank — viewer < operator < planner < admin. Shared by every nav
// consumer (SideNav, TopBar, CommandPalette) so the role floor is computed one
// way, not re-derived per component.
export const NAV_ROLE_ORDER: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  planner: 3,
  admin: 4,
};

/**
 * navItemAllowsRole — the single coarse role gate for nav visibility.
 *
 * When `item.roles` is present it is an EXACT allow-list and OVERRIDES the
 * `min_role` floor (tranche 138); otherwise `min_role` is a lower bound.
 * SideNav, TopBar, and CommandPalette all call this so a folded item can never
 * vanish from one surface while lingering in another. Route ACCESS is
 * unaffected — this only decides whether the entry is *listed*.
 */
export function navItemAllowsRole(role: Role, item: NavItem): boolean {
  if (item.roles) return item.roles.includes(role);
  return NAV_ROLE_ORDER[role] >= NAV_ROLE_ORDER[item.min_role];
}

export const NAV_MANIFEST: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        // Tranche 090 (Slice B) — the card-home landing + first top-bar tab.
        href: "/home",
        label: "Home",
        icon: Home,
        min_role: "viewer",
        required_capability: "viewer:read",
        placement: "top",
      },
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        min_role: "viewer",
        required_capability: "viewer:read",
        placement: "top", // Tranche 090 — pulse, lives in the TopBar
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
        placement: "top", // Tranche 090 — attention queue, lives in the TopBar
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
      {
        // Bookkeeper shortage-resolution table (Tom 2026-06-12): every
        // picking shortage (credit_tasks) with credited/deferred/supplied
        // marks. Backs the missing-picks daily email cumulative CSV.
        href: "/credit-tracking",
        label: "Credit Tracking",
        icon: CircleDollarSign,
        min_role: "viewer",
        required_capability: "viewer:read",
        // Tranche 138 — the bookkeeper's queue (Dorin/office). Operators
        // (Dennis/Maxim) never work credits, so scope it out of their sidebar
        // via the exact allow-list; the route stays reachable for them by URL.
        roles: ["viewer", "planner", "admin"],
      },
    ],
  },
  {
    title: "Stock",
    // Tranche 090 — thin-sidebar progressive disclosure. Collapsed by default so
    // the owner's sidebar stops being a flat ~30-item haystack; SideNav
    // auto-expands this group when the active path is inside it, so daily stock
    // use stays one click. Nothing removed — full access is one expand away.
    collapsible: true,
    defaultCollapsed: true,
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
        label: "Production Report",
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
        // Tranche 138 — ledger read-model for verification/debug (Tom + office
        // usage, not floor usage). Out of the operator sidebar; reachable by
        // URL/⌘K for everyone the middleware already admits.
        roles: ["viewer", "planner", "admin"],
      },
    ],
  },
  {
    title: "Planning",
    // Tranche 090 — collapsed by default (progressive disclosure). Auto-expands
    // on active path. The heaviest group (9 items); the daily cadence is reached
    // from the card-home, not by scanning this list.
    collapsible: true,
    defaultCollapsed: true,
    items: [
      {
        href: "/planning",
        label: "Planning Overview",
        icon: LineChart,
        // Tranche 138 — raised viewer→planner. Self-declared "Engine
        // diagnostic" (retitled tranche 125), not a corridor surface;
        // operators/viewers have no action on it. Route access unchanged.
        min_role: "planner",
        required_capability: "planning:read",
      },
      {
        href: "/planning/forecast",
        label: "Forecast",
        icon: TrendingUp,
        // Tranche 138 — raised viewer→planner. Monthly Tom cadence; operator/
        // viewer writes are server-blocked anyway, so the row was pure noise
        // for Dennis/Maxim/Dorin. Route access unchanged.
        min_role: "planner",
        required_capability: "planning:read",
      },
      // Tranche 045 — "Run History" removed from primary nav. The page stays
      // live at /planning/runs (blockers + critical-today depend on runs) but
      // is diagnostic-only; ordering goes through /planning/procurement.
      {
        href: "/planning/production-plan",
        label: "Daily Production Plan",
        icon: Factory,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        // DR-018 FLOW-001 (Tranche 121, 2026-07-03) — the Thursday "firm the
        // week" cockpit had no nav entry at all; it was only reachable via
        // deep link. route-manifest.json already lists /planning/meeting as
        // live for operator/planner/admin/viewer and middleware already
        // allows it — this is a nav-only addition.
        href: "/planning/meeting",
        label: "Weekly Meeting",
        icon: CalendarCheck,
        min_role: "planner",
        required_capability: "planning:read",
      },
      {
        // Tranche 028 — merged procurement front door. Replaces the separate
        // "Purchase Session" + "Purchase Calendar" entries with one action-list
        // page grouped by decision. The old routes stay live and URL-reachable
        // (de-linked) until focus mode supersedes them in Tranche 029.
        href: "/planning/procurement",
        label: "Procurement",
        icon: ShoppingCart,
        min_role: "planner",
        required_capability: "planning:read",
      },
      {
        // 2026-05-12 — widened from cycle-16 admin-only to planner+admin per
        // Tom's request ("add access also for planner"). Cycle-16 had pinned
        // this surface to admin because the page is IDB-backed and can
        // silently disagree with live database state (audit 2026-05-01 §16 #9
        // P0). The driver is unchanged: full backend wiring is still queued
        // as a separate W4 contract → W1 backend → W2 portal sequence. What
        // changes is the audience that can navigate here: planners now need
        // routine access to the simulator, and the data-quality risk is
        // contained at the page surface — the non-dismissible "Simulation
        // preview only — this does not change inventory and is not the
        // production planning source of truth" banner at
        // src/app/(planning)/planning/production-simulation/page.tsx stays
        // in place. We deliberately do NOT use min_role:"viewer" here even
        // though the rest of the Planning group does, because viewers and
        // operators have no decision authority over the output and the
        // containment posture argues for the narrowest audience that can
        // act on the simulation.
        href: "/planning/production-simulation",
        label: "Production Simulation",
        icon: Network,
        min_role: "planner",
        required_capability: "planning:read",
        // Tranche 138 — folded out of primary nav (⌘K + deep link only). It
        // carries a permanent containment banner ("preview only, not source of
        // truth"), is IDB-backed, and sits in no corridor, so it only cluttered
        // the Planning group. Page stays live (route-manifest unchanged).
        placement: "command",
      },
      {
        href: "/planning/inventory-flow",
        label: "Inventory Flow",
        icon: CalendarDays,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/blockers",
        label: "Blockers",
        icon: AlertOctagon,
        min_role: "viewer",
        required_capability: "planning:read",
        // Tranche 138 — folded out of primary nav (⌘K + deep link only). It
        // depends on diagnostic runs, and dashboard/critical-today already
        // surfaces the actionable subset. Page stays live.
        placement: "command",
      },
      {
        // 2026-05-17 — moved here from the Admin group and widened from
        // admin-only to planner+admin per Tom's request. The page was lifted
        // out of the (admin) route group into a dedicated (economics) group
        // whose layout gates on planning:execute — a capability the lattice
        // grants to planner and admin only (operator/viewer hold
        // planning:read, below execute). The URL is unchanged
        // (/admin/economics) so existing links keep working; route-group
        // folders never appear in URLs. Component-cost edits and the manual
        // re-snapshot are enforced server-side on the same planner+admin gate.
        href: "/admin/economics",
        label: "Economics",
        icon: TrendingUp,
        min_role: "planner",
        required_capability: "planning:execute",
      },
      {
        // Tranche 080 — Product Decision Board. Joins /economics (margin,
        // cost, confidence) with /orders/by-item-and-period (units sold) in the
        // browser to rank products for protect / promote / reprice / drop. A
        // decision surface, distinct from the analyst-grade Economics table.
        // Same (economics) route group → planner+admin via planning:execute.
        href: "/admin/decision-board",
        label: "Decision Board",
        icon: Scale,
        min_role: "planner",
        required_capability: "planning:execute",
      },
    ],
  },
  {
    title: "Purchase Orders",
    // Tranche 090 — collapsed by default (progressive disclosure). Auto-expands
    // on active path.
    collapsible: true,
    defaultCollapsed: true,
    items: [
      {
        href: "/purchase-orders",
        label: "Purchase Orders",
        icon: ShoppingCart,
        min_role: "viewer",
        required_capability: "viewer:read",
      },
      {
        // Tranche 086 — office-manager queue of APPROVED_TO_ORDER POs awaiting
        // placement (price + payment terms → OPEN). Hebrew page; English nav
        // label like the rest of the shell.
        href: "/purchase-orders/placement-queue",
        label: "Orders to Place",
        icon: ClipboardCheck,
        min_role: "planner",
        required_capability: "planning:execute",
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
        // Tranche 044 (Groups v1) — curated product/material group
        // vocabularies that drive the Inventory category chips and the
        // flow-page group filters.
        href: "/admin/groups",
        label: "Groups",
        icon: Shapes,
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
        // Tranche 043 (Price Truth) — pending supplier_cost_drafts review
        // queue: PO-entered prices whose delta vs the effective cost needs
        // admin approval before becoming the catalog cost.
        href: "/admin/cost-drafts",
        label: "Price updates",
        icon: CircleDollarSign,
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
        href: "/admin/sku-health",
        label: "SKU Health",
        icon: ShieldCheck,
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
      {
        href: "/admin/masters/archive",
        label: "Archive",
        icon: Archive,
        min_role: "admin",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/holidays",
        label: "Holidays (IL)",
        icon: CalendarDays,
        min_role: "admin",
        required_capability: "admin:execute",
      },
    ],
  },
  {
    title: "Me",
    items: [
      {
        href: "/me/activity",
        label: "My activity",
        icon: Clock,
        min_role: "viewer",
        required_capability: "stock:execute",
      },
    ],
  },
];
