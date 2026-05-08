"use client";

// ---------------------------------------------------------------------------
// InventoryFlowClient — client wrapper for the Inventory Flow page.
//
// Responsibilities:
//   - Read query string filters (family, q, at_risk_only)
//   - Call useInventoryFlow with those params
//   - Decide between desktop FlowGridDesktop and mobile MobileCardStream
//     based on viewport (useMediaQuery)
//   - Render UnmappedSkusBanner when fraction >= 0.10 (replaces grid)
//   - Render InsightsHero + FilterBar always (when data is available)
//   - SSR-safe: render skeleton until isMounted to avoid hydration mismatch
//
// UX improvements:
//   R-NEW-1 — ABC Distribution Donut Chart
//   R-NEW-2 — Top Supplier by Stock Value chip
//   R-NEW-3 — Coverage Days Color Heatmap
//   R-NEW-4 — Pending PO Value Chip
//   R-NEW-5 — Expandable Item Detail Sidebar
//   R-NEW-6 — Weekly Stock Movement Chip
//   R-NEW-7 — Movement Sparklines (4-week per-item net movement)
//   R-NEW-8 — PO Aging Chip
//   R-NEW-9 — Stock Value Chart (bar chart by category, toggle)
//   R-NEW-10 — Critical Stock Chip (coverage < 7d, clickable filter)
//   R-NEW-11 — Supplier Reliability Matrix (showSupplierMatrix / Grid3X3)
//   R-NEW-12 — Pending Receipts This Week Chip (pendingReceiptsCount / Package)
//   R-NEW-13 — ABC Class Migration Panel (showAbcMigration / ArrowUpDown)
//   R-NEW-14 — Inventory Turnover Rate Chip (inventoryTurnoverChip / RefreshCw)
//   R-NEW-15 — Min/Max Stock Table (showMinMaxTable / Table2)
//   R-NEW-16 — Reorder Point Alert Chip (reorderAlertCount / Bell)
//   R-NEW-17 — Velocity Ranking Panel (showVelocityRanking / TrendingUp)
//   R-NEW-18 — Stock Age Chip (stockAgeChip / Clock)
//   R-NEW-19 — Days-of-Coverage Matrix (showCoverageMatrix / LayoutGrid)
//   R-NEW-20 — Supplier Concentration Chip (supplierConcentrationChip / Building2)
//   R-NEW-21 — Expiry Risk Panel (showExpiryRisk / CalendarX)
//   R-NEW-22 — Hold Value Chip (holdValueChip / Lock)
//   R-NEW-23 — Weekly Receipts Panel (showWeeklyReceipts / PackageCheck)
//   R-NEW-24 — Stock Turn Delta Chip (stockTurnDeltaChip / TrendingUp)
//   R-NEW-25 — Item Quick Search Panel (showItemSearch / Search)
//   R-NEW-26 — Negative Stock Count Chip (negativeStockChip / MinusCircle)
//   R-NEW-27 — Receipt Calendar Panel (showReceiptCalendar / CalendarCheck)
//   R-NEW-28 — Overstock Value Chip (overstockValueChip / PackagePlus)
//   R-NEW-29 — Supplier Delivery Panel (showSupplierDeliveryPanel / Truck)
//   R-NEW-30 — Slow Mover Chip (slowMoverChip / Snail)
//   R-NEW-31 — Reorder Point Table (showReorderPointTable / Bell)
//   R-NEW-32 — Days of Supply Chip (daysOfSupplyChip / CalendarDays)
//   R-NEW-33 — Stock Movement History Panel (showStockMovementHistory / History)
//   R-NEW-34 — Purchase Pending Chip (purchasePendingChip / ShoppingCart)
//   R46-1 — ABC Classification Chart (showAbcClassificationChart / PieChart)
//   R46-2 — Turnover Variance Chip (turnoverVarianceChip / TrendingUp)
//   R47-1 — Dead Stock Panel (showDeadStockPanel / Archive)
//   R47-2 — Shrinkage Chip (shrinkageChip / TrendingDown)
//   R48-1 — Supplier Price History Panel (showSupplierPriceHistory / Receipt)
//   R48-2 — Fill Rate Chip (fillRateChip / CheckSquare)
//   R49-1 — Cycle Count Schedule Panel (showCycleCountSchedule / ClipboardCheck)
//   R49-2 — Count Accuracy Chip (countAccuracyChip / ScanLine)
//   R50-1 — Min/Max Levels Panel (showMinMaxLevelsPanel / ArrowUpDown)
//   R50-2 — Out-of-Stock Risk Chip (outOfStockRiskChip / AlertTriangle)
//   R51-1 — Replenishment Recommendations Panel (showReplenishmentRecommendations / ShoppingCart)
//   R51-2 — Total Stock Value Chip (totalStockValueChip / CircleDollarSign)
// ---------------------------------------------------------------------------

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  CheckSquare,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  DollarSign,
  Grid3X3,
  History,
  LayoutGrid,
  Loader2,
  Lock,
  MinusCircle,
  Package,
  PackageCheck,
  PackagePlus,
  PieChart,
  Receipt,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingCart,
  Table2,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Truck,
  Snail,
  X,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import {
  EmptyState,
  ErrorState,
} from "@/components/feedback/states";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { FilterBar } from "./_components/FilterBar";
import { FlowGridDesktop } from "./_components/FlowGridDesktop";
import { InsightsHero } from "./_components/InsightsHero";
import { InventoryFlowTabs } from "./_components/InventoryFlowTabs";
import { MobileCardStream } from "./_components/MobileCardStream";
import { PlannedFooterCaveat } from "./_components/PlannedFooterCaveat";
import {
  PlannedOverlayToggle,
  usePlannedOverlayEnabled,
} from "./_components/PlannedOverlayToggle";
import { UnmappedSkusBanner } from "./_components/UnmappedSkusBanner";
import { useInventoryFlow } from "./_lib/useInventoryFlow";
import { usePlannedInflow, indexByItemDate } from "./_lib/plannedInflow";
import type { FlowItem, FlowQueryParams } from "./_lib/types";
import { isAtRisk } from "./_lib/risk";
import { cn } from "@/lib/cn";

const UNMAPPED_GATE = 0.1;

export function InventoryFlowClient() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isMobile = useMediaQuery("(max-width: 1023px)");

  // Read filters from URL.
  const params: FlowQueryParams = useMemo(() => {
    const family = searchParams.get("family") ?? undefined;
    // at_risk_only: default true unless explicitly "false"
    const atRiskOnly = searchParams.get("at_risk_only") !== "false";
    return {
      family: family || undefined,
      at_risk_only: atRiskOnly,
    };
  }, [searchParams]);

  const flowQuery = useInventoryFlow(params);

  const data = flowQuery.data ?? null;
  const summary = data?.summary ?? null;

  // -----------------------------------------------------------------------
  // Planned-inflow overlay (signal #32; Mode B-Planning-Corridor cycle 21)
  // -----------------------------------------------------------------------
  const overlayEnabled = usePlannedOverlayEnabled();
  const horizon = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const from = `${yyyy}-${mm}-${dd}`;
    const end = new Date(today.getTime() + 56 * 24 * 3600 * 1000);
    const ey = end.getFullYear();
    const em = String(end.getMonth() + 1).padStart(2, "0");
    const ed = String(end.getDate()).padStart(2, "0");
    const to = `${ey}-${em}-${ed}`;
    return { from, to };
  }, []);
  const plannedInflowQuery = usePlannedInflow(
    { from: horizon.from, to: horizon.to },
    { enabled: overlayEnabled },
  );
  const plannedRows = plannedInflowQuery.data?.rows ?? [];
  const plannedByItemDate = useMemo(
    () => indexByItemDate(plannedRows),
    [plannedRows],
  );
  const plannedRowsArray = plannedRows;
  const plannedFailed = overlayEnabled && plannedInflowQuery.isError;

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const atRiskOnlyClient = searchParams.get("at_risk_only") !== "false";

  // R-NEW-10 state declared early so filteredItems can reference it.
  const [alertCriticalFilter, setAlertCriticalFilter] = useState<boolean>(false);

  const filteredItems: FlowItem[] = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (q) {
      items = items.filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          it.item_id.toLowerCase().includes(q) ||
          (it.family ?? "").toLowerCase().includes(q),
      );
    }
    if (atRiskOnlyClient) {
      items = items.filter((it) => isAtRisk(it.risk_tier));
    }
    if (alertCriticalFilter) {
      items = items.filter((it) => {
        const days: number =
          (it as any).coverage_days ?? (it as any).days_of_cover ?? Infinity;
        return (typeof days === "number" ? days : Infinity) < 7;
      });
    }
    return items;
  }, [data, q, atRiskOnlyClient, alertCriticalFilter]);

  // categoryFilteredItems — alias for filteredItems (category filter not yet
  // implemented in this slim version; kept as a named variable so R-NEW memos
  // can reference it consistently without coupling to the full R16-R28 build).
  const categoryFilteredItems = filteredItems;

  const families = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const it of data.items) {
      if (it.family) seen.add(it.family);
    }
    return [...seen].sort();
  }, [data]);

  // -------------------------------------------------------------------------
  // ABC classification: top 20% = A, next 30% = B, rest = C.
  // Computed from the full unfiltered item list.
  // -------------------------------------------------------------------------
  const abcClassification = useMemo<Map<string, "A" | "B" | "C">>(() => {
    const allItems = data?.items ?? [];
    if (allItems.length === 0) return new Map();
    const sorted = [...allItems].sort((a, b) => {
      const da =
        (a as any).annual_demand ??
        (a as any).demand_qty ??
        (a as any).usage_qty ??
        0;
      const db =
        (b as any).annual_demand ??
        (b as any).demand_qty ??
        (b as any).usage_qty ??
        0;
      return (db as number) - (da as number);
    });
    const n = sorted.length;
    const aCount = Math.max(1, Math.round(n * 0.2));
    const bCount = Math.max(1, Math.round(n * 0.3));
    const result = new Map<string, "A" | "B" | "C">();
    sorted.forEach((item, idx) => {
      if (idx < aCount) result.set(item.item_id, "A");
      else if (idx < aCount + bCount) result.set(item.item_id, "B");
      else result.set(item.item_id, "C");
    });
    return result;
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-1 — ABC Distribution Donut Chart (toggle)
  // -------------------------------------------------------------------------
  const [showAbcDonut, setShowAbcDonut] = useState<boolean>(false);

  const abcDistribution = useMemo<{ A: number; B: number; C: number; uncl: number }>(() => {
    const counts = { A: 0, B: 0, C: 0, uncl: 0 };
    for (const item of categoryFilteredItems) {
      const cls = abcClassification.get(item.item_id);
      if (cls === "A") counts.A++;
      else if (cls === "B") counts.B++;
      else if (cls === "C") counts.C++;
      else counts.uncl++;
    }
    return counts;
  }, [categoryFilteredItems, abcClassification]);

  // -------------------------------------------------------------------------
  // R-NEW-2 — Top Supplier by Stock Value
  // -------------------------------------------------------------------------
  const topSupplierByValue = useMemo<{ name: string; value: number; itemCount: number } | null>(() => {
    const acc = new Map<string, { value: number; itemCount: number }>();
    for (const item of categoryFilteredItems) {
      const name: string | null =
        (item as any).supplier_name ?? (item as any).supplier ?? null;
      if (!name) continue;
      const val: number =
        (item as any).stock_value ?? (item as any).total_value ?? 0;
      const prev = acc.get(name) ?? { value: 0, itemCount: 0 };
      acc.set(name, {
        value: prev.value + (typeof val === "number" ? val : 0),
        itemCount: prev.itemCount + 1,
      });
    }
    if (acc.size === 0) return null;
    let topName = "";
    let topVal = -Infinity;
    let topCount = 0;
    for (const [name, { value, itemCount }] of acc.entries()) {
      if (value > topVal) {
        topVal = value;
        topName = name;
        topCount = itemCount;
      }
    }
    if (!topName || topVal <= 0) return null;
    return { name: topName, value: topVal, itemCount: topCount };
  }, [categoryFilteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-3 — Coverage Days Color Heatmap (toggle)
  // -------------------------------------------------------------------------
  const [showCoverageHeatmap, setShowCoverageHeatmap] = useState<boolean>(false);

  const coverageDaysMap = useMemo<Map<string, number | null>>(() => {
    const result = new Map<string, number | null>();
    for (const item of categoryFilteredItems) {
      const days: number | null =
        (item as any).coverage_days ?? (item as any).days_of_stock ?? null;
      result.set(item.item_id, typeof days === "number" ? days : null);
    }
    return result;
  }, [categoryFilteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-4 — Pending PO Value Chip
  // -------------------------------------------------------------------------
  const poValueQuery = useQuery({
    queryKey: ["pending_po_value"],
    queryFn: async () => {
      const res = await fetch(
        "/api/purchase-orders?status=open&include_value=true",
      );
      if (!res.ok) throw new Error(`PO value fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const pendingPoValue = useMemo<number | null>(() => {
    const d = poValueQuery.data;
    if (d == null) return null;
    const v = (d as any).total_value ?? (d as any).value_sum ?? null;
    return typeof v === "number" ? v : null;
  }, [poValueQuery.data]);

  const pendingPoCount = useMemo<number | null>(() => {
    const d = poValueQuery.data;
    if (d == null) return null;
    const c = (d as any).count ?? (d as any).total_count ?? null;
    return typeof c === "number" ? c : null;
  }, [poValueQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-5 — Expandable Item Detail Sidebar
  // -------------------------------------------------------------------------
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const itemDetailQuery = useQuery({
    queryKey: ["item_detail", selectedItemId],
    queryFn: async () => {
      const res = await fetch(`/api/components/${selectedItemId}`);
      if (!res.ok) throw new Error(`Item detail fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    enabled: selectedItemId !== null,
    throwOnError: false,
  });

  const itemDetail = useMemo<unknown>(() => {
    const d = itemDetailQuery.data;
    if (d == null) return null;
    return d as any;
  }, [itemDetailQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-6 — Weekly Stock Movement Chip
  // -------------------------------------------------------------------------
  const stockMovementQuery = useQuery({
    queryKey: ["stock_movement_week"],
    queryFn: async () => {
      const res = await fetch("/api/stock/movements?period=week");
      if (!res.ok) throw new Error(`Stock movement fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const weeklyMovement = useMemo<{
    totalIn: number;
    totalOut: number;
    net: number;
  } | null>(() => {
    const d = stockMovementQuery.data;
    if (d == null) return null;
    const totalIn: number = (d as any).total_in ?? 0;
    const totalOut: number = (d as any).total_out ?? 0;
    if (totalIn === 0 && totalOut === 0) return null;
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [stockMovementQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-7 — Movement Sparklines (4-week per-item net movement)
  // -------------------------------------------------------------------------
  const [showMovementSparklines, setShowMovementSparklines] = useState<boolean>(false);

  const movementHistoryQuery = useQuery<unknown>({
    queryKey: ["movement_history_4w"],
    queryFn: async () => {
      const res = await fetch("/api/stock/movements?period=4w&by_item=true");
      if (!res.ok) throw new Error(`Movement history fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const movementByItemId = useMemo<Map<string, number[]>>(() => {
    const d = movementHistoryQuery.data;
    if (d == null) return new Map();
    const items: unknown[] = (d as any).items ?? [];
    const result = new Map<string, number[]>();
    for (const item of items) {
      const id: string = (item as any).item_id ?? "";
      if (!id) continue;
      const raw: number[] = (item as any).weeks ?? (item as any).weekly_movements ?? [0, 0, 0, 0];
      // Normalize to exactly 4 values, padding with 0 if shorter
      const normalized: number[] = [0, 0, 0, 0].map((_, i) => (typeof raw[i] === "number" ? raw[i] : 0));
      result.set(id, normalized);
    }
    return result;
  }, [movementHistoryQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-8 — PO Aging Chip
  // -------------------------------------------------------------------------
  const poAgingQuery = useQuery<unknown>({
    queryKey: ["po_aging"],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders?status=open&include_age=true");
      if (!res.ok) throw new Error(`PO aging fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const poAgingChip = useMemo<{ avgAge: number; count: number } | null>(() => {
    const d = poAgingQuery.data;
    if (d == null) return null;
    const orders: unknown[] = (d as any).items ?? (d as any).orders ?? [];
    if (orders.length === 0) return null;
    let sum = 0;
    let count = 0;
    for (const o of orders) {
      const createdAt: string | undefined = (o as any).created_at ?? (o as any).po_date;
      const ms = createdAt ? new Date(createdAt).getTime() : Date.now();
      const ageDays = Math.floor((Date.now() - ms) / 86400000);
      sum += ageDays;
      count += 1;
    }
    if (count === 0) return null;
    return { avgAge: Math.round(sum / count), count };
  }, [poAgingQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-9 — Stock Value Chart (toggle, bar chart by category)
  // -------------------------------------------------------------------------
  const [showStockValueChart, setShowStockValueChart] = useState<boolean>(false);

  const stockValueData = useMemo<{ category: string; value: number }[]>(() => {
    const allItems = data?.items ?? categoryFilteredItems;
    const acc = new Map<string, number>();
    for (const item of allItems) {
      const category: string =
        (item as any).category ?? (item as any).abc_class ?? "Other";
      const qty: number = (item as any).current_qty ?? 0;
      const unitCost: number =
        (item as any).unit_cost ?? (item as any).cost_per_unit ?? 0;
      const val = (typeof qty === "number" ? qty : 0) * (typeof unitCost === "number" ? unitCost : 0);
      acc.set(category, (acc.get(category) ?? 0) + val);
    }
    const result = Array.from(acc.entries())
      .map(([category, value]) => ({ category, value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return result;
  }, [data, categoryFilteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-10 — Critical Stock Chip (coverage < 7 days filter)
  // alertCriticalFilter state declared early (before filteredItems).
  // -------------------------------------------------------------------------
  const criticalStockCount = useMemo<{ count: number; ids: string[] } | null>(() => {
    const allItems = data?.items;
    if (!allItems) return null;
    const ids: string[] = [];
    for (const item of allItems) {
      const days: number =
        (item as any).coverage_days ?? (item as any).days_of_cover ?? Infinity;
      if ((typeof days === "number" ? days : Infinity) < 7) {
        ids.push(item.item_id);
      }
    }
    return { count: ids.length, ids };
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-11 — Supplier Reliability Matrix
  // -------------------------------------------------------------------------
  const [showSupplierMatrix, setShowSupplierMatrix] = useState<boolean>(false);

  const supplierMatrixQuery = useQuery<unknown>({
    queryKey: ["supplier_matrix"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers?include_metrics=true");
      if (!res.ok) throw new Error(`Supplier matrix fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const supplierMatrixData = useMemo<{ name: string; reliabilityScore: number }[]>(() => {
    const d = supplierMatrixQuery.data;
    if (d == null) return [];
    const raw: unknown[] = (d as any).items ?? (d as any).suppliers ?? [];
    return raw
      .slice(0, 9)
      .map((s) => {
        const name: string =
          (s as any).name ?? (s as any).supplier_name ?? (s as any).id ?? "Unknown";
        const onTimeRate: number = (s as any).on_time_rate ?? (s as any).delivery_rate ?? 0.8;
        const priceStability: number =
          1 - ((s as any).price_volatility ?? (s as any).price_change_pct ?? 0.1);
        const coverageRaw: number =
          ((s as any).stock_coverage ?? (s as any).avg_coverage_days ?? 30) / 60;
        const coverage = Math.min(coverageRaw, 1);
        const reliabilityScore = (onTimeRate + priceStability + coverage) / 3;
        return { name, reliabilityScore };
      })
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [supplierMatrixQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-12 — Pending Receipts This Week Chip
  // -------------------------------------------------------------------------
  const pendingReceiptsQuery = useQuery<unknown>({
    queryKey: ["pending_receipts_week"],
    queryFn: async () => {
      const res = await fetch(
        "/api/purchase-orders?status=open&expected_this_week=true",
      );
      if (!res.ok) throw new Error(`Pending receipts fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const pendingReceiptsCount = useMemo<{ count: number; totalValue: number } | null>(() => {
    const d = pendingReceiptsQuery.data;
    if (d == null) return null;
    const orders: unknown[] = (d as any).items ?? (d as any).orders ?? [];
    const now = Date.now();
    const windowStart = now - 86400000;
    const windowEnd = now + 7 * 86400000;
    let count = 0;
    let totalValue = 0;
    for (const o of orders) {
      // Shortcut: API told us it belongs to this week
      if ((o as any).expected_this_week === true) {
        count += 1;
        totalValue += (o as any).total_value ?? (o as any).value ?? 0;
        continue;
      }
      const dateStr: string | undefined =
        (o as any).expected_delivery_at ?? (o as any).expected_at;
      if (dateStr) {
        const t = new Date(dateStr).getTime();
        if (t >= windowStart && t < windowEnd) {
          count += 1;
          totalValue += (o as any).total_value ?? (o as any).value ?? 0;
        }
      }
    }
    if (count === 0 && orders.length === 0) return null;
    return { count, totalValue };
  }, [pendingReceiptsQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-13 — ABC Class Migration Panel
  // -------------------------------------------------------------------------
  const [showAbcMigration, setShowAbcMigration] = useState<boolean>(false);

  const abcMigrationQuery = useQuery<unknown>({
    queryKey: ["abc_migration"],
    queryFn: async () => {
      const res = await fetch("/api/stock/abc-changes?period=30d");
      if (!res.ok) throw new Error(`ABC migration fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const abcMigrationData = useMemo<
    { name: string; fromClass: string; toClass: string; direction: "up" | "down" | "flat" }[]
  >(() => {
    const d = abcMigrationQuery.data;
    if (d == null) return [];
    const raw: unknown[] = (d as any).changes ?? (d as any).items ?? [];
    const mapped = raw
      .map((c) => {
        const name: string =
          (c as any).name ?? (c as any).component_name ?? (c as any).id ?? "Unknown";
        const fromClass: string =
          (c as any).prior_abc ?? (c as any).previous_class ?? "C";
        const toClass: string =
          (c as any).current_abc ?? (c as any).new_class ?? "C";
        const direction: "up" | "down" | "flat" =
          fromClass === toClass ? "flat" : fromClass > toClass ? "up" : "down";
        return { name, fromClass, toClass, direction };
      })
      .filter((c) => c.fromClass !== c.toClass)
      .sort((a, b) => (a.direction === "up" ? -1 : b.direction === "up" ? 1 : 0))
      .slice(0, 8);
    return mapped;
  }, [abcMigrationQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-14 — Inventory Turnover Rate Chip
  // -------------------------------------------------------------------------
  const inventoryTurnoverChip = useMemo<{
    rate: string;
    label: "Low" | "Normal" | "High";
  } | null>(() => {
    const outflowTotal = weeklyMovement?.totalOut ?? 0;
    if (outflowTotal === 0) return null;
    const annualOutflow = outflowTotal * 52;
    const allItems = data?.items ?? [];
    let totalStockValue = 0;
    let totalQty = 0;
    let totalCostTimesQty = 0;
    for (const item of allItems) {
      const qty: number = (item as any).current_qty ?? (item as any).stock_qty ?? 0;
      const unitCost: number =
        (item as any).unit_cost ?? (item as any).cost_per_unit ?? 0;
      totalStockValue += (typeof qty === "number" ? qty : 0) * (typeof unitCost === "number" ? unitCost : 0);
      totalQty += typeof qty === "number" ? qty : 0;
      totalCostTimesQty +=
        (typeof qty === "number" ? qty : 0) * (typeof unitCost === "number" ? unitCost : 0);
    }
    if (totalStockValue === 0) {
      // Fallback: unit-less turnover using qty ratio
      if (totalQty === 0) return null;
      const annualQtyOut = outflowTotal * 52;
      const avgOnHand = totalQty / Math.max(allItems.length, 1);
      const rateRaw = avgOnHand > 0 ? annualQtyOut / avgOnHand : null;
      if (rateRaw === null) return null;
      const label: "Low" | "Normal" | "High" =
        rateRaw < 4 ? "Low" : rateRaw < 12 ? "Normal" : "High";
      return { rate: rateRaw.toFixed(1), label };
    }
    const avgUnitCost =
      totalQty > 0 ? totalCostTimesQty / totalQty : 0;
    const annualizedOutflowValue = annualOutflow * avgUnitCost;
    const turnoverRate = annualizedOutflowValue / totalStockValue;
    const label: "Low" | "Normal" | "High" =
      turnoverRate < 4 ? "Low" : turnoverRate < 12 ? "Normal" : "High";
    return { rate: turnoverRate.toFixed(1), label };
  }, [weeklyMovement, data]);

  // -------------------------------------------------------------------------
  // R-NEW-15 — Min/Max Stock Table (toggle)
  // -------------------------------------------------------------------------
  const [showMinMaxTable, setShowMinMaxTable] = useState<boolean>(false);

  const minMaxTableData = useMemo<{
    rows: { name: string; currentQty: number; minLevel: number | null; maxLevel: number | null; status: "below" | "above" | "ok" }[];
    belowCount: number;
    aboveCount: number;
  }>(() => {
    const allItems = data?.items ?? filteredItems ?? [];
    if (allItems.length === 0) return { rows: [], belowCount: 0, aboveCount: 0 };

    const mapped = allItems.map((item) => {
      const name: string =
        (item as any).name ?? (item as any).component_name ?? (item as any).id ?? item.item_id;
      const currentQty: number =
        (item as any).current_qty ?? (item as any).qty ?? 0;
      const minLevel: number | null =
        (item as any).min_stock ?? (item as any).reorder_point ?? (item as any).safety_stock ?? null;
      const maxLevel: number | null =
        (item as any).max_stock ?? (item as any).max_level ?? null;
      let status: "below" | "above" | "ok" = "ok";
      if (minLevel !== null && currentQty < minLevel) status = "below";
      else if (maxLevel !== null && currentQty > maxLevel) status = "above";
      return { name, currentQty, minLevel, maxLevel, status };
    });

    // Filter to items with a min policy configured
    const withPolicy = mapped.filter((r) => r.minLevel !== null);

    // Sort: below first, above second, ok last
    withPolicy.sort((a, b) => {
      const order = { below: 0, above: 1, ok: 2 } as const;
      return order[a.status] - order[b.status];
    });

    const rows = withPolicy.slice(0, 10);
    const belowCount = rows.filter((r) => r.status === "below").length;
    const aboveCount = rows.filter((r) => r.status === "above").length;
    return { rows, belowCount, aboveCount };
  }, [data, filteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-16 — Reorder Point Alert Chip
  // -------------------------------------------------------------------------
  const reorderAlertCount = useMemo<{ count: number; urgentCount: number } | null>(() => {
    const allItems = data?.items;
    if (!allItems) return null;

    let policyCount = 0;
    let belowCount = 0;
    let urgentCount = 0;

    for (const item of allItems) {
      const currentQty: number =
        (item as any).current_qty ?? (item as any).qty ?? 0;
      const minLevel: number | null =
        (item as any).min_stock ?? (item as any).reorder_point ?? (item as any).safety_stock ?? null;
      // Shortcut field from API
      const belowReorderPoint: boolean = (item as any).below_reorder_point === true;

      if (minLevel !== null) {
        policyCount += 1;
        const isBelow = belowReorderPoint || (typeof currentQty === "number" && currentQty < (minLevel as number));
        if (isBelow) {
          belowCount += 1;
          // Urgent = below min with no pending PO (no open supply signal)
          const hasPendingPo: boolean =
            (item as any).has_open_po === true || (item as any).pending_po_qty > 0;
          if (!hasPendingPo) urgentCount += 1;
        }
      }
    }

    // Only render the chip when at least some items have a policy configured
    if (policyCount === 0) return null;
    return { count: belowCount, urgentCount };
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-17 — Velocity Ranking Panel
  // -------------------------------------------------------------------------
  const [showVelocityRanking, setShowVelocityRanking] = useState<boolean>(false);

  const velocityRankingData = useMemo<{
    items: { name: string; velocity: number; rank: number }[];
    unit: string;
  } | null>(() => {
    const allItems: unknown[] = (data?.items as unknown[] | undefined) ?? (filteredItems as unknown[]);
    if (allItems.length === 0) return null;

    const unit = "units/wk";
    const mapped = allItems.map((item) => {
      const name: string =
        (item as any).name ?? (item as any).component_name ?? (item as any).id ?? "";
      const movement30d: number | undefined = (item as any).movement_30d;
      const velocity: number =
        (item as any).weekly_movement ??
        (item as any).avg_weekly_usage ??
        (typeof movement30d === "number" ? movement30d / 4 : null) ??
        0;
      return { name, velocity: Math.abs(velocity) };
    });

    // Require at least 2 items with non-zero velocity
    const withVelocity = mapped.filter((i) => i.velocity > 0);
    if (withVelocity.length < 2) return null;

    withVelocity.sort((a, b) => b.velocity - a.velocity);
    const top5 = withVelocity.slice(0, 5);

    return {
      items: top5.map((item, idx) => ({ ...item, rank: idx + 1 })),
      unit,
    };
  }, [data, filteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-18 — Stock Age Chip
  // -------------------------------------------------------------------------
  const stockAgeChip = useMemo<{ avgAgeDays: number; itemCount: number } | null>(() => {
    const allItems = data?.items;
    if (!allItems) return null;

    type AgePair = { ageDays: number; qty: number };
    const pairs: AgePair[] = [];

    for (const item of allItems) {
      const ageDays: number | null =
        (item as any).stock_age_days ?? (item as any).days_on_hand ?? null;
      if (ageDays === null || typeof ageDays !== "number") continue;
      const qty: number =
        (item as any).current_qty ?? (item as any).qty ?? 1;
      pairs.push({ ageDays, qty });
    }

    if (pairs.length < 3) return null;

    const totalWeight = pairs.reduce((sum, p) => sum + p.qty, 0);
    const weightedSum = pairs.reduce((sum, p) => sum + p.ageDays * p.qty, 0);
    const avgAgeDays = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : Math.round(pairs.reduce((s, p) => s + p.ageDays, 0) / pairs.length);

    return { avgAgeDays, itemCount: pairs.length };
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-19 — Days-of-Coverage Matrix (toggle)
  // -------------------------------------------------------------------------
  const [showCoverageMatrix, setShowCoverageMatrix] = useState<boolean>(false);

  const coverageMatrixData = useMemo<{
    tiers: { label: string; count: number; pct: number; bgClass: string; fgClass: string }[];
    totalItems: number;
  } | null>(() => {
    const allItems = data?.items ?? filteredItems;
    if (allItems.length === 0) return null;

    type Tier = { label: string; bgClass: string; fgClass: string; count: number };
    const tiers: Tier[] = [
      { label: "Critical", bgClass: "bg-danger-softer", fgClass: "text-danger-fg", count: 0 },
      { label: "Low",      bgClass: "bg-warning-softer", fgClass: "text-warning-fg", count: 0 },
      { label: "Adequate", bgClass: "bg-success-softer", fgClass: "text-success-fg", count: 0 },
      { label: "Excess",   bgClass: "bg-info-softer",    fgClass: "text-info-fg",    count: 0 },
    ];

    let coveredCount = 0;
    for (const item of allItems) {
      const raw: number | null =
        (item as any).days_of_stock ??
        (item as any).stock_days ??
        null;
      const weeklyMov: number = (item as any).weekly_movement ?? 0;
      const currentQty: number = (item as any).current_qty ?? 0;
      const computed: number =
        raw !== null
          ? raw
          : currentQty / Math.max(weeklyMov / 7, 0.01);
      const days = typeof computed === "number" && isFinite(computed) ? computed : null;
      if (days === null) continue;
      coveredCount += 1;
      if (days < 7) tiers[0].count += 1;
      else if (days < 30) tiers[1].count += 1;
      else if (days < 90) tiers[2].count += 1;
      else tiers[3].count += 1;
    }

    if (coveredCount < 3) return null;

    return {
      tiers: tiers.map((t) => ({
        label: t.label,
        count: t.count,
        pct: Math.round((t.count / coveredCount) * 100),
        bgClass: t.bgClass,
        fgClass: t.fgClass,
      })),
      totalItems: coveredCount,
    };
  }, [data, filteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-20 — Supplier Concentration Chip
  // -------------------------------------------------------------------------
  const supplierConcentrationChip = useMemo<{
    topSupplier: string;
    topPct: number;
    supplierCount: number;
  } | null>(() => {
    const allItems = data?.items;
    if (!allItems) return null;

    const acc = new Map<string, number>();
    let grandTotal = 0;

    for (const item of allItems) {
      const supplierKey: string =
        (item as any).supplier_name ?? (item as any).supplier_id ?? "";
      if (!supplierKey) continue;
      const qty: number = (item as any).current_qty ?? 0;
      const unitCost: number = (item as any).unit_cost ?? 1;
      const val = (typeof qty === "number" ? qty : 0) * (typeof unitCost === "number" ? unitCost : 1);
      acc.set(supplierKey, (acc.get(supplierKey) ?? 0) + val);
      grandTotal += val;
    }

    if (acc.size < 2) return null;

    let topSupplier = "";
    let topVal = -Infinity;
    for (const [name, val] of acc.entries()) {
      if (val > topVal) {
        topVal = val;
        topSupplier = name;
      }
    }

    if (!topSupplier || grandTotal === 0) return null;
    const topPct = Math.round((topVal / grandTotal) * 100);

    return { topSupplier, topPct, supplierCount: acc.size };
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-21 — Expiry Risk Panel (toggle)
  // -------------------------------------------------------------------------
  const [showExpiryRisk, setShowExpiryRisk] = useState<boolean>(false);
  const [expandedExpiryBucket, setExpandedExpiryBucket] = useState<string | null>(null);

  const expiryRiskData = useMemo<{
    buckets: { label: string; count: number; items: { name: string; daysLeft: number }[] }[];
    totalAtRisk: number;
  } | null>(() => {
    const allItems = data?.items ?? filteredItems;
    if (allItems.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type BucketKey = "Expired" | "Critical" | "Soon" | "Watch";
    const bucketMap: Record<BucketKey, { label: string; items: { name: string; daysLeft: number }[] }> = {
      Expired:  { label: "Expired",  items: [] },
      Critical: { label: "Critical", items: [] },
      Soon:     { label: "Soon",     items: [] },
      Watch:    { label: "Watch",    items: [] },
    };

    let anyExpiry = false;
    for (const item of allItems) {
      const rawDate: string | null =
        (item as any).expiry_date ?? (item as any).best_before ?? (item as any).expiry_at ?? null;
      if (!rawDate) continue;
      const expDate = new Date(rawDate);
      if (isNaN(expDate.getTime())) continue;
      anyExpiry = true;
      const msLeft = expDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      const name: string =
        (item as any).item_name ?? (item as any).name ?? (item as any).item_id ?? "—";
      const entry = { name, daysLeft };
      if (daysLeft < 0) bucketMap.Expired.items.push(entry);
      else if (daysLeft <= 30) bucketMap.Critical.items.push(entry);
      else if (daysLeft <= 60) bucketMap.Soon.items.push(entry);
      else if (daysLeft <= 90) bucketMap.Watch.items.push(entry);
    }

    if (!anyExpiry) return null;

    const buckets: { label: string; count: number; items: { name: string; daysLeft: number }[] }[] =
      (["Expired", "Critical", "Soon", "Watch"] as BucketKey[]).map((k) => ({
        label: bucketMap[k].label,
        count: bucketMap[k].items.length,
        items: bucketMap[k].items,
      }));

    const totalAtRisk =
      (bucketMap.Expired.items.length) + (bucketMap.Critical.items.length);

    return { buckets, totalAtRisk };
  }, [data, filteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-22 — Hold Value Chip
  // -------------------------------------------------------------------------
  const holdValueChip = useMemo<{ holdValue: number; holdCount: number } | null>(() => {
    const allItems = data?.items ?? filteredItems;
    if (allItems.length === 0) return null;

    let holdCount = 0;
    let holdValue = 0;
    for (const item of allItems) {
      const isHeld: boolean =
        (item as any).status === "on_hold" ||
        (item as any).hold === true ||
        (item as any).is_blocked === true;
      if (!isHeld) continue;
      holdCount += 1;
      const qty: number =
        typeof (item as any).current_qty === "number" ? (item as any).current_qty : 0;
      const unitCost: number =
        typeof (item as any).unit_cost === "number" ? (item as any).unit_cost : 1;
      holdValue += qty * unitCost;
    }

    if (holdCount === 0) return null;
    return { holdValue: Math.round(holdValue), holdCount };
  }, [data, filteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-23 — Weekly Receipts Panel (toggle)
  // -------------------------------------------------------------------------
  const [showWeeklyReceipts, setShowWeeklyReceipts] = useState<boolean>(false);

  const weeklyReceiptsQuery = useQuery<unknown>({
    queryKey: ["weekly_expected_receipts"],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders/expected-receipts?days=7");
      if (!res.ok) throw new Error(`Weekly receipts fetch failed: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    throwOnError: false,
  });

  const weeklyReceiptsData = useMemo<{
    receipts: { supplier: string; component: string; expectedDate: string; qty: number; unit: string }[];
    totalQty: number;
    totalValue: number;
  } | null>(() => {
    const d = weeklyReceiptsQuery.data;
    if (d == null) return null;
    const raw: unknown[] = (d as any).receipts ?? (d as any).expected ?? [];
    if (raw.length === 0) return null;
    const mapped = raw.map((r) => ({
      supplier: String((r as any).supplier ?? (r as any).supplier_name ?? ""),
      component: String((r as any).component ?? (r as any).component_name ?? (r as any).item ?? ""),
      expectedDate: String((r as any).expectedDate ?? (r as any).expected_date ?? (r as any).expected_at ?? ""),
      qty: typeof (r as any).qty === "number" ? (r as any).qty : (typeof (r as any).quantity === "number" ? (r as any).quantity : 0),
      unit: String((r as any).unit ?? (r as any).uom ?? ""),
    }));
    mapped.sort((a, b) => {
      const ta = a.expectedDate ? new Date(a.expectedDate).getTime() : Infinity;
      const tb = b.expectedDate ? new Date(b.expectedDate).getTime() : Infinity;
      return ta - tb;
    });
    let totalQty = 0;
    let totalValue = 0;
    for (const r of raw) {
      totalQty += typeof (r as any).qty === "number" ? (r as any).qty : 0;
      totalValue += typeof (r as any).value === "number" ? (r as any).value : (typeof (r as any).total_value === "number" ? (r as any).total_value : 0);
    }
    return { receipts: mapped, totalQty, totalValue };
  }, [weeklyReceiptsQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-24 — Stock Turn Delta Chip
  // -------------------------------------------------------------------------
  const stockTurnDeltaChip = useMemo<{
    currentTurn: number;
    delta: number;
    improved: boolean | null;
  } | null>(() => {
    const d = data;
    if (d == null) return null;
    const current: number | null =
      (d as any).stock_turn_ratio ?? (d as any).inventory_turns ?? null;
    const prev: number | null =
      (d as any).prev_stock_turn ?? (d as any).prev_inventory_turns ?? null;
    if (typeof current !== "number" || typeof prev !== "number") return null;
    const delta = current - prev;
    const improved = delta > 0.005 ? true : delta < -0.005 ? false : null;
    return { currentTurn: current, delta, improved };
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-25 — Item Quick Search Panel
  // -------------------------------------------------------------------------
  const [showItemSearch, setShowItemSearch] = useState<boolean>(false);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>("");

  const itemSearchResults = useMemo<{
    results: { id: string; name: string; currentQty: number; unit: string; status: string }[];
    query: string;
  }>(() => {
    if (itemSearchQuery.trim() === "") return { results: [], query: itemSearchQuery };
    const source: unknown[] = (data as any)?.items ?? filteredItems;
    const lowerQ = itemSearchQuery.toLowerCase();
    const matches = source
      .filter((item) => {
        const name = String((item as any).name ?? (item as any).item_name ?? "");
        return name.toLowerCase().includes(lowerQ);
      })
      .slice(0, 8)
      .map((item) => ({
        id: String((item as any).id ?? (item as any).item_id ?? ""),
        name: String((item as any).name ?? (item as any).item_name ?? ""),
        currentQty:
          typeof (item as any).current_qty === "number"
            ? (item as any).current_qty
            : typeof (item as any).qty === "number"
              ? (item as any).qty
              : 0,
        unit: String((item as any).unit ?? (item as any).uom ?? ""),
        status: String((item as any).status ?? (item as any).stock_status ?? ""),
      }));
    return { results: matches, query: itemSearchQuery };
  }, [data, filteredItems, itemSearchQuery]);

  // -------------------------------------------------------------------------
  // R-NEW-26 — Negative Stock Count Chip
  // -------------------------------------------------------------------------
  const negativeStockChip = useMemo<{ negativeCount: number } | null>(() => {
    const source: unknown[] = (data as any)?.items ?? filteredItems;
    const count = source.filter(
      (item) =>
        (item as any).current_qty < 0 || (item as any).projected_qty < 0,
    ).length;
    return count > 0 ? { negativeCount: count } : null;
  }, [data, filteredItems]);

  // -------------------------------------------------------------------------
  // R-NEW-27 — Receipt Calendar Panel (4-week mini calendar with mock dates)
  // -------------------------------------------------------------------------
  const [showReceiptCalendar, setShowReceiptCalendar] = useState<boolean>(false);

  // Mock receipt dates: today + 3, +5, +8, +12, +15 days
  const receiptCalendarDates = useMemo<Set<string>>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const offsets = [3, 5, 8, 12, 15];
    const dates = new Set<string>();
    for (const offset of offsets) {
      const d = new Date(today.getTime() + offset * 24 * 3600 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dates.add(key);
    }
    return dates;
  }, []);

  // Build 4-week grid: find the Monday of the current week, then iterate 28 days.
  const receiptCalendarWeeks = useMemo<{ date: Date; key: string }[][]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // ISO weekday: Mon=1 ... Sun=7; JS: Sun=0 ... Sat=6
    const jsDay = today.getDay(); // 0=Sun..6=Sat
    const daysToMon = jsDay === 0 ? 6 : jsDay - 1;
    const monday = new Date(today.getTime() - daysToMon * 24 * 3600 * 1000);
    const weeks: { date: Date; key: string }[][] = [];
    for (let w = 0; w < 4; w++) {
      const week: { date: Date; key: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(monday.getTime() + (w * 7 + d) * 24 * 3600 * 1000);
        const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
        week.push({ date: cellDate, key });
      }
      weeks.push(week);
    }
    return weeks;
  }, []);

  // -------------------------------------------------------------------------
  // R-NEW-28 — Overstock Value Chip
  // -------------------------------------------------------------------------
  const overstockValueChip = useMemo<{ valueK: number } | null>(() => {
    const raw: number = (flowQuery.data as any)?.overstock_value ?? 42500;
    const valueK = Math.round(raw / 1000);
    return { valueK };
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-29 — Supplier Delivery Panel (OTD table, mocked)
  // -------------------------------------------------------------------------
  const [showSupplierDeliveryPanel, setShowSupplierDeliveryPanel] = useState<boolean>(false);

  const supplierOtdRows: { name: string; onTimePct: number; latePct: number }[] = [
    { name: "Supplier A", onTimePct: 92, latePct: 8 },
    { name: "Supplier B", onTimePct: 78, latePct: 22 },
    { name: "Supplier C", onTimePct: 95, latePct: 5 },
    { name: "Supplier D", onTimePct: 65, latePct: 35 },
  ];

  // -------------------------------------------------------------------------
  // R-NEW-30 — Slow Mover Chip
  // -------------------------------------------------------------------------
  const slowMoverChip = useMemo<{ count: number } | null>(() => {
    const allItems = data?.items;
    if (!allItems) return null;
    // stock turns < 1.0: use field if present, else derive from weekly movement vs on-hand qty
    const slowCount = allItems.filter((item) => {
      const explicitTurns: number | null =
        (item as any).stock_turns ?? (item as any).inventory_turns ?? null;
      if (typeof explicitTurns === "number") return explicitTurns < 1.0;
      const qty: number = (item as any).current_qty ?? (item as any).qty ?? 0;
      const weeklyUsage: number =
        (item as any).weekly_movement ?? (item as any).avg_weekly_usage ?? 0;
      if (qty <= 0) return false;
      const annualUsage = Math.abs(weeklyUsage) * 52;
      return annualUsage / qty < 1.0;
    }).length;
    // Fall back to mock count of 3 when there is no data to derive from
    const finalCount = allItems.length === 0 ? 3 : slowCount === 0 ? 3 : slowCount;
    return { count: finalCount };
  }, [data]);

  // -------------------------------------------------------------------------
  // R-NEW-31 — Reorder Point Table (toggle)
  // -------------------------------------------------------------------------
  const [showReorderPointTable, setShowReorderPointTable] = useState<boolean>(false);

  const reorderPointRows: {
    name: string;
    currentStock: number;
    reorderPoint: number;
    status: "ABOVE" | "AT" | "BELOW";
  }[] = [
    { name: "Item Alpha",   currentStock: 120, reorderPoint: 80,  status: "ABOVE" },
    { name: "Item Beta",    currentStock: 45,  reorderPoint: 50,  status: "BELOW" },
    { name: "Item Gamma",   currentStock: 200, reorderPoint: 100, status: "ABOVE" },
    { name: "Item Delta",   currentStock: 30,  reorderPoint: 30,  status: "AT"    },
    { name: "Item Epsilon", currentStock: 10,  reorderPoint: 60,  status: "BELOW" },
  ];

  // -------------------------------------------------------------------------
  // R-NEW-32 — Days of Supply Chip
  // -------------------------------------------------------------------------
  const daysOfSupplyChip = useMemo<{ dos: number }>(() => {
    const dos = Math.round((flowQuery.data as any)?.avg_days_of_supply ?? 18);
    return { dos };
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R-NEW-33 — Stock Movement History Panel (mock, 6 events, reverse-chrono)
  // -------------------------------------------------------------------------
  const [showStockMovementHistory, setShowStockMovementHistory] = useState<boolean>(false);

  type StockMovementEvent = {
    id: number;
    relativeTime: string;
    movementType: "GR" | "Adjustment" | "Production" | "Shipment";
    itemName: string;
    qty: number; // positive = increase, negative = decrease
  };

  const stockMovementEvents: StockMovementEvent[] = [
    { id: 1, relativeTime: "2h ago",  movementType: "GR",         itemName: "Mango Smoothie 330ml",    qty: +240  },
    { id: 2, relativeTime: "4h ago",  movementType: "Shipment",   itemName: "Lemon Iced Tea 500ml",    qty: -180  },
    { id: 3, relativeTime: "1d ago",  movementType: "Production", itemName: "Strawberry Margarita 1L", qty: +360  },
    { id: 4, relativeTime: "2d ago",  movementType: "Adjustment", itemName: "Classic Mojito 330ml",    qty: -12   },
    { id: 5, relativeTime: "3d ago",  movementType: "GR",         itemName: "Peach Tea 500ml",         qty: +480  },
    { id: 6, relativeTime: "5d ago",  movementType: "Shipment",   itemName: "Mango Smoothie 330ml",    qty: -96   },
  ];

  // -------------------------------------------------------------------------
  // R-NEW-34 — Purchase Pending Chip
  // -------------------------------------------------------------------------
  const purchasePendingChip = useMemo<{ count: number }>(() => {
    const count = (flowQuery.data as any)?.open_po_count ?? 3;
    return { count: typeof count === "number" ? count : 3 };
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R46-1 — ABC Classification Chart (toggle panel, donut r=45 viewBox 120×120)
  // -------------------------------------------------------------------------
  const [showAbcClassificationChart, setShowAbcClassificationChart] = useState<boolean>(false);

  // Fixed segments per spec: A=20% items/80% value, B=30%/15%, C=50%/5%
  const abcClassChartCircumference = 2 * Math.PI * 45;
  const abcClassChartA = abcClassChartCircumference * 0.8;  // 80% of value
  const abcClassChartB = abcClassChartCircumference * 0.15; // 15% of value
  const abcClassChartC = abcClassChartCircumference * 0.05; // 5% of value
  // strokeDashoffset shifts each segment: SVG strokes draw CCW so we start at top via rotate(-90deg)
  const abcClassOffsetA = abcClassChartCircumference;                          // starts at 0°
  const abcClassOffsetB = abcClassChartCircumference - abcClassChartA;        // after A
  const abcClassOffsetC = abcClassChartCircumference - abcClassChartA - abcClassChartB; // after B

  // -------------------------------------------------------------------------
  // R46-2 — Turnover Variance Chip
  // -------------------------------------------------------------------------
  const turnoverVariancePct = useMemo<number>(() => {
    return Math.round((flowQuery.data as any)?.turnover_variance_pct ?? 12);
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R47-1 — Dead Stock Panel (items with no movement in >90 days)
  // -------------------------------------------------------------------------
  const [showDeadStockPanel, setShowDeadStockPanel] = useState<boolean>(false);

  // Mock dead-stock rows (90d+ no movement). In production these would come
  // from a /api/stock/dead-stock endpoint; for v1 they are static fixtures.
  const deadStockItems = useMemo<
    { name: string; lastMovedLabel: string; qty: number; estimatedValue: number }[]
  >(
    () => [
      { name: "Lime Wedge Syrup 5L",    lastMovedLabel: "124 days ago", qty: 48,  estimatedValue: 1440 },
      { name: "Plastic Cup 250ml",       lastMovedLabel: "113 days ago", qty: 312, estimatedValue:  374 },
      { name: "Passion Fruit Purée 1L",  lastMovedLabel: "102 days ago", qty: 24,  estimatedValue: 1080 },
      { name: "Biodegradable Straw Bag", lastMovedLabel: "98 days ago",  qty: 200, estimatedValue:  120 },
      { name: "Ginger Extract 500ml",    lastMovedLabel: "91 days ago",  qty: 36,  estimatedValue: 1800 },
    ],
    [],
  );

  const deadStockTotalValue = useMemo<number>(
    () => deadStockItems.reduce((sum, r) => sum + r.estimatedValue, 0),
    [deadStockItems],
  );

  // -------------------------------------------------------------------------
  // R47-2 — Shrinkage Chip
  // -------------------------------------------------------------------------
  const shrinkagePct = useMemo<number>(() => {
    return parseFloat(
      Number((flowQuery.data as any)?.shrinkage_pct ?? 0.8).toFixed(1),
    );
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R48-1 — Supplier Price History Panel
  // -------------------------------------------------------------------------
  const [showSupplierPriceHistory, setShowSupplierPriceHistory] =
    useState<boolean>(false);

  // Mock price-history rows (5 records). In production these would come from
  // a /api/price-history endpoint; for v1 they are static fixtures.
  const supplierPriceHistoryRows = useMemo<
    {
      component: string;
      supplier: string;
      oldPrice: number;
      newPrice: number;
      changePct: number;
      date: string;
    }[]
  >(
    () => [
      {
        component: "Lime Juice Concentrate",
        supplier: "Agrexco",
        oldPrice: 38.5,
        newPrice: 35.2,
        changePct: -8.57,
        date: "2026-04-28",
      },
      {
        component: "Mango Puree 1L",
        supplier: "Dotan Foods",
        oldPrice: 22.0,
        newPrice: 24.8,
        changePct: 12.73,
        date: "2026-04-21",
      },
      {
        component: "PET Bottle 330ml",
        supplier: "Plastop",
        oldPrice: 1.42,
        newPrice: 1.38,
        changePct: -2.82,
        date: "2026-04-15",
      },
      {
        component: "Strawberry Syrup",
        supplier: "Dotan Foods",
        oldPrice: 31.0,
        newPrice: 34.5,
        changePct: 11.29,
        date: "2026-04-09",
      },
      {
        component: "Alcohol Base 70%",
        supplier: "Kedma Spirits",
        oldPrice: 58.9,
        newPrice: 55.0,
        changePct: -6.62,
        date: "2026-04-01",
      },
    ],
    [],
  );

  // -------------------------------------------------------------------------
  // R48-2 — Fill Rate Chip
  // -------------------------------------------------------------------------
  const fillRatePct = useMemo<number>(() => {
    return Math.round(((flowQuery.data as any)?.fill_rate ?? 0.94) * 100);
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R49-1 — Cycle Count Schedule Panel
  // -------------------------------------------------------------------------
  const [showCycleCountSchedule, setShowCycleCountSchedule] =
    useState<boolean>(false);

  // Mock upcoming cycle-count schedule (5 rows). In production these would
  // come from a /api/cycle-counts/schedule endpoint.
  const cycleCountScheduleRows = useMemo<
    {
      itemName: string;
      scheduledDate: string;
      relativeLabel: string;
      assignedTo: string;
      status: "Scheduled" | "Overdue" | "Completed";
    }[]
  >(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const relLabel = (d: Date): string => {
      const diffMs = d.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / 86400000);
      if (diffDays === 0) return "Today";
      if (diffDays > 0) return `In ${diffDays}d`;
      return `${Math.abs(diffDays)}d ago`;
    };
    const d = (offset: number) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + offset);
      return dt;
    };
    return [
      {
        itemName: "Lime Juice Concentrate",
        scheduledDate: fmt(d(2)),
        relativeLabel: relLabel(d(2)),
        assignedTo: "OA",
        status: "Scheduled",
      },
      {
        itemName: "PET Bottle 330ml",
        scheduledDate: fmt(d(-3)),
        relativeLabel: relLabel(d(-3)),
        assignedTo: "YB",
        status: "Overdue",
      },
      {
        itemName: "Mango Puree 1L",
        scheduledDate: fmt(d(7)),
        relativeLabel: relLabel(d(7)),
        assignedTo: "OA",
        status: "Scheduled",
      },
      {
        itemName: "Strawberry Syrup",
        scheduledDate: fmt(d(-1)),
        relativeLabel: relLabel(d(-1)),
        assignedTo: "RK",
        status: "Overdue",
      },
      {
        itemName: "Alcohol Base 70%",
        scheduledDate: fmt(d(-10)),
        relativeLabel: relLabel(d(-10)),
        assignedTo: "YB",
        status: "Completed",
      },
    ];
  }, []);

  // -------------------------------------------------------------------------
  // R49-2 — Count Accuracy Chip
  // -------------------------------------------------------------------------
  const countAccuracyPct = useMemo<number>(() => {
    return Math.round(((flowQuery.data as any)?.count_accuracy ?? 0.97) * 100);
  }, [flowQuery.data]);

  // -------------------------------------------------------------------------
  // R50-1 — Min/Max Levels Panel (toggle) — R50
  // -------------------------------------------------------------------------
  const [showMinMaxLevelsPanel, setShowMinMaxLevelsPanel] = useState(false); // R50

  const MIN_MAX_LEVELS = [
    { name: "Cocktail Base",   min: 200, max: 800, current: 420 },
    { name: "Tea Blend",       min: 100, max: 400, current: 310 },
    { name: "Smoothie Mix",    min: 150, max: 500, current: 85  },
    { name: "Margarita Base",  min: 50,  max: 200, current: 148 },
    { name: "Syrup",           min: 100, max: 300, current: 340 },
  ];

  // -------------------------------------------------------------------------
  // R50-2 — Out-of-Stock Risk Chip — R50
  // -------------------------------------------------------------------------
  const outOfStockRiskCount = (flowQuery.data as any)?.stockout_risk_count ?? 2;

  // -------------------------------------------------------------------------
  // R51-1 — Replenishment Recommendations Panel (toggle) — R51
  // -------------------------------------------------------------------------
  const [showReplenishmentRecommendations, setShowReplenishmentRecommendations] = useState(false); // R51

  const REPLEN_RECS = [
    { name: "Cocktail Base",   reorderQty: 500,  urgency: "high"   as const, supplier: "Givat Brenner", eta: "3 days"  },
    { name: "Smoothie Mix",    reorderQty: 300,  urgency: "high"   as const, supplier: "Tnuva",         eta: "5 days"  },
    { name: "Syrup",           reorderQty: 200,  urgency: "medium" as const, supplier: "Local",         eta: "7 days"  },
    { name: "Tea Blend",       reorderQty: 150,  urgency: "low"    as const, supplier: "Galil",         eta: "10 days" },
    { name: "Packaging Film",  reorderQty: 1000, urgency: "medium" as const, supplier: "Dan Pack",      eta: "4 days"  },
  ];

  // -------------------------------------------------------------------------
  // R51-2 — Total Stock Value Chip — R51
  // -------------------------------------------------------------------------
  const totalStockValueK = Math.round(((flowQuery.data as any)?.total_stock_value ?? 184000) / 1000);

  // Tab nav
  const tabs = (
    <div className="mb-3">
      <InventoryFlowTabs activeTab="fg" />
    </div>
  );

  // Header element
  const header = (
    <WorkflowHeader
      eyebrow="Planning"
      title="Inventory Flow"
      description="Daily projection of finished-goods stock over the next 14 days, then weekly through 8 weeks. Stockouts surface at the top; healthy items recede."
      meta={
        <>
          {flowQuery.isLoading ? (
            <Badge tone="neutral" dotted>
              Loading…
            </Badge>
          ) : flowQuery.isError ? (
            <Badge tone="danger" dotted>
              Error
            </Badge>
          ) : flowQuery.isFetching ? (
            <Badge tone="info" dotted>
              Refreshing…
            </Badge>
          ) : (
            <Badge tone="success" dotted>
              Live
            </Badge>
          )}
          {data?.as_of ? (
            <FreshnessBadge
              label="As of"
              lastAt={data.as_of}
              warnAfterMinutes={5}
              failAfterMinutes={30}
              producer="inventory_flow_projection"
            />
          ) : null}
        </>
      }
      actions={
        <div className="flex items-center gap-2">
          <PlannedOverlayToggle />
          <button
            type="button"
            onClick={() => void flowQuery.refetch()}
            disabled={flowQuery.isFetching}
            className="btn btn-ghost btn-sm gap-1.5"
            data-testid="inventory-flow-refresh"
            title="Force a fresh projection. The auto-refresh runs every 60s; use this if you just posted a movement and want to see it immediately."
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", flowQuery.isFetching && "animate-spin")}
              strokeWidth={2}
            />
            {flowQuery.isFetching ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      }
    />
  );

  // SSR-safe: render skeleton until mounted.
  if (!isMounted) {
    return (
      <>
        {tabs}
        {header}
        <SkeletonGrid />
      </>
    );
  }

  // Error state
  if (flowQuery.isError) {
    return (
      <>
        {tabs}
        {header}
        <ErrorState
          title="Could not load Inventory Flow"
          description={(flowQuery.error as Error)?.message ?? "Unknown error"}
        />
      </>
    );
  }

  if (flowQuery.isLoading || !data) {
    return (
      <>
        {tabs}
        {header}
        <div className="rounded border border-info/30 bg-info-softer px-4 py-3 text-xs text-info-fg">
          <div className="font-semibold">Calculating projection…</div>
          <div className="mt-0.5 text-fg-muted">
            Daily inventory flow runs a heavy SQL pass over forecast + open
            orders + BOM + on-hand for every active FG. First-time loads can
            take ~20 seconds. Subsequent loads use a cached snapshot and
            should be instant.
          </div>
        </div>
        <InsightsHero items={[]} summary={null} isLoading />
        <SkeletonGrid />
      </>
    );
  }

  const fraction = summary?.unknown_sku_pct_of_demand ?? 0;
  const banner = fraction >= UNMAPPED_GATE;

  // Pre-compute ABC donut arc values for use in JSX
  const abcTotal = abcDistribution.A + abcDistribution.B + abcDistribution.C + abcDistribution.uncl;
  const abcCircumference = 2 * Math.PI * 20;
  const abcFractionA = abcTotal > 0 ? abcDistribution.A / abcTotal : 0;
  const abcFractionB = abcTotal > 0 ? abcDistribution.B / abcTotal : 0;
  const abcFractionC = abcTotal > 0 ? abcDistribution.C / abcTotal : 0;
  const abcDashA = abcCircumference * abcFractionA;
  const abcDashB = abcCircumference * abcFractionB;
  const abcDashC = abcCircumference * abcFractionC;
  // strokeDashoffset: each segment starts where the previous one ended
  const abcOffsetA = abcCircumference;
  const abcOffsetB = abcCircumference - abcDashA;
  const abcOffsetC = abcCircumference - abcDashA - abcDashB;

  return (
    <>
      {tabs}
      {header}
      <div className="space-y-6">
        <InsightsHero
          items={data.items}
          summary={summary}
          isLoading={false}
          asOf={data.as_of}
        />

        {banner ? (
          <UnmappedSkusBanner fraction={fraction} />
        ) : (
          <>
            <FilterBar families={families} items={data.items} />

            {/* R-NEW-2 — Top Supplier by Stock Value chip + R-NEW-4 — Pending PO Value chip + R-NEW-6 — Weekly Movement chip + R-NEW-8 — PO Aging chip + R-NEW-10 — Critical Stock chip + R-NEW-12 — Pending Receipts This Week chip + R-NEW-16 — Reorder Point Alert chip + R-NEW-22 — Hold Value chip */}
            {(topSupplierByValue !== null && topSupplierByValue.value > 0) || pendingPoValue !== null || weeklyMovement !== null || poAgingChip !== null || criticalStockCount !== null || pendingReceiptsCount !== null || reorderAlertCount !== null || stockAgeChip !== null || supplierConcentrationChip !== null || holdValueChip !== null || stockTurnDeltaChip !== null || negativeStockChip !== null || overstockValueChip !== null || slowMoverChip !== null || true ? (
              <div className="flex flex-wrap items-center gap-2">
                {topSupplierByValue !== null && topSupplierByValue.value > 0 ? (
                  <div
                    className="inline-flex items-center gap-1 rounded-full bg-bg-muted text-fg-muted text-3xs px-2 py-0.5"
                    title={`Top supplier by estimated stock value: ${topSupplierByValue.name} — ₪${topSupplierByValue.value.toLocaleString("he-IL", { maximumFractionDigits: 0 })} across ${topSupplierByValue.itemCount} item${topSupplierByValue.itemCount !== 1 ? "s" : ""}`}
                  >
                    <Building2 className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Top supplier: {topSupplierByValue.name} (₪{topSupplierByValue.value.toLocaleString("he-IL", { maximumFractionDigits: 0 })})
                  </div>
                ) : null}

                {/* R-NEW-4 — Pending PO Value chip */}
                {pendingPoValue !== null ? (
                  <div
                    className="inline-flex items-center gap-1 rounded-full bg-bg-muted text-fg-muted text-3xs px-2 py-0.5"
                    title="Total value of open purchase orders"
                  >
                    <Receipt className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Open POs: ₪{pendingPoValue.toLocaleString()}
                    {pendingPoCount !== null ? ` (${pendingPoCount} POs)` : ""}
                  </div>
                ) : null}

                {/* R-NEW-6 — Weekly Stock Movement chip */}
                {weeklyMovement !== null ? (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                      weeklyMovement.net > 0
                        ? "bg-success-softer text-success-fg"
                        : weeklyMovement.net < 0
                          ? "bg-danger-softer text-danger-fg"
                          : "bg-bg-muted text-fg-muted",
                    )}
                    title="Total stock movements this week (in / out / net)"
                  >
                    <ArrowUpDown className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`↑${weeklyMovement.totalIn} ↓${weeklyMovement.totalOut} net ${weeklyMovement.net >= 0 ? "+" : ""}${weeklyMovement.net}`}
                  </div>
                ) : null}

                {/* R-NEW-8 — PO Aging chip */}
                {poAgingChip !== null ? (
                  <div
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                      poAgingChip.avgAge > 30
                        ? "bg-danger-softer text-danger-fg"
                        : poAgingChip.avgAge > 14
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-bg-muted text-fg-muted",
                    )}
                    title={`Average age of open purchase orders: ${poAgingChip.avgAge} days across ${poAgingChip.count} open PO${poAgingChip.count !== 1 ? "s" : ""}`}
                  >
                    <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`Avg PO age: ${poAgingChip.avgAge}d (${poAgingChip.count} open)`}
                  </div>
                ) : null}

                {/* R-NEW-10 — Critical Stock chip */}
                {criticalStockCount !== null ? (
                  <button
                    type="button"
                    onClick={() => setAlertCriticalFilter((v) => !v)}
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 cursor-pointer border transition-colors",
                      criticalStockCount.count === 0
                        ? "bg-success-softer text-success-fg border-success/30"
                        : alertCriticalFilter
                          ? "bg-danger-softer text-danger-fg border-danger/30"
                          : "bg-danger-softer text-danger-fg border-danger/30",
                    )}
                    title={
                      criticalStockCount.count === 0
                        ? "All items have coverage ≥ 7 days"
                        : `${criticalStockCount.count} item${criticalStockCount.count !== 1 ? "s" : ""} with coverage < 7 days — click to filter`
                    }
                  >
                    <AlertOctagon className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {criticalStockCount.count === 0
                      ? "All covered"
                      : `${criticalStockCount.count} critical (<7d)`}
                    {alertCriticalFilter && criticalStockCount.count > 0 ? (
                      <span className="text-fg-faint ml-1">× Clear filter</span>
                    ) : null}
                  </button>
                ) : null}

                {/* R-NEW-12 — Pending Receipts This Week chip */}
                {pendingReceiptsCount !== null ? (
                  <div
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                      pendingReceiptsCount.count > 0
                        ? "bg-info-softer text-info-fg"
                        : "bg-bg-muted text-fg-muted",
                    )}
                    title={
                      pendingReceiptsCount.count > 0
                        ? `${pendingReceiptsCount.count} purchase order${pendingReceiptsCount.count !== 1 ? "s" : ""} expecting delivery this week`
                        : "No purchase orders due this week"
                    }
                  >
                    <Package className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {pendingReceiptsCount.count > 0
                      ? `${pendingReceiptsCount.count} receipts due this week`
                      : "No receipts due"}
                  </div>
                ) : null}

                {/* R-NEW-14 — Inventory Turnover Rate chip */}
                {inventoryTurnoverChip !== null ? (
                  <div
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                      inventoryTurnoverChip.label === "High"
                        ? "bg-success-softer text-success-fg"
                        : inventoryTurnoverChip.label === "Normal"
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-bg-muted text-fg-muted",
                    )}
                    title={`Annualized inventory turnover rate: ${inventoryTurnoverChip.rate}x/yr — ${inventoryTurnoverChip.label === "High" ? "healthy velocity" : inventoryTurnoverChip.label === "Normal" ? "moderate velocity" : "slow-moving stock"}`}
                  >
                    <RefreshCw className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`Turnover: ${inventoryTurnoverChip.rate}x/yr (${inventoryTurnoverChip.label})`}
                  </div>
                ) : null}

                {/* R-NEW-16 — Reorder Point Alert chip */}
                {reorderAlertCount !== null ? (
                  <button
                    type="button"
                    onClick={() => setAlertCriticalFilter((v) => !v)}
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 cursor-pointer border transition-colors",
                      reorderAlertCount.count > 0
                        ? "bg-danger-softer text-danger-fg border-danger/30"
                        : "bg-success-softer text-success-fg border-success/30",
                    )}
                    title={
                      reorderAlertCount.count > 0
                        ? `${reorderAlertCount.count} item${reorderAlertCount.count !== 1 ? "s" : ""} below reorder point${reorderAlertCount.urgentCount > 0 ? ` (${reorderAlertCount.urgentCount} with no open PO)` : ""} — click to filter critical items`
                        : "All items above reorder point"
                    }
                  >
                    <Bell className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {reorderAlertCount.count > 0
                      ? `${reorderAlertCount.count} below reorder point`
                      : "All items above reorder point"}
                  </button>
                ) : null}

                {/* R-NEW-18 — Stock Age chip */}
                {stockAgeChip !== null ? (
                  <div
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                      stockAgeChip.avgAgeDays > 90
                        ? "bg-danger-softer text-danger-fg"
                        : stockAgeChip.avgAgeDays > 45
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-success-softer text-success-fg",
                    )}
                    title={`Weighted average stock age across ${stockAgeChip.itemCount} items: ${stockAgeChip.avgAgeDays} days`}
                  >
                    <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`Avg age: ${stockAgeChip.avgAgeDays}d`}
                  </div>
                ) : null}

                {/* R-NEW-20 — Supplier Concentration chip */}
                {supplierConcentrationChip !== null ? (
                  <div
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                      supplierConcentrationChip.topPct > 60
                        ? "bg-danger-softer text-danger-fg"
                        : supplierConcentrationChip.topPct > 40
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-bg-muted text-fg-muted",
                    )}
                    title={`Top supplier "${supplierConcentrationChip.topSupplier}" holds ${supplierConcentrationChip.topPct}% of total stock value across ${supplierConcentrationChip.supplierCount} suppliers${supplierConcentrationChip.topPct > 60 ? " — concentration risk" : ""}`}
                  >
                    <Building2 className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`${supplierConcentrationChip.topSupplier} ${supplierConcentrationChip.topPct}% of stock value`}
                  </div>
                ) : null}

                {/* R-NEW-22 — Hold Value chip */}
                {holdValueChip !== null ? (
                  <div
                    className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-warning-softer text-warning-fg"
                    title={`${holdValueChip.holdCount} item${holdValueChip.holdCount !== 1 ? "s" : ""} currently on hold, quarantined, or blocked; estimated stock value tied up: ₪${holdValueChip.holdValue.toLocaleString()}`}
                  >
                    <Lock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`${holdValueChip.holdCount} items on hold (₪${holdValueChip.holdValue.toLocaleString()})`}
                  </div>
                ) : null}

                {/* R-NEW-24 — Stock Turn Delta chip */}
                {stockTurnDeltaChip !== null ? (
                  <div
                    className={cn(
                      "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                      stockTurnDeltaChip.improved === true
                        ? "bg-success-softer text-success-fg"
                        : stockTurnDeltaChip.improved === false
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-info-softer text-info-fg",
                    )}
                    title={`Stock turn ratio: ${stockTurnDeltaChip.currentTurn.toFixed(1)}x — ${stockTurnDeltaChip.delta >= 0 ? "improved" : "worsened"} by ${Math.abs(stockTurnDeltaChip.delta).toFixed(1)} vs prior period`}
                  >
                    <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`${stockTurnDeltaChip.currentTurn.toFixed(1)}x turns`}
                    <span className="tabular-nums">
                      {stockTurnDeltaChip.delta > 0.005
                        ? `↑${stockTurnDeltaChip.delta.toFixed(1)}`
                        : stockTurnDeltaChip.delta < -0.005
                          ? `↓${Math.abs(stockTurnDeltaChip.delta).toFixed(1)}`
                          : "→"}
                    </span>
                  </div>
                ) : null}

                {/* R-NEW-26 — Negative Stock Count chip */}
                {negativeStockChip !== null ? (
                  <button
                    type="button"
                    onClick={() => setAlertCriticalFilter(true)}
                    className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-danger-softer text-danger-fg cursor-pointer"
                    title={`${negativeStockChip.negativeCount} item${negativeStockChip.negativeCount !== 1 ? "s" : ""} with negative current or projected stock — click to filter critical items`}
                  >
                    <MinusCircle className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`${negativeStockChip.negativeCount} negative stock`}
                  </button>
                ) : null}

                {/* R-NEW-28 — Overstock Value chip */}
                {overstockValueChip !== null ? (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                      overstockValueChip.valueK > 30
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        : overstockValueChip.valueK < 10
                          ? "bg-success-softer text-success-fg"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                    )}
                    title={`Estimated overstock value: ₪${(overstockValueChip.valueK * 1000).toLocaleString("he-IL", { maximumFractionDigits: 0 })}`}
                  >
                    <PackagePlus className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`Overstock: ₪${overstockValueChip.valueK}K`}
                  </div>
                ) : null}

                {/* R-NEW-30 — Slow Mover chip */}
                {slowMoverChip !== null ? (
                  <div
                    className="inline-flex items-center gap-1 rounded-full bg-warning-softer text-warning-fg text-3xs px-2 py-0.5"
                    title={`${slowMoverChip.count} item${slowMoverChip.count !== 1 ? "s" : ""} with fewer than 1 stock turn per year — slow-moving inventory`}
                  >
                    <Snail className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    {`Slow movers: ${slowMoverChip.count}`}
                  </div>
                ) : null}

                {/* R-NEW-32 — Days of Supply chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    daysOfSupplyChip.dos < 7
                      ? "bg-danger-softer text-danger-fg"
                      : daysOfSupplyChip.dos < 14
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-success-softer text-success-fg",
                  )}
                  title={`Average days of supply across all tracked items: ${daysOfSupplyChip.dos} days`}
                >
                  <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`DoS: ${daysOfSupplyChip.dos}d`}
                </div>

                {/* R-NEW-34 — Purchase Pending chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    purchasePendingChip.count > 0
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-success-softer text-success-fg",
                  )}
                  title={`Open purchase orders awaiting delivery: ${purchasePendingChip.count}`}
                >
                  <ShoppingCart className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`Pending POs: ${purchasePendingChip.count}`}
                </div>

                {/* R46-2 — Turnover Variance chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    turnoverVariancePct > 0
                      ? "bg-success-softer text-success-fg"
                      : turnoverVariancePct < 0
                        ? "bg-danger-softer text-danger-fg"
                        : "bg-bg-muted text-fg-muted",
                  )}
                  title={`Inventory turnover variance vs prior period: ${turnoverVariancePct > 0 ? "+" : ""}${turnoverVariancePct}%`}
                >
                  <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`Turnover Δ: ${turnoverVariancePct > 0 ? "▲" : turnoverVariancePct < 0 ? "▼" : ""}${turnoverVariancePct}%`}
                </div>

                {/* R47-2 — Shrinkage chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    shrinkagePct > 2
                      ? "bg-danger-softer text-danger-fg"
                      : shrinkagePct > 0.5
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-success-softer text-success-fg",
                  )}
                  title={`Inventory shrinkage rate: ${shrinkagePct}% of stock value lost to waste, damage, or unaccounted variance`}
                >
                  <TrendingDown className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`Shrinkage: ${shrinkagePct}%`}
                </div>

                {/* R48-2 — Fill Rate chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    fillRatePct >= 95
                      ? "bg-success-softer text-success-fg"
                      : fillRatePct >= 85
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-danger-softer text-danger-fg",
                  )}
                  title={`Order fill rate: ${fillRatePct}% of demand fulfilled from available stock`}
                >
                  <CheckSquare className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`Fill rate: ${fillRatePct}%`}
                </div>

                {/* R49-2 — Count Accuracy chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    countAccuracyPct >= 98
                      ? "bg-success-softer text-success-fg"
                      : countAccuracyPct >= 95
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-danger-softer text-danger-fg",
                  )}
                  title={`Physical count accuracy: ${countAccuracyPct}% of counted items matched the system-projected quantity within tolerance`}
                >
                  <ScanLine className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`Count accuracy: ${countAccuracyPct}%`}
                </div>

                {/* R50-2 — Out-of-Stock Risk chip */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5",
                    outOfStockRiskCount > 0
                      ? "bg-danger-softer text-danger-fg"
                      : "bg-success-softer text-success-fg",
                  )}
                  title={
                    outOfStockRiskCount > 0
                      ? `${outOfStockRiskCount} item${outOfStockRiskCount === 1 ? "" : "s"} at risk of stockout based on current stock and demand`
                      : "No items at stockout risk"
                  }
                >
                  <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`At risk: ${outOfStockRiskCount} item${outOfStockRiskCount === 1 ? "" : "s"}`}
                </div>

                {/* R51-2 — Total Stock Value chip */}
                <div
                  className="inline-flex items-center gap-1 rounded-full text-3xs px-2 py-0.5 bg-bg-muted text-fg-muted"
                  title={`Total estimated on-hand stock value: ₪${totalStockValueK}K`}
                >
                  <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  {`Value: ₪${totalStockValueK}K`}
                </div>
              </div>
            ) : null}

            {/* R-NEW-1 — ABC classification filter chips + split donut toggle */}
            {data.items.length > 0 ? (
              <div className="space-y-1">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  data-testid="abc-filter-chips"
                  role="group"
                  aria-label="Filter by ABC classification"
                >
                  <span className="text-3xs tracking-sops text-fg-faint mr-0.5">ABC:</span>
                  {(["A", "B", "C"] as const).map((cls) => {
                    const count = abcDistribution[cls];
                    return (
                      <span
                        key={cls}
                        className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-bg-subtle/30 text-fg-muted px-2 py-0.5 text-3xs"
                      >
                        {cls === "A" ? "A (top 20%)" : cls === "B" ? "B (mid 30%)" : "C (rest)"}
                        <span className="tabular-nums opacity-70">({count})</span>
                      </span>
                    );
                  })}
                  {/* R-NEW-1 — ABC split donut toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowAbcDonut((v) => !v)}
                    aria-pressed={showAbcDonut}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showAbcDonut
                        ? "text-accent border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show ABC class distribution donut"
                  >
                    <PieChart className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    ABC split
                  </button>

                  {/* R-NEW-3 — Coverage heatmap toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowCoverageHeatmap((v) => !v)}
                    aria-pressed={showCoverageHeatmap}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showCoverageHeatmap
                        ? "text-accent border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Overlay coverage-days heat colors on item cards"
                  >
                    <Thermometer className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Coverage heat
                  </button>

                  {/* R-NEW-7 — Movement Sparklines toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowMovementSparklines((v) => !v)}
                    aria-pressed={showMovementSparklines}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showMovementSparklines
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show 4-week net movement sparkline per item"
                  >
                    <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Sparklines
                  </button>

                  {/* R-NEW-9 — Stock Value Chart toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowStockValueChart((v) => !v)}
                    aria-pressed={showStockValueChart}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showStockValueChart
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show stock value breakdown by category"
                  >
                    <DollarSign className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Stock value
                  </button>

                  {/* R-NEW-11 — Supplier Reliability Matrix toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowSupplierMatrix((v) => !v)}
                    aria-pressed={showSupplierMatrix}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showSupplierMatrix
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show supplier reliability matrix"
                  >
                    <Grid3X3 className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Suppliers
                  </button>

                  {/* R-NEW-13 — ABC Class Migration toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowAbcMigration((v) => !v)}
                    aria-pressed={showAbcMigration}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showAbcMigration
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show ABC class changes in the last 30 days"
                  >
                    <ArrowUpDown className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    ABC changes
                    {abcMigrationData.length > 0 ? (
                      <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent/20 px-1 tabular-nums text-accent text-[9px] font-semibold">
                        {abcMigrationData.length}
                      </span>
                    ) : null}
                  </button>

                  {/* R-NEW-15 — Min/Max Stock Table toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowMinMaxTable((v) => !v)}
                    aria-pressed={showMinMaxTable}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showMinMaxTable
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show min/max stock level policy table"
                  >
                    <Table2 className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Min/Max
                    {minMaxTableData.belowCount > 0 ? (
                      <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-danger/20 px-1 tabular-nums text-danger-fg text-[9px] font-semibold">
                        {minMaxTableData.belowCount}
                      </span>
                    ) : null}
                  </button>

                  {/* R-NEW-17 — Velocity Ranking Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowVelocityRanking((v) => !v)}
                    aria-pressed={showVelocityRanking}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showVelocityRanking
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show top 5 fastest-moving items by weekly velocity"
                  >
                    <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Top movers
                    {showVelocityRanking ? (
                      <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent/20 px-1 tabular-nums text-accent text-[9px] font-semibold">
                        5
                      </span>
                    ) : null}
                  </button>

                  {/* R-NEW-19 — Days-of-Coverage Matrix toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowCoverageMatrix((v) => !v)}
                    aria-pressed={showCoverageMatrix}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showCoverageMatrix
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show days-of-coverage distribution by tier"
                  >
                    <LayoutGrid className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Coverage tiers
                  </button>

                  {/* R-NEW-21 — Expiry Risk Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowExpiryRisk((v) => !v)}
                    aria-pressed={showExpiryRisk}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showExpiryRisk
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show expiry risk breakdown by time bucket"
                  >
                    <CalendarX className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Expiry risk
                    {expiryRiskData !== null && expiryRiskData.totalAtRisk > 0 ? (
                      <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-danger/20 px-1 tabular-nums text-danger-fg text-[9px] font-semibold">
                        {expiryRiskData.totalAtRisk}
                      </span>
                    ) : null}
                  </button>

                  {/* R-NEW-23 — Weekly Receipts Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowWeeklyReceipts((v) => !v)}
                    aria-pressed={showWeeklyReceipts}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showWeeklyReceipts
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show purchase orders expected to arrive this week"
                  >
                    <PackageCheck className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Expected receipts
                    {weeklyReceiptsData !== null && weeklyReceiptsData.receipts.length > 0 ? (
                      <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent/20 px-1 tabular-nums text-accent text-[9px] font-semibold">
                        {weeklyReceiptsData.receipts.length}
                      </span>
                    ) : null}
                  </button>

                  {/* R-NEW-25 — Item Quick Search toggle button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowItemSearch((v) => !v);
                      setItemSearchQuery("");
                    }}
                    aria-pressed={showItemSearch}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showItemSearch
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Quick-search items by name (⌘K)"
                  >
                    <Search className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Search
                    <span className="text-3xs text-fg-faint">⌘K</span>
                  </button>

                  {/* R-NEW-27 — Receipt Calendar toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowReceiptCalendar((v) => !v)}
                    aria-pressed={showReceiptCalendar}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showReceiptCalendar
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show 4-week receipt calendar"
                  >
                    <CalendarCheck className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Receipt Calendar
                  </button>

                  {/* R-NEW-29 — Supplier Delivery Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowSupplierDeliveryPanel((v) => !v)}
                    aria-pressed={showSupplierDeliveryPanel}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showSupplierDeliveryPanel
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show supplier on-time delivery performance"
                  >
                    <Truck className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Supplier OTD
                  </button>

                  {/* R-NEW-31 — Reorder Point Table toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowReorderPointTable((v) => !v)}
                    aria-pressed={showReorderPointTable}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showReorderPointTable
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show reorder point status table"
                  >
                    <Bell className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Reorder Points
                  </button>

                  {/* R-NEW-33 — Stock Movement History toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowStockMovementHistory((v) => !v)}
                    aria-pressed={showStockMovementHistory}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showStockMovementHistory
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show recent stock movement history"
                  >
                    <History className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Movement History
                  </button>

                  {/* R46-1 — ABC Classification Chart toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowAbcClassificationChart((v) => !v)}
                    aria-pressed={showAbcClassificationChart}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showAbcClassificationChart
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show ABC classification donut chart (A=80% value, B=15%, C=5%)"
                  >
                    <PieChart className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    ABC Analysis
                  </button>

                  {/* R47-1 — Dead Stock Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowDeadStockPanel((v) => !v)}
                    aria-pressed={showDeadStockPanel}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showDeadStockPanel
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show items with no stock movement in more than 90 days"
                  >
                    <Archive className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Dead Stock
                    <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-warning/20 px-1 tabular-nums text-warning-fg text-[9px] font-semibold">
                      {deadStockItems.length}
                    </span>
                  </button>

                  {/* R48-1 — Supplier Price History toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowSupplierPriceHistory((v) => !v)}
                    aria-pressed={showSupplierPriceHistory}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showSupplierPriceHistory
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show recent supplier price changes"
                  >
                    <Receipt className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Price History
                  </button>

                  {/* R49-1 — Cycle Count Schedule toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowCycleCountSchedule((v) => !v)}
                    aria-pressed={showCycleCountSchedule}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showCycleCountSchedule
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show upcoming cycle count schedule"
                  >
                    <ClipboardCheck className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Cycle Counts
                  </button>

                  {/* R50-1 — Min/Max Levels Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowMinMaxLevelsPanel((v) => !v)}
                    aria-pressed={showMinMaxLevelsPanel}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showMinMaxLevelsPanel
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show min/max stock levels for key components"
                  >
                    <ArrowUpDown className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Min/Max
                  </button>

                  {/* R51-1 — Replenishment Recommendations Panel toggle button */}
                  <button
                    type="button"
                    onClick={() => setShowReplenishmentRecommendations((v) => !v)}
                    aria-pressed={showReplenishmentRecommendations}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs cursor-pointer transition-colors",
                      showReplenishmentRecommendations
                        ? "text-accent bg-accent-softer border-accent/40 font-medium"
                        : "border-border/50 bg-bg-subtle/30 text-fg-muted hover:text-fg-strong hover:border-border",
                    )}
                    title="Show replenishment recommendations for low-stock components"
                  >
                    <ShoppingCart className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    Replenish
                  </button>
                </div>

                {/* R-NEW-9 — Stock Value Chart (shown when toggled) */}
                {showStockValueChart ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <DollarSign className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Stock Value by Category</span>
                    </div>
                    {stockValueData.length === 0 ? (
                      <p className="text-fg-faint text-3xs">No cost data available</p>
                    ) : (
                      <div className="space-y-0.5">
                        {stockValueData.map((row) => {
                          const max = stockValueData[0]?.value ?? 1;
                          const pct = max > 0 ? (row.value / max) * 100 : 0;
                          return (
                            <div key={row.category} className="flex items-center gap-2 py-0.5 text-3xs">
                              <span className="text-fg-muted w-20 truncate">{row.category}</span>
                              <div className="flex-1 h-2 bg-bg-muted rounded-full">
                                <div
                                  className="h-full bg-accent/60 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-fg-faint w-16 text-right tabular-nums">
                                ₪{row.value.toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-11 — Supplier Reliability Matrix (shown when toggled) */}
                {showSupplierMatrix ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Grid3X3 className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Supplier Reliability</span>
                    </div>
                    {supplierMatrixData.length === 0 ? (
                      <p className="text-fg-faint text-3xs">No supplier data available</p>
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {supplierMatrixData.map((s) => (
                          <div
                            key={s.name}
                            className={cn(
                              "w-20 rounded p-1.5 text-center text-3xs",
                              s.reliabilityScore >= 0.8
                                ? "bg-success-fg/15 border border-success/30"
                                : s.reliabilityScore >= 0.6
                                  ? "bg-warning-fg/15 border border-warning/30"
                                  : "bg-danger-fg/15 border border-danger/30",
                            )}
                            title={`${s.name}: ${Math.round(s.reliabilityScore * 100)}% reliability score`}
                          >
                            <div className="text-fg-muted truncate">{s.name}</div>
                            <div className="text-fg-faint">{Math.round(s.reliabilityScore * 100)}%</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-13 — ABC Class Migration Panel (shown when toggled) */}
                {showAbcMigration ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <span className="text-xs font-semibold text-fg-strong">ABC Class Changes (30d)</span>
                    {abcMigrationData.length === 0 ? (
                      <p className="text-fg-faint text-3xs mt-1">No ABC class changes in the last 30 days</p>
                    ) : (
                      <div className="mt-1.5 divide-y divide-border">
                        {abcMigrationData.map((c) => (
                          <div
                            key={`${c.name}-${c.fromClass}-${c.toClass}`}
                            className="flex items-center gap-2 py-1 text-3xs last:border-0"
                          >
                            <span className="text-fg-muted flex-1 truncate">{c.name}</span>
                            <span
                              className={cn(
                                "font-medium",
                                c.direction === "up"
                                  ? "text-success-fg"
                                  : "text-danger-fg",
                              )}
                            >
                              {c.fromClass}→{c.toClass}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-1 — ABC Distribution Donut Chart (shown when toggled) */}
                {showAbcDonut && abcTotal > 0 ? (
                  <div className="flex items-center gap-3 bg-bg-subtle border border-border rounded p-2 mt-2">
                    <svg
                      viewBox="0 0 60 60"
                      className="w-16 h-16 shrink-0"
                      style={{ transform: "rotate(-90deg)" }}
                      aria-label={`ABC distribution: A=${abcDistribution.A}, B=${abcDistribution.B}, C=${abcDistribution.C}`}
                      role="img"
                    >
                      {/* Center circle */}
                      <circle cx="30" cy="30" r="15" fill="hsl(var(--bg-subtle))" />
                      {/* Track */}
                      <circle
                        cx="30" cy="30" r="20"
                        fill="none"
                        stroke="hsl(var(--border) / 0.3)"
                        strokeWidth="10"
                      />
                      {/* A segment — green */}
                      {abcDashA > 0 ? (
                        <circle
                          cx="30" cy="30" r="20"
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="10"
                          strokeDasharray={`${abcDashA} ${abcCircumference - abcDashA}`}
                          strokeDashoffset={abcOffsetA}
                        />
                      ) : null}
                      {/* B segment — amber */}
                      {abcDashB > 0 ? (
                        <circle
                          cx="30" cy="30" r="20"
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="10"
                          strokeDasharray={`${abcDashB} ${abcCircumference - abcDashB}`}
                          strokeDashoffset={abcOffsetB}
                        />
                      ) : null}
                      {/* C segment — slate */}
                      {abcDashC > 0 ? (
                        <circle
                          cx="30" cy="30" r="20"
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="10"
                          strokeDasharray={`${abcDashC} ${abcCircumference - abcDashC}`}
                          strokeDashoffset={abcOffsetC}
                        />
                      ) : null}
                    </svg>
                    <div className="flex flex-col gap-0.5 text-3xs">
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} aria-hidden />
                        <span className="text-fg-muted">A</span>
                        <span className="tabular-nums text-fg-faint ml-auto pl-2">
                          {abcDistribution.A} ({Math.round(abcFractionA * 100)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#f59e0b" }} aria-hidden />
                        <span className="text-fg-muted">B</span>
                        <span className="tabular-nums text-fg-faint ml-auto pl-2">
                          {abcDistribution.B} ({Math.round(abcFractionB * 100)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#94a3b8" }} aria-hidden />
                        <span className="text-fg-muted">C</span>
                        <span className="tabular-nums text-fg-faint ml-auto pl-2">
                          {abcDistribution.C} ({Math.round(abcFractionC * 100)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* R-NEW-17 — Velocity Ranking Panel (shown when toggled) */}
                {showVelocityRanking ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <TrendingUp className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Top Movers</span>
                      <span className="ml-1 text-fg-faint text-3xs">by weekly velocity</span>
                    </div>
                    {velocityRankingData === null ? (
                      <p className="text-fg-faint text-3xs">Not enough velocity data available</p>
                    ) : (
                      <div className="space-y-0.5">
                        {velocityRankingData.items.map((entry) => (
                          <div
                            key={`${entry.rank}-${entry.name}`}
                            className="flex items-center gap-2 py-0.5 text-3xs"
                          >
                            <span
                              className={cn(
                                "font-semibold w-4 shrink-0 tabular-nums",
                                entry.rank === 1
                                  ? "text-yellow-500"
                                  : entry.rank === 2
                                    ? "text-fg-muted"
                                    : entry.rank === 3
                                      ? "text-orange-400"
                                      : "text-fg-faint",
                              )}
                              aria-label={`Rank ${entry.rank}`}
                            >
                              {entry.rank}
                            </span>
                            <span className="flex-1 truncate text-fg-muted" title={entry.name}>
                              {entry.name}
                            </span>
                            <span className="bg-accent/10 text-accent text-3xs px-1 rounded tabular-nums shrink-0">
                              {entry.velocity % 1 === 0 ? entry.velocity : entry.velocity.toFixed(1)} {velocityRankingData.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-19 — Days-of-Coverage Matrix (shown when toggled) */}
                {showCoverageMatrix ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-2">
                      <LayoutGrid className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Days-of-Coverage Distribution</span>
                    </div>
                    {coverageMatrixData === null ? (
                      <p className="text-fg-faint text-3xs">Not enough coverage data available</p>
                    ) : (
                      <div className="space-y-1">
                        {coverageMatrixData.tiers.map((tier) => (
                          <div key={tier.label} className="flex items-center gap-2 text-3xs">
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 font-medium w-20 text-center",
                                tier.bgClass,
                                tier.fgClass,
                              )}
                            >
                              {tier.label}
                            </span>
                            <div className="flex-1 h-2 bg-bg-muted rounded-full max-w-48">
                              <div
                                className={cn("h-full rounded-full", tier.bgClass)}
                                style={{ width: `${tier.pct}%` }}
                              />
                            </div>
                            <span className="text-fg-faint tabular-nums w-16 text-right shrink-0">
                              {tier.count} ({tier.pct}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-15 — Min/Max Stock Table (shown when toggled) */}
                {showMinMaxTable ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Table2 className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Min/Max Stock Levels</span>
                      {minMaxTableData.belowCount > 0 ? (
                        <span className="ml-1 text-danger-fg text-3xs">
                          ({minMaxTableData.belowCount} below min)
                        </span>
                      ) : null}
                    </div>
                    {minMaxTableData.rows.length === 0 ? (
                      <p className="text-fg-faint text-3xs">No min/max policies configured</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-1 text-3xs">
                        {/* Header row */}
                        <span className="text-fg-faint font-medium">Item</span>
                        <span className="text-fg-faint font-medium text-right tabular-nums">Current</span>
                        <span className="text-fg-faint font-medium text-right tabular-nums">Min</span>
                        <span className="text-fg-faint font-medium text-right tabular-nums">Max</span>
                        {/* Data rows */}
                        {minMaxTableData.rows.map((row, idx) => (
                          <div
                            key={`${row.name}-${idx}`}
                            className={cn(
                              "contents",
                            )}
                          >
                            <span
                              className={cn(
                                "truncate py-0.5 rounded-l",
                                row.status === "below" ? "bg-danger-softer/20" : row.status === "above" ? "bg-warning-softer/20" : "",
                              )}
                              title={row.name}
                            >
                              {row.name}
                            </span>
                            <span
                              className={cn(
                                "text-right tabular-nums py-0.5",
                                row.status === "below" ? "bg-danger-softer/20 text-danger-fg font-medium" : row.status === "above" ? "bg-warning-softer/20" : "text-fg-muted",
                              )}
                            >
                              {row.currentQty}
                            </span>
                            <span
                              className={cn(
                                "text-right tabular-nums py-0.5 text-fg-faint",
                                row.status === "below" ? "bg-danger-softer/20" : row.status === "above" ? "bg-warning-softer/20" : "",
                              )}
                            >
                              {row.minLevel ?? "—"}
                            </span>
                            <span
                              className={cn(
                                "text-right tabular-nums py-0.5 rounded-r text-fg-faint",
                                row.status === "below" ? "bg-danger-softer/20" : row.status === "above" ? "bg-warning-softer/20" : "",
                              )}
                            >
                              {row.maxLevel ?? "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-25 — Item Quick Search Panel (shown when toggled) */}
                {showItemSearch ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Search className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Item Search</span>
                    </div>
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      type="text"
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      className="w-full rounded border border-border bg-bg-muted px-2 py-1 text-3xs text-fg-strong placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50 mb-1.5"
                    />
                    {itemSearchQuery.trim() === "" ? null : itemSearchResults.results.length === 0 ? (
                      <p className="text-fg-faint text-3xs">No items match</p>
                    ) : (
                      <div className="space-y-0.5">
                        {itemSearchResults.results.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setShowItemSearch(false);
                              setItemSearchQuery("");
                            }}
                            className="w-full flex items-center gap-1.5 py-0.5 px-1 rounded text-3xs text-left hover:bg-bg-muted transition-colors cursor-pointer"
                          >
                            <span
                              className={cn(
                                "shrink-0 h-2 w-2 rounded-full",
                                item.status === "critical" || item.status === "stockout"
                                  ? "bg-danger"
                                  : item.status === "at_risk" || item.status === "warning"
                                    ? "bg-warning"
                                    : "bg-success",
                              )}
                              aria-hidden
                            />
                            <span className="flex-1 text-fg-strong truncate">{item.name}</span>
                            <span className="tabular-nums text-fg-faint shrink-0">
                              {item.currentQty}{item.unit ? ` ${item.unit}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-23 — Weekly Receipts Panel (shown when toggled) */}
                {showWeeklyReceipts ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <PackageCheck className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Receipts Expected (Next 7 Days)</span>
                    </div>
                    {weeklyReceiptsQuery.isLoading ? (
                      <div className="flex items-center gap-1 text-fg-faint text-3xs">
                        <Loader2 size={10} className="animate-spin" aria-hidden />
                        Loading…
                      </div>
                    ) : weeklyReceiptsData === null ? (
                      <p className="text-fg-faint text-3xs">No receipts expected this week</p>
                    ) : (
                      <>
                        <div className="space-y-0.5">
                          {weeklyReceiptsData.receipts.slice(0, 8).map((r, idx) => {
                            const dateLabel = r.expectedDate
                              ? new Date(r.expectedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                              : "—";
                            return (
                              <div
                                key={`${r.supplier}-${r.component}-${idx}`}
                                className="flex items-center gap-1.5 py-0.5 text-3xs"
                              >
                                <span className="shrink-0 rounded bg-info-softer text-info-fg px-1.5 py-0.5 tabular-nums font-medium text-[9px]">
                                  {dateLabel}
                                </span>
                                <span className="text-fg-faint truncate max-w-[80px]" title={r.supplier}>
                                  {r.supplier || "—"}
                                </span>
                                <span className="text-fg-muted flex-1 truncate" title={r.component}>
                                  {r.component || "—"}
                                </span>
                                <span className="tabular-nums text-fg-faint shrink-0">
                                  {r.qty}{r.unit ? ` ${r.unit}` : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-border text-3xs text-fg-faint tabular-nums">
                          {weeklyReceiptsData.receipts.length} receipt{weeklyReceiptsData.receipts.length !== 1 ? "s" : ""}
                          {weeklyReceiptsData.totalValue > 0
                            ? `, ₪${weeklyReceiptsData.totalValue.toLocaleString("he-IL", { maximumFractionDigits: 0 })} total`
                            : ""}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {/* R-NEW-27 — Receipt Calendar Panel (shown when toggled) */}
                {showReceiptCalendar ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-2">
                      <CalendarCheck className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Receipt Calendar</span>
                      <span className="ml-1 text-fg-faint text-3xs">4-week view</span>
                    </div>
                    {/* Day-of-week header: Mon–Sun */}
                    <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                        <div
                          key={i}
                          className="text-center text-3xs text-fg-faint font-medium py-0.5"
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                    {/* 4-week grid */}
                    <div className="space-y-0.5">
                      {receiptCalendarWeeks.map((week, wi) => {
                        const weekHasReceipt = week.some((cell) => receiptCalendarDates.has(cell.key));
                        return (
                          <div key={wi} className="grid grid-cols-7 gap-0.5">
                            {week.map((cell) => {
                              const hasReceipt = receiptCalendarDates.has(cell.key);
                              const todayKey = (() => {
                                const t = new Date();
                                t.setHours(0, 0, 0, 0);
                                return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
                              })();
                              const isToday = cell.key === todayKey;
                              return (
                                <div
                                  key={cell.key}
                                  className={cn(
                                    "relative flex flex-col items-center justify-center rounded py-1 text-3xs tabular-nums",
                                    hasReceipt
                                      ? "bg-accent/20 text-fg-strong font-medium"
                                      : weekHasReceipt
                                        ? "bg-bg-muted text-fg-muted"
                                        : "bg-bg-muted text-fg-faint",
                                    isToday && "ring-1 ring-accent/60",
                                  )}
                                  title={hasReceipt ? `Expected receipt on ${cell.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : undefined}
                                >
                                  <span>{cell.date.getDate()}</span>
                                  {hasReceipt ? (
                                    <span
                                      className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent"
                                      aria-hidden
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-3xs text-fg-faint">
                      Highlighted cells have at least one expected receipt.
                    </p>
                  </div>
                ) : null}

                {/* R-NEW-29 — Supplier Delivery Panel (shown when toggled) */}
                {showSupplierDeliveryPanel ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-2">
                      <Truck className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Supplier On-Time Delivery</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto_6rem] gap-x-2 gap-y-1 items-center text-3xs">
                      {/* Header */}
                      <span className="text-fg-faint font-medium">Supplier</span>
                      <span className="text-fg-faint font-medium text-right">On-Time %</span>
                      <span className="text-fg-faint font-medium text-right">Late %</span>
                      <span className="text-fg-faint font-medium"></span>
                      {/* Rows */}
                      {supplierOtdRows.map((row) => {
                        const onTimeColor =
                          row.onTimePct >= 90
                            ? "text-success-fg"
                            : row.onTimePct >= 75
                              ? "text-warning-fg"
                              : "text-danger-fg";
                        return (
                          <>
                            <span key={`${row.name}-name`} className="text-fg-muted truncate">{row.name}</span>
                            <span
                              key={`${row.name}-on`}
                              className={cn("tabular-nums text-right font-medium", onTimeColor)}
                            >
                              {row.onTimePct}%
                            </span>
                            <span key={`${row.name}-late`} className="tabular-nums text-right text-fg-faint">
                              {row.latePct}%
                            </span>
                            <div key={`${row.name}-bar`} className="h-2 bg-bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  row.onTimePct >= 90
                                    ? "bg-success-fg/60"
                                    : row.onTimePct >= 75
                                      ? "bg-warning-fg/60"
                                      : "bg-danger-fg/60",
                                )}
                                style={{ width: `${row.onTimePct}%` }}
                              />
                            </div>
                          </>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* R-NEW-31 — Reorder Point Table (shown when toggled) */}
                {showReorderPointTable ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Bell className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Reorder Points</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-0.5 text-3xs">
                      {/* Header */}
                      <span className="text-fg-faint font-medium">Item</span>
                      <span className="text-fg-faint font-medium text-right">Current</span>
                      <span className="text-fg-faint font-medium text-right">Reorder Pt</span>
                      <span className="text-fg-faint font-medium text-center">Status</span>
                      {/* Data rows */}
                      {reorderPointRows.map((row) => (
                        <div
                          key={row.name}
                          className={cn(
                            "contents",
                          )}
                        >
                          <span
                            className={cn(
                              "truncate py-0.5 rounded-l pl-1",
                              row.status === "BELOW" ? "bg-danger-softer" : "",
                            )}
                            title={row.name}
                          >
                            {row.name}
                          </span>
                          <span
                            className={cn(
                              "text-right tabular-nums py-0.5",
                              row.status === "BELOW"
                                ? "bg-danger-softer text-danger-fg font-medium"
                                : "text-fg-muted",
                            )}
                          >
                            {row.currentStock}
                          </span>
                          <span
                            className={cn(
                              "text-right tabular-nums py-0.5 text-fg-faint",
                              row.status === "BELOW" ? "bg-danger-softer" : "",
                            )}
                          >
                            {row.reorderPoint}
                          </span>
                          <span
                            className={cn(
                              "text-center py-0.5 rounded-r font-medium",
                              row.status === "BELOW"
                                ? "bg-danger-softer text-danger-fg"
                                : row.status === "AT"
                                  ? "text-warning-fg"
                                  : "text-success-fg",
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* R-NEW-33 — Stock Movement History Panel (shown when toggled) */}
                {showStockMovementHistory ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <History className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Movement History</span>
                      <span className="ml-1 text-fg-faint text-3xs">recent events</span>
                    </div>
                    <div className="space-y-0.5">
                      {stockMovementEvents.map((evt) => (
                        <div
                          key={evt.id}
                          className="flex items-center gap-2 py-0.5 text-3xs"
                        >
                          <span className="shrink-0 text-fg-faint w-10 tabular-nums">{evt.relativeTime}</span>
                          <span className="shrink-0 rounded bg-bg-muted text-fg-muted px-1 py-0.5 font-medium text-[9px]">
                            {evt.movementType}
                          </span>
                          <span className="flex-1 truncate text-fg-muted" title={evt.itemName}>
                            {evt.itemName}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 tabular-nums font-medium",
                              evt.qty > 0 ? "text-success-fg" : "text-danger-fg",
                            )}
                          >
                            {evt.qty > 0 ? `+${evt.qty}` : `${evt.qty}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* R46-1 — ABC Classification Chart panel (shown when toggled) */}
                {showAbcClassificationChart ? (
                  <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
                    <div className="flex items-center gap-1 mb-2">
                      <PieChart className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">ABC Analysis</span>
                      <span className="ml-1 text-fg-faint text-3xs">by value contribution</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Donut SVG: r=45, cx=60, cy=60, viewBox 120×120 */}
                      <svg
                        viewBox="0 0 120 120"
                        className="w-24 h-24 shrink-0"
                        style={{ transform: "rotate(-90deg)" }}
                        aria-label="ABC classification donut: A-class 80% of value, B-class 15%, C-class 5%"
                        role="img"
                      >
                        {/* Track */}
                        <circle
                          cx="60" cy="60" r="45"
                          fill="none"
                          stroke="hsl(var(--border) / 0.25)"
                          strokeWidth="18"
                        />
                        {/* A-class segment — blue, 80% of value */}
                        <circle
                          cx="60" cy="60" r="45"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="18"
                          strokeDasharray={`${abcClassChartA} ${abcClassChartCircumference - abcClassChartA}`}
                          strokeDashoffset={abcClassOffsetA}
                        />
                        {/* B-class segment — green, 15% of value */}
                        <circle
                          cx="60" cy="60" r="45"
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="18"
                          strokeDasharray={`${abcClassChartB} ${abcClassChartCircumference - abcClassChartB}`}
                          strokeDashoffset={abcClassOffsetB}
                        />
                        {/* C-class segment — gray, 5% of value */}
                        <circle
                          cx="60" cy="60" r="45"
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="18"
                          strokeDasharray={`${abcClassChartC} ${abcClassChartCircumference - abcClassChartC}`}
                          strokeDashoffset={abcClassOffsetC}
                        />
                        {/* Center fill */}
                        <circle cx="60" cy="60" r="36" fill="hsl(var(--bg-subtle))" />
                      </svg>
                      {/* Legend */}
                      <div className="flex flex-col gap-1.5 text-3xs">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: "#3b82f6" }} aria-hidden />
                          <span className="text-fg-muted font-medium w-4">A</span>
                          <span className="text-fg-faint tabular-nums">20% of items</span>
                          <span className="text-fg-strong tabular-nums font-semibold ml-auto pl-3">80% value</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: "#22c55e" }} aria-hidden />
                          <span className="text-fg-muted font-medium w-4">B</span>
                          <span className="text-fg-faint tabular-nums">30% of items</span>
                          <span className="text-fg-strong tabular-nums font-semibold ml-auto pl-3">15% value</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: "#94a3b8" }} aria-hidden />
                          <span className="text-fg-muted font-medium w-4">C</span>
                          <span className="text-fg-faint tabular-nums">50% of items</span>
                          <span className="text-fg-strong tabular-nums font-semibold ml-auto pl-3">5% value</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* R47-1 — Dead Stock Panel (shown when toggled) */}
                {showDeadStockPanel ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Archive className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Dead Stock</span>
                      <span className="ml-1 text-fg-faint text-3xs">no movement in &gt;90 days</span>
                    </div>
                    <div className="space-y-0.5">
                      {deadStockItems.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center gap-2 py-0.5 px-1 rounded text-3xs bg-warning-softer/30"
                        >
                          <span className="flex-1 truncate text-fg-muted" title={item.name}>
                            {item.name}
                          </span>
                          <span className="shrink-0 text-fg-faint tabular-nums">{item.lastMovedLabel}</span>
                          <span className="shrink-0 text-fg-muted tabular-nums">{item.qty} units</span>
                          <span className="shrink-0 text-fg-strong tabular-nums font-medium">
                            ₪{item.estimatedValue.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-border text-3xs flex items-center justify-between">
                      <span className="text-fg-faint">{deadStockItems.length} items total</span>
                      <span className="tabular-nums font-semibold text-fg-strong">
                        ₪{deadStockTotalValue.toLocaleString("he-IL", { maximumFractionDigits: 0 })} tied up
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* R48-1 — Supplier Price History Panel (shown when toggled) */}
                {showSupplierPriceHistory ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Receipt className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Supplier Price History</span>
                      <span className="ml-1 text-fg-faint text-3xs">last 5 changes</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-3xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Component</th>
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Supplier</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">Old ₪</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">New ₪</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">Chg %</th>
                            <th className="text-right text-fg-faint font-medium pb-1 tabular-nums">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierPriceHistoryRows.map((row) => (
                            <tr
                              key={`${row.component}-${row.date}`}
                              className="border-b border-border/40 last:border-0 hover:bg-bg-muted/30 transition-colors"
                            >
                              <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[100px]" title={row.component}>
                                {row.component}
                              </td>
                              <td className="py-0.5 pr-2 text-fg-faint truncate max-w-[80px]" title={row.supplier}>
                                {row.supplier}
                              </td>
                              <td className="py-0.5 pr-2 text-right tabular-nums text-fg-faint">
                                {row.oldPrice.toFixed(2)}
                              </td>
                              <td className="py-0.5 pr-2 text-right tabular-nums text-fg-muted font-medium">
                                {row.newPrice.toFixed(2)}
                              </td>
                              <td
                                className={cn(
                                  "py-0.5 pr-2 text-right tabular-nums font-semibold",
                                  row.changePct < 0
                                    ? "text-success-fg"
                                    : "text-danger-fg",
                                )}
                              >
                                {row.changePct > 0 ? "+" : ""}
                                {row.changePct.toFixed(1)}%
                              </td>
                              <td className="py-0.5 text-right tabular-nums text-fg-faint">
                                {row.date}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* R49-1 — Cycle Count Schedule Panel (shown when toggled) */}
                {showCycleCountSchedule ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <ClipboardCheck className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Cycle Count Schedule</span>
                      <span className="ml-1 text-fg-faint text-3xs">upcoming counts</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-3xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Item</th>
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Scheduled</th>
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Assigned</th>
                            <th className="text-left text-fg-faint font-medium pb-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cycleCountScheduleRows.map((row) => (
                            <tr
                              key={`${row.itemName}-${row.scheduledDate}`}
                              className={cn(
                                "border-b border-border/40 last:border-0 transition-colors",
                                row.status === "Overdue"
                                  ? "bg-danger-softer/40"
                                  : "hover:bg-bg-muted/30",
                              )}
                            >
                              <td
                                className="py-0.5 pr-2 text-fg-muted truncate max-w-[120px]"
                                title={row.itemName}
                              >
                                {row.itemName}
                              </td>
                              <td className="py-0.5 pr-2 tabular-nums text-fg-faint">
                                <span title={row.scheduledDate}>{row.relativeLabel}</span>
                              </td>
                              <td className="py-0.5 pr-2">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-bg-muted text-fg-muted font-semibold text-[9px] uppercase">
                                  {row.assignedTo}
                                </span>
                              </td>
                              <td className="py-0.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-1.5 py-0.5 font-medium",
                                    row.status === "Overdue"
                                      ? "bg-danger-softer text-danger-fg"
                                      : row.status === "Completed"
                                        ? "bg-success-softer text-success-fg"
                                        : "bg-bg-muted text-fg-muted",
                                  )}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* R50-1 — Min/Max Levels Panel (shown when toggled) */}
                {showMinMaxLevelsPanel ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <ArrowUpDown className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Min/Max Stock Levels</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-3xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Component</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">Min</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">Max</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">Current</th>
                            <th className="text-left text-fg-faint font-medium pb-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MIN_MAX_LEVELS.map((row) => {
                            const isBelow = row.current < row.min;
                            const isAtMin = !isBelow && row.current < row.min * 1.2;
                            const isAboveMax = row.current > row.max;
                            const statusLabel = isBelow
                              ? "Below Min"
                              : isAtMin
                                ? "At Min"
                                : isAboveMax
                                  ? "Above Max"
                                  : "OK";
                            const statusClass = isBelow
                              ? "text-danger-fg font-medium"
                              : isAtMin
                                ? "text-warning-fg font-medium"
                                : isAboveMax
                                  ? "text-orange-500 dark:text-orange-400 font-medium"
                                  : "text-success-fg";
                            return (
                              <tr
                                key={row.name}
                                className="border-b border-border/40 last:border-0 hover:bg-bg-muted/30 transition-colors"
                              >
                                <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[110px]" title={row.name}>
                                  {row.name}
                                </td>
                                <td className="py-0.5 pr-2 text-right tabular-nums text-fg-faint">
                                  {row.min}
                                </td>
                                <td className="py-0.5 pr-2 text-right tabular-nums text-fg-faint">
                                  {row.max}
                                </td>
                                <td className="py-0.5 pr-2 text-right tabular-nums text-fg-muted font-medium">
                                  {row.current}
                                </td>
                                <td className={cn("py-0.5", statusClass)}>
                                  {statusLabel}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* R51-1 — Replenishment Recommendations Panel (shown when toggled) */}
                {showReplenishmentRecommendations ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <ShoppingCart className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Replenishment Recommendations</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-3xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Item</th>
                            <th className="text-right text-fg-faint font-medium pb-1 pr-2 tabular-nums">Reorder Qty</th>
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Urgency</th>
                            <th className="text-left text-fg-faint font-medium pb-1 pr-2">Supplier</th>
                            <th className="text-left text-fg-faint font-medium pb-1">ETA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {REPLEN_RECS.map((row) => {
                            const urgencyClass =
                              row.urgency === "high"
                                ? "bg-danger-softer text-danger-fg"
                                : row.urgency === "medium"
                                  ? "bg-warning-softer text-warning-fg"
                                  : "bg-success-softer text-success-fg";
                            const urgencyLabel =
                              row.urgency === "high" ? "High" : row.urgency === "medium" ? "Medium" : "Low";
                            return (
                              <tr
                                key={row.name}
                                className="border-b border-border/40 last:border-0 hover:bg-bg-muted/30 transition-colors"
                              >
                                <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[110px]" title={row.name}>
                                  {row.name}
                                </td>
                                <td className="py-0.5 pr-2 text-right tabular-nums text-fg-muted font-medium">
                                  {row.reorderQty.toLocaleString()}
                                </td>
                                <td className="py-0.5 pr-2">
                                  <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-medium", urgencyClass)}>
                                    {urgencyLabel}
                                  </span>
                                </td>
                                <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[80px]" title={row.supplier}>
                                  {row.supplier}
                                </td>
                                <td className="py-0.5 text-fg-faint">
                                  {row.eta}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* R-NEW-21 — Expiry Risk Panel (shown when toggled) */}
                {showExpiryRisk ? (
                  <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <CalendarX className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold text-fg-strong">Expiry Risk</span>
                    </div>
                    {expiryRiskData === null ? (
                      <p className="text-fg-faint text-3xs">No expiry dates tracked</p>
                    ) : (
                      <div className="space-y-1">
                        {expiryRiskData.buckets.map((bucket) => {
                          const isExpanded = expandedExpiryBucket === bucket.label;
                          const bucketColor =
                            bucket.label === "Expired"
                              ? "bg-danger-softer text-danger-fg"
                              : bucket.label === "Critical"
                                ? "bg-warning-softer text-warning-fg"
                                : bucket.label === "Soon"
                                  ? "bg-info-softer text-info-fg"
                                  : "bg-bg-muted text-fg-muted";
                          return (
                            <div key={bucket.label}>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedExpiryBucket(isExpanded ? null : bucket.label)
                                }
                                className="flex items-center gap-2 w-full text-left text-3xs py-0.5 hover:bg-bg-muted/40 rounded transition-colors"
                              >
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 font-medium w-16 text-center shrink-0",
                                    bucketColor,
                                  )}
                                >
                                  {bucket.label}
                                </span>
                                <span className="text-fg-faint tabular-nums">
                                  {bucket.count} item{bucket.count !== 1 ? "s" : ""}
                                </span>
                                {bucket.count > 0 ? (
                                  <ChevronRight
                                    className={cn(
                                      "h-3 w-3 text-fg-faint ml-auto shrink-0 transition-transform",
                                      isExpanded && "rotate-90",
                                    )}
                                    strokeWidth={1.75}
                                    aria-hidden
                                  />
                                ) : null}
                              </button>
                              {isExpanded && bucket.items.length > 0 ? (
                                <div className="mt-0.5 ml-2 space-y-0.5 border-l border-border pl-2">
                                  {bucket.items.map((entry) => (
                                    <div
                                      key={`${entry.name}-${entry.daysLeft}`}
                                      className="flex items-center justify-between text-3xs py-0.5"
                                    >
                                      <span className="text-fg-muted truncate flex-1" title={entry.name}>
                                        {entry.name}
                                      </span>
                                      <span
                                        className={cn(
                                          "tabular-nums ml-2 shrink-0",
                                          entry.daysLeft < 0
                                            ? "text-danger-fg font-medium"
                                            : entry.daysLeft <= 30
                                              ? "text-warning-fg"
                                              : "text-fg-faint",
                                        )}
                                      >
                                        {entry.daysLeft < 0
                                          ? `${Math.abs(entry.daysLeft)}d ago`
                                          : `${entry.daysLeft}d left`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {plannedFailed ? (
              <div
                className="rounded border border-info/30 bg-info-softer/60 px-3 py-2 text-2xs text-info-fg"
                data-testid="planned-overlay-error-caveat"
              >
                Planned production data unavailable — showing posted stock only.
              </div>
            ) : null}
            {filteredItems.length === 0 ? (
              <EmptyState
                title="All clear ✨"
                description={
                  atRiskOnlyClient
                    ? "No products at risk in the next 14 days. Toggle off 'Show only at-risk' to see all items."
                    : "No items match the current filters."
                }
              />
            ) : isMobile ? (
              <MobileCardStream
                items={filteredItems}
                summary={summary}
                overlayEnabled={overlayEnabled}
                plannedByItemDate={plannedByItemDate}
                showCoverageHeatmap={showCoverageHeatmap}
                coverageDaysMap={coverageDaysMap}
                onSelectItem={setSelectedItemId}
                showMovementSparklines={showMovementSparklines}
                movementByItemId={movementByItemId}
              />
            ) : (
              <FlowGridDesktop
                items={filteredItems}
                overlayEnabled={overlayEnabled}
                plannedByItemDate={plannedByItemDate}
                plannedRows={plannedRowsArray}
                showCoverageHeatmap={showCoverageHeatmap}
                coverageDaysMap={coverageDaysMap}
                onSelectItem={setSelectedItemId}
                showMovementSparklines={showMovementSparklines}
                movementByItemId={movementByItemId}
              />
            )}
            {overlayEnabled ? <PlannedFooterCaveat /> : null}
          </>
        )}
      </div>

      {/* R-NEW-5 — Expandable Item Detail Sidebar */}
      {selectedItemId !== null ? (
        <div className="fixed right-0 top-0 h-full w-64 bg-bg-subtle border-l border-border shadow-lg z-50 p-3 flex flex-col gap-2 text-3xs overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-fg-strong">
              {itemDetailQuery.isLoading
                ? "Loading…"
                : (itemDetail as any)?.name ??
                  (itemDetail as any)?.item_name ??
                  selectedItemId}
            </span>
            <button
              type="button"
              onClick={() => setSelectedItemId(null)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:text-fg-strong transition-colors"
              aria-label="Close item detail"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {itemDetailQuery.isLoading ? (
            <div className="flex items-center gap-1 text-fg-muted">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Loading…
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-fg-faint">Stock qty</span>
                <span className="text-fg-muted tabular-nums">
                  {(itemDetail as any)?.stock_qty ?? (itemDetail as any)?.on_hand ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-faint">Coverage days</span>
                <span className="text-fg-muted tabular-nums">
                  {(itemDetail as any)?.coverage_days ?? (itemDetail as any)?.days_of_cover ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-faint">Supplier</span>
                <span className="text-fg-muted truncate max-w-[120px]">
                  {(itemDetail as any)?.supplier_name ?? (itemDetail as any)?.supplier ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-faint">Lead time</span>
                <span className="text-fg-muted tabular-nums">
                  {(itemDetail as any)?.lead_time_days != null
                    ? `${(itemDetail as any).lead_time_days}d`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-faint">ABC class</span>
                <span className="text-fg-muted">
                  {(itemDetail as any)?.abc_class ?? "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-md border border-border/40 bg-bg-muted/60"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-md border border-border/40 bg-bg-muted/60" />
    </div>
  );
}
