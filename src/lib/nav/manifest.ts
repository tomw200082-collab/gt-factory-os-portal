// ---------------------------------------------------------------------------
// Navigation manifest — typed, capability-aware. Substrate for Tranche A.
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
// Grouping follows plan §B.1 layout:
//   Overview | Inbox | Stock | Planning | Purchase Orders | Admin | System
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardCheck,
  Cog,
  Factory,
  Inbox,
  LayoutDashboard,
  LineChart,
  Link2,
  ListChecks,
  Network,
  Package,
  PackageOpen,
  ShoppingCart,
  Sliders,
  Tags,
  TriangleAlert,
} from "lucide-react";

import type { Role } from "@/lib/contracts/enums";
import type { CapabilityRequirement } from "@/lib/auth/authorize";

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
}

export interface NavGroup {
  title: string;
  items: NavItem[];
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
      },
      {
        href: "/exceptions",
        label: "Exceptions",
        icon: TriangleAlert,
        min_role: "viewer",
        // Legacy (planner)/layout.tsx allow={planner, admin, viewer} means
        // operators get a "not for your role" card on click. Tranche B will
        // move /exceptions under /inbox or tighten its gate; for now the
        // nav item is visible to everyone and the layout is the blocker.
        required_capability: "planning:read",
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
        icon: Sliders,
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
      // /stock/submissions is a Tranche A target URL per plan §B.1 but its
      // consolidation from legacy /my-submissions is explicitly out of
      // Tranche A scope (plan §C.5). The nav entry is omitted for now so
      // the zero-404 walk stays green; it will land with Tranche F or the
      // dedicated consolidation cycle.
    ],
  },
  {
    title: "Planning",
    items: [
      {
        href: "/planning",
        label: "Planning",
        icon: LineChart,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/forecast",
        label: "Forecast",
        icon: LineChart,
        min_role: "viewer",
        required_capability: "planning:read",
      },
      {
        href: "/planning/runs",
        label: "Planning Runs",
        icon: ListChecks,
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
    items: [
      // NOTE: admin surfaces require admin:execute to MATCH the
      // (admin)/layout.tsx gate. If the layout ever drops to admin:read
      // (allowing read-only viewer access), flip these back. Keeping them
      // aligned avoids the "sidebar links to a blocked page" anti-pattern.
      {
        href: "/admin/items",
        label: "Items",
        icon: Package,
        min_role: "viewer",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/components",
        label: "Components",
        icon: Cog,
        min_role: "viewer",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/boms",
        label: "BOMs",
        icon: Network,
        min_role: "viewer",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/suppliers",
        label: "Suppliers",
        icon: Building2,
        min_role: "viewer",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/supplier-items",
        label: "Supplier items",
        icon: Link2,
        min_role: "viewer",
        required_capability: "admin:execute",
      },
      {
        href: "/admin/planning-policy",
        label: "Planning policy",
        icon: Sliders,
        min_role: "viewer",
        required_capability: "admin:execute",
      },
    ],
  },
  {
    title: "System",
    items: [
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
      // /admin/users, /admin/jobs, /admin/integrations are route-manifest
      // status=quarantined as of Tranche 001 (their pages render
      // <QuarantinedPage>). They are intentionally omitted from SideNav so
      // primary nav never points at a quarantined surface. When real
      // implementations land, add rows here and flip route-manifest status
      // back to live in the same tranche.
      //
      // /admin/signals is a plan §B.1 target URL; its page is a Tranche G
      // deliverable. Omitted from nav until that surface lands.
    ],
  },
];
