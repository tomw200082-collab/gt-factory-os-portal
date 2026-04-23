// ---------------------------------------------------------------------------
// Dashboard Control Tower — role-adapted quick actions launcher.
//
// Introduced by Tranche C of portal-full-production-refactor (plan §E).
//
// Each launcher tile declares its minimum capability requirement. The
// dashboard filters the tile list by authorizeCapability(role, required)
// from src/lib/auth/authorize.ts — identical enforcement path as RoleGate
// and SideNav. No hand-curated role arrays.
//
// URL canonicality: every href below MUST be a canonical domain-first URL
// per plan §B.1. The CI lint guard (scripts/check-no-persona-in-urls.mjs)
// will fail the build if any href carries a route-group literal.
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  ClipboardCheck,
  Cog,
  Factory,
  Inbox as InboxIcon,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Network,
  Package,
  PackageOpen,
  ShoppingCart,
  Sliders,
} from "lucide-react";

import type { CapabilityRequirement } from "@/lib/auth/authorize";

export interface QuickAction {
  href: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  required: CapabilityRequirement;
  category: "stock" | "planning" | "admin" | "triage" | "overview";
}

// Canonical launcher set — domain-first URLs (plan §B.1). The category is a
// UI projection only; the capability requirement is the authoritative gate.
export const QUICK_ACTIONS: readonly QuickAction[] = [
  // Overview / triage — always visible to authenticated roles.
  {
    href: "/inbox",
    label: "Open Inbox",
    blurb: "Triage approvals + exceptions in one list.",
    icon: InboxIcon,
    required: "viewer:read",
    category: "triage",
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    blurb: "Control tower — live operational signals.",
    icon: LayoutDashboard,
    required: "viewer:read",
    category: "overview",
  },
  // Stock — operator + admin execute; planner + viewer see read-only links
  // would not land here (category filters to stock:execute).
  {
    href: "/stock/receipts",
    label: "Goods Receipt",
    blurb: "Receive stock, with or without an open PO.",
    icon: PackageOpen,
    required: "stock:execute",
    category: "stock",
  },
  {
    href: "/stock/waste-adjustments",
    label: "Waste / Adjustment",
    blurb: "Record loss or positive adjustments (with approval for large).",
    icon: Sliders,
    required: "stock:execute",
    category: "stock",
  },
  {
    href: "/stock/physical-count",
    label: "Physical Count",
    blurb: "Blind count; freeze-on-submit; anchor on approval.",
    icon: ClipboardCheck,
    required: "stock:execute",
    category: "stock",
  },
  {
    href: "/stock/production-actual",
    label: "Production Actual",
    blurb: "Output + scrap; BOM-derived consumption.",
    icon: Factory,
    required: "stock:execute",
    category: "stock",
  },
  // Planning — planner + admin execute.
  {
    href: "/planning/forecast",
    label: "Forecast",
    blurb: "Create, edit, publish forecast versions.",
    icon: LineChart,
    required: "planning:read",
    category: "planning",
  },
  {
    href: "/planning/runs",
    label: "Planning Runs",
    blurb: "Review runs + purchase/production recommendations.",
    icon: ListChecks,
    required: "planning:read",
    category: "planning",
  },
  {
    href: "/purchase-orders",
    label: "Purchase Orders",
    blurb: "Open / partial / received POs.",
    icon: ShoppingCart,
    required: "viewer:read",
    category: "planning",
  },
  // Admin — admin only.
  {
    href: "/admin/items",
    label: "Items",
    blurb: "Item master — FG, components, REPACK, BOUGHT_FINISHED.",
    icon: Package,
    required: "admin:execute",
    category: "admin",
  },
  {
    href: "/admin/components",
    label: "Components",
    blurb: "Component master + supplier mapping.",
    icon: Cog,
    required: "admin:execute",
    category: "admin",
  },
  {
    href: "/admin/masters/boms",
    label: "BOMs",
    blurb: "BOM heads + versions + line structure.",
    icon: Network,
    required: "admin:execute",
    category: "admin",
  },
  {
    href: "/admin/suppliers",
    label: "Suppliers",
    blurb: "Supplier master + payment terms.",
    icon: Building2,
    required: "admin:execute",
    category: "admin",
  },
  {
    href: "/admin/jobs",
    label: "Jobs",
    blurb: "Scheduled jobs monitor.",
    icon: Activity,
    required: "admin:execute",
    category: "admin",
  },
];
