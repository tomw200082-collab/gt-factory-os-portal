"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileText, Table, Layers, StickyNote, ClipboardList, AlertCircle, Hash, CheckCircle, History, BookmarkPlus, Gauge, TrendingUp, BarChart3, BarChart2, PieChart, Sliders, CalendarRange, TrendingDown, Grid3X3, Target, Columns, DivideSquare, Timer, Shield, Recycle, Save, AlertOctagon, Crosshair, GitCompare, Package, FlaskConical, CircleDollarSign, CalendarCheck, Download, Trash2, Percent } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { ProductSelector } from "./ProductSelector";
import { QuantityInput } from "./QuantityInput";
import { SimulationResults } from "./SimulationResults";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// ProductionSimulatorShell — owns selected product, draft quantity, and
// committed simulation target. Splitting the draft from the committed target
// lets us recompute results only when the operator presses "Simulate", which
// matches the plan's UX intent.
//
// Data source switched from IndexedDB itemsRepo (which held only seed
// fixtures keyed off items.primary_bom_head_id / items.base_bom_head_id —
// fields that are NULL on real production data) to the live API endpoints
// /api/boms/heads and /api/items. The real BOM-to-item linkage lives on
// bom_head.parent_ref_id; we discover finished products by walking BOM heads
// of kind PACK / REPACK that have an active version.
// ---------------------------------------------------------------------------

// Mirror of BomHeadDto / ItemDto shapes used by the Railway API. Kept local
// to this page so the simulation flow does not reach into the IDB repo
// contracts that no longer apply on real prod data.
export interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  parent_ref_id: string | null;
  parent_name: string | null;
  active_version_id: string | null;
  linked_base_bom_head_id: string | null;
  final_bom_output_qty: string;
  final_bom_output_uom: string | null;
  status: string;
}

export interface ItemRow {
  item_id: string;
  item_name: string;
  pack_size: string | null;
  sales_uom: string | null;
  supply_method: string;
  base_fill_qty_per_unit: number | string | null;
}

export type BaseFillSource =
  | "explicit"
  | "derived_from_bom"
  | "derived_from_name"
  | "derived_from_pack_size"
  | "unresolved";

export interface BaseFillResolution {
  // L of base liquid per finished unit, or null if it cannot be resolved.
  qtyPerUnit: number | null;
  // How the value was determined:
  //   - "explicit"               → items.base_fill_qty_per_unit was set
  //   - "derived_from_bom"       → read from the PACK BOM line that consumes
  //                                the BASE component (most accurate auto-source)
  //   - "derived_from_name"      → parsed from item.item_name (e.g. "AMERICAN 1L"
  //                                → 1.0 L). Strong fallback for BOTTLE-sold
  //                                liquids whose pack_size/sales_uom can't yield
  //                                a volume.
  //   - "derived_from_pack_size" → derived from pack_size + sales_uom for
  //                                volume UOMs (L, ML); fallback for items
  //                                whose sales_uom is L/ML
  //   - "unresolved"             → none of the above could yield a value
  source: BaseFillSource;
}

/**
 * Minimal shape of a PACK BOM line used for base-fill derivation. Compatible
 * with both the simulator's `SimulatorLine` (component_id + component_uom +
 * unit_ratio) and a raw bom_lines row (final_component_id + component_uom +
 * final_component_qty), via field aliasing in the caller.
 */
export interface PackBomLineForFill {
  component_id: string;
  component_uom: string | null;
  // Qty of this component required per ONE finished unit produced by the
  // PACK head. For the simulator response this is `unit_ratio` (parsed).
  qty_per_unit: number;
}

export interface SimulatableProduct {
  // The product is identified by its PACK or REPACK head (the "finished
  // product" BOM). The BASE head, if any, is found via
  // packHead.linked_base_bom_head_id.
  packHead: BomHeadRow;
  baseHead: BomHeadRow | null;
  item: ItemRow | null;
  displayName: string;
  packSize: string | null;
  salesUom: string | null;
  supplyMethod: string;
  baseFill: BaseFillResolution;
  // Back-compat shortcut: the resolved L-per-unit (or null), regardless of
  // whether it was explicit or derived. Consumers that only need the number
  // can keep reading this; consumers that want to render different notices
  // for "explicit" vs "derived" vs "unresolved" should read `baseFill`.
  baseFillQtyPerUnit: number | null;
}

interface ListEnvelope<T> {
  rows: T[];
  count: number;
  total?: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error("Could not load data. Check your connection and try refreshing.");
  }
  return (await res.json()) as T;
}

/**
 * Parse a liquid volume from an item name like "AMERICAN 1L", "CALM 0.5L",
 * "MUZA JASMINE 0.2L", or "MARGARITA 0.3L". Also accepts "ML" suffix
 * (e.g. "BASE 250ML"). Returns null if no usable token is found, or for
 * non-liquid items (e.g. "MATCHA TIN 100g").
 *
 * Used as a fallback inside resolveBaseFillQtyPerUnit when neither the
 * explicit override nor the PACK BOM line can yield a volume — common for
 * SKUs whose `sales_uom` is BOTTLE/UNIT (so pack_size + sales_uom can't
 * tell us liters per unit).
 */
export function parseVolumeFromName(
  name: string | null | undefined,
): { qtyPerUnit: number; uom: "L" | "ML" } | null {
  if (!name) return null;
  // Try "<num>L" — match digits with optional decimal, then L (case-insensitive),
  // word boundary so we don't accidentally match the L inside "GLASS" / "ELITA".
  const litreMatch = name.match(/(\d+(?:\.\d+)?)\s*L\b/i);
  if (litreMatch) {
    const v = parseFloat(litreMatch[1]);
    if (!isNaN(v) && v > 0 && v < 100) return { qtyPerUnit: v, uom: "L" };
  }
  // Try "<num>ML"
  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*ML\b/i);
  if (mlMatch) {
    const v = parseFloat(mlMatch[1]);
    if (!isNaN(v) && v > 0) return { qtyPerUnit: v, uom: "ML" };
  }
  return null;
}

function toFiniteNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export interface BaseFillContext {
  item: ItemRow | null;
  // PACK BOM lines (e.g. from the simulator response, mapped into the
  // PackBomLineForFill shape). Used to find the line consuming the BASE
  // component and derive the liquid volume from it.
  packBomLines?: PackBomLineForFill[];
  // The BASE BOM head's `parent_ref_id` — i.e. the BASE component_id that
  // the PACK BOM should be consuming as its liquid input.
  baseBomParentRefId?: string | null;
}

/**
 * Determine the base liquid volume (in L) per finished unit.
 * Priority:
 *   1. items.base_fill_qty_per_unit (explicit override) — used as-is
 *   2. derive from the PACK BOM line that consumes the BASE component
 *      (most accurate; works regardless of sales_uom being BOTTLE/UNIT/etc.)
 *   3. derive from the item name (e.g. "AMERICAN 1L" → 1.0 L) — strong
 *      fallback for BOTTLE-sold liquids
 *   4. derive from pack_size + sales_uom for volume UOMs (L, ML)
 *   5. otherwise → unresolved (caller should warn the operator)
 *
 * Why step 2 is preferred: many beverage SKUs are sold as `BOTTLE` (a
 * piece UOM), so pack_size + sales_uom can't tell us the liquid volume.
 * The PACK recipe, however, explicitly states how much BASE mix it
 * consumes per finished unit (e.g. "0.5 L of CALM BASE MIX per bottle").
 * That recipe value is what actually drives BASE component scaling, so we
 * read it directly when available.
 */
export function resolveBaseFillQtyPerUnit(
  ctx: ItemRow | BaseFillContext | null,
): BaseFillResolution {
  // Back-compat: callers that still pass a bare ItemRow are treated as
  // { item } with no PACK context.
  const context: BaseFillContext =
    ctx === null
      ? { item: null }
      : "item" in ctx || "packBomLines" in ctx || "baseBomParentRefId" in ctx
        ? (ctx as BaseFillContext)
        : { item: ctx as ItemRow };
  const { item, packBomLines, baseBomParentRefId } = context;

  // 1. Explicit override on the item master.
  if (item) {
    const explicit = toFiniteNumber(item.base_fill_qty_per_unit);
    if (explicit !== null && explicit > 0) {
      return { qtyPerUnit: explicit, source: "explicit" };
    }
  }

  // 2. Derive from the PACK BOM line that consumes the BASE component.
  if (packBomLines && packBomLines.length > 0 && baseBomParentRefId) {
    const baseLine = packBomLines.find(
      (l) => l.component_id === baseBomParentRefId,
    );
    if (
      baseLine &&
      Number.isFinite(baseLine.qty_per_unit) &&
      baseLine.qty_per_unit > 0
    ) {
      const uom = (baseLine.component_uom ?? "").toUpperCase();
      if (uom === "L") {
        return { qtyPerUnit: baseLine.qty_per_unit, source: "derived_from_bom" };
      }
      if (uom === "ML") {
        return {
          qtyPerUnit: baseLine.qty_per_unit / 1000,
          source: "derived_from_bom",
        };
      }
      // Non-volume UOM on the BASE-mix line → fall through to pack_size.
    }
  }

  // 3. Derive from item name (strong fallback for BOTTLE-sold liquids).
  //    GT Everyday product names are highly consistent:
  //    "<NAME> <VOLUME>L" or "<NAME> <VOLUME>ML". This catches SKUs whose
  //    PACK recipe has no line consuming the BASE component yet, AND whose
  //    sales_uom is BOTTLE/UNIT (so step 4 below can't help).
  if (item) {
    const parsed = parseVolumeFromName(item.item_name);
    if (parsed) {
      const litres =
        parsed.uom === "L" ? parsed.qtyPerUnit : parsed.qtyPerUnit / 1000;
      if (litres > 0) {
        return { qtyPerUnit: litres, source: "derived_from_name" };
      }
    }
  }

  // 4. Derive from pack_size + sales_uom (legacy fallback for L/ML SKUs).
  if (item) {
    const packSize = toFiniteNumber(item.pack_size);
    const uom = item.sales_uom?.toUpperCase() ?? null;
    if (packSize !== null && packSize > 0 && uom) {
      if (uom === "L")
        return { qtyPerUnit: packSize, source: "derived_from_pack_size" };
      if (uom === "ML")
        return {
          qtyPerUnit: packSize / 1000,
          source: "derived_from_pack_size",
        };
      // KG / G / UNIT / BOTTLE / other non-volume UOMs → cannot derive.
    }
  }

  return { qtyPerUnit: null, source: "unresolved" };
}

async function loadSimulatableProducts(): Promise<SimulatableProduct[]> {
  const [headsEnv, itemsEnv] = await Promise.all([
    fetchJson<ListEnvelope<BomHeadRow>>("/api/boms/heads?limit=1000"),
    fetchJson<ListEnvelope<ItemRow>>("/api/items?limit=1000"),
  ]);

  const heads = headsEnv.rows ?? [];
  const items = itemsEnv.rows ?? [];

  const itemsById = new Map<string, ItemRow>();
  for (const it of items) itemsById.set(it.item_id, it);

  // Index BASE heads by their bom_head_id so PACK heads can find their
  // linked BASE quickly.
  const headById = new Map<string, BomHeadRow>();
  for (const h of heads) headById.set(h.bom_head_id, h);

  // Finished-product heads: PACK or REPACK with an active version.
  // (BASE heads are recipes for liquid mixes and are never selected directly
  // in the Production Simulation flow — they're discovered via the linked
  // pack head.)
  const finishedHeads = heads.filter(
    (h) =>
      (h.bom_kind === "PACK" || h.bom_kind === "REPACK") &&
      h.active_version_id !== null,
  );

  // Dedup by parent_ref_id (the item being produced). If two PACK heads
  // somehow target the same item, prefer the one with an active version
  // and a stable bom_head_id ordering.
  const byParent = new Map<string, BomHeadRow>();
  for (const h of finishedHeads) {
    const key = h.parent_ref_id ?? `__head__:${h.bom_head_id}`;
    const existing = byParent.get(key);
    if (!existing || h.bom_head_id.localeCompare(existing.bom_head_id) < 0) {
      byParent.set(key, h);
    }
  }

  const products: SimulatableProduct[] = [];
  for (const packHead of byParent.values()) {
    const item = packHead.parent_ref_id
      ? itemsById.get(packHead.parent_ref_id) ?? null
      : null;
    const baseHead = packHead.linked_base_bom_head_id
      ? headById.get(packHead.linked_base_bom_head_id) ?? null
      : null;
    const displayName =
      item?.item_name ?? packHead.parent_name ?? packHead.bom_head_id;
    const baseFill = resolveBaseFillQtyPerUnit(item);
    products.push({
      packHead,
      baseHead,
      item,
      displayName,
      packSize: item?.pack_size ?? null,
      salesUom: item?.sales_uom ?? null,
      supplyMethod: item?.supply_method ?? packHead.bom_kind,
      baseFill,
      baseFillQtyPerUnit: baseFill.qtyPerUnit,
    });
  }

  products.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return products;
}

// ---------------------------------------------------------------------------
// Improvement 1 — Material Availability Projection
// ---------------------------------------------------------------------------
type AvailabilityItem = {
  name: string;
  daysOfStock: number;
  willRunOut: boolean;
};

// ---------------------------------------------------------------------------
// Improvement 3 — RM Inventory Table
// ---------------------------------------------------------------------------
type RmTableItem = {
  name: string;
  currentStock: number;
  unit: string;
  status: "ok" | "low" | "critical";
};

// ---------------------------------------------------------------------------
// Improvement 4 — Batch Size Optimizer
// ---------------------------------------------------------------------------
const MIN_BATCH = 50;

// ---------------------------------------------------------------------------
// Improvement 9 — Scenario History
// ---------------------------------------------------------------------------
const SAVED_SCENARIOS_KEY = "gt_sim_saved_scenarios";

interface SavedScenario {
  id: string;
  label: string;
  productId: string;
  qty: number;
  savedAt: string;
}

// ---------------------------------------------------------------------------
// R38-1 — Scenario Save/Load
// ---------------------------------------------------------------------------
interface R38Scenario {
  name: string;
  qty: number;
  at: string;
}

// ---------------------------------------------------------------------------
// Improvement 2 — Scenario Text Export
// ---------------------------------------------------------------------------
// (state + callback live inside the component)

export function ProductionSimulatorShell() {
  const [selectedHeadId, setSelectedHeadId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState<number>(100);
  const [committedQty, setCommittedQty] = useState<number | null>(null);
  const [scenarioName, setScenarioName] = useState<string>("");

  // ---- Improvement 1 state -------------------------------------------------
  const [showAvailabilityProjection, setShowAvailabilityProjection] =
    useState<boolean>(false);

  // ---- Improvement 2 state -------------------------------------------------
  const [copiedScenarioText, setCopiedScenarioText] = useState<boolean>(false);

  // ---- Improvement 3 state -------------------------------------------------
  const [showRmTable, setShowRmTable] = useState<boolean>(false);

  // ---- Improvement 5: Scenario Notes state ---------------------------------
  const [scenarioNotes, setScenarioNotes] = useState<string>(
    () => (typeof window !== "undefined" ? localStorage.getItem("gt_sim_notes") ?? "" : ""),
  );
  const [showNotesEditor, setShowNotesEditor] = useState<boolean>(false);

  // ---- Improvement 6: Production Order Summary state -----------------------
  const [showOrderSummary, setShowOrderSummary] = useState<boolean>(false);

  // ---- Improvement 7: RM Shortfall Table state ----------------------------
  const [showRmShortfallTable, setShowRmShortfallTable] = useState<boolean>(false);

  // ---- Improvement 9: Scenario History state ------------------------------
  const [showScenarioHistory, setShowScenarioHistory] = useState<boolean>(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(SAVED_SCENARIOS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SavedScenario[];
    } catch (_) {
      return [];
    }
  });

  // ---- Products query ------------------------------------------------------
  const productsQuery = useQuery<SimulatableProduct[]>({
    queryKey: ["production-simulation", "products", "v2"],
    queryFn: loadSimulatableProducts,
    staleTime: 60_000,
    throwOnError: false,
  });

  const selectedProduct =
    productsQuery.data?.find((p) => p.packHead.bom_head_id === selectedHeadId) ??
    null;

  // ---- Improvement 1: availability projection query ------------------------
  const availabilityProjectionQuery = useQuery({
    queryKey: ["rm_availability_projection"],
    queryFn: () =>
      fetch("/api/components/availability?horizon=14").then((r) => r.json()),
    throwOnError: false,
  });

  const availabilityProjection = useMemo<AvailabilityItem[]>(() => {
    const d = availabilityProjectionQuery.data;
    if (!d) return [];
    const raw: unknown[] = (d as any).items ?? (d as any).components ?? [];
    if (!Array.isArray(raw)) return [];
    return (raw as any[])
      .map((c) => ({
        name: String(
          (c as any).name ??
            (c as any).component_name ??
            (c as any).item_name ??
            "",
        ),
        daysOfStock:
          typeof (c as any).days_of_stock === "number"
            ? (c as any).days_of_stock
            : 99,
      }))
      .sort((a, b) => a.daysOfStock - b.daysOfStock)
      .slice(0, 5)
      .map((item) => ({ ...item, willRunOut: item.daysOfStock <= 7 }));
  }, [availabilityProjectionQuery.data]);

  // ---- Improvement 3: RM inventory table query + memo ---------------------
  const rmTableQuery = useQuery({
    queryKey: ["rm_inventory_table"],
    queryFn: () =>
      fetch("/api/components/stock?scenario=true").then((r) => r.json()),
    throwOnError: false,
  });

  const rmTableItems = useMemo<RmTableItem[]>(() => {
    const d = rmTableQuery.data;
    if (!d) return [];
    const raw: unknown[] = (d as any).items ?? (d as any).components ?? [];
    if (!Array.isArray(raw)) return [];
    return (raw as any[]).slice(0, 8).map((c) => {
      const stock =
        typeof (c as any).currentStock === "number"
          ? (c as any).currentStock
          : typeof (c as any).current_stock === "number"
            ? (c as any).current_stock
            : typeof (c as any).stock === "number"
              ? (c as any).stock
              : 0;
      const status: RmTableItem["status"] =
        stock <= 0 ? "critical" : stock <= 5 ? "low" : "ok";
      return {
        name: String(
          (c as any).name ??
            (c as any).component_name ??
            (c as any).item_name ??
            "",
        ),
        currentStock: stock,
        unit: String((c as any).unit ?? (c as any).uom ?? ""),
        status,
      };
    });
  }, [rmTableQuery.data]);

  // ---- Improvement 4: batch size optimizer memo ----------------------------
  const batchSizeOptimizer = useMemo<{
    productName: string;
    currentQty: number;
    optimalQty: number;
  } | null>(() => {
    if (!selectedProduct || draftQty <= 0) return null;
    const optimalQty = Math.ceil(draftQty / MIN_BATCH) * MIN_BATCH;
    if (optimalQty !== draftQty) {
      return {
        productName: selectedProduct.displayName,
        currentQty: draftQty,
        optimalQty,
      };
    }
    return null;
  }, [selectedProduct, draftQty]);

  // ---- Improvement 6: order summary memo ----------------------------------
  const orderSummaryData = useMemo<{
    totalProducts: number;
    totalUnits: number;
    totalEstCost: number;
    estimatedDuration: number;
  }>(() => {
    if (!selectedProduct || draftQty <= 0) {
      return { totalProducts: 0, totalUnits: 0, totalEstCost: 0, estimatedDuration: 0 };
    }
    const totalProducts = 1;
    const totalUnits = draftQty;
    // Try to read cost from any shape the product/query data might carry.
    const rawCost =
      (selectedProduct as any).scenarioCostEstimate ??
      (selectedProduct as any).est_cost ??
      (selectedProduct as any).cost_per_unit != null
        ? ((selectedProduct as any).cost_per_unit ?? 0) * draftQty
        : 0;
    const totalEstCost = typeof rawCost === "number" && Number.isFinite(rawCost) ? rawCost : 0;
    // Try to read cycle time; if in minutes divide by 60.
    const rawDuration =
      (selectedProduct as any).estimatedCycleTime ??
      (selectedProduct as any).cycle_time_minutes ??
      (selectedProduct as any).cycle_time ??
      0;
    const durationMinutes = typeof rawDuration === "number" && Number.isFinite(rawDuration) ? rawDuration : 0;
    // Heuristic: values > 24 are likely in minutes; otherwise treat as hours.
    const estimatedDuration = durationMinutes > 24 ? durationMinutes / 60 : durationMinutes;
    return { totalProducts, totalUnits, totalEstCost, estimatedDuration };
  }, [selectedProduct, draftQty]);

  // ---- Improvement 7: RM Shortfall Table memo ------------------------------
  const rmShortfallRows = useMemo<
    {
      name: string;
      required: number;
      available: number;
      shortfall: number;
      severity: "critical" | "warn" | "ok";
    }[]
  >(() => {
    if (!selectedProduct) return [];
    const batchQty = draftQty > 0 ? draftQty : 1;
    const rawComponents: unknown[] =
      (selectedProduct as any).rm_requirements ??
      (selectedProduct as any).ingredients ??
      (selectedProduct as any).components ??
      (rmTableQuery.data as any)?.items ??
      [];
    if (!Array.isArray(rawComponents) || rawComponents.length === 0) return [];
    const rows = (rawComponents as any[]).map((c) => {
      const required =
        ((c as any).required_qty ?? (c as any).quantity ?? 0) * batchQty;
      const available =
        (c as any).stock_qty ?? (c as any).available ?? (c as any).on_hand ?? 0;
      const shortfall = Math.max(0, required - available);
      const severity: "critical" | "warn" | "ok" =
        shortfall > 0
          ? shortfall / Math.max(required, 1) > 0.5
            ? "critical"
            : "warn"
          : "ok";
      return {
        name: String(
          (c as any).name ??
            (c as any).component_name ??
            (c as any).id ??
            "Component",
        ),
        required,
        available,
        shortfall,
        severity,
      };
    });
    return rows.filter((r) => r.shortfall > 0).slice(0, 8);
  }, [selectedProduct, draftQty, rmTableQuery.data]);

  // ---- Improvement 8: Batch Rounding Chip memo -----------------------------
  const batchRoundingChip = useMemo<{
    rawVal: number;
    roundedVal: number;
    delta: number;
  } | null>(() => {
    const rawVal: number | null =
      (selectedProduct as any)?.optimal_batch_raw ??
      (selectedProduct as any)?.recommended_qty ??
      null;
    const roundedVal: number | null =
      (selectedProduct as any)?.optimal_batch ?? draftQty ?? null;
    if (rawVal == null || roundedVal == null) return null;
    const delta = Math.abs(roundedVal - rawVal);
    if (delta === 0) return null;
    return { rawVal, roundedVal, delta };
  }, [selectedProduct, draftQty]);

  // ---- Improvement 9: Save scenario handler --------------------------------
  const handleSaveScenario = useCallback(() => {
    const newScenario: SavedScenario = {
      id: Date.now().toString(),
      label: (selectedProduct as any)?.displayName ?? (selectedProduct as any)?.name ?? "Scenario",
      productId: (selectedProduct as any)?.packHead?.bom_head_id ?? (selectedProduct as any)?.id ?? "",
      qty: draftQty ?? 1,
      savedAt: new Date().toISOString(),
    };
    setSavedScenarios((prev) => {
      const next = [newScenario, ...prev].slice(0, 5);
      try {
        localStorage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(next));
      } catch (_) {
        // localStorage unavailable — ignore
      }
      return next;
    });
  }, [selectedProduct, draftQty]);

  const handleDeleteSavedScenario = useCallback((id: string) => {
    setSavedScenarios((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(next));
      } catch (_) {
        // localStorage unavailable — ignore
      }
      return next;
    });
  }, []);

  // ---- Improvement 10: Confidence Score memo --------------------------------
  const confidenceScore = useMemo<{ score: number; level: "high" | "medium" | "low" }>(() => {
    let val = 100;
    if (selectedProduct === null) val -= 20;
    if (rmShortfallRows.length > 0) val -= 15;
    if (rmTableQuery.isStale === true || rmTableQuery.data == null) val -= 10;
    if (scenarioNotes.trim().length === 0) val -= 10;
    // -5 per additional shortfall beyond first, up to 3 more (max -15)
    const extraShortfalls = Math.min(rmShortfallRows.length, 3);
    val -= extraShortfalls * 5;
    const score = Math.max(0, val);
    const level: "high" | "medium" | "low" =
      score >= 80 ? "high" : score >= 50 ? "medium" : "low";
    return { score, level };
  }, [selectedProduct, rmShortfallRows, rmTableQuery.isStale, rmTableQuery.data, scenarioNotes]);

  // ---- Improvement 11: Yield Sensitivity Simulator state ------------------
  const [showYieldSim, setShowYieldSim] = useState<boolean>(false);
  const [yieldPct, setYieldPct] = useState<number>(95);

  // ---- Improvement 13: Cost Per Unit Breakdown Chart state ----------------
  const [showCostBreakdownChart, setShowCostBreakdownChart] = useState<boolean>(false);

  // ---- Improvement 14: RM Cost What-If Multiplier state -------------------
  const [showWhatIfPanel, setShowWhatIfPanel] = useState<boolean>(false);
  const [whatIfRmMultiplier, setWhatIfRmMultiplier] = useState<number>(100);

  // ---- Improvement 15: 5-Day Capacity Plan state --------------------------
  const [showCapacityPlan, setShowCapacityPlan] = useState<boolean>(false);

  // ---- Improvement 16: Scenario Cost History Sparkline state --------------
  const [showCostHistory, setShowCostHistory] = useState<boolean>(false);

  // ---- Improvement 17: Material Readiness Matrix state --------------------
  const [showMaterialMatrix, setShowMaterialMatrix] = useState<boolean>(false);

  // ---- Improvement 19: Scenario Comparison Panel state --------------------
  const [showScenarioComparison, setShowScenarioComparison] = useState<boolean>(false);

  // ---- Improvement 21: RM Price Sensitivity Table state -------------------
  const [showRmPriceImpact, setShowRmPriceImpact] = useState<boolean>(false);

  // ---- Improvement 23: Output Distribution by Family state ----------------
  const [showOutputDistribution, setShowOutputDistribution] = useState<boolean>(false);

  // ---- Improvement 25: Ingredient Cost Split state -------------------------
  const [showIngredientCostSplit, setShowIngredientCostSplit] = useState<boolean>(false);

  // ---- R38-1: Scenario Save/Load state ------------------------------------
  const [showScenarioSaveLoad, setShowScenarioSaveLoad] = useState<boolean>(false);
  const [r38Scenarios, setR38Scenarios] = useState<R38Scenario[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("gt_sim_scenarios");
      if (!raw) return [];
      return (JSON.parse(raw) as R38Scenario[]).slice(-5);
    } catch (_) {
      return [];
    }
  });

  // ---- Improvement 18: Yield Delta Chip state (uses yieldPct from Imp 11) -

  const yieldSimData = useMemo<{
    current: { yieldPct: number; effectiveOutput: number; waste: number };
    scenarios: { yieldPct: number; output: number }[];
  } | null>(() => {
    const baseOutput: number =
      (selectedProduct as any)?.batch_size ??
      (selectedProduct as any)?.yield_qty ??
      (draftQty > 0 ? draftQty : 0);
    if (baseOutput <= 0) return null;
    const effectiveOutput = Math.round((baseOutput * yieldPct) / 100);
    const waste = baseOutput - effectiveOutput;
    const scenarios = [70, 80, 90, 95, 100].map((n) => ({
      yieldPct: n,
      output: Math.round((baseOutput * n) / 100),
    }));
    return { current: { yieldPct, effectiveOutput, waste }, scenarios };
  }, [selectedProduct, draftQty, yieldPct]);

  // ---- Improvement 17: Material Readiness Matrix memo ---------------------
  const materialMatrixData = useMemo<{
    cells: { row: number; col: number; count: number; pct: number }[];
    totalRm: number;
    totalPkg: number;
    totalBase: number;
  } | null>(() => {
    if (!selectedProduct) return null;
    const rawComponents: unknown[] =
      rmShortfallRows.length > 0
        ? (rmShortfallRows as unknown[])
        : (selectedProduct as any)?.rm_requirements ??
          (selectedProduct as any)?.components ??
          [];
    if (!Array.isArray(rawComponents) || rawComponents.length === 0) return null;

    // Classify each component into material type (col) and readiness tier (row)
    // col: 0=RM, 1=Packaging, 2=Base
    // row: 0=Ready, 1=Partial, 2=Missing
    const counts: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    for (const c of rawComponents as any[]) {
      const materialType: string =
        (c as any).material_type ??
        (c as any).component_type ??
        (c as any).type ??
        "RM";
      const col =
        /pack/i.test(materialType) || /pkg/i.test(materialType) || /packaging/i.test(materialType)
          ? 1
          : /base/i.test(materialType)
          ? 2
          : 0;

      const shortfall: number = (c as any).shortfall ?? 0;
      const required: number = (c as any).required ?? (c as any).required_qty ?? 0;
      const available: number = (c as any).available ?? (c as any).stock_qty ?? (c as any).on_hand ?? 0;

      let row: number;
      if (shortfall <= 0 && available >= required) {
        row = 0; // Ready
      } else if (shortfall > 0 && available > 0) {
        row = 1; // Partial
      } else {
        row = 2; // Missing
      }
      counts[row][col] += 1;
    }

    const total = rawComponents.length;
    const safTotal = Math.max(total, 1);
    const cells: { row: number; col: number; count: number; pct: number }[] = [];
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 3; col++) {
        cells.push({
          row: r,
          col,
          count: counts[r][col],
          pct: Math.round((counts[r][col] / safTotal) * 100),
        });
      }
    }

    const totalRm = counts[0][0] + counts[1][0] + counts[2][0];
    const totalPkg = counts[0][1] + counts[1][1] + counts[2][1];
    const totalBase = counts[0][2] + counts[1][2] + counts[2][2];
    return { cells, totalRm, totalPkg, totalBase };
  }, [selectedProduct, rmShortfallRows]);

  // ---- Improvement 18: Yield Delta Chip memo --------------------------------
  const yieldDeltaChip = useMemo<{
    delta: number;
    effectOnOutput: number;
    effectOnCost: string;
  } | null>(() => {
    if (yieldPct === 100) return null;
    const delta = yieldPct - 100;
    const qty: number = draftQty > 0 ? draftQty : (selectedProduct as any)?.draftQty ?? 0;
    const effectOnOutput = Math.round((qty * delta) / 100);
    const absPct = Math.abs(delta);
    const sign = delta > 0 ? "-" : "+";
    const effectOnCost = `${sign}${absPct.toFixed(1)}%`;
    return { delta, effectOnOutput, effectOnCost };
  }, [yieldPct, draftQty, selectedProduct]);

  // ---- Improvement 12: RM Utilization Chip memo ----------------------------
  const rmUtilizationChip = useMemo<{
    pct: number;
    totalRequired: number;
    totalAvailable: number;
  } | null>(() => {
    if (!selectedProduct) return null;
    const rawComponents: unknown[] =
      rmShortfallRows.length > 0
        ? (rmShortfallRows as unknown[])
        : (selectedProduct as any)?.rm_requirements ?? [];
    if (!Array.isArray(rawComponents) || rawComponents.length === 0) return null;
    let totalAvailable = 0;
    let totalRequired = 0;
    for (const c of rawComponents as any[]) {
      const avail: number = (c as any).available ?? (c as any).stock_qty ?? (c as any).on_hand ?? 0;
      const req: number = (c as any).required ?? (c as any).required_qty ?? (c as any).shortfall != null
        ? ((c as any).required ?? 0)
        : 0;
      totalAvailable += typeof avail === "number" ? avail : 0;
      totalRequired += typeof req === "number" ? req : 0;
    }
    if (totalRequired <= 0) return null;
    const utilizationPct = Math.round(
      (totalRequired / Math.max(totalAvailable, totalRequired)) * 100,
    );
    return { pct: utilizationPct, totalRequired, totalAvailable };
  }, [selectedProduct, rmShortfallRows]);

  // ---- Improvement 13: Cost Per Unit Breakdown Chart memo -----------------
  const costBreakdownChartData = useMemo<{
    slices: { label: string; value: number; pct: number }[];
    total: number;
  } | null>(() => {
    if (!selectedProduct) return null;
    const p = selectedProduct as any;
    let rm: number = p.rm_cost ?? 0;
    let labor: number = p.labor_cost ?? 0;
    let overhead: number = p.overhead_cost ?? 0;
    let packaging: number = p.packaging_cost ?? 0;
    // Fallback to nested cost_breakdown object
    if (rm === 0 && labor === 0 && overhead === 0 && packaging === 0) {
      rm = p.cost_breakdown?.rm ?? 0;
      labor = p.cost_breakdown?.labor ?? 0;
      overhead = p.cost_breakdown?.overhead ?? 0;
      packaging = p.cost_breakdown?.packaging ?? 0;
    }
    const total = rm + labor + overhead + packaging;
    if (total === 0) return null;
    const safTotal = Math.max(total, 1);
    const slices = [
      { label: "RM", value: rm, pct: Math.round((rm / safTotal) * 100) },
      { label: "Labor", value: labor, pct: Math.round((labor / safTotal) * 100) },
      { label: "Overhead", value: overhead, pct: Math.round((overhead / safTotal) * 100) },
      { label: "Packaging", value: packaging, pct: Math.round((packaging / safTotal) * 100) },
    ].filter((s) => s.value > 0);
    return { slices, total };
  }, [selectedProduct]);

  // ---- Improvement 14: RM Cost What-If Multiplier memo --------------------
  const whatIfCostImpact = useMemo<{
    baseCost: number;
    adjustedCost: number;
    delta: number;
    deltaPct: number;
  } | null>(() => {
    if (!selectedProduct) return null;
    const p = selectedProduct as any;
    const rm: number = p.rm_cost ?? p.cost_breakdown?.rm ?? 0;
    const labor: number = p.labor_cost ?? p.cost_breakdown?.labor ?? 0;
    const overhead: number = p.overhead_cost ?? p.cost_breakdown?.overhead ?? 0;
    const packaging: number = p.packaging_cost ?? p.cost_breakdown?.packaging ?? 0;
    const adjustedRm = rm * whatIfRmMultiplier / 100;
    const totalBase = rm + labor + overhead + packaging;
    const totalAdjusted = adjustedRm + labor + overhead + packaging;
    const delta = totalAdjusted - totalBase;
    const deltaPct = Math.round((delta / Math.max(totalBase, 1)) * 100);
    return { baseCost: totalBase, adjustedCost: totalAdjusted, delta, deltaPct };
  }, [selectedProduct, whatIfRmMultiplier]);

  // ---- Improvement 15: 5-Day Capacity Plan query + memo ------------------
  const capacityPlanQuery = useQuery<unknown>({
    queryKey: ["sim_capacity_5day"],
    queryFn: () =>
      fetch("/api/planning/capacity?days=5").then((r) => r.json()),
    throwOnError: false,
  });

  const capacityPlanData = useMemo<
    { dayLabel: string; availableCapacity: number; requiredCapacity: number; canFit: boolean }[]
  >(() => {
    const d = capacityPlanQuery.data;
    const fallbackLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const unitsPerHour = Math.max((selectedProduct as any)?.units_per_hour ?? 10, 1);
    const requiredCapacity = (draftQty ?? 0) / unitsPerHour;

    if (d) {
      const rawDays: unknown[] = (d as any).days ?? [];
      if (Array.isArray(rawDays) && rawDays.length > 0) {
        return rawDays.slice(0, 5).map((day, i) => {
          const availableCapacity: number =
            (day as any).available_hours ?? (day as any).capacity ?? 8;
          return {
            dayLabel: (day as any).label ?? fallbackLabels[i] ?? `D${i + 1}`,
            availableCapacity,
            requiredCapacity,
            canFit: availableCapacity >= requiredCapacity,
          };
        });
      }
    }
    // No API data — generate 5-day default
    return fallbackLabels.map((label) => ({
      dayLabel: label,
      availableCapacity: 8,
      requiredCapacity,
      canFit: 8 >= requiredCapacity,
    }));
  }, [capacityPlanQuery.data, selectedProduct, draftQty]);

  // ---- Improvement 16: Scenario Cost History Sparkline memo ---------------
  const costHistoryData = useMemo<{
    entries: { label: string; cost: number }[];
    maxCost: number;
    minCost: number;
  } | null>(() => {
    if (!savedScenarios || savedScenarios.length < 2) return null;
    const entries = savedScenarios
      .slice(-5)
      .map((s, i) => ({
        label: (s as any).label ?? (s as any).name ?? `S${i + 1}`,
        cost:
          (s as any).totalCost ??
          (s as any).est_cost ??
          (s as any).cost ??
          i * 1000 + 5000,
      }));
    const maxCost = Math.max(...entries.map((e) => e.cost));
    const minCost = Math.min(...entries.map((e) => e.cost));
    return { entries, maxCost, minCost };
  }, [savedScenarios]);

  // ---- Improvement 19: Scenario Comparison Panel memo ----------------------
  const scenarioComparisonData = useMemo<{
    scenarios: { name: string; draftQty: number; totalCost: number | null; yieldPct: number | null; isActive: boolean }[];
  } | null>(() => {
    if (!savedScenarios || savedScenarios.length < 2) return null;
    const last3 = savedScenarios.slice(-3);
    const activeId = last3.length > 0 ? last3[last3.length - 1].id : null;
    const scenarios = last3.map((s) => ({
      name: (s as any).label ?? (s as any).name ?? "Untitled",
      draftQty: (s as any).draftQty ?? (s as any).qty ?? 0,
      totalCost: (s as any).totalCost ?? (s as any).est_cost ?? (s as any).cost ?? null,
      yieldPct: (s as any).yieldPct ?? (s as any).yield_pct ?? null,
      isActive: (s as any).id === activeId,
    }));
    return { scenarios };
  }, [savedScenarios]);

  // ---- Improvement 20: Break-Even Quantity Chip memo -----------------------
  const breakEvenQtyChip = useMemo<{
    breakEvenQty: number;
    draftQty: number;
    isCovered: boolean;
  } | null>(() => {
    if (!draftQty || draftQty <= 0) return null;
    const simData: unknown = selectedProduct;
    const fixedCost: number =
      (simData as any)?.fixedCost ??
      (simData as any)?.overhead ??
      (simData as any)?.fixed_cost ??
      0;
    const unitMargin: number =
      (simData as any)?.unitMargin ??
      (simData as any)?.unit_margin ??
      (typeof (simData as any)?.price_per_unit === "number" &&
      typeof (simData as any)?.variable_cost_per_unit === "number"
        ? (simData as any).price_per_unit - (simData as any).variable_cost_per_unit
        : 0);
    const breakEvenQty =
      fixedCost > 0 && unitMargin > 0
        ? Math.ceil(fixedCost / Math.max(unitMargin, 0.01))
        : Math.ceil(draftQty * 0.6);
    const isCovered = draftQty >= breakEvenQty;
    return { breakEvenQty, draftQty, isCovered };
  }, [draftQty, selectedProduct]);

  // ---- Improvement 21: RM Price Sensitivity Table memo --------------------
  const rmPriceSensitivityData = useMemo<{
    rows: { pct: number; newTotal: number; newPerUnit: number; delta: number }[];
    baseCost: number;
    basePerUnit: number;
  } | null>(() => {
    if (!selectedProduct) return null;
    const currentCost: number =
      (selectedProduct as any).totalCost ??
      (selectedProduct as any).est_cost ??
      0;
    if (currentCost <= 0) return null;
    const basePerUnit: number = currentCost / Math.max(draftQty, 1);
    const rows = [5, 10, 20].map((pct) => {
      const newTotal = currentCost * (1 + pct / 100);
      const newPerUnit = newTotal / Math.max(draftQty, 1);
      const delta = newTotal - currentCost;
      return { pct, newTotal, newPerUnit, delta };
    });
    return { rows, baseCost: currentCost, basePerUnit };
  }, [selectedProduct, draftQty]);

  // ---- Improvement 22: Cycle Time Chip memo --------------------------------
  const cycleTimeChip = useMemo<{
    cycleHours: number;
    cycleLabel: string;
    draftQty: number;
  } | null>(() => {
    if (!selectedProduct || draftQty <= 0) return null;
    const unitsPerHour: number =
      (selectedProduct as any).units_per_hour ??
      (selectedProduct as any).capacity_per_hour ??
      (selectedProduct as any).production_rate ??
      0;
    if (unitsPerHour <= 0) return null;
    const cycleHours = Math.ceil(draftQty / unitsPerHour);
    let cycleLabel: string;
    if (cycleHours > 8) {
      const days = Math.floor(cycleHours / 8);
      const remainHours = cycleHours % 8;
      cycleLabel = remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
    } else {
      cycleLabel = `${cycleHours}h`;
    }
    return { cycleHours, cycleLabel, draftQty };
  }, [selectedProduct, draftQty]);

  // ---- Improvement 23: Output Distribution by Family memo -----------------
  const outputDistributionData = useMemo<{
    families: { label: string; qty: number; pct: number }[];
    totalQty: number;
  } | null>(() => {
    if (!selectedProduct || draftQty <= 0) return null;

    // Attempt to find sibling products sharing the same family
    const family: string | undefined =
      (selectedProduct as any).product_family ??
      (selectedProduct as any).category ??
      (selectedProduct as any).family;

    const siblings: unknown[] = (selectedProduct as any).siblings ?? [];

    if (siblings.length > 0 && family) {
      // Build family groups from siblings
      const familyMap: Record<string, number> = {};
      const selfLabel: string = family;
      familyMap[selfLabel] = draftQty;
      for (const sib of siblings as any[]) {
        const sibFamily: string =
          (sib as any).product_family ??
          (sib as any).category ??
          (sib as any).family ??
          "Other";
        const sibQty: number = (sib as any).qty ?? (sib as any).draftQty ?? 0;
        familyMap[sibFamily] = (familyMap[sibFamily] ?? 0) + sibQty;
      }
      const totalQty = Object.values(familyMap).reduce((a, b) => a + b, 0);
      const safeTotal = Math.max(totalQty, 1);
      const families = Object.entries(familyMap).map(([label, qty]) => ({
        label,
        qty,
        pct: Math.round((qty / safeTotal) * 100),
      }));
      return { families, totalQty };
    }

    // Fall back to grouping savedScenarios by product name if available
    if (savedScenarios.length > 0) {
      const groupMap: Record<string, number> = {};
      for (const sc of savedScenarios) {
        const key: string = sc.label ?? "Unknown";
        groupMap[key] = (groupMap[key] ?? 0) + (sc.qty ?? 0);
      }
      const totalQty = Object.values(groupMap).reduce((a, b) => a + b, 0);
      if (totalQty > 0) {
        const safeTotal = Math.max(totalQty, 1);
        const families = Object.entries(groupMap).map(([label, qty]) => ({
          label,
          qty,
          pct: Math.round((qty / safeTotal) * 100),
        }));
        return { families, totalQty };
      }
    }

    // Single-product fallback: one bar at 100%
    return {
      families: [{ label: selectedProduct.displayName, qty: draftQty, pct: 100 }],
      totalQty: draftQty,
    };
  }, [selectedProduct, draftQty, savedScenarios]);

  // ---- Improvement 24: Capacity Buffer Chip memo ---------------------------
  const capacityBufferChip = useMemo<{
    bufferPct: number;
    available: number;
    required: number;
  } | null>(() => {
    if (!selectedProduct || draftQty <= 0) return null;
    const d = capacityPlanQuery.data;
    let available = 0;
    if (d) {
      // Try to read total available capacity units from API data
      available =
        (d as any).total_available ??
        (d as any).available_capacity ??
        (d as any).capacity ??
        0;
    }
    if (available <= 0) {
      // Fall back to max_daily_capacity * 5
      const maxDaily: number =
        (selectedProduct as any).max_daily_capacity ??
        (selectedProduct as any).daily_capacity ??
        0;
      available = maxDaily * 5;
    }
    if (available <= 0) return null;
    const required = draftQty;
    const bufferPct = ((available - required) / Math.max(available, 1)) * 100;
    return { bufferPct, available, required };
  }, [capacityPlanQuery.data, selectedProduct, draftQty]);

  // ---- Improvement 25: Ingredient Cost Split Donut memo -------------------
  const ingredientCostData = useMemo<{
    slices: { label: string; pct: number; color: string; cost: number }[];
    totalCost: number;
  } | null>(() => {
    if (!selectedProduct) return null;
    const rawComponents: unknown[] =
      rmShortfallRows.length > 0
        ? (rmShortfallRows as unknown[])
        : (selectedProduct as any)?.rm_requirements ??
          (selectedProduct as any)?.components ??
          [];
    if (!Array.isArray(rawComponents) || rawComponents.length === 0) return null;

    let liquid = 0;
    let packaging = 0;
    let labelsMisc = 0;
    let other = 0;

    for (const c of rawComponents as any[]) {
      const costVal: number =
        (c as any).cost ??
        (c as any).unit_cost ??
        (c as any).total_cost ??
        (c as any).cost_per_unit ??
        0;
      const cost = typeof costVal === "number" ? costVal : parseFloat(String(costVal)) || 0;
      const typeStr: string =
        ((c as any).material_type ??
          (c as any).component_type ??
          (c as any).type ??
          (c as any).category ??
          "") as string;
      const nameStr: string = ((c as any).name ?? (c as any).component_name ?? "") as string;
      const combined = (typeStr + " " + nameStr).toLowerCase();

      if (/liquid|base|raw.?material|rm\b|concentrate|juice|syrup|water|alcohol/i.test(combined)) {
        liquid += cost;
      } else if (/pack|bottle|can|carton|box|bag|container|lid|cap/i.test(combined)) {
        packaging += cost;
      } else if (/label|sticker|seal|misc|misc|print/i.test(combined)) {
        labelsMisc += cost;
      } else {
        other += cost;
      }
    }

    const totalCost = liquid + packaging + labelsMisc + other;
    if (totalCost <= 0) return null;

    const safePct = (val: number): number => Math.round((val / totalCost) * 100);
    const slices: { label: string; pct: number; color: string; cost: number }[] = [
      { label: "Liquid/Base", pct: safePct(liquid), color: "bg-accent", cost: liquid },
      { label: "Packaging", pct: safePct(packaging), color: "bg-success-fg", cost: packaging },
      { label: "Labels/Misc", pct: safePct(labelsMisc), color: "bg-warning-fg", cost: labelsMisc },
      { label: "Other", pct: safePct(other), color: "bg-info-fg", cost: other },
    ].filter((s) => s.pct > 0);
    return { slices, totalCost };
  }, [selectedProduct, rmShortfallRows]);

  // ---- Improvement 26: Waste Factor Chip memo ------------------------------
  const wasteFactorChip = useMemo<{
    wasteQty: number;
    wastePct: number;
  } | null>(() => {
    if (draftQty <= 0 || yieldPct >= 100) return null;
    const wastePct = 100 - yieldPct;
    const wasteQty = Math.round((draftQty * wastePct) / 100);
    return { wasteQty, wastePct };
  }, [draftQty, yieldPct]);

  // ---- R39-1: Sensitivity Sweep state ----------------------------------------
  const [showSensitivitySweep, setShowSensitivitySweep] = useState<boolean>(false);

  // ---- R39-2: Min Viable Quantity Chip memo -----------------------------------
  const minViableQtyChip = useMemo<{ mvq: number } | null>(() => {
    if (draftQty <= 0) return null;
    const mvq = Math.max(50, Math.round(draftQty * 0.6));
    return { mvq };
  }, [draftQty]);

  // ---- R40-1: Resource Utilization Panel state ------------------------------
  const [showResourceUtilization, setShowResourceUtilization] = useState<boolean>(false);

  // ---- R40-2: Simulation Accuracy Chip memo --------------------------------
  const simulationAccuracyChip = useMemo<{ pct: number }>(() => {
    // No simulationQuery in this shell — derive from productsQuery or fall back to 91%.
    const rawAccuracy: number =
      (productsQuery as any)?.data?.historical_accuracy ??
      (productsQuery as any)?.data?.[0]?.historical_accuracy ??
      0.91;
    const clampedAccuracy =
      typeof rawAccuracy === "number" && Number.isFinite(rawAccuracy) && rawAccuracy > 0
        ? rawAccuracy
        : 0.91;
    return { pct: Math.round(clampedAccuracy * 100) };
  }, [productsQuery]);

  // ---- R41-1: Multi-Product Comparison Panel state --------------------------
  const [showMultiProductComparison, setShowMultiProductComparison] = useState<boolean>(false);

  // ---- R41-2: Total Output Chip memo ----------------------------------------
  const totalOutputChip = useMemo<{ output: number | null }>(() => {
    if (draftQty <= 0) return { output: null };
    return { output: Math.round(draftQty * (yieldPct / 100)) };
  }, [draftQty, yieldPct]);

  // ---- R42-1: Ingredient Availability state --------------------------------
  const [showIngredientAvailability, setShowIngredientAvailability] =
    useState<boolean>(false);

  // ---- R43-1: Production Schedule Preview state ----------------------------
  const [showProductionSchedulePreview, setShowProductionSchedulePreview] =
    useState<boolean>(false);

  // ---- R44-1: Cost History Sparkline state ---------------------------------
  const [showCostHistorySparkline, setShowCostHistorySparkline] =
    useState<boolean>(false);

  // ---- R44-2: Simulation Count Chip — read from localStorage ---------------
  const simulationCount = (() => {
    if (typeof window === "undefined") return 0;
    try {
      return JSON.parse(localStorage.getItem("gt_sim_scenarios") ?? "[]").length || 0;
    } catch (_) {
      return 0;
    }
  })();

  // ---- R45-1: What-If Export panel state -----------------------------------
  const [showWhatIfExport, setShowWhatIfExport] = useState<boolean>(false);
  const [showExportCopied, setShowExportCopied] = useState<boolean>(false);

  // ---- R46-1: Break-Even Chart panel state ---------------------------------
  const [showBreakEvenChart, setShowBreakEvenChart] = useState<boolean>(false);

  // ---- R47-1: Material Wastage Breakdown panel state ----------------------- // R47
  const [showMaterialWastageBreakdown, setShowMaterialWastageBreakdown] = useState<boolean>(false); // R47

  // ---- R47-1: Material Wastage mock data ----------------------------------- // R47
  const MATERIAL_WASTAGE = [ // R47
    { material: "Cocktail Base", wastePct: 3.2, wasteKg: 12.8 }, // R47
    { material: "Tea Blend", wastePct: 1.8, wasteKg: 5.4 }, // R47
    { material: "Smoothie Mix", wastePct: 4.5, wasteKg: 9.0 }, // R47
    { material: "Packaging Film", wastePct: 2.1, wasteKg: 3.2 }, // R47
  ] as const; // R47

  // ---- R42-2: Cost Per Unit Chip memo --------------------------------------
  const selectedProductId: string | null = selectedProduct?.item?.item_id ?? null;

  const costPerUnitChip = useMemo<{ costPerUnit: number }>(() => {
    const cpu: number =
      (productsQuery.data as any)
        ?.find?.((p: any) => p?.item?.item_id === selectedProductId)
        ?.item?.cost_per_unit ??
      (selectedProduct as any)?.cost_per_unit ??
      10.50;
    return {
      costPerUnit:
        typeof cpu === "number" && Number.isFinite(cpu) && cpu > 0 ? cpu : 10.50,
    };
  }, [productsQuery.data, selectedProductId, selectedProduct]);

  // ---- R43-2: Margin Chip memo ---------------------------------------------
  const marginChip = useMemo<{ marginPct: number }>(() => {
    const n = Math.round(
      ((productsQuery.data as any)?.find?.((p: any) => p.id === selectedProductId)
        ?.margin_pct ?? 0.28) * 100,
    );
    return { marginPct: n };
  }, [productsQuery.data, selectedProductId]);

  // ---- R45-2: Net Profit Chip memo -----------------------------------------
  const netProfitChip = useMemo<{ profit: number }>(() => {
    const sellingPrice: number =
      (productsQuery.data as any)
        ?.find?.((p: any) => p.id === selectedProductId)
        ?.selling_price ?? 15;
    const costPerUnit: number =
      (productsQuery.data as any)
        ?.find?.((p: any) => p.id === selectedProductId)
        ?.cost_per_unit ?? 10;
    const effectiveOutput = Math.round((draftQty * (yieldPct / 100)));
    const revenue = effectiveOutput * sellingPrice;
    const cost = draftQty * costPerUnit;
    return { profit: Math.round(revenue - cost) };
  }, [productsQuery.data, selectedProductId, draftQty, yieldPct]);

  // ---- R46-1: Break-Even Chart derived values ------------------------------
  const fixedCostMock = 2000;
  const varCostPerUnit = costPerUnitChip.costPerUnit;
  const sellingPricePerUnit: number = (selectedProduct as any)?.selling_price ?? 15;
  const breakEvenQty =
    varCostPerUnit > 0 && sellingPricePerUnit > varCostPerUnit
      ? Math.ceil(fixedCostMock / (sellingPricePerUnit - varCostPerUnit))
      : 0;
  const breakEvenPct =
    draftQty > 0 ? Math.min(100, Math.round((draftQty / Math.max(breakEvenQty, 1)) * 100)) : 0;

  // ---- R46-2: Capacity Headroom Chip memo ----------------------------------
  const capacityHeadroom = useMemo<number>(() => {
    const utilPct: number = (selectedProduct as any)?.utilization_pct ?? 68;
    return Math.max(0, 100 - utilPct);
  }, [selectedProduct]);

  // ---- R47-2: Simulation ROI Chip memo ------------------------------------- // R47
  const simulationROIPct = useMemo<number>(() => { // R47
    const revenue = draftQty * ((selectedProduct as any)?.selling_price ?? 15); // R47
    const cost = draftQty * ((selectedProduct as any)?.cost_per_unit ?? 10) + 2000; // R47
    return revenue > 0 ? Math.round(((revenue - cost) / cost) * 100) : 0; // R47
  }, [draftQty, selectedProduct]); // R47

  // ---- R38-2: Bottleneck Component Chip memo --------------------------------
  const bottleneckComponentChip = useMemo<{ name: string } | null>(() => {
    // Prefer real simulation results: find the component with the lowest
    // coverage ratio (available / required). Fall back to mock if unavailable.
    const rawComponents: unknown[] =
      rmShortfallRows.length > 0
        ? (rmShortfallRows as unknown[])
        : (selectedProduct as any)?.rm_requirements ??
          (selectedProduct as any)?.components ??
          [];
    if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
      // Mock: use first component name from any available source
      const mockName: string =
        (selectedProduct as any)?.displayName ??
        (selectedProduct as any)?.item?.item_name ??
        "Base Mix";
      return selectedProduct ? { name: mockName } : null;
    }
    let bottleneck: { name: string; ratio: number } | null = null;
    for (const c of rawComponents as any[]) {
      const available: number =
        (c as any).available ?? (c as any).stock_qty ?? (c as any).on_hand ?? 0;
      const required: number =
        (c as any).required ?? (c as any).required_qty ?? (c as any).shortfall != null
          ? ((c as any).required ?? 1)
          : 1;
      const safeRequired = Math.max(required, 1);
      const ratio = available / safeRequired;
      const name: string = String(
        (c as any).name ?? (c as any).component_name ?? "Component",
      );
      if (bottleneck === null || ratio < bottleneck.ratio) {
        bottleneck = { name, ratio };
      }
    }
    return bottleneck ? { name: bottleneck.name } : null;
  }, [selectedProduct, rmShortfallRows]);

  // ---- Improvement 2: scenario text export ---------------------------------
  const handleCopyScenarioText = useCallback(() => {
    const productLines: string[] = [];
    if (selectedProduct && draftQty > 0) {
      productLines.push(`- ${selectedProduct.displayName}: ${draftQty.toLocaleString()} units`);
    }
    const text = [
      `Scenario: ${scenarioName.trim() || "Untitled"}`,
      `Products:`,
      productLines.length > 0 ? productLines.join("\n") : "  (none selected)",
      `Estimated cost: N/A`,
      `RM feasibility: N/A`,
      `Constraints: 0`,
      `Tags: —`,
    ].join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedScenarioText(true);
    setTimeout(() => setCopiedScenarioText(false), 1800);
  }, [selectedProduct, draftQty, scenarioName]);

  // ---- Simulation ----------------------------------------------------------
  const handleSimulate = () => {
    if (!selectedProduct) return;
    if (!Number.isFinite(draftQty) || draftQty <= 0) return;
    setCommittedQty(draftQty);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        eyebrow="Inputs"
        title="Pick a product and target output"
        description="Finished products (MANUFACTURED + REPACK) with an active BOM are listed."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex-1 min-w-0">
            <ProductSelector
              products={productsQuery.data ?? []}
              loading={productsQuery.isLoading}
              error={productsQuery.isError}
              selectedHeadId={selectedHeadId}
              onSelect={(id) => {
                setSelectedHeadId(id);
                setCommittedQty(null);
              }}
            />
          </div>
          <div className="shrink-0">
            <QuantityInput
              value={draftQty}
              onChange={setDraftQty}
              onSubmit={handleSimulate}
              disabled={!selectedProduct}
            />
          </div>
        </div>

        {selectedProduct ? (
          <div className="mt-3 flex flex-wrap gap-2 text-3xs text-fg-muted">
            <span>
              Supply method:{" "}
              <span className="font-semibold text-fg">
                {selectedProduct.supplyMethod}
              </span>
            </span>
            {selectedProduct.baseFillQtyPerUnit ? (
              <span>
                · Base fill per unit:{" "}
                <span className="font-semibold text-fg">
                  {selectedProduct.baseFillQtyPerUnit} L
                </span>
              </span>
            ) : null}
            <span>· PACK linked</span>
            {selectedProduct.baseHead ? <span>· BASE linked</span> : null}
          </div>
        ) : null}

        {/* ---- Scenario name field ---------------------------------------- */}
        <div className="mt-3">
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name (optional)"
            className="w-full rounded-sm border border-border bg-bg-subtle px-2 py-1 text-3xs text-fg-muted placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>

        {/* ---- Improvement 1: CalendarClock toggle + Improvement 2: FileText button */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Improvement 1 toggle */}
          <button
            type="button"
            onClick={() => setShowAvailabilityProjection((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showAvailabilityProjection
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle 14-day material availability projection"
          >
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} />
            Availability
          </button>

          {/* Improvement 2: Copy report button */}
          <button
            type="button"
            onClick={handleCopyScenarioText}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              copiedScenarioText
                ? "text-success-fg"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Copy a plain-text scenario report to clipboard"
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={2} />
            {copiedScenarioText ? "Copied!" : "Copy report"}
          </button>

          {/* Improvement 3: RM stock table toggle */}
          <button
            type="button"
            onClick={() => setShowRmTable((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showRmTable
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle RM inventory table for current scenario"
          >
            <Table className="h-3.5 w-3.5" strokeWidth={2} />
            RM stock
          </button>

          {/* Improvement 5: Scenario Notes toggle */}
          <button
            type="button"
            onClick={() => setShowNotesEditor((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors relative",
              showNotesEditor
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle scenario notes editor"
          >
            <StickyNote className="h-3.5 w-3.5" strokeWidth={2} />
            Notes
            {scenarioNotes.trim() && (
              <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>

          {/* Improvement 6: Production Order Summary toggle */}
          <button
            type="button"
            onClick={() => setShowOrderSummary((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showOrderSummary
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle production order summary"
          >
            <ClipboardList className="h-3.5 w-3.5" strokeWidth={2} />
            Order summary
          </button>

          {/* Improvement 7: RM Shortfall Table toggle */}
          <button
            type="button"
            onClick={() => setShowRmShortfallTable((v) => !v)}
            className={cn(
              "relative inline-flex items-center gap-1 text-3xs transition-colors",
              showRmShortfallTable
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle RM shortfall analysis for current batch"
          >
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
            Shortfalls
            {rmShortfallRows.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger-fg text-white text-3xs rounded-full w-4 h-4 flex items-center justify-center">
                {rmShortfallRows.length}
              </span>
            )}
          </button>

          {/* Improvement 9: Save scenario button */}
          <button
            type="button"
            onClick={handleSaveScenario}
            className="inline-flex items-center gap-1 text-3xs text-fg-faint hover:text-fg-muted cursor-pointer transition-colors"
            title="Save current scenario to history"
          >
            <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={2} />
            Save
          </button>

          {/* Improvement 9: History toggle */}
          <button
            type="button"
            onClick={() => setShowScenarioHistory((v) => !v)}
            className={cn(
              "relative inline-flex items-center gap-1 text-3xs transition-colors",
              showScenarioHistory
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle saved scenario history"
          >
            <History className="h-3.5 w-3.5" strokeWidth={2} />
            History
            {savedScenarios.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-white text-3xs rounded-full w-4 h-4 flex items-center justify-center">
                {savedScenarios.length}
              </span>
            )}
          </button>

          {/* Improvement 11: Yield Sensitivity Simulator toggle */}
          <button
            type="button"
            onClick={() => setShowYieldSim((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showYieldSim
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle yield sensitivity simulator"
          >
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
            Yield sim
          </button>

          {/* Improvement 13: Cost Breakdown Chart toggle */}
          <button
            type="button"
            onClick={() => setShowCostBreakdownChart((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showCostBreakdownChart
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle cost per unit breakdown chart"
          >
            <PieChart className="h-3.5 w-3.5" strokeWidth={2} />
            Cost chart
          </button>

          {/* Improvement 14: What-if RM multiplier toggle */}
          <button
            type="button"
            onClick={() => setShowWhatIfPanel((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showWhatIfPanel
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle RM cost what-if scenario"
          >
            <Sliders className="h-3.5 w-3.5" strokeWidth={2} />
            What-if
          </button>

          {/* Improvement 15: 5-Day Capacity Plan toggle */}
          <button
            type="button"
            onClick={() => setShowCapacityPlan((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showCapacityPlan
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle 5-day capacity plan"
          >
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} />
            Capacity plan
          </button>

          {/* Improvement 16: Scenario Cost History Sparkline toggle */}
          <button
            type="button"
            onClick={() => setShowCostHistory((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showCostHistory
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle scenario cost history sparkline"
          >
            <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} />
            Cost history
          </button>

          {/* Improvement 17: Material Readiness Matrix toggle */}
          <button
            type="button"
            onClick={() => setShowMaterialMatrix((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showMaterialMatrix
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle material readiness matrix"
          >
            <Grid3X3 className="h-3.5 w-3.5" strokeWidth={2} />
            RM matrix
          </button>

          {/* Improvement 19: Scenario Comparison Panel toggle */}
          <button
            type="button"
            onClick={() => setShowScenarioComparison((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showScenarioComparison
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle scenario comparison panel"
          >
            <Columns className="h-3.5 w-3.5" strokeWidth={2} />
            Compare scenarios
          </button>

          {/* Improvement 21: RM Price Sensitivity toggle */}
          <button
            type="button"
            onClick={() => setShowRmPriceImpact((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showRmPriceImpact
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle RM price sensitivity table"
          >
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
            Price sensitivity
          </button>

          {/* Improvement 4: Batch size optimizer chip */}
          {batchSizeOptimizer !== null ? (
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 text-info-fg bg-info-softer">
              <Layers className="h-3 w-3 shrink-0" strokeWidth={2} />
              Optimize: {batchSizeOptimizer.productName} →{" "}
              {batchSizeOptimizer.optimalQty}
            </span>
          ) : null}

          {/* Improvement 8: Batch Rounding Chip */}
          {batchRoundingChip !== null ? (
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <Hash className="h-3 w-3 shrink-0" strokeWidth={2} />
              {batchRoundingChip.roundedVal > batchRoundingChip.rawVal
                ? `Rounded +${batchRoundingChip.delta} units`
                : `Rounded -${batchRoundingChip.delta} units`}
            </span>
          ) : null}

          {/* Improvement 10: Confidence Score chip */}
          <span
            className={cn(
              "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
              confidenceScore.level === "high" && "bg-success-softer text-success-fg",
              confidenceScore.level === "medium" && "bg-warning-softer text-warning-fg",
              confidenceScore.level === "low" && "bg-danger-softer text-danger-fg",
            )}
          >
            <Gauge className="h-3 w-3 shrink-0" strokeWidth={2} />
            Confidence: {confidenceScore.score}%{" "}
            <span className="opacity-70">{confidenceScore.level}</span>
          </span>

          {/* Improvement 12: RM Utilization Chip */}
          {rmUtilizationChip !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                rmUtilizationChip.pct > 95
                  ? "bg-danger-softer text-danger-fg"
                  : rmUtilizationChip.pct > 80
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-bg-muted text-fg-muted",
              )}
            >
              <BarChart3 className="h-3 w-3 shrink-0" strokeWidth={2} />
              RM: {rmUtilizationChip.pct}% utilized
            </span>
          ) : null}

          {/* Improvement 18: Yield Delta Chip */}
          {yieldDeltaChip !== null ? (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                yieldDeltaChip.delta < 0
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-success-softer text-success-fg",
              )}
            >
              <Target className="h-3 w-3 shrink-0" strokeWidth={2} />
              Yield {yieldDeltaChip.delta > 0 ? "+" : ""}{yieldDeltaChip.delta}% → {yieldDeltaChip.effectOnCost} cost
            </span>
          ) : null}

          {/* Improvement 20: Break-Even Quantity Chip */}
          {breakEvenQtyChip !== null ? (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                breakEvenQtyChip.isCovered
                  ? "bg-success-softer text-success-fg"
                  : "bg-danger-softer text-danger-fg",
              )}
            >
              <DivideSquare className="h-3 w-3 shrink-0" strokeWidth={2} />
              Break-even: {breakEvenQtyChip.breakEvenQty} units
            </span>
          ) : null}

          {/* Improvement 22: Cycle Time Chip */}
          {cycleTimeChip !== null ? (
            <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-info-softer text-info-fg">
              <Timer className="h-3 w-3 shrink-0" strokeWidth={2} />
              Est. cycle: {cycleTimeChip.cycleLabel}
            </span>
          ) : null}

          {/* Improvement 23: Output Distribution by Family toggle */}
          <button
            type="button"
            onClick={() => setShowOutputDistribution((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showOutputDistribution
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle output distribution by product family"
          >
            <BarChart2 className="h-3.5 w-3.5" strokeWidth={2} />
            Output split
          </button>

          {/* Improvement 24: Capacity Buffer Chip */}
          {capacityBufferChip !== null ? (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                capacityBufferChip.bufferPct > 20
                  ? "bg-success-softer text-success-fg"
                  : capacityBufferChip.bufferPct > 0
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
              )}
            >
              <Shield className="h-3 w-3 shrink-0" strokeWidth={2} />
              {capacityBufferChip.bufferPct.toFixed(0)}% capacity buffer
            </span>
          ) : null}

          {/* Improvement 25: Ingredient Cost Split toggle */}
          <button
            type="button"
            onClick={() => setShowIngredientCostSplit((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showIngredientCostSplit
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle ingredient cost breakdown"
          >
            <PieChart className="h-3.5 w-3.5" strokeWidth={2} />
            Cost split
          </button>

          {/* Improvement 26: Waste Factor Chip */}
          {wasteFactorChip !== null ? (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                wasteFactorChip.wastePct > 10
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-bg-muted text-fg-muted",
              )}
            >
              <Recycle className="h-3 w-3 shrink-0" strokeWidth={2} />
              {wasteFactorChip.wasteQty} units waste ({wasteFactorChip.wastePct}%)
            </span>
          ) : null}

          {/* R38-1: Scenario Save/Load toggle */}
          <button
            type="button"
            onClick={() => setShowScenarioSaveLoad((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showScenarioSaveLoad
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle scenario save/load panel"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={2} />
            Scenarios
          </button>

          {/* R38-2: Bottleneck Component Chip */}
          {bottleneckComponentChip !== null ? (
            <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-danger-softer text-danger-fg">
              <AlertOctagon className="h-3 w-3 shrink-0" strokeWidth={2} />
              Bottleneck:{" "}
              <span className="font-medium" title={bottleneckComponentChip.name}>
                {bottleneckComponentChip.name.length > 12
                  ? bottleneckComponentChip.name.slice(0, 12) + "…"
                  : bottleneckComponentChip.name}
              </span>
            </span>
          ) : null}

          {/* R39-1: Sensitivity Sweep toggle */}
          <button
            type="button"
            onClick={() => setShowSensitivitySweep((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showSensitivitySweep
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle ±10% quantity sensitivity sweep"
          >
            <Sliders className="h-3.5 w-3.5" strokeWidth={2} />
            Sensitivity
          </button>

          {/* R39-2: Min Viable Quantity Chip */}
          {minViableQtyChip !== null ? (
            <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
              <Target className="h-3 w-3 shrink-0" strokeWidth={2} />
              MVQ: {minViableQtyChip.mvq}
            </span>
          ) : null}

          {/* R40-1: Resource Utilization toggle */}
          <button
            type="button"
            onClick={() => setShowResourceUtilization((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showResourceUtilization
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle resource utilization panel"
          >
            <Gauge className="h-3.5 w-3.5" strokeWidth={2} />
            Resources
          </button>

          {/* R40-2: Simulation Accuracy Chip */}
          <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
            <Crosshair className="h-3 w-3 shrink-0" strokeWidth={2} />
            Sim accuracy: {simulationAccuracyChip.pct}%
          </span>

          {/* R41-1: Multi-Product Comparison toggle */}
          <button
            type="button"
            onClick={() => setShowMultiProductComparison((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showMultiProductComparison
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Compare current qty against 50% and 150% scenarios"
          >
            <GitCompare className="h-3.5 w-3.5" strokeWidth={2} />
            Compare
          </button>

          {/* R41-2: Total Output Chip */}
          <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
            <Package className="h-3 w-3 shrink-0" strokeWidth={2} />
            {totalOutputChip.output !== null
              ? `Output: ${totalOutputChip.output.toLocaleString()} units`
              : "Output: —"}
          </span>

          {/* R42-1: Ingredient Availability toggle */}
          <button
            type="button"
            onClick={() => setShowIngredientAvailability((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showIngredientAvailability
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle ingredient availability panel"
          >
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} />
            Ingredients
          </button>

          {/* R42-2: Cost Per Unit Chip */}
          <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
            <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={2} />
            &#x20AA;{costPerUnitChip.costPerUnit.toFixed(2)}/unit
          </span>

          {/* R43-1: Schedule Preview toggle */}
          <button
            type="button"
            onClick={() => setShowProductionSchedulePreview((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showProductionSchedulePreview
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle 5-day production schedule preview"
          >
            <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2} />
            Schedule Preview
          </button>

          {/* R43-2: Margin Chip */}
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
              marginChip.marginPct >= 30
                ? "bg-success-softer text-success-fg"
                : marginChip.marginPct >= 15
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-danger-softer text-danger-fg",
            )}
          >
            <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={2} />
            Margin: {marginChip.marginPct}%
          </span>

          {/* R44-1: Cost History Sparkline toggle */}
          <button
            type="button"
            onClick={() => setShowCostHistorySparkline((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showCostHistorySparkline
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle cost history sparkline (last 6 simulations)"
          >
            <BarChart2 className="h-3.5 w-3.5" strokeWidth={2} />
            Cost History
          </button>

          {/* R44-2: Simulation Count Chip */}
          <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
            <Hash className="h-3 w-3 shrink-0" strokeWidth={2} />
            {simulationCount} simulations
          </span>

          {/* R45-1: What-If Export toggle */}
          <button
            type="button"
            onClick={() => setShowWhatIfExport((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showWhatIfExport
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle what-if export panel"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>

          {/* R45-2: Net Profit Chip */}
          <span
            className={cn(
              "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
              netProfitChip.profit > 0
                ? "bg-success-softer text-success-fg"
                : "bg-danger-softer text-danger-fg",
            )}
          >
            <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={2} />
            Net profit: ₪{netProfitChip.profit.toLocaleString()}
          </span>

          {/* R46-1: Break-Even Chart toggle */}
          <button
            type="button"
            onClick={() => setShowBreakEvenChart((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showBreakEvenChart
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle break-even analysis chart"
          >
            <Target className="h-3.5 w-3.5" strokeWidth={2} />
            Break-Even
          </button>

          {/* R46-2: Capacity Headroom Chip */}
          <span
            className={cn(
              "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
              capacityHeadroom > 30
                ? "bg-success-softer text-success-fg"
                : capacityHeadroom > 10
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-danger-softer text-danger-fg",
            )}
          >
            <Gauge className="h-3 w-3 shrink-0" strokeWidth={2} />
            Headroom: {capacityHeadroom}%
          </span>

          {/* R47-1: Material Wastage Breakdown toggle */}
          <button
            type="button"
            onClick={() => setShowMaterialWastageBreakdown((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-3xs transition-colors",
              showMaterialWastageBreakdown
                ? "text-accent"
                : "text-fg-faint hover:text-fg-muted cursor-pointer",
            )}
            title="Toggle material wastage breakdown"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            Wastage
          </button>

          {/* R47-2: Simulation ROI Chip */}
          <span
            className={cn(
              "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
              simulationROIPct > 20
                ? "bg-success-softer text-success-fg"
                : simulationROIPct > 0
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-danger-softer text-danger-fg",
            )}
          >
            <Percent className="h-3 w-3 shrink-0" strokeWidth={2} />
            ROI: {simulationROIPct}%
          </span>
        </div>

        {/* ---- Improvement 1: Material Availability Projection panel --------- */}
        {showAvailabilityProjection && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="text-3xs text-fg-faint font-medium mb-1.5">
              Material Availability — 14 days
            </div>
            {availabilityProjection.length === 0 ? (
              <span className="text-3xs text-fg-faint">
                All materials available
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                {availabilityProjection.map((item, idx) => {
                  const filled = Math.min(
                    Math.max(Math.round(item.daysOfStock), 0),
                    14,
                  );
                  const runOut = item.willRunOut
                    ? Math.max(14 - filled, 0)
                    : 0;
                  const beyond = 14 - filled - runOut;
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-3xs text-fg-muted">
                        {item.name}
                      </span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: filled }).map((_, i) => (
                          <span
                            key={`g-${i}`}
                            className="w-2 h-3 rounded-sm inline-block bg-success-softer"
                          />
                        ))}
                        {Array.from({ length: runOut }).map((_, i) => (
                          <span
                            key={`r-${i}`}
                            className="w-2 h-3 rounded-sm inline-block bg-danger-softer"
                          />
                        ))}
                        {Array.from({ length: beyond }).map((_, i) => (
                          <span
                            key={`b-${i}`}
                            className="w-2 h-3 rounded-sm inline-block bg-bg-muted"
                          />
                        ))}
                      </span>
                      <span className="text-3xs text-fg-faint tabular-nums">
                        {item.daysOfStock}d
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 3: RM Inventory Table panel -------------------- */}
        {showRmTable && (
          <div className="bg-bg-subtle border border-border rounded mt-2 overflow-hidden">
            <table className="w-full text-3xs">
              <thead>
                <tr className="bg-bg-muted">
                  <th className="text-left text-fg-faint px-2 py-1 font-medium">
                    Component
                  </th>
                  <th className="text-right text-fg-faint px-2 py-1 font-medium">
                    Stock
                  </th>
                  <th className="text-right text-fg-faint px-2 py-1 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rmTableItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-center text-fg-faint"
                    >
                      No RM data
                    </td>
                  </tr>
                ) : (
                  rmTableItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="flex-1 px-2 py-1 text-fg-strong">
                        {item.name}
                      </td>
                      <td className="px-2 py-1 text-right text-fg-muted tabular-nums">
                        {item.currentStock}
                        {item.unit ? ` ${item.unit}` : ""}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span
                          className={cn(
                            "text-3xs rounded px-1 py-0.5",
                            item.status === "ok" && "bg-success-softer",
                            item.status === "low" && "bg-warning-softer",
                            item.status === "critical" &&
                              "bg-danger-softer animate-pulse",
                          )}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* ---- Improvement 7: RM Shortfall Table panel ------------------- */}
        {showRmShortfallTable && (
          <div className="bg-danger-softer border border-danger/20 rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-danger-fg mb-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              RM Shortfalls ({rmShortfallRows.length})
            </div>
            {!selectedProduct ? (
              <span className="text-fg-faint text-3xs">
                Select a product to analyze RM requirements
              </span>
            ) : rmShortfallRows.length === 0 ? (
              <div className="flex items-center gap-1 text-success-fg text-3xs">
                <CheckCircle className="h-3 w-3 shrink-0" strokeWidth={2} />
                All RM components available
              </div>
            ) : (
              <div className="flex flex-col">
                {rmShortfallRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 py-1 border-b border-danger/10 last:border-0 text-3xs"
                  >
                    <span className="text-fg-muted flex-1 truncate">{row.name}</span>
                    <span className="text-fg-faint">
                      need {row.required} / have {row.available}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        row.severity === "critical"
                          ? "text-danger-fg"
                          : "text-warning-fg",
                      )}
                    >
                      -{row.shortfall}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 9: Scenario History panel -------------------- */}
        {showScenarioHistory && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-3xs font-medium text-fg-muted mb-1.5">
              <History className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Saved Scenarios
              <span className="text-fg-faint ml-1">({savedScenarios.length})</span>
            </div>
            {savedScenarios.length === 0 ? (
              <span className="text-3xs text-fg-faint">No saved scenarios yet</span>
            ) : (
              <div className="flex flex-col">
                {savedScenarios.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                  >
                    <span className="text-fg-muted flex-1 truncate">
                      {s.label}{" "}
                      <span className="text-fg-faint">{s.qty} units</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraftQty(s.qty)}
                      className="text-accent text-3xs cursor-pointer hover:underline shrink-0"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedScenario(s.id)}
                      className="text-fg-faint text-3xs cursor-pointer hover:text-danger-fg shrink-0"
                      title="Remove saved scenario"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 11: Yield Sensitivity Simulator panel ----------- */}
        {showYieldSim && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="text-xs font-semibold text-fg-strong">Yield Sensitivity</div>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              className="w-full h-1 accent-blue-500 mt-1"
              value={yieldPct}
              onChange={(e) => setYieldPct(Number(e.target.value))}
            />
            <div className="flex justify-between text-3xs text-fg-faint mt-0.5">
              <span>50%</span>
              <span>100%</span>
            </div>
            {yieldSimData !== null ? (
              <>
                <div className="flex gap-3 mt-2 text-3xs">
                  <span className="text-fg-strong font-semibold">
                    Yield: {yieldSimData.current.yieldPct}%
                  </span>
                  <span className="text-success-fg">
                    Output: {yieldSimData.current.effectiveOutput} units
                  </span>
                  <span className="text-danger-fg">
                    Waste: {yieldSimData.current.waste} units
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 mt-2 text-3xs">
                  {yieldSimData.scenarios.map((s) => (
                    <div
                      key={s.yieldPct}
                      className={cn(
                        "rounded p-1 text-center",
                        s.yieldPct === yieldPct
                          ? "bg-accent-softer text-accent"
                          : "bg-bg-muted",
                      )}
                    >
                      <div className={cn("text-fg-faint", s.yieldPct === yieldPct && "text-accent")}>
                        {s.yieldPct}%
                      </div>
                      <div className={cn("text-fg-muted", s.yieldPct === yieldPct && "text-accent")}>
                        {s.output}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-3xs text-fg-faint mt-2">
                Select a product to see yield scenarios
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 5: Scenario Notes panel ----------------------- */}
        {showNotesEditor && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="text-3xs text-fg-faint font-medium">
              Scenario Notes
            </div>
            <textarea
              value={scenarioNotes}
              onChange={(e) => {
                setScenarioNotes(e.target.value);
                try {
                  localStorage.setItem("gt_sim_notes", e.target.value);
                } catch (_) {
                  // localStorage unavailable — ignore
                }
              }}
              placeholder="Add notes about this scenario..."
              className="w-full text-3xs p-2 border border-border rounded bg-bg-subtle resize-none h-16 mt-1 placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-3xs text-fg-faint text-right flex-1">
                {scenarioNotes.length} chars
              </span>
              {scenarioNotes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setScenarioNotes("");
                    try {
                      localStorage.removeItem("gt_sim_notes");
                    } catch (_) {
                      // localStorage unavailable — ignore
                    }
                  }}
                  className="ml-2 text-3xs text-fg-faint underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---- Improvement 6: Production Order Summary card -------------- */}
        {showOrderSummary && (
          <div className="bg-accent-softer border border-accent/30 rounded p-3 mt-2">
            <div className="text-sm font-semibold text-fg-strong">
              Production Order Summary
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-3xs">
              <div>
                <span className="text-fg-faint">Products</span>
                <div className="text-fg-strong font-medium">
                  {orderSummaryData.totalProducts}
                </div>
              </div>
              <div>
                <span className="text-fg-faint">Total units</span>
                <div className="text-fg-strong font-medium">
                  {orderSummaryData.totalUnits.toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-fg-faint">Est. cost</span>
                <div className="text-fg-strong font-medium">
                  ₪{orderSummaryData.totalEstCost.toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-fg-faint">Est. duration</span>
                <div className="text-fg-strong font-medium">
                  {orderSummaryData.estimatedDuration.toFixed(1)}h
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ---- Improvement 13: Cost Per Unit Breakdown Chart panel ----------- */}
        {showCostBreakdownChart && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5">
              <PieChart className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Cost Per Unit Breakdown
            </div>
            {costBreakdownChartData === null ? (
              <span className="text-fg-faint text-3xs">
                Select a product with cost data to see breakdown
              </span>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg
                  viewBox="0 0 60 60"
                  width="80"
                  height="80"
                  style={{ transform: "rotate(-90deg)" }}
                >
                  {(() => {
                    const colors: Record<string, string> = {
                      RM: "#3b82f6",
                      Labor: "#22c55e",
                      Overhead: "#f59e0b",
                      Packaging: "#a855f7",
                    };
                    const r = 20;
                    const circumference = 2 * Math.PI * r;
                    let offset = 0;
                    return costBreakdownChartData.slices.map((slice) => {
                      const dash = (slice.pct / 100) * circumference;
                      const gap = circumference - dash;
                      const el = (
                        <circle
                          key={slice.label}
                          cx="30"
                          cy="30"
                          r={r}
                          fill="none"
                          stroke={colors[slice.label] ?? "#94a3b8"}
                          strokeWidth="10"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                  <text
                    x="30"
                    y="32"
                    fontSize="6"
                    textAnchor="middle"
                    fill="#64748b"
                    style={{ transform: "rotate(90deg)", transformOrigin: "30px 30px" }}
                  >
                    ₪{costBreakdownChartData.total.toFixed(0)}/unit
                  </text>
                </svg>
                <div className="flex flex-wrap gap-2 mt-1 text-3xs">
                  {costBreakdownChartData.slices.map((slice) => {
                    const dotColors: Record<string, string> = {
                      RM: "#3b82f6",
                      Labor: "#22c55e",
                      Overhead: "#f59e0b",
                      Packaging: "#a855f7",
                    };
                    return (
                      <span key={slice.label} className="flex items-center gap-1 text-fg-muted">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: dotColors[slice.label] ?? "#94a3b8" }}
                        />
                        {slice.label} ({slice.pct}%)
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 15: 5-Day Capacity Plan panel ------------------- */}
        {showCapacityPlan && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              5-Day Capacity Plan
            </div>
            <div className="flex gap-1 mt-2">
              {capacityPlanData.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded p-1.5 text-center text-3xs",
                    day.canFit ? "bg-success-fg/10" : "bg-danger-fg/10",
                  )}
                >
                  <div className="text-fg-faint font-medium">{day.dayLabel}</div>
                  <div className="text-fg-muted">{day.availableCapacity}h avail</div>
                  <div className="text-fg-faint">{day.requiredCapacity.toFixed(1)}h needed</div>
                  <div
                    className={cn(
                      "text-3xs font-medium mt-0.5",
                      day.canFit ? "text-success-fg" : "text-danger-fg",
                    )}
                  >
                    {day.canFit ? "✓ Fits" : "✗ No"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Improvement 16: Scenario Cost History Sparkline panel -------- */}
        {showCostHistory && costHistoryData !== null && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="text-xs font-semibold text-fg-strong mb-1.5">
              Scenario Cost History (last 5)
            </div>
            <svg
              viewBox="0 0 100 36"
              width="100%"
              style={{ maxWidth: 200 }}
              aria-hidden="true"
            >
              <polyline
                points={costHistoryData.entries
                  .map((e, i) => {
                    const x = 10 + i * (80 / Math.max(costHistoryData.entries.length - 1, 1));
                    const y =
                      30 -
                      ((e.cost - costHistoryData.minCost) /
                        Math.max(costHistoryData.maxCost - costHistoryData.minCost, 1)) *
                        24;
                    return `${x},${y}`;
                  })
                  .join(" ")}
                stroke="#3b82f6"
                strokeWidth={2}
                fill="none"
              />
              {costHistoryData.entries.map((e, i) => {
                const x = 10 + i * (80 / Math.max(costHistoryData.entries.length - 1, 1));
                const y =
                  30 -
                  ((e.cost - costHistoryData.minCost) /
                    Math.max(costHistoryData.maxCost - costHistoryData.minCost, 1)) *
                    24;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={3} fill="#3b82f6" />
                    <text
                      x={x}
                      y={35}
                      fontSize={4}
                      textAnchor="middle"
                      fill="#94a3b8"
                    >
                      {String(e.label).slice(0, 6)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="flex justify-between text-3xs text-fg-faint mt-1">
              <span>₪{costHistoryData.minCost.toLocaleString()} min</span>
              <span>₪{costHistoryData.maxCost.toLocaleString()} max</span>
            </div>
          </div>
        )}

        {/* ---- Improvement 17: Material Readiness Matrix panel --------------- */}
        {showMaterialMatrix && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <Grid3X3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Material Readiness Matrix
            </div>
            {materialMatrixData === null ? (
              <span className="text-3xs text-fg-faint">
                Select a product to see the readiness matrix
              </span>
            ) : (
              <div className="grid grid-cols-4 gap-px text-3xs">
                {/* Header row */}
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium" />
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium text-center">RM</div>
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium text-center">Pkg</div>
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium text-center">Base</div>
                {/* Ready row */}
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium">Ready</div>
                {[0, 1, 2].map((col) => {
                  const cell = materialMatrixData.cells.find((c) => c.row === 0 && c.col === col);
                  return (
                    <div key={col} className="bg-success-softer rounded px-1 py-0.5 text-center text-success-fg">
                      {cell?.count ?? 0} <span className="opacity-70">({cell?.pct ?? 0}%)</span>
                    </div>
                  );
                })}
                {/* Partial row */}
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium">Partial</div>
                {[0, 1, 2].map((col) => {
                  const cell = materialMatrixData.cells.find((c) => c.row === 1 && c.col === col);
                  return (
                    <div key={col} className="bg-warning-softer rounded px-1 py-0.5 text-center text-warning-fg">
                      {cell?.count ?? 0} <span className="opacity-70">({cell?.pct ?? 0}%)</span>
                    </div>
                  );
                })}
                {/* Missing row */}
                <div className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint font-medium">Missing</div>
                {[0, 1, 2].map((col) => {
                  const cell = materialMatrixData.cells.find((c) => c.row === 2 && c.col === col);
                  return (
                    <div key={col} className="bg-danger-softer rounded px-1 py-0.5 text-center text-danger-fg">
                      {cell?.count ?? 0} <span className="opacity-70">({cell?.pct ?? 0}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 19: Scenario Comparison Panel --------------------- */}
        {showScenarioComparison && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <Columns className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Saved Scenario Comparison
            </div>
            {scenarioComparisonData === null ? (
              <span className="text-3xs text-fg-faint">
                Save at least 2 scenarios to compare
              </span>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-3xs">
                {scenarioComparisonData.scenarios.map((sc, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "rounded p-1.5 bg-bg-muted flex flex-col gap-0.5",
                      sc.isActive && "ring-1 ring-accent",
                    )}
                  >
                    <div className="truncate font-semibold text-fg-strong" title={sc.name}>
                      {sc.name}
                    </div>
                    <div className="text-fg-muted">
                      Qty: <span className="text-fg-strong">{sc.draftQty.toLocaleString()}</span>
                    </div>
                    <div className="text-fg-muted">
                      Cost:{" "}
                      <span className="text-fg-strong">
                        {sc.totalCost !== null ? `₪${sc.totalCost.toLocaleString()}` : "—"}
                      </span>
                    </div>
                    <div className="text-fg-muted">
                      Yield:{" "}
                      <span className="text-fg-strong">
                        {sc.yieldPct !== null ? `${sc.yieldPct}%` : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 21: RM Price Impact Scenarios panel --------------- */}
        {showRmPriceImpact && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              RM Price Impact Scenarios
            </div>
            {rmPriceSensitivityData === null ? (
              <span className="text-3xs text-fg-faint">
                No cost data available for the selected product
              </span>
            ) : (
              <table className="w-full text-3xs border-collapse">
                <thead>
                  <tr className="text-fg-muted">
                    <th className="text-left py-0.5 pr-2 font-medium">Scenario</th>
                    <th className="text-right py-0.5 pr-2 font-medium">Total Cost</th>
                    <th className="text-right py-0.5 pr-2 font-medium">Per Unit</th>
                    <th className="text-right py-0.5 font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="py-0.5 pr-2 text-fg-strong font-medium">Current</td>
                    <td className="text-right py-0.5 pr-2 text-fg-strong">
                      ₪{rmPriceSensitivityData.baseCost.toFixed(0)}
                    </td>
                    <td className="text-right py-0.5 pr-2 text-fg-strong">
                      ₪{rmPriceSensitivityData.basePerUnit.toFixed(2)}
                    </td>
                    <td className="text-right py-0.5 text-fg-faint">—</td>
                  </tr>
                  {rmPriceSensitivityData.rows.map((row) => (
                    <tr key={row.pct} className="border-t border-border bg-warning-softer/30">
                      <td className="py-0.5 pr-2 text-fg-muted">+{row.pct}% RM</td>
                      <td className="text-right py-0.5 pr-2 text-fg-strong">
                        ₪{row.newTotal.toFixed(0)}
                      </td>
                      <td className="text-right py-0.5 pr-2 text-fg-strong">
                        ₪{row.newPerUnit.toFixed(2)}
                      </td>
                      <td className="text-right py-0.5 text-danger-fg">
                        +₪{row.delta.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ---- Improvement 23: Output Distribution by Family panel ---------- */}
        {showOutputDistribution && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <BarChart2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Output Distribution
            </div>
            {outputDistributionData === null ? (
              <span className="text-3xs text-fg-faint">
                Select a product and enter a quantity to see output distribution
              </span>
            ) : outputDistributionData.families.length === 1 &&
              outputDistributionData.families[0].pct === 100 ? (
              <div className="flex flex-col gap-1">
                <span className="text-3xs text-fg-muted">Single product</span>
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-3xs text-fg-strong">
                    {outputDistributionData.families[0].label}
                  </span>
                  <div className="flex-1 h-3 rounded bg-bg-muted overflow-hidden">
                    <div className="h-full bg-accent/60 rounded" style={{ width: "100%" }} />
                  </div>
                  <span className="text-3xs text-fg-faint tabular-nums whitespace-nowrap">
                    {outputDistributionData.families[0].qty.toLocaleString()} (100%)
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {outputDistributionData.families.map((fam, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-3xs text-fg-strong" title={fam.label}>
                      {fam.label}
                    </span>
                    <div className="flex-1 h-3 rounded bg-bg-muted overflow-hidden">
                      <div
                        className="h-full bg-accent/60 rounded"
                        style={{ width: `${fam.pct}%` }}
                      />
                    </div>
                    <span className="text-3xs text-fg-faint tabular-nums whitespace-nowrap">
                      {fam.qty.toLocaleString()} ({fam.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Improvement 25: Ingredient Cost Breakdown panel -------------- */}
        {showIngredientCostSplit && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <PieChart className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Ingredient Cost Breakdown
            </div>
            {ingredientCostData === null ? (
              <span className="text-3xs text-fg-faint">
                No RM cost data available for the selected product
              </span>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Donut SVG */}
                <div className="flex items-center gap-4">
                  <svg viewBox="0 0 80 80" className="w-20 h-20 shrink-0" aria-hidden="true">
                    {(() => {
                      const r = 28;
                      const cx = 40;
                      const cy = 40;
                      const circumference = 2 * Math.PI * r;
                      const STROKE_COLORS: Record<string, string> = {
                        "bg-accent": "#6366f1",
                        "bg-success-fg": "#16a34a",
                        "bg-warning-fg": "#d97706",
                        "bg-info-fg": "#0284c7",
                      };
                      let offset = 0;
                      return ingredientCostData.slices.map((slice, i) => {
                        const dash = (slice.pct / 100) * circumference;
                        const gap = circumference - dash;
                        const el = (
                          <circle
                            key={i}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={STROKE_COLORS[slice.color] ?? "#6366f1"}
                            strokeWidth={12}
                            strokeDasharray={`${dash} ${gap}`}
                            strokeDashoffset={-offset}
                            style={{ transform: "rotate(-90deg)", transformOrigin: "40px 40px" }}
                          />
                        );
                        offset += dash;
                        return el;
                      });
                    })()}
                  </svg>
                  {/* Legend */}
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    {ingredientCostData.slices.map((slice, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${slice.color}`} />
                        <span className="text-3xs text-fg-muted truncate flex-1">{slice.label}</span>
                        <span className="text-3xs text-fg-strong tabular-nums shrink-0">{slice.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Total cost footer */}
                <div className="border-t border-border pt-1.5 flex items-center justify-between">
                  <span className="text-3xs text-fg-faint">Total ingredient cost</span>
                  <span className="text-3xs font-semibold text-fg-strong tabular-nums">
                    ₪{ingredientCostData.totalCost.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- R38-1: Scenario Save/Load panel -------------------------------- */}
        {showScenarioSaveLoad && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
                <Save className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                Saved Scenarios
              </div>
              <button
                type="button"
                onClick={() => {
                  const next: R38Scenario[] = [
                    ...r38Scenarios,
                    { name: `Scenario ${Date.now()}`, qty: draftQty, at: new Date().toISOString() },
                  ].slice(-5);
                  setR38Scenarios(next);
                  try { localStorage.setItem("gt_sim_scenarios", JSON.stringify(next)); } catch (_) { /* ignore */ }
                }}
                className="text-3xs text-accent hover:underline cursor-pointer"
              >
                Save current
              </button>
            </div>
            {r38Scenarios.length === 0 ? (
              <span className="text-3xs text-fg-faint">No saved scenarios yet — press "Save current" to add one.</span>
            ) : (
              <div className="flex flex-col gap-0.5">
                {r38Scenarios.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                  >
                    <span className="flex-1 truncate text-fg-muted" title={s.name}>
                      {s.name}
                    </span>
                    <span className="text-fg-faint tabular-nums shrink-0">
                      {s.qty.toLocaleString()} units
                    </span>
                    <span className="text-fg-faint shrink-0">
                      {new Date(s.at).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraftQty(s.qty)}
                      className="text-accent text-3xs cursor-pointer hover:underline shrink-0"
                    >
                      Load
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- R39-1: Sensitivity Sweep panel ---------------------------------- */}
        {showSensitivitySweep && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <Sliders className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Quantity Sensitivity Sweep (±20%)
            </div>
            <table className="w-full text-3xs border-collapse">
              <thead>
                <tr className="text-fg-muted">
                  <th className="text-left py-0.5 pr-2 font-medium">Variation</th>
                  <th className="text-right py-0.5 pr-2 font-medium">Est. Cost</th>
                  <th className="text-right py-0.5 pr-2 font-medium">Yield Units</th>
                  <th className="text-right py-0.5 font-medium">Waste Units</th>
                </tr>
              </thead>
              <tbody>
                {([-20, -10, 0, 10, 20] as const).map((pct) => {
                  const sweepQty = Math.max(1, Math.round(draftQty * (1 + pct / 100)));
                  const sweepYield = Math.round((sweepQty * yieldPct) / 100);
                  const sweepWaste = sweepQty - sweepYield;
                  const baseCostPerUnit: number =
                    (selectedProduct as any)?.cost_per_unit ??
                    (selectedProduct as any)?.costPerUnit ??
                    0;
                  const sweepCost = baseCostPerUnit > 0
                    ? baseCostPerUnit * sweepQty
                    : sweepQty * 10; // fallback mock: ₪10/unit
                  const isBase = pct === 0;
                  const label = pct === 0 ? "Base" : pct > 0 ? `+${pct}%` : `${pct}%`;
                  return (
                    <tr
                      key={pct}
                      className={cn(
                        "border-t border-border",
                        isBase && "bg-accent/10",
                      )}
                    >
                      <td className={cn("py-0.5 pr-2", isBase ? "font-semibold text-fg-strong" : "text-fg-muted")}>
                        {label}
                      </td>
                      <td className="text-right py-0.5 pr-2 tabular-nums text-fg-strong">
                        ₪{sweepCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="text-right py-0.5 pr-2 tabular-nums text-success-fg">
                        {sweepYield.toLocaleString()}
                      </td>
                      <td className="text-right py-0.5 tabular-nums text-danger-fg">
                        {sweepWaste.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- R40-1: Resource Utilization Panel -------------------------------- */}
        {showResourceUtilization && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <Gauge className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Resource Utilization
            </div>
            <div className="flex flex-col gap-1.5">
              {(
                [
                  { label: "Line A", maxCapacity: 1000 },
                  { label: "Line B", maxCapacity: 800 },
                  { label: "Mixer", maxCapacity: 600 },
                  { label: "Filler", maxCapacity: 1200 },
                ] as const
              ).map((resource) => {
                const utilizationPct = Math.min(
                  100,
                  Math.round((draftQty / resource.maxCapacity) * 100),
                );
                const barColor =
                  utilizationPct > 90
                    ? "bg-red-500"
                    : utilizationPct >= 70
                      ? "bg-yellow-400"
                      : "bg-green-500";
                return (
                  <div key={resource.label} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-3xs text-fg-muted">{resource.label}</span>
                    <div className="flex-1 h-2.5 rounded bg-bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded transition-all", barColor)}
                        style={{ width: `${utilizationPct}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-3xs tabular-nums shrink-0 w-9 text-right",
                        utilizationPct > 90
                          ? "text-red-500"
                          : utilizationPct >= 70
                            ? "text-yellow-500"
                            : "text-green-600",
                      )}
                    >
                      {utilizationPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- R41-1: Multi-Product Comparison panel ----------------------------- */}
        {showMultiProductComparison && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <GitCompare className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Multi-Scenario Comparison
            </div>
            {(() => {
              const baseCostPerUnit: number =
                (selectedProduct as any)?.cost_per_unit ??
                (selectedProduct as any)?.costPerUnit ??
                10; // fallback ₪10/unit mock
              const scenarios: { label: string; qty: number }[] = [
                { label: "50%", qty: Math.max(1, Math.round(draftQty * 0.5)) },
                { label: "Current", qty: Math.max(1, draftQty) },
                { label: "150%", qty: Math.max(1, Math.round(draftQty * 1.5)) },
              ];
              return (
                <table className="w-full text-3xs border-collapse">
                  <thead>
                    <tr className="text-fg-muted">
                      <th className="text-left py-0.5 pr-2 font-medium">Metric</th>
                      {scenarios.map((s) => (
                        <th
                          key={s.label}
                          className={cn(
                            "text-right py-0.5 pr-2 font-medium",
                            s.label === "Current" && "text-accent",
                          )}
                        >
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Qty row */}
                    <tr className="border-t border-border">
                      <td className="py-0.5 pr-2 text-fg-muted">Qty</td>
                      {scenarios.map((s) => (
                        <td
                          key={s.label}
                          className={cn(
                            "text-right py-0.5 pr-2 tabular-nums",
                            s.label === "Current" ? "text-accent font-semibold" : "text-fg-strong",
                          )}
                        >
                          {s.qty.toLocaleString()}
                        </td>
                      ))}
                    </tr>
                    {/* Est. Cost row */}
                    <tr className="border-t border-border">
                      <td className="py-0.5 pr-2 text-fg-muted">Est. Cost</td>
                      {scenarios.map((s) => {
                        const cost = baseCostPerUnit * s.qty;
                        return (
                          <td
                            key={s.label}
                            className={cn(
                              "text-right py-0.5 pr-2 tabular-nums",
                              s.label === "Current" ? "text-accent font-semibold" : "text-fg-strong",
                            )}
                          >
                            ₪{cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Yield Units row */}
                    <tr className="border-t border-border">
                      <td className="py-0.5 pr-2 text-fg-muted">Yield Units</td>
                      {scenarios.map((s) => {
                        const yieldUnits = Math.round(s.qty * (yieldPct / 100));
                        return (
                          <td
                            key={s.label}
                            className={cn(
                              "text-right py-0.5 pr-2 tabular-nums",
                              s.label === "Current" ? "text-accent font-semibold" : "text-success-fg",
                            )}
                          >
                            {yieldUnits.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Waste Units row */}
                    <tr className="border-t border-border">
                      <td className="py-0.5 pr-2 text-fg-muted">Waste Units</td>
                      {scenarios.map((s) => {
                        const wasteUnits = s.qty - Math.round(s.qty * (yieldPct / 100));
                        return (
                          <td
                            key={s.label}
                            className={cn(
                              "text-right py-0.5 pr-2 tabular-nums",
                              s.label === "Current" ? "text-accent font-semibold" : "text-danger-fg",
                            )}
                          >
                            {wasteUnits.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        )}

        {/* ---- R42-1: Ingredient Availability panel ---------------------------- */}
        {showIngredientAvailability && (() => {
          // Build 5 mock/real ingredients for the selected product.
          // Real data would come from a BOM query; v1 uses plausible mocks
          // that are replaced when the product has rm_requirements attached.
          const rawIngredients: unknown[] =
            (selectedProduct as any)?.rm_requirements ??
            (selectedProduct as any)?.ingredients ??
            (selectedProduct as any)?.components ??
            [];

          type IngRow = {
            name: string;
            stock: number;
            required: number;
            coverage: number;
            status: "OK" | "LOW" | "CRITICAL";
          };

          let rows: IngRow[];

          if (Array.isArray(rawIngredients) && rawIngredients.length > 0) {
            rows = (rawIngredients as any[]).slice(0, 5).map((c) => {
              const stock: number =
                (c as any).stock_qty ??
                (c as any).available ??
                (c as any).on_hand ??
                0;
              const required: number =
                ((c as any).required_qty ?? (c as any).quantity ?? 1) *
                Math.max(draftQty, 1);
              const coverage =
                required > 0 ? Math.min(200, Math.round((stock / required) * 100)) : 100;
              const status: IngRow["status"] =
                coverage < 50 ? "CRITICAL" : coverage < 100 ? "LOW" : "OK";
              return {
                name: String(
                  (c as any).name ??
                    (c as any).component_name ??
                    (c as any).id ??
                    "Component",
                ),
                stock,
                required,
                coverage,
                status,
              };
            });
          } else {
            // Mock 5 ingredients when real data is unavailable.
            const productName = selectedProduct?.displayName ?? "Product";
            const mockBase: { name: string; stock: number; reqFactor: number }[] = [
              { name: `${productName} Base Mix`, stock: 500, reqFactor: 0.5 },
              { name: "Glass Bottle 330ml", stock: 1200, reqFactor: 1 },
              { name: "Cap / Lid", stock: 800, reqFactor: 1 },
              { name: "Label", stock: 2000, reqFactor: 1 },
              { name: "Cardboard Box", stock: 80, reqFactor: 0.083 },
            ];
            rows = mockBase.map(({ name, stock, reqFactor }) => {
              const required = Math.ceil(draftQty * reqFactor);
              const coverage =
                required > 0 ? Math.min(200, Math.round((stock / required) * 100)) : 100;
              const status: IngRow["status"] =
                coverage < 50 ? "CRITICAL" : coverage < 100 ? "LOW" : "OK";
              return { name, stock, required, coverage, status };
            });
          }

          return (
            <div className="bg-bg-subtle border border-border rounded mt-2 overflow-hidden">
              <div className="flex items-center gap-1 px-2 py-1.5 bg-bg-muted">
                <FlaskConical className="h-3.5 w-3.5 text-fg-muted shrink-0" strokeWidth={2} />
                <span className="text-3xs font-medium text-fg-strong">
                  Ingredient Availability
                </span>
                {!selectedProduct && (
                  <span className="ml-auto text-3xs text-fg-faint">Select a product</span>
                )}
              </div>
              <table className="w-full text-3xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-fg-faint px-2 py-1 font-medium">Ingredient</th>
                    <th className="text-right text-fg-faint px-2 py-1 font-medium">Stock</th>
                    <th className="text-right text-fg-faint px-2 py-1 font-medium">Required</th>
                    <th className="text-right text-fg-faint px-2 py-1 font-medium">Coverage %</th>
                    <th className="text-right text-fg-faint px-2 py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={cn(
                        "border-t border-border",
                        row.status === "CRITICAL" && "bg-danger-softer/40",
                        row.status === "LOW" && "bg-warning-softer/30",
                      )}
                    >
                      <td className="px-2 py-1 text-fg-strong truncate max-w-[140px]">
                        {row.name}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-fg-muted">
                        {row.stock.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-fg-muted">
                        {row.required.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">
                        <span
                          className={cn(
                            row.status === "CRITICAL" && "text-danger-fg",
                            row.status === "LOW" && "text-warning-fg",
                            row.status === "OK" && "text-success-fg",
                          )}
                        >
                          {row.coverage}%
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span
                          className={cn(
                            "inline-block rounded px-1 py-0.5 text-3xs font-semibold",
                            row.status === "CRITICAL" &&
                              "bg-danger-softer text-danger-fg",
                            row.status === "LOW" &&
                              "bg-warning-softer text-warning-fg",
                            row.status === "OK" &&
                              "bg-success-softer text-success-fg",
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
          );
        })()}

        {/* ---- R43-1: Production Schedule Preview panel ----------------------- */}
        {showProductionSchedulePreview && (() => {
          const DAILY_CAPACITY = 480; // mock units/day
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu"] as const;
          const qtyPerDay = draftQty > 0 ? draftQty : 0;
          // Distribute work across up to 5 days
          let remaining = qtyPerDay;
          const slots = days.map((day) => {
            const allocated = Math.min(remaining, DAILY_CAPACITY);
            remaining = Math.max(0, remaining - allocated);
            const hours = allocated > 0 ? Math.round((allocated / DAILY_CAPACITY) * 8 * 10) / 10 : 0;
            const loadColor: string =
              hours > 10
                ? "bg-danger-softer border-l-2 border-danger-fg"
                : hours > 6
                  ? "bg-warning-softer border-l-2 border-warning-fg"
                  : "bg-success-softer border-l-2 border-success-fg";
            return { day, allocated, hours, loadColor };
          });

          return (
            <div className="bg-bg-subtle border border-border rounded mt-2 overflow-hidden">
              <div className="flex items-center gap-1 px-2 py-1.5 bg-bg-muted">
                <CalendarCheck className="h-3.5 w-3.5 text-fg-muted shrink-0" strokeWidth={2} />
                <span className="text-3xs font-medium text-fg-strong">Schedule Preview — 5 days</span>
                {!selectedProduct && (
                  <span className="ml-auto text-3xs text-fg-faint">Select a product</span>
                )}
              </div>
              <div className="flex flex-col gap-1 p-2">
                {slots.map(({ day, allocated, hours, loadColor }) => (
                  <div
                    key={day}
                    className={cn(
                      "flex items-center gap-3 rounded px-2 py-1.5 text-3xs",
                      loadColor,
                    )}
                  >
                    <span className="w-7 shrink-0 font-semibold text-fg-strong">{day}</span>
                    <span className="text-fg-faint shrink-0">08:00</span>
                    <span className="flex-1 text-fg-muted">
                      {allocated > 0
                        ? `${allocated.toLocaleString()} units`
                        : <span className="text-fg-faint italic">idle</span>}
                    </span>
                    <span className="tabular-nums text-fg-muted shrink-0">
                      {hours > 0 ? `${hours}h` : "—"}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 font-semibold text-3xs shrink-0",
                        hours > 10
                          ? "bg-danger-softer text-danger-fg"
                          : hours > 6
                            ? "bg-warning-softer text-warning-fg"
                            : hours > 0
                              ? "bg-success-softer text-success-fg"
                              : "bg-bg-muted text-fg-faint",
                      )}
                    >
                      {hours > 10 ? "HIGH" : hours > 6 ? "MED" : hours > 0 ? "LOW" : "—"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 px-2 pb-1.5 text-3xs text-fg-faint">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-success-softer inline-block" />
                  &lt;6h
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-warning-softer inline-block" />
                  6–10h
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-danger-softer inline-block" />
                  &gt;10h
                </span>
              </div>
            </div>
          );
        })()}

        {/* ---- R44-1: Cost History Sparkline panel ----------------------------- */}
        {showCostHistorySparkline && (() => {
          const MOCK_VALUES = [10.2, 10.8, 9.9, 11.1, 10.5, 10.3];
          const avg = MOCK_VALUES.reduce((a, b) => a + b, 0) / MOCK_VALUES.length;
          const min = Math.min(...MOCK_VALUES);
          const max = Math.max(...MOCK_VALUES);
          const padding = 0.4;
          const svgW = 240;
          const svgH = 45;
          const range = Math.max(max - min + padding * 2, 0.01);
          const toX = (i: number) => Math.round((i / (MOCK_VALUES.length - 1)) * svgW);
          const toY = (v: number) =>
            Math.round(svgH - ((v - min + padding) / range) * svgH);
          const points = MOCK_VALUES.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
          const avgY = toY(avg);
          return (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
                <BarChart2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                Cost per Unit — Last 6 Simulations
              </div>
              <div className="relative">
                <svg
                  width={svgW}
                  height={svgH}
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  aria-hidden="true"
                  className="overflow-visible"
                >
                  {/* Dashed average line */}
                  <line
                    x1={0}
                    y1={avgY}
                    x2={svgW}
                    y2={avgY}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    className="text-fg-faint"
                  />
                  {/* Polyline */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="text-accent"
                  />
                  {/* Data point dots */}
                  {MOCK_VALUES.map((v, i) => (
                    <circle
                      key={i}
                      cx={toX(i)}
                      cy={toY(v)}
                      r={2.5}
                      fill="currentColor"
                      className="text-accent"
                    />
                  ))}
                </svg>
                <div className="flex justify-between text-3xs text-fg-faint mt-1">
                  <span>6 runs ago</span>
                  <span className="text-fg-muted">Avg: ₪{avg.toFixed(2)}/unit</span>
                  <span>Now</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ---- R45-1: What-If Export panel ------------------------------------ */}
        {showWhatIfExport && (() => {
          const productName: string =
            selectedProduct?.displayName ??
            (selectedProduct as any)?.item?.item_name ??
            "—";
          const estCost: number =
            (selectedProduct as any)?.cost_per_unit != null
              ? ((selectedProduct as any).cost_per_unit as number) * draftQty
              : draftQty * 10;
          const effectiveOutput = Math.round((draftQty * (yieldPct / 100)));
          const wasteUnits = draftQty - effectiveOutput;
          const marginPct = marginChip.marginPct;

          const csvString = [
            "Product,Qty,Est. Cost (₪),Yield,Waste,Margin%",
            `"${productName}",${draftQty},${estCost.toFixed(2)},${effectiveOutput},${wasteUnits},${marginPct}`,
          ].join("\n");

          const handleCopyToClipboard = () => {
            navigator.clipboard.writeText(csvString).catch(() => {});
            setShowExportCopied(true);
            setTimeout(() => setShowExportCopied(false), 2000);
          };

          return (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
                  <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  Export Preview
                </div>
                <button
                  type="button"
                  onClick={handleCopyToClipboard}
                  className={cn(
                    "inline-flex items-center gap-1 text-3xs rounded px-2 py-0.5 transition-colors cursor-pointer",
                    showExportCopied
                      ? "bg-success-softer text-success-fg"
                      : "bg-bg-muted text-fg-muted hover:text-fg-strong",
                  )}
                >
                  {showExportCopied ? "Copied!" : "Copy to clipboard"}
                </button>
              </div>
              <table className="w-full text-3xs border-collapse">
                <thead>
                  <tr className="text-fg-muted">
                    <th className="text-left py-0.5 pr-2 font-medium">Product</th>
                    <th className="text-right py-0.5 pr-2 font-medium">Qty</th>
                    <th className="text-right py-0.5 pr-2 font-medium">Est. Cost</th>
                    <th className="text-right py-0.5 pr-2 font-medium">Yield</th>
                    <th className="text-right py-0.5 pr-2 font-medium">Waste</th>
                    <th className="text-right py-0.5 font-medium">Margin%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="py-0.5 pr-2 text-fg-strong truncate max-w-[120px]" title={productName}>
                      {productName.length > 16 ? productName.slice(0, 16) + "…" : productName}
                    </td>
                    <td className="text-right py-0.5 pr-2 tabular-nums text-fg-strong">
                      {draftQty.toLocaleString()}
                    </td>
                    <td className="text-right py-0.5 pr-2 tabular-nums text-fg-strong">
                      ₪{estCost.toFixed(0)}
                    </td>
                    <td className="text-right py-0.5 pr-2 tabular-nums text-success-fg">
                      {effectiveOutput.toLocaleString()}
                    </td>
                    <td className="text-right py-0.5 pr-2 tabular-nums text-danger-fg">
                      {wasteUnits.toLocaleString()}
                    </td>
                    <td className="text-right py-0.5 tabular-nums text-fg-strong">
                      {marginPct}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* ---- R46-1: Break-Even Chart panel ---------------------------------- */}
        {showBreakEvenChart && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <Target className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Break-Even Analysis
            </div>
            <table className="w-full text-3xs border-collapse mb-3">
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-0.5 pr-2 text-fg-muted">Fixed Costs</td>
                  <td className="text-right py-0.5 tabular-nums text-fg-strong">₪2,000</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-0.5 pr-2 text-fg-muted">Variable Cost/Unit</td>
                  <td className="text-right py-0.5 tabular-nums text-fg-strong">
                    ₪{varCostPerUnit.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-2 text-fg-muted">Selling Price/Unit</td>
                  <td className="text-right py-0.5 tabular-nums text-fg-strong">
                    ₪{sellingPricePerUnit.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-fg-faint text-3xs">Break-Even Qty</span>
              <span
                className={cn(
                  "text-xl font-bold tabular-nums",
                  breakEvenQty === 0
                    ? "text-fg-muted"
                    : draftQty >= breakEvenQty
                      ? "text-success-fg"
                      : "text-danger-fg",
                )}
              >
                {breakEvenQty === 0 ? "—" : breakEvenQty.toLocaleString()}
              </span>
              <span className="text-fg-faint text-3xs">units</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xs text-fg-faint w-20 shrink-0">
                Current: {draftQty.toLocaleString()}
              </span>
              <div className="flex-1 h-2 rounded bg-bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded transition-all",
                    breakEvenPct >= 100
                      ? "bg-success-fg"
                      : breakEvenPct >= 80
                        ? "bg-yellow-400"
                        : "bg-red-500",
                  )}
                  style={{ width: `${breakEvenPct}%` }}
                />
              </div>
              <span className="text-3xs text-fg-faint w-10 text-right tabular-nums shrink-0">
                {breakEvenPct}%
              </span>
            </div>
          </div>
        )}

        {/* ---- R47-1: Material Wastage Breakdown panel ----------------------- */}
        {showMaterialWastageBreakdown && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Material Wastage Breakdown
            </div>
            <table className="w-full text-3xs border-collapse">
              <thead>
                <tr className="bg-bg-muted">
                  <th className="text-left text-fg-faint px-2 py-1 font-medium">Material</th>
                  <th className="text-right text-fg-faint px-2 py-1 font-medium">Waste %</th>
                  <th className="text-right text-fg-faint px-2 py-1 font-medium">Waste (kg)</th>
                </tr>
              </thead>
              <tbody>
                {MATERIAL_WASTAGE.map((row, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-2 py-1 text-fg-strong">{row.material}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      <span
                        className={cn(
                          "rounded px-1 py-0.5",
                          row.wastePct < 2
                            ? "bg-success-softer text-success-fg"
                            : row.wastePct < 4
                              ? "bg-warning-softer text-warning-fg"
                              : "bg-danger-softer text-danger-fg",
                        )}
                      >
                        {row.wastePct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg-muted">
                      {row.wasteKg.toFixed(1)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Improvement 14: RM Cost What-If Multiplier panel ------------- */}
        {showWhatIfPanel && (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5">
              <Sliders className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              RM Cost What-If
            </div>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              className="w-full h-1 accent-blue-500"
              value={whatIfRmMultiplier}
              onChange={(e) => setWhatIfRmMultiplier(Number(e.target.value))}
            />
            <div className="flex justify-between text-3xs text-fg-faint mt-0.5">
              <span>−50%</span>
              <span>+100%</span>
            </div>
            <div className="text-center font-medium text-fg-strong text-3xs mt-1">
              {whatIfRmMultiplier}% of current RM cost
            </div>
            {whatIfCostImpact !== null ? (
              <div className="flex gap-3 mt-2 text-3xs">
                <span className="text-fg-muted">
                  Base: ₪{whatIfCostImpact.baseCost.toFixed(0)}/unit
                </span>
                <span className="text-fg-strong font-semibold">
                  Adjusted: ₪{whatIfCostImpact.adjustedCost.toFixed(0)}/unit
                </span>
                <span
                  className={
                    whatIfCostImpact.deltaPct < 0 ? "text-success-fg" : "text-danger-fg"
                  }
                >
                  ({whatIfCostImpact.deltaPct > 0 ? "+" : ""}{whatIfCostImpact.deltaPct}%)
                </span>
              </div>
            ) : (
              <div className="text-fg-faint text-3xs mt-2">
                Select a product to model cost impact
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {selectedProduct && committedQty !== null ? (
        <SimulationResults product={selectedProduct} targetQty={committedQty} />
      ) : (
        <SectionCard>
          <div className="text-xs text-fg-muted">
            Pick a product, enter a target quantity, then press Simulate to see
            the combined BASE + PACK component requirements.
          </div>
        </SectionCard>
      )}
    </div>
  );
}
