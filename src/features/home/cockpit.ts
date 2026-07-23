// ---------------------------------------------------------------------------
// Home cockpit — role-tailored card-home model (Tranche 090, Slice B / Phase 2).
//
// "The Line" cockpit: each role lands on a curated front door — ONE large
// primary tile (their #1 daily action; size = frequency of use) plus grouped
// supporting tiles. Role-TAILORED, not role-locked:
//   - The tile catalogue is one source of truth (HOME_TILES).
//   - Each role's cockpit picks a primary + an ordered set of GROUPS to feature.
//   - Visibility is gated by the SAME two checks the SideNav uses
//     (meetsMinRole + authorizeCapability), so HOME can never offer a tile the
//     role can't actually open, and admin — who passes every gate and whose
//     cockpit lists every group — sees everything. Nothing is removed: anything
//     a role can reach is still one sidebar / ⌘K click away.
//
// Language: the bookkeeper/office (viewer) cockpit renders Hebrew + RTL per the
// Tom-authorized exception in CLAUDE.md (2026-06-26). Every other role's view
// stays English-first. Hebrew strings live in the `he` field per tile.
//
// Static shortcuts only — no live data, zero backend (tranche 090 §G.2).
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Cog,
  Coins,
  Factory,
  GitBranch,
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  MinusCircle,
  Package,
  PackageCheck,
  PackageOpen,
  Plug,
  Receipt,
  Scale,
  Shapes,
  ShoppingBasket,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

import type { Role } from "@/lib/contracts/enums";
import { authorizeCapability, type CapabilityRequirement } from "@/lib/auth/authorize";

export type Lang = "en" | "he";
export type Dir = "ltr" | "rtl";

export type HomeGroupKey =
  | "overview"
  | "triage"
  | "planning"
  | "office"
  | "stock"
  | "admin";

export interface HomeStrings {
  label: string;
  blurb: string;
}

export interface HomeTile {
  href: string;
  /** English label + blurb (the default for every role except the bookkeeper). */
  label: string;
  blurb: string;
  icon: LucideIcon;
  group: HomeGroupKey;
  /** Coarse audience filter — mirrors the nav manifest `min_role`. */
  minRole: Role;
  /** Authoritative capability gate — identical to RoleGate / SideNav. */
  required: CapabilityRequirement;
  /** Hebrew strings, used only when the cockpit lang is "he" (bookkeeper). */
  he?: HomeStrings;
}

// Role coarse-rank — kept identical to SideNav.ROLE_ORDER so the card-home and
// the sidebar curate the same way (no "home offers it, sidebar hides it" drift).
const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  planner: 3,
  admin: 4,
};

function meetsMinRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export const HOME_GROUP_LABEL: Record<HomeGroupKey, { en: string; he: string }> = {
  overview: { en: "Overview", he: "מבט-על" },
  triage: { en: "Triage", he: "לטיפול" },
  planning: { en: "Planning & purchasing", he: "תכנון ורכש" },
  office: { en: "Office & finance", he: "משרד וכספים" },
  stock: { en: "Stock", he: "מלאי" },
  admin: { en: "Admin", he: "ניהול" },
};

// ---------------------------------------------------------------------------
// Tile catalogue — one source of truth. Curated (not the full ~30-item nav):
// the home is the front door, the sidebar + ⌘K hold the long tail. Each group
// is kept ≤ 7 (tranche 090 §C.6).
// ---------------------------------------------------------------------------
export const HOME_TILES: readonly HomeTile[] = [
  // ——— Overview ———————————————————————————————————————————————————————
  {
    href: "/dashboard",
    label: "Dashboard",
    blurb: "The pulse — today's factory state at a glance.",
    icon: LayoutDashboard,
    group: "overview",
    minRole: "viewer",
    required: "viewer:read",
    he: { label: "לוח בקרה", blurb: "מבט-על על המפעל — מה קורה היום." },
  },
  {
    href: "/me/activity",
    label: "My activity",
    blurb: "Your recent submissions and their status.",
    icon: Clock,
    group: "overview",
    minRole: "viewer",
    required: "stock:execute",
  },
  // ——— Triage ————————————————————————————————————————————————————————
  {
    href: "/inbox",
    label: "Inbox",
    blurb: "Approvals and exceptions in one queue.",
    icon: Inbox,
    group: "triage",
    minRole: "viewer",
    required: "viewer:read",
    he: { label: "תיבה נכנסת", blurb: "אישורים וחריגים — הכול במקום אחד." },
  },
  // ——— Planning & purchasing ————————————————————————————————————————
  {
    href: "/planning/procurement",
    label: "Procurement",
    blurb: "The weekly buying flow — review and place planned orders.",
    icon: ShoppingBasket,
    group: "planning",
    minRole: "planner",
    required: "planning:read",
  },
  {
    href: "/planning/production-plan",
    label: "Daily production plan",
    blurb: "Plan output by day; mark planned, done, or cancelled.",
    icon: CalendarDays,
    group: "planning",
    minRole: "viewer",
    required: "planning:read",
  },
  {
    href: "/planning/forecast",
    label: "Forecast",
    blurb: "Create, edit, and publish forecast versions.",
    icon: LineChart,
    group: "planning",
    minRole: "viewer",
    required: "planning:read",
  },
  {
    href: "/planning/inventory-flow",
    label: "Inventory flow",
    blurb: "Daily projected balance per item, with shortage tier.",
    icon: TrendingUp,
    group: "planning",
    minRole: "viewer",
    required: "planning:read",
  },
  {
    href: "/admin/decision-board",
    label: "Decision board",
    blurb: "Protect, promote, reprice, or drop on margin × velocity.",
    icon: Scale,
    group: "planning",
    minRole: "planner",
    required: "planning:execute",
  },
  {
    href: "/admin/economics",
    label: "Economics",
    blurb: "Margins, costs, and the profit pool.",
    icon: Coins,
    group: "planning",
    minRole: "planner",
    required: "planning:execute",
  },
  // ——— Office & finance ——————————————————————————————————————————————
  {
    href: "/credit-tracking",
    label: "Credit tracking",
    blurb: "Picking shortages — credited, deferred, or supplied.",
    icon: CircleDollarSign,
    group: "office",
    minRole: "viewer",
    required: "viewer:read",
    he: { label: "מעקב זיכויים", blurb: "חוסרים בליקוט — זוכה, נדחה או סופק." },
  },
  {
    href: "/purchase-orders",
    label: "Purchase orders",
    blurb: "Open, partial, and received purchase orders.",
    icon: ShoppingCart,
    group: "office",
    minRole: "viewer",
    required: "viewer:read",
    he: { label: "הזמנות רכש", blurb: "הזמנות פתוחות, חלקיות ושהתקבלו." },
  },
  {
    // FLOW-8 (ux-release-gate 2026-07-16, closed by Tom decision same day):
    // this tile is minRole:"planner" because placing an order requires
    // planning:execute — but ROLE_COCKPIT gives every "planner" persona
    // lang:"en" (only "viewer" gets "he"), so a `he` field here could never
    // render for any real user. The office manager (Doreen) is provisioned
    // role=planner (she needs planning:execute), so she sees this tile in
    // English on /home; her actual work page (/purchase-orders/placement-queue)
    // stays Hebrew regardless, per its own route-level authorization below.
    // Do not re-add `he` here without also revisiting ROLE_COCKPIT's lang map.
    href: "/purchase-orders/placement-queue",
    label: "Orders to place",
    blurb: "Confirm supplier price + terms, then place the order.",
    icon: PackageCheck,
    group: "office",
    minRole: "planner",
    required: "planning:execute",
  },
  {
    href: "/admin/cost-drafts",
    label: "Price updates",
    blurb: "Approve cost changes sourced from purchase orders.",
    icon: Receipt,
    group: "office",
    minRole: "admin",
    required: "admin:execute",
    he: { label: "עדכוני מחיר", blurb: "אישור עדכוני עלות שמקורם בהזמנות." },
  },
  // ——— Stock ————————————————————————————————————————————————————————
  {
    href: "/stock/production-actual",
    label: "Production Report",
    blurb: "Report output and scrap; consumption is computed from the active recipe.",
    icon: Factory,
    group: "stock",
    minRole: "viewer",
    required: "stock:execute",
  },
  {
    href: "/stock/receipts",
    label: "Goods receipt",
    blurb: "Receive stock, with or without an open PO.",
    icon: PackageOpen,
    group: "stock",
    minRole: "viewer",
    required: "stock:execute",
  },
  {
    // Tranche 138 — ordered ahead of Waste/adjustment so the operator's stock
    // group leads with the Dennis/Maxim reality (Production Report is the hero
    // tile; Goods receipt + Physical count are the next two daily actions).
    href: "/stock/physical-count",
    label: "Physical count",
    blurb: "Blind count — you don't see current stock. Freeze on submit; stock truth updates on approval.",
    icon: ClipboardCheck,
    group: "stock",
    minRole: "viewer",
    required: "stock:execute",
  },
  {
    href: "/stock/waste-adjustments",
    label: "Waste / adjustment",
    blurb: "Record loss or positive adjustments.",
    icon: MinusCircle,
    group: "stock",
    minRole: "viewer",
    required: "stock:execute",
  },
  {
    href: "/inventory",
    label: "Inventory",
    blurb: "Current stock across items and components.",
    icon: Layers,
    group: "stock",
    minRole: "viewer",
    required: "viewer:read",
    he: { label: "מלאי", blurb: "מצב המלאי לפי פריטים ורכיבים." },
  },
  // ——— Admin (admin only) ————————————————————————————————————————————
  {
    href: "/admin/items",
    label: "Items",
    blurb: "Item master — finished goods, components, repack.",
    icon: Package,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
  {
    href: "/admin/components",
    label: "Components",
    blurb: "Component master + supplier mapping.",
    icon: Cog,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
  {
    href: "/admin/suppliers",
    label: "Suppliers",
    blurb: "Supplier master + payment terms.",
    icon: Building2,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
  {
    href: "/admin/masters/boms",
    label: "BOMs",
    blurb: "BOM heads, versions, and line structure.",
    icon: GitBranch,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
  {
    href: "/admin/groups",
    label: "Groups",
    blurb: "Product and material group vocabularies.",
    icon: Shapes,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
  {
    href: "/admin/jobs",
    label: "Jobs",
    blurb: "Scheduled jobs monitor.",
    icon: Activity,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
  {
    href: "/admin/integrations",
    label: "Integrations",
    blurb: "LionWheel, Shopify, and Green Invoice health.",
    icon: Plug,
    group: "admin",
    minRole: "admin",
    required: "admin:execute",
  },
];

// ---------------------------------------------------------------------------
// Per-role cockpit — primary tile + ordered groups + language/direction.
// ---------------------------------------------------------------------------
export interface RoleCockpit {
  /** href of the role's large hero tile (their #1 daily action). */
  primaryHref: string;
  /** Groups to feature on this role's home, in render order. */
  groupOrder: HomeGroupKey[];
  lang: Lang;
  dir: Dir;
}

export const ROLE_COCKPIT: Record<Role, RoleCockpit> = {
  // Owner / superuser — sees every group (everything), pulse-first.
  admin: {
    primaryHref: "/dashboard",
    groupOrder: ["overview", "triage", "planning", "office", "stock", "admin"],
    lang: "en",
    dir: "ltr",
  },
  // Owner / planner — lands on the weekly buying decision.
  planner: {
    primaryHref: "/planning/procurement",
    groupOrder: ["overview", "triage", "planning", "office", "stock"],
    lang: "en",
    dir: "ltr",
  },
  // Production operator — production-first, then the rest of the floor tasks.
  operator: {
    primaryHref: "/stock/production-actual",
    groupOrder: ["stock", "triage", "overview"],
    lang: "en",
    dir: "ltr",
  },
  // Bookkeeper / office — Hebrew RTL, finance-first (Tom-authorized surface).
  viewer: {
    primaryHref: "/credit-tracking",
    groupOrder: ["office", "triage", "overview"],
    lang: "he",
    dir: "rtl",
  },
};

const MAX_TILES_PER_GROUP = 7; // tranche 090 §C.6

export interface HomeCockpitGroup {
  key: HomeGroupKey;
  label: { en: string; he: string };
  tiles: HomeTile[];
}

export interface HomeCockpitView {
  primary: HomeTile | null;
  groups: HomeCockpitGroup[];
  lang: Lang;
  dir: Dir;
}

/** A tile is visible to a role iff it clears BOTH the coarse role filter and
 *  the authoritative capability gate — the same pair the SideNav uses. */
export function isTileVisible(role: Role, tile: HomeTile): boolean {
  return meetsMinRole(role, tile.minRole) && authorizeCapability(role, tile.required);
}

/** Resolve a tile's display strings for the cockpit language (Hebrew falls back
 *  to English when no `he` strings exist). */
export function tileText(tile: HomeTile, lang: Lang): HomeStrings {
  if (lang === "he" && tile.he) return tile.he;
  return { label: tile.label, blurb: tile.blurb };
}

/** Build the role's curated cockpit: primary hero + ordered, capability-gated
 *  groups. Pure + deterministic — no Date, no I/O — so it is unit-testable. */
export function buildHomeCockpit(role: Role): HomeCockpitView {
  const cockpit = ROLE_COCKPIT[role];
  const accessible = HOME_TILES.filter((t) => isTileVisible(role, t));
  const primary = accessible.find((t) => t.href === cockpit.primaryHref) ?? null;

  const groups: HomeCockpitGroup[] = [];
  for (const key of cockpit.groupOrder) {
    const tiles = accessible
      .filter((t) => t.group === key && t.href !== primary?.href)
      .slice(0, MAX_TILES_PER_GROUP);
    if (tiles.length > 0) {
      groups.push({ key, label: HOME_GROUP_LABEL[key], tiles });
    }
  }

  return { primary, groups, lang: cockpit.lang, dir: cockpit.dir };
}
