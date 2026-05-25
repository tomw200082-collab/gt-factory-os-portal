"use client";

// ---------------------------------------------------------------------------
// Economics — Phase 10A + Tranche 020 polish (2026-05-24).
//
// Access: planner + admin (the (economics) route group gates on
// planning:execute). Lifted out of the (admin) group 2026-05-17 so planners
// own routine component-cost edits and on-demand re-snapshots.
//
// Three-tab view onto the economics pipeline:
//   - Overview        : COGS per SKU, editable average sale price, derived
//                       material margin, inventory valued at cost / sale,
//                       plus a whole-factory valuation summary. Incomplete
//                       rows expose a "Cost gaps" drill-down (drawer) that
//                       lists the missing components by name with inline
//                       cost editors so editors can publish a fallback
//                       price without leaving the page.
//   - Component Costs : effective cost per component + inline fallback edit
//                       + a sticky "Recalc affected products now" toast
//                       after a save so the edit is visible in COGS without
//                       waiting for the 04:00 UTC cron.
//   - Raw Materials   : RM / packaging inventory valued at effective cost.
//
// All three tabs ship with a shared <FilterChipBar> (chip toggles + counts +
// clear-all + visible-row counter) plus sortable column headers, so an
// operator can slice by status, source, class, and on-hand without grepping
// a 200-row table.
//
// Source of truth:
//   GET  /api/economics                          → economics rows (per item)
//   GET  /api/economics/component-costs          → cost view (one per component)
//   GET  /api/economics/raw-materials            → RM/PKG inventory valuation
//   PATCH /api/economics/component-costs/:id     → updates fallback (components
//                                                  .std_cost_per_inv_uom)
//   PATCH /api/economics/sale-price/:item_id     → updates the manual average
//                                                  sale price (items
//                                                  .manual_avg_sale_price_ils)
//   POST /api/economics/recalculate              → run snapshot now
//
// Average sale price is a manual interim input (migration 0207, ahead of
// Wave 10B automation). Unlike component costs, a sale-price edit feeds
// v_fg_economics directly — margin and inventory-at-sale columns recompute
// on the next fetch, no snapshot run required.
//
// Edits to the component fallback do NOT change the active effective cost
// when the component has a primary supplier — the supplier_items row wins.
// That nuance is surfaced on the row and inside the edit cell so editors do
// not silently edit a value with no effect.
//
// The Cost-gaps drawer is intentionally scoped to the components the snapshot
// job already flagged as missing (in `missing_cost_components`). A full
// BOM-with-costs walk would need a new backend endpoint and lives in a future
// W1 tranche — deferred per Tom 2026-05-24 to keep this change frontend-only.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  X,
  Info,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { Drawer } from "@/components/overlays/Drawer";
import { useCapability } from "@/lib/auth/role-gate";
import { formatIls, formatPct, formatQtyInt } from "@/lib/utils/format-money";
import { fmtNumStr } from "@/lib/utils/format-quantity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MissingCostComponent {
  component_id: string | null;
  reason: string;
}

interface EconomicsRow {
  item_id: string;
  item_name: string;
  cogs_per_unit_ils: string | null;
  cogs_complete: boolean;
  missing_cost_components: MissingCostComponent[];
  cogs_snapshot_at: string | null;
  qty_on_hand: string;
  fg_inventory_value_at_cost: string | null;
  avg_sale_price_ils: string | null;
  material_margin_ils: string | null;
  material_margin_pct: string | null;
  fg_inventory_value_at_sale_price: string | null;
  embedded_material_margin_in_stock: string | null;
  reliability_flag: string;
  // Trailing-90-day sales (migration 0210). qty_sold_90d defaults to '0' (never
  // null). revenue_90d_ils is NULL when avg_sale_price_ils is NULL — that
  // NULL excludes the row from the P&L Coverage denominator (honest
  // representation: we cannot measure what we don't price).
  qty_sold_90d: string;
  order_count_90d: number;
  revenue_90d_ils: string | null;
}

interface ComponentCostRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  inventory_uom: string | null;
  fallback_cost: string | null;
  supplier_cost: string | null;
  effective_cost: string | null;
  cost_source: "supplier_items_primary" | "components_fallback" | "missing";
  // In-house semi-finished base: cost derived from a recipe BOM by the
  // snapshot job, not manually editable (migration 0209).
  is_semi_base: boolean;
}

type CostSource = "supplier_items_primary" | "components_fallback" | "missing";

interface RawMaterialRow {
  component_id: string;
  component_name: string | null;
  component_class: string | null;
  item_type: string;
  inventory_uom: string | null;
  fallback_cost_ils: string | null;
  supplier_cost_ils: string | null;
  effective_cost_ils: string | null;
  cost_source: CostSource;
  qty_on_hand: string;
  inventory_value_ils: string | null;
}

interface RawMaterialEconomicsResponse {
  rows: RawMaterialRow[];
  count: number;
  totals: {
    total_inventory_value_ils: string;
    rm_inventory_value_ils: string;
    pkg_inventory_value_ils: string;
    priced_component_count: number;
    unpriced_component_count: number;
    component_count: number;
  };
}

type ListEnvelope<T> = { rows: T[]; count: number };

interface RecalculateResponse {
  items_complete?: number;
  items_missing_cost?: number;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Data fetcher (matches components/page.tsx pattern exactly)
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Format helpers — formatIls / formatPct / formatQtyInt come from the shared
// money module so every monetary value renders identically across surfaces.
// ---------------------------------------------------------------------------

// Tailwind tone for a margin value: negative margins read as a loss.
function marginTone(value: string | number | null): string {
  if (value == null) return "text-fg-muted";
  const n = Number(value);
  if (!Number.isFinite(n)) return "text-fg-muted";
  if (n < 0) return "text-danger-fg";
  return "text-fg-strong";
}

function formatRelativeShort(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return new Date(iso).toLocaleDateString();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Numeric coercion that treats null/NaN as null so it sorts to the end and is
// excluded from min/max comparisons.
function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Generic comparator that puts nulls last for both asc and desc.
function cmp(
  a: number | string | null,
  b: number | string | null,
  dir: "asc" | "desc",
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") {
    return dir === "asc" ? a - b : b - a;
  }
  const s = String(a).localeCompare(String(b));
  return dir === "asc" ? s : -s;
}

// ---------------------------------------------------------------------------
// Friendlier labels for the `missing_cost_components.reason` enum so editors
// see plain English instead of snake_case from the backend.
// ---------------------------------------------------------------------------

function missingReasonLabel(reason: string): string {
  switch (reason) {
    case "no_primary_supplier_cost":
      return "Primary supplier price not set";
    case "primary_supplier_cost_null":
      return "Primary supplier row is missing a price";
    case "bought_finished_no_primary_supplier_cost":
      return "Bought-finished item with no supplier price";
    case "no_bom_lines":
      return "Recipe has no BOM lines";
    case "no_active_bom_version":
      return "Recipe has no active BOM version";
    case "unknown_supply_method":
      return "Item has an unknown supply method";
    default:
      return reason.replace(/_/g, " ");
  }
}

// ---------------------------------------------------------------------------
// Snapshot status badge (overview tab)
// ---------------------------------------------------------------------------

// Tranche 021: classify a row under the P&L Coverage measurement axis.
// Mirrors OVERVIEW_MEASUREMENT_DEFS but returns a single state so the
// MeasurementCell can branch on it directly (rather than re-evaluating
// each predicate).
type MeasurementState =
  | "fully_measured"
  | "margin_unmeasured"
  | "revenue_unmeasured"
  | "inactive";

function classifyMeasurement(r: EconomicsRow): MeasurementState {
  if (!isActive90d(r)) return "inactive";
  if (r.avg_sale_price_ils == null) return "revenue_unmeasured";
  if (!r.cogs_complete) return "margin_unmeasured";
  return "fully_measured";
}

// MeasurementCell — Tranche 021 replacement for SnapshotStatusBadge.
// Renders the measurement badge with a SIZE indicator (revenue 90d, or
// units, or "—") so the operator sees both the STATE and the IMPACT of
// each row in one glance. Inactive rows render muted so the operator's
// eye skips past them — coverage gaps that don't move the books shouldn't
// compete for attention.
function MeasurementCell({
  row,
  onOpenGaps,
}: {
  row: EconomicsRow;
  onOpenGaps?: () => void;
}): JSX.Element {
  const state = classifyMeasurement(row);
  const revenue = num(row.revenue_90d_ils);
  const qtySold = num(row.qty_sold_90d) ?? 0;
  const missing = row.missing_cost_components ?? [];
  const blockerCount = missing.length;
  const snapshotText =
    row.cogs_snapshot_at != null
      ? `Last snapshot ${formatRelativeShort(row.cogs_snapshot_at)}`
      : "No snapshot yet";

  if (state === "fully_measured") {
    return (
      <div className="flex flex-col gap-0.5">
        <span title={`Fully measured. ${snapshotText}.`}>
          <Badge tone="success" dotted>
            Fully measured
          </Badge>
        </span>
        {revenue != null && revenue > 0 ? (
          <span className="text-3xs tabular-nums text-fg-subtle">
            {formatIls(revenue)} · {row.order_count_90d} orders 90d
          </span>
        ) : null}
      </div>
    );
  }

  if (state === "margin_unmeasured") {
    const tip =
      blockerCount > 0
        ? `Margin unmeasured — ${blockerCount} component cost${blockerCount === 1 ? "" : "s"} missing. ${snapshotText}.`
        : `Margin unmeasured — COGS incomplete. ${snapshotText}.`;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span title={tip}>
            <Badge tone="warning" dotted>
              Margin unmeasured
              {blockerCount > 0 ? ` · ${blockerCount}` : ""}
            </Badge>
          </span>
          {onOpenGaps && blockerCount > 0 ? (
            <button
              type="button"
              onClick={onOpenGaps}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-3xs font-semibold text-accent transition-colors hover:bg-accent-soft/80"
              title="Open the Cost-gaps drawer to fix the missing component costs."
            >
              Measure
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
        {revenue != null && revenue > 0 ? (
          <span className="text-3xs tabular-nums text-warning-fg">
            {formatIls(revenue)} unmeasured · {row.order_count_90d} orders 90d
          </span>
        ) : null}
      </div>
    );
  }

  if (state === "revenue_unmeasured") {
    return (
      <div className="flex flex-col gap-0.5">
        <span title={`No sale price set — revenue itself unknown. ${snapshotText}.`}>
          <Badge tone="danger" dotted>
            Revenue unmeasured
          </Badge>
        </span>
        {qtySold > 0 ? (
          <span className="text-3xs tabular-nums text-danger-fg">
            {formatQtyInt(qtySold)} units · {row.order_count_90d} orders 90d ·
            price not set
          </span>
        ) : null}
      </div>
    );
  }

  // inactive — no 90d demand. Muted; the operator's eye should skip past.
  // We still surface the COGS state subtly so editors can find quiet SKUs.
  return (
    <div className="flex flex-col gap-0.5 opacity-60">
      <span
        title={`Not selling in the last 90 days — coverage gaps here don't move the books this quarter. ${snapshotText}.`}
      >
        <Badge tone="neutral" dotted>
          Not selling 90d
        </Badge>
      </span>
      <span className="text-3xs text-fg-subtle">
        {row.cogs_complete
          ? "COGS measured"
          : blockerCount > 0
            ? `COGS incomplete · ${blockerCount}`
            : row.cogs_snapshot_at == null
              ? "No snapshot"
              : "COGS incomplete"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source badge (component-costs tab)
// ---------------------------------------------------------------------------

function CostSourceBadge({
  source,
  supplierCost,
  isSemiBase = false,
}: {
  source: ComponentCostRow["cost_source"];
  supplierCost: string | null;
  isSemiBase?: boolean;
}): JSX.Element {
  if (isSemiBase) {
    return (
      <span title="In-house semi-finished base. Its cost is rolled up from its recipe BOM by the COGS snapshot job.">
        <Badge tone="info" dotted>Recipe rollup</Badge>
      </span>
    );
  }
  if (source === "supplier_items_primary") {
    return (
      <span
        title={
          supplierCost != null
            ? `Set via primary supplier (${formatIls(supplierCost)}). Edit supplier items to change the active cost.`
            : "Set via primary supplier. Edit supplier items to change the active cost."
        }
      >
        <Badge tone="success" dotted>Primary supplier</Badge>
      </span>
    );
  }
  if (source === "components_fallback") {
    return <Badge tone="warning" dotted>Fallback cost</Badge>;
  }
  return <Badge tone="danger" dotted>Missing</Badge>;
}

// ---------------------------------------------------------------------------
// CostEditCell — inline editor for a component's fallback cost.
// Used both on the Component Costs tab and inside the Cost-gaps drawer.
// ---------------------------------------------------------------------------

interface CostEditCellProps {
  row: ComponentCostRow;
  canEdit: boolean;
  onSaved: () => void;
}

function CostEditCell({ row, canEdit, onSaved }: CostEditCellProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(() => row.fallback_cost ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const display = formatIls(row.effective_cost);

  // SEMI base components are costed from their recipe by the snapshot job —
  // render read-only so editors are not misled into a no-op edit.
  if (row.is_semi_base) {
    return (
      <span
        title="Derived from this base's recipe BOM — recomputed by the COGS snapshot job. Not manually editable."
        className="inline-flex min-w-[5rem] items-center justify-end px-1.5 py-0.5 text-right text-sm tabular-nums text-fg-strong"
      >
        {display}
      </span>
    );
  }

  const startEdit = () => {
    if (!canEdit) return;
    setValue(row.fallback_cost ?? "");
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setValue(row.fallback_cost ?? "");
  };

  const commit = async () => {
    if (busy) return;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      setError("Cost must be a number ≥ 0.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/economics/component-costs/${encodeURIComponent(row.component_id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ std_cost_per_inv_uom: num }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(
          body?.message ?? `Save failed (HTTP ${res.status}).`,
        );
      }
      setEditing(false);
      setFlash(true);
      onSaved();
      window.setTimeout(() => setFlash(false), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.0001"
            min="0"
            autoFocus
            disabled={busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              void commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className={`input w-28 text-right tabular-nums ${
              error ? "border-danger focus:border-danger" : ""
            }`}
            aria-label={`Edit fallback cost for ${row.component_name}`}
          />
          {busy ? (
            <span
              className="dot bg-info animate-pulse-soft"
              aria-label="Saving"
            />
          ) : null}
        </div>
        {error ? (
          <span className="text-3xs text-danger-fg">{error}</span>
        ) : row.cost_source === "supplier_items_primary" ? (
          <span className="text-3xs text-fg-subtle">
            Editing fallback — primary supplier{" "}
            {formatIls(row.supplier_cost)} still wins.
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={!canEdit}
      title={
        canEdit
          ? "Click to edit fallback cost"
          : "Read-only — planner or admin access required to edit"
      }
      className={`inline-flex min-w-[5rem] items-center justify-end rounded px-1.5 py-0.5 text-right text-sm tabular-nums transition-colors ${
        flash
          ? "bg-success-softer text-success-fg"
          : canEdit
            ? "text-fg-strong hover:bg-bg-subtle hover:text-accent"
            : "cursor-default text-fg-strong"
      }`}
    >
      {display}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SalePriceEditCell — inline editor for the manual average sale price
// (overview tab). Mirrors CostEditCell; a blank value clears the price.
// ---------------------------------------------------------------------------

interface SalePriceEditCellProps {
  row: EconomicsRow;
  canEdit: boolean;
  onSaved: () => void;
}

function SalePriceEditCell({
  row,
  canEdit,
  onSaved,
}: SalePriceEditCellProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(() => row.avg_sale_price_ils ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const hasPrice = row.avg_sale_price_ils != null;

  const startEdit = () => {
    if (!canEdit) return;
    setValue(row.avg_sale_price_ils ?? "");
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setValue(row.avg_sale_price_ils ?? "");
  };

  const commit = async () => {
    if (busy) return;
    const trimmed = value.trim();
    let payload: number | null;
    if (trimmed === "") {
      // Clearing a price that was set is destructive — confirm first.
      if (
        row.avg_sale_price_ils != null &&
        !window.confirm(
          `Clear the average sale price for ${row.item_name}? Its margin and inventory-at-sale figures will go blank until a new price is entered.`,
        )
      ) {
        cancel();
        return;
      }
      payload = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setError("Price must be a number ≥ 0, or blank to clear.");
        return;
      }
      payload = n;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/economics/sale-price/${encodeURIComponent(row.item_id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ manual_avg_sale_price_ils: payload }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? `Save failed (HTTP ${res.status}).`);
      }
      setEditing(false);
      setFlash(true);
      onSaved();
      window.setTimeout(() => setFlash(false), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            disabled={busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              void commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className={`input w-28 text-right tabular-nums ${
              error ? "border-danger focus:border-danger" : ""
            }`}
            aria-label={`Edit average sale price for ${row.item_name}`}
          />
          {busy ? (
            <span
              className="dot bg-info animate-pulse-soft"
              aria-label="Saving"
            />
          ) : null}
        </div>
        {error ? (
          <span className="text-3xs text-danger-fg">{error}</span>
        ) : (
          <span className="text-3xs text-fg-subtle">
            Blank clears the price.
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={!canEdit}
      title={
        canEdit
          ? "Click to edit the average sale price"
          : "Read-only — planner or admin access required to edit"
      }
      className={`inline-flex min-w-[5rem] items-center justify-end rounded px-1.5 py-0.5 text-right text-sm tabular-nums transition-colors ${
        flash
          ? "bg-success-softer text-success-fg"
          : canEdit
            ? "hover:bg-bg-subtle hover:text-accent"
            : "cursor-default"
      } ${hasPrice ? "text-fg-strong" : "text-fg-subtle"}`}
    >
      {hasPrice ? formatIls(row.avg_sale_price_ils) : canEdit ? "+ Set" : "—"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (matches components/page.tsx)
// ---------------------------------------------------------------------------

function TableSkeleton(): JSX.Element {
  return (
    <div className="p-5">
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
          >
            <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
            <div className="h-4 flex-1 rounded bg-bg-subtle" />
            <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error card (matches components/page.tsx)
// ---------------------------------------------------------------------------

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div className="p-5">
      <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
        <div className="font-semibold">Could not load data</div>
        <div className="mt-1 text-xs">{message}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HelpHint — small info icon carrying an explanatory tooltip. Used on table
// headers so editors can see where a number comes from without leaving the
// page.
// ---------------------------------------------------------------------------

function HelpHint({ text }: { text: string }): JSX.Element {
  return (
    <span
      className="ml-1 inline-flex cursor-help align-middle text-fg-subtle"
      title={text}
      aria-label={text}
      role="img"
    >
      <Info className="h-3 w-3" strokeWidth={2.25} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatTile — one figure in the Overview valuation summary.
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  hint,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  sub?: string;
  tone?: "default" | "danger";
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border/60 bg-bg-subtle/40 p-3">
      <div className="flex items-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
        <HelpHint text={hint} />
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "danger" ? "text-danger-fg" : "text-fg-strong"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-3xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoverageTile — the Tranche 021 headline tile. Dual-axis P&L Coverage:
//   * Revenue axis — % of MEASURABLE revenue with measured margin.
//   * SKU axis     — % of 90d-ACTIVE SKUs fully measured.
//
// Each axis: label, big percent, progress bar, sublabel with absolute
// numerator/denominator. Reads as a coverage metric to drive toward 100%
// rather than a fear-based "risk" number. Tone is derived from coverage
// thresholds — green ≥95%, warning 70–95%, danger <70%.
// ---------------------------------------------------------------------------

function coverageTone(pct: number | null): "success" | "warning" | "danger" | "neutral" {
  if (pct == null) return "neutral";
  if (pct >= 95) return "success";
  if (pct >= 70) return "warning";
  return "danger";
}

function CoverageAxisSkeleton({ label }: { label: string }): JSX.Element {
  return (
    <div className="opacity-60">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold leading-none tabular-nums text-fg-subtle">—</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div className="h-full w-0 bg-fg-subtle" aria-hidden />
      </div>
      <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-bg-subtle" />
    </div>
  );
}

function CoverageAxis({
  label,
  pct,
  numerator,
  denominator,
  hint,
}: {
  label: string;
  pct: number | null;
  numerator: string;
  denominator: string;
  hint: string;
}): JSX.Element {
  const tone = coverageTone(pct);
  const pctText = pct == null ? "—" : `${pct.toFixed(0)}%`;
  const barColor =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-fg-subtle";
  const pctColor =
    tone === "success"
      ? "text-success-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : tone === "danger"
          ? "text-danger-fg"
          : "text-fg-strong";
  return (
    <div>
      <div className="flex items-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
        <HelpHint text={hint} />
      </div>
      <div className={`mt-1 text-3xl font-bold leading-none tabular-nums ${pctColor}`}>
        {pctText}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div
          className={`h-full ${barColor} rounded-r-full transition-all duration-500`}
          style={{
            width: pct == null ? "0%" : `${Math.max(0, Math.min(100, pct))}%`,
          }}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 text-3xs tabular-nums text-fg-subtle">
        <span className="font-medium text-fg-strong">{numerator}</span>
        <span className="mx-1 text-fg-subtle">of</span>
        <span>{denominator}</span>
      </div>
    </div>
  );
}

function CoverageTile({
  loading,
  revenuePct,
  measuredRevenue,
  measurableRevenue,
  unmeasuredRevenue,
  skuPct,
  measuredSkus,
  activeSkus,
  marginUnmeasuredSkus,
  revenueUnmeasuredSkus,
}: {
  loading: boolean;
  revenuePct: number | null;
  measuredRevenue: number;
  measurableRevenue: number;
  unmeasuredRevenue: number;
  skuPct: number | null;
  measuredSkus: number;
  activeSkus: number;
  marginUnmeasuredSkus: number;
  revenueUnmeasuredSkus: number;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border/70 bg-bg-subtle/30 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          P&amp;L Coverage · last 90 days
        </div>
        <div className="text-3xs text-fg-subtle">
          {loading
            ? "Loading…"
            : activeSkus === 0
              ? "No SKUs sold in the last 90 days"
              : `${activeSkus} SKU${activeSkus === 1 ? "" : "s"} sold this quarter`}
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CoverageAxisSkeleton label="Revenue" />
          <CoverageAxisSkeleton label="SKU" />
        </div>
      ) : activeSkus === 0 ? (
        <div className="rounded border border-dashed border-border bg-bg-subtle/40 p-4 text-center text-xs text-fg-subtle">
          Coverage cannot be computed without recent sales. Check that the
          LionWheel mirror is current — see the freshness banner at the top
          of the page.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CoverageAxis
              label="Revenue"
              pct={revenuePct}
              numerator={formatIls(measuredRevenue)}
              denominator={formatIls(measurableRevenue)}
              hint="Share of measurable 90-day revenue that has a measured margin. Measurable means an avg sale price is set; measured means COGS is also complete. SKUs without a sale price are excluded from both numerator and denominator — we cannot measure what we do not price."
            />
            <CoverageAxis
              label="SKU"
              pct={skuPct}
              numerator={String(measuredSkus)}
              denominator={String(activeSkus)}
              hint="Share of SKUs sold in the last 90 days that are fully measured (COGS complete and avg sale price set)."
            />
          </div>
          {unmeasuredRevenue > 0 || revenueUnmeasuredSkus > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/60 pt-3 text-3xs sm:grid-cols-2">
              {unmeasuredRevenue > 0 ? (
                <div className="rounded-md border border-warning/30 bg-warning-softer/60 px-2.5 py-1.5 text-warning-fg">
                  <span className="font-semibold tabular-nums">
                    {formatIls(unmeasuredRevenue)}
                  </span>{" "}
                  of measurable revenue · margin unmeasured
                  <span className="ml-1 text-fg-subtle tabular-nums">({marginUnmeasuredSkus} SKUs)</span>
                </div>
              ) : null}
              {revenueUnmeasuredSkus > 0 ? (
                <div className="rounded-md border border-danger/30 bg-danger-softer/60 px-2.5 py-1.5 text-danger-fg">
                  <span className="font-semibold tabular-nums">
                    {revenueUnmeasuredSkus}
                  </span>{" "}
                  active SKUs · no sale price set · revenue blind
                </div>
              ) : null}
            </div>
          ) : revenuePct != null && revenuePct >= 95 ? (
            <div className="mt-3 rounded-md border border-success/40 bg-success-softer px-3 py-2 text-center text-xs font-medium text-success-fg">
              Books closeable — nothing material to fix this quarter.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InventoryHonestTile — like StatTile but with a measured/unmeasured
// decomposition so the headline number is honest about its blind spot.
// Used for the FG-inventory-at-cost tile under Tranche 021.
// ---------------------------------------------------------------------------

function InventoryHonestTile({
  label,
  measuredValue,
  measuredCount,
  totalCount,
  unmeasuredUnits,
  unmeasuredSkus,
  hint,
}: {
  label: string;
  measuredValue: string;
  measuredCount: number;
  totalCount: number;
  unmeasuredUnits: number;
  unmeasuredSkus: number;
  hint: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border/60 bg-bg-subtle/40 p-3">
      <div className="flex items-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
        <HelpHint text={hint} />
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-fg-strong">
        {measuredValue}
      </div>
      <div className="mt-0.5 text-3xs text-fg-subtle">
        {measuredCount} of {totalCount} SKUs measured
      </div>
      {unmeasuredSkus > 0 ? (
        <div className="mt-1 text-3xs text-warning-fg">
          Missing COGS:{" "}
          <span className="tabular-nums">{formatQtyInt(String(unmeasuredUnits))}</span>{" "}
          units · {unmeasuredSkus} SKUs (value unknown)
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterChip — toggle chip with active state + count. Variant tone is
// derived from the chip's semantic meaning so the bar visually mirrors
// the status badges that appear in the table rows.
// ---------------------------------------------------------------------------

type ChipTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  tone?: ChipTone;
  title?: string;
  onToggle: () => void;
}

const CHIP_TONE_INACTIVE: Record<ChipTone, string> = {
  neutral: "border-border/70 bg-bg-subtle text-fg-muted hover:bg-bg-subtle/80",
  success:
    "border-success/30 bg-success-softer/50 text-success-fg hover:bg-success-softer",
  warning:
    "border-warning/30 bg-warning-softer/50 text-warning-fg hover:bg-warning-softer",
  danger:
    "border-danger/30 bg-danger-softer/50 text-danger-fg hover:bg-danger-softer",
  info: "border-info/30 bg-info-softer/50 text-info-fg hover:bg-info-softer",
  accent:
    "border-accent/30 bg-accent-soft/40 text-accent hover:bg-accent-soft/70",
};

const CHIP_TONE_ACTIVE: Record<ChipTone, string> = {
  neutral: "border-fg/40 bg-fg/10 text-fg-strong",
  success: "border-success bg-success-soft text-success-fg",
  warning: "border-warning bg-warning-soft text-warning-fg",
  danger: "border-danger bg-danger-soft text-danger-fg",
  info: "border-info bg-info-soft text-info-fg",
  accent: "border-accent bg-accent-soft text-accent",
};

function FilterChip({
  label,
  count,
  active,
  tone = "neutral",
  title,
  onToggle,
}: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? CHIP_TONE_ACTIVE[tone] : CHIP_TONE_INACTIVE[tone]
      }`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums ${
          active ? "opacity-90" : "opacity-70"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilterChipBar — wraps a row of FilterChips with a sticky "Clear all" + a
// visible/total counter so the planner always knows what slice they are
// looking at.
// ---------------------------------------------------------------------------

function FilterChipBar({
  children,
  visible,
  total,
  hasActiveFilters,
  onClear,
}: {
  children: React.ReactNode;
  visible: number;
  total: number;
  hasActiveFilters: boolean;
  onClear: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 -mx-0.5">
      {children}
      <div className="ml-auto flex items-center gap-3 pl-2">
        <span className="text-3xs tabular-nums text-fg-subtle">
          Showing <span className="font-semibold text-fg-strong">{visible}</span>{" "}
          of {total}
        </span>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="text-3xs font-medium uppercase tracking-sops text-fg-subtle underline-offset-2 hover:text-accent hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortHeader — clickable column header. Cycles asc → desc → none. Renders a
// subtle direction arrow so the user can see what they're sorting by.
// ---------------------------------------------------------------------------

interface SortState<Col extends string> {
  col: Col;
  dir: "asc" | "desc";
}

function SortHeader<Col extends string>({
  col,
  label,
  align = "left",
  sort,
  onSort,
  hint,
}: {
  col: Col;
  label: string;
  align?: "left" | "right";
  sort: SortState<Col> | null;
  onSort: (next: SortState<Col> | null) => void;
  hint?: string;
}): JSX.Element {
  const isActive = sort?.col === col;
  const dir = isActive ? sort?.dir : null;
  const ariaSort =
    isActive && dir === "asc"
      ? "ascending"
      : isActive && dir === "desc"
        ? "descending"
        : "none";
  const cycle = () => {
    if (!isActive) {
      onSort({ col, dir: "asc" });
    } else if (dir === "asc") {
      onSort({ col, dir: "desc" });
    } else {
      onSort(null);
    }
  };
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`sticky top-0 z-10 bg-bg-subtle/95 px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle backdrop-blur ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={cycle}
        className={`group inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-fg-strong ${
          align === "right" ? "ml-auto" : ""
        } ${isActive ? "text-fg-strong" : ""}`}
        title={hint ?? "Click to sort"}
      >
        <span>{label}</span>
        {hint ? <HelpHint text={hint} /> : null}
        {isActive ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          )
        ) : (
          <ChevronsUpDown
            className="h-3 w-3 opacity-30 group-hover:opacity-70"
            strokeWidth={2.5}
          />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Overview filter taxonomy — Tranche 021 P&L Coverage frame.
//
// Replaces the old single-axis taxonomy (complete / incomplete / no_snapshot
// / no_supplier_cost / no_sale_price / negative_margin) — which mixed
// measurement-state and findings into one row of overlapping chips — with
// TWO orthogonal axes:
//
//   Measurement (within 90d-active SKUs):
//     fully_measured     — selling, COGS known, sale price known.
//     margin_unmeasured  — selling, sale price known, COGS missing.
//     revenue_unmeasured — selling, sale price not set (revenue itself blind).
//     inactive           — not selling in 90d (defer; doesn't move the books).
//
//   Findings (within fully_measured):
//     negative_margin    — sale price below COGS.
//     low_margin         — margin %  positive but < 20.
//     healthy_margin     — margin % ≥ 20.
//
// Within a group: OR. Across groups: AND. The two are orthogonal because
// findings only make sense ON measured rows — a row that's "Margin unmeasured"
// CANNOT have a "Negative margin" finding (we don't know its margin).
// ---------------------------------------------------------------------------

type OverviewMeasurementKey =
  | "fully_measured"
  | "margin_unmeasured"
  | "revenue_unmeasured"
  | "inactive";

type OverviewFindingKey =
  | "negative_margin"
  | "low_margin"
  | "healthy_margin";

// Active = selling in the trailing 90d. This is the denominator of every
// coverage metric on the page — SKUs that didn't sell don't move the books.
function isActive90d(r: EconomicsRow): boolean {
  const q = num(r.qty_sold_90d);
  return q != null && q > 0;
}

const OVERVIEW_MEASUREMENT_DEFS: Array<{
  key: OverviewMeasurementKey;
  label: string;
  tone: ChipTone;
  title: string;
  match: (r: EconomicsRow) => boolean;
}> = [
  {
    key: "fully_measured",
    label: "Fully measured",
    tone: "success",
    title:
      "Sold in the last 90 days, COGS is complete, and an average sale price is set. Margin is computable end-to-end — this row's contribution to the quarter's P&L is fully visible.",
    match: (r) =>
      isActive90d(r) && r.cogs_complete && r.avg_sale_price_ils != null,
  },
  {
    key: "margin_unmeasured",
    label: "Margin unmeasured",
    tone: "warning",
    title:
      "Sold in the last 90 days with a sale price set, but COGS is missing or incomplete. Revenue is visible, margin is not. Open Cost gaps to close.",
    match: (r) =>
      isActive90d(r) && !r.cogs_complete && r.avg_sale_price_ils != null,
  },
  {
    key: "revenue_unmeasured",
    label: "Revenue unmeasured",
    tone: "danger",
    title:
      "Sold in the last 90 days but no average sale price is set — neither revenue nor margin is computable for this SKU. Enter a sale price to start measuring.",
    match: (r) => isActive90d(r) && r.avg_sale_price_ils == null,
  },
  {
    key: "inactive",
    label: "Not selling 90d",
    tone: "neutral",
    title:
      "No resolved-line orders for this SKU in the last 90 days. Coverage gaps here don't affect the current quarter — defer.",
    match: (r) => !isActive90d(r),
  },
];

const OVERVIEW_FINDING_DEFS: Array<{
  key: OverviewFindingKey;
  label: string;
  tone: ChipTone;
  title: string;
  match: (r: EconomicsRow) => boolean;
}> = [
  {
    key: "negative_margin",
    label: "Negative margin",
    tone: "danger",
    title:
      "Sale price is below COGS — the unit currently sells at a material loss. Only fully-measured rows can land here.",
    match: (r) => {
      const m = num(r.material_margin_ils);
      return m != null && m < 0;
    },
  },
  {
    key: "low_margin",
    label: "Low margin (<20%)",
    tone: "warning",
    title:
      "Margin % is positive but below 20%. Fully-measured rows only.",
    match: (r) => {
      const pct = num(r.material_margin_pct);
      return pct != null && pct >= 0 && pct < 20;
    },
  },
  {
    key: "healthy_margin",
    label: "Healthy (≥20%)",
    tone: "success",
    title: "Margin % is 20% or more. Fully-measured rows only.",
    match: (r) => {
      const pct = num(r.material_margin_pct);
      return pct != null && pct >= 20;
    },
  },
];

type OverviewSortCol =
  | "name"
  | "cogs"
  | "sale_price"
  | "margin"
  | "margin_pct"
  | "on_hand"
  | "inv_cost"
  | "inv_sale"
  | "snapshot"
  | "sold_90d"
  | "revenue_90d";

// ---------------------------------------------------------------------------
// Component Costs filter taxonomy.
// ---------------------------------------------------------------------------

type ComponentSourceKey =
  | "supplier"
  | "fallback"
  | "missing"
  | "recipe_rollup";

const COMPONENT_SOURCE_DEFS: Array<{
  key: ComponentSourceKey;
  label: string;
  tone: ChipTone;
  title: string;
  match: (r: ComponentCostRow) => boolean;
}> = [
  {
    key: "supplier",
    label: "Primary supplier",
    tone: "success",
    title:
      "Effective cost comes from the primary supplier_items row (most-recently updated).",
    match: (r) => !r.is_semi_base && r.cost_source === "supplier_items_primary",
  },
  {
    key: "fallback",
    label: "Fallback",
    tone: "warning",
    title:
      "No primary supplier — effective cost comes from the components.std_cost_per_inv_uom fallback.",
    match: (r) => !r.is_semi_base && r.cost_source === "components_fallback",
  },
  {
    key: "missing",
    label: "Missing",
    tone: "danger",
    title: "Neither a supplier price nor a fallback cost is set.",
    match: (r) => !r.is_semi_base && r.cost_source === "missing",
  },
  {
    key: "recipe_rollup",
    label: "Recipe rollup",
    tone: "info",
    title:
      "In-house semi-finished base. Cost is derived from its recipe BOM by the snapshot job — not manually editable.",
    match: (r) => r.is_semi_base,
  },
];

type ComponentSortCol = "name" | "class" | "uom" | "effective_cost" | "source";

// ---------------------------------------------------------------------------
// Raw Materials filter taxonomy.
// ---------------------------------------------------------------------------

type RmTypeKey = "RM" | "PKG";

const RM_TYPE_DEFS: Array<{
  key: RmTypeKey;
  label: string;
  tone: ChipTone;
  title: string;
}> = [
  {
    key: "RM",
    label: "Raw material",
    tone: "accent",
    title: "Items typed as RM in the items table.",
  },
  {
    key: "PKG",
    label: "Packaging",
    tone: "info",
    title: "Items typed as PKG in the items table.",
  },
];

type RmSortCol = "name" | "type" | "uom" | "on_hand" | "unit_cost" | "value";

// ---------------------------------------------------------------------------
// CostGapsDrawer — drill-down for an incomplete Overview row. Lists the
// missing components enriched with names + classes from the component-costs
// query, with inline cost editors so editors can publish without leaving
// the page. Includes a "Recalc this product" affordance that fires the
// existing global recalc endpoint.
// ---------------------------------------------------------------------------

interface CostGapsDrawerProps {
  product: EconomicsRow | null;
  canEdit: boolean;
  costsByComponentId: Map<string, ComponentCostRow>;
  onClose: () => void;
  onRecalc: () => void;
  recalcBusy: boolean;
  onCostSaved: () => void;
}

function CostGapsDrawer({
  product,
  canEdit,
  costsByComponentId,
  onClose,
  onRecalc,
  recalcBusy,
  onCostSaved,
}: CostGapsDrawerProps): JSX.Element {
  const open = product != null;
  const missing = product?.missing_cost_components ?? [];

  // Buckets so editors see the supplier-blocked items grouped separately
  // from component fallback gaps. Both are actionable but in different
  // places (supplier_items vs. components.std_cost_per_inv_uom).
  const supplierBlocked = missing.filter(
    (m) => m.reason === "bought_finished_no_primary_supplier_cost",
  );
  const componentGaps = missing.filter(
    (m) =>
      m.reason !== "bought_finished_no_primary_supplier_cost" &&
      m.component_id != null,
  );
  const structural = missing.filter(
    (m) =>
      m.reason !== "bought_finished_no_primary_supplier_cost" &&
      m.component_id == null,
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={product ? `Measure margin — ${product.item_name}` : "Measure margin"}
      description={
        product
          ? (() => {
              const rev = num(product.revenue_90d_ils);
              const qty = num(product.qty_sold_90d) ?? 0;
              if (rev != null && rev > 0) {
                return `${missing.length} component cost${missing.length === 1 ? "" : "s"} block COGS. ${formatIls(rev)} of 90-day revenue is currently unmeasured (margin unknown). Publish a fallback price below, then recalc.`;
              }
              if (qty > 0) {
                return `${missing.length} component cost${missing.length === 1 ? "" : "s"} block COGS. This SKU sold ${formatQtyInt(qty)} units in the last 90 days — without a sale price the revenue itself is also unmeasured. Publish fallback costs below, then set the sale price.`;
              }
              return `${missing.length} component cost${missing.length === 1 ? "" : "s"} block COGS. Not selling in the last 90 days — this gap doesn't move the books this quarter, but closing it now means the next sale is fully measured.`;
            })()
          : undefined
      }
      width="lg"
    >
      {product ? (
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="rounded-md border border-border/60 bg-bg-subtle/50 p-3">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                    Product
                  </div>
                  <div
                    className="mt-0.5 font-medium text-fg-strong"
                    dir="auto"
                  >
                    {product.item_name}
                  </div>
                  <div className="font-mono text-3xs text-fg-subtle">
                    {product.item_id}
                  </div>
                </div>
                <div>
                  <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                    COGS / unit
                  </div>
                  <div className="mt-0.5 font-medium tabular-nums text-fg-strong">
                    {formatIls(product.cogs_per_unit_ils)}
                  </div>
                  <div className="text-3xs text-fg-subtle">
                    Last snapshot: {formatRelativeShort(product.cogs_snapshot_at)}
                  </div>
                </div>
                <div>
                  <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                    90-day exposure
                  </div>
                  <div className="mt-0.5 font-medium tabular-nums text-warning-fg">
                    {product.revenue_90d_ils != null
                      ? formatIls(product.revenue_90d_ils)
                      : "—"}
                  </div>
                  <div className="text-3xs text-fg-subtle">
                    {formatQtyInt(product.qty_sold_90d)} units ·{" "}
                    {product.order_count_90d} orders
                  </div>
                </div>
              </div>
            </div>

            {supplierBlocked.length > 0 ? (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Bought-finished item · supplier price missing
                </h3>
                <p className="mb-2 text-xs text-fg-muted">
                  This is a bought-finished product. Add a primary supplier
                  cost for the item itself on the Items / Supplier-items page
                  — fallback costs do not apply here.
                </p>
                <div className="rounded border border-danger/40 bg-danger-softer/60 p-3 text-xs text-danger-fg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      strokeWidth={2.5}
                    />
                    <span>
                      Set a primary supplier price for{" "}
                      <code className="font-mono text-3xs">
                        {product.item_id}
                      </code>{" "}
                      on the supplier-items page, then return and recalc.
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {componentGaps.length > 0 ? (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Missing component costs ({componentGaps.length})
                </h3>
                <p className="mb-2 text-xs text-fg-muted">
                  Each row below is a component used by this product's recipe
                  that currently has no effective cost. Type a fallback price
                  to publish — the value lands in components.std_cost_per_inv_uom
                  and feeds COGS on the next recalc.
                </p>
                <div className="overflow-hidden rounded border border-border/60">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-bg-subtle/60">
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Component
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Reason
                        </th>
                        <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Fallback cost (₪)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {componentGaps.map((m) => {
                        const cid = m.component_id as string;
                        const enriched = costsByComponentId.get(cid);
                        return (
                          <tr
                            key={cid}
                            className="border-b border-border/40 last:border-b-0"
                          >
                            <td className="px-3 py-2">
                              <span
                                className="block text-sm font-medium leading-snug text-fg-strong"
                                dir="auto"
                              >
                                {enriched?.component_name ?? cid}
                              </span>
                              <span className="block font-mono text-3xs text-fg-subtle">
                                {cid}
                                {enriched?.component_class
                                  ? ` · ${enriched.component_class}`
                                  : ""}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-fg-muted">
                              {missingReasonLabel(m.reason)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {enriched ? (
                                <CostEditCell
                                  row={enriched}
                                  canEdit={canEdit}
                                  onSaved={onCostSaved}
                                />
                              ) : (
                                <span
                                  className="text-3xs text-fg-subtle"
                                  title="This component is not in the active components list — likely SEMI base or quarantined. Open Component Costs to investigate."
                                >
                                  not editable here
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {structural.length > 0 ? (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Recipe-level issues ({structural.length})
                </h3>
                <ul className="space-y-1 text-xs text-fg-muted">
                  {structural.map((m, i) => (
                    <li
                      key={i}
                      className="rounded border border-warning/30 bg-warning-softer/60 p-2 text-warning-fg"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          strokeWidth={2.5}
                        />
                        <span>
                          {missingReasonLabel(m.reason)}
                          {" — "}
                          fix on the recipe / BOM editor, then recalc.
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {missing.length === 0 ? (
              <div className="rounded border border-success/40 bg-success-softer p-3 text-xs text-success-fg">
                No gaps recorded on the last snapshot — this product is ready
                to recalc.
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/70 bg-bg-subtle/40 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-3xs text-fg-subtle">
                Recalc runs across all products today — a per-item recalc
                endpoint is planned for a future tranche.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm"
                >
                  Close
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={onRecalc}
                    disabled={recalcBusy}
                    className="btn-primary inline-flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {recalcBusy ? "Running…" : "Recalc this product"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div />
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminEconomicsPage(): JSX.Element {
  // planning:execute is granted to planner + admin by the role lattice;
  // operator/viewer never reach this page (the (economics) layout gates on
  // the same capability), so canEdit is effectively always true here and the
  // read-only branches below are defence-in-depth.
  const canEdit = useCapability("planning:execute");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "overview" | "component-costs" | "raw-materials"
  >("overview");
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [costSavedHint, setCostSavedHint] = useState(false);
  const [priceSavedHint, setPriceSavedHint] = useState(false);

  // --- Overview filters + sort -------------------------------------------
  // Tranche 021 P&L Coverage frame: chips split into two orthogonal groups
  // (measurement state vs. findings). Default sort lands on revenue_90d desc
  // so the biggest measurement gaps surface first — the page's mission, not
  // an arbitrary alphabetical scan.
  const [overviewQuery, setOverviewQuery] = useState("");
  const [overviewMeasurement, setOverviewMeasurement] = useState<
    Set<OverviewMeasurementKey>
  >(() => new Set());
  const [overviewFinding, setOverviewFinding] = useState<
    Set<OverviewFindingKey>
  >(() => new Set());
  const [overviewSort, setOverviewSort] = useState<
    SortState<OverviewSortCol> | null
  >({ col: "revenue_90d", dir: "desc" });

  // --- Component-costs filters + sort ------------------------------------
  const [componentQuery, setComponentQuery] = useState("");
  const [componentSources, setComponentSources] = useState<
    Set<ComponentSourceKey>
  >(() => new Set());
  const [componentClasses, setComponentClasses] = useState<Set<string>>(
    () => new Set(),
  );
  const [componentZeroOnly, setComponentZeroOnly] = useState(false);
  const [componentSort, setComponentSort] =
    useState<SortState<ComponentSortCol> | null>(null);

  // --- Raw-materials filters + sort --------------------------------------
  const [rmQuery, setRmQuery] = useState("");
  const [rmTypes, setRmTypes] = useState<Set<RmTypeKey>>(() => new Set());
  const [rmSources, setRmSources] = useState<Set<ComponentSourceKey>>(
    () => new Set(),
  );
  const [rmZeroOnly, setRmZeroOnly] = useState(false);
  const [rmHasStockOnly, setRmHasStockOnly] = useState(false);
  const [rmSort, setRmSort] = useState<SortState<RmSortCol> | null>(null);

  // --- Cost-gaps drawer state --------------------------------------------
  const [gapsProductId, setGapsProductId] = useState<string | null>(null);

  // --- Overview data ------------------------------------------------------

  const economicsQuery = useQuery<ListEnvelope<EconomicsRow>>({
    queryKey: ["admin", "economics"],
    queryFn: () => fetchJson<ListEnvelope<EconomicsRow>>("/api/economics"),
  });

  const recalculateMutation = useMutation({
    mutationFn: async (): Promise<RecalculateResponse> => {
      const res = await fetch("/api/economics/recalculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? `Snapshot failed (HTTP ${res.status}).`);
      }
      return (await res.json()) as RecalculateResponse;
    },
    onSuccess: (data) => {
      const complete = data.items_complete ?? 0;
      const missing = data.items_missing_cost ?? 0;
      setBanner({
        kind: "success",
        message: `Snapshot complete — ${complete} items complete, ${missing} missing cost.`,
      });
      setCostSavedHint(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "economics"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "economics", "component-costs"],
      });
    },
    onError: (err: Error) => {
      setBanner({ kind: "error", message: `Snapshot failed: ${err.message}` });
    },
  });

  // --- Component-costs data ----------------------------------------------

  const costsQuery = useQuery<ListEnvelope<ComponentCostRow>>({
    queryKey: ["admin", "economics", "component-costs"],
    queryFn: () =>
      fetchJson<ListEnvelope<ComponentCostRow>>(
        "/api/economics/component-costs",
      ),
  });

  // --- Raw-material / packaging valuation --------------------------------

  const rawMaterialsQuery = useQuery<RawMaterialEconomicsResponse>({
    queryKey: ["admin", "economics", "raw-materials"],
    queryFn: () =>
      fetchJson<RawMaterialEconomicsResponse>("/api/economics/raw-materials"),
  });

  // Index components by id so the gaps drawer can enrich missing rows
  // (names, classes, current effective cost) without a second fetch.
  const costsByComponentId = useMemo(() => {
    const m = new Map<string, ComponentCostRow>();
    for (const r of costsQuery.data?.rows ?? []) m.set(r.component_id, r);
    return m;
  }, [costsQuery.data]);

  // Set of distinct component classes seen in the component-costs response.
  // Used to render the class-filter chips. We keep the order stable by
  // sorting alphabetically.
  const componentClassesAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const r of costsQuery.data?.rows ?? []) {
      if (r.component_class) set.add(r.component_class);
    }
    return Array.from(set).sort();
  }, [costsQuery.data]);

  // Overview valuation + P&L Coverage axes. Sums skip NULL so a product with
  // no COGS / no sale price simply does not contribute.
  //
  // Coverage axes (Tranche 021):
  //   revenueCoveragePct = measuredRevenue / measurableRevenue * 100
  //     measuredRevenue   = SUM revenue_90d_ils where cogs_complete=true
  //     measurableRevenue = SUM revenue_90d_ils where revenue_90d_ils IS NOT NULL
  //     (an unpriced SKU lands in NEITHER numerator nor denominator — we
  //     can't measure what we don't price.)
  //   skuCoveragePct = measuredSkus / activeSkus * 100
  //     activeSkus   = count(qty_sold_90d > 0)
  //     measuredSkus = count(qty_sold_90d > 0 AND cogs_complete AND avg_sale_price set)
  //
  // Inventory decomposition (Tranche 021):
  //   unmeasuredOnHandUnits = sum(qty_on_hand) where cogs_per_unit_ils IS NULL
  //                           AND qty_on_hand > 0
  //   unmeasuredOnHandSkus  = count of the same predicate
  //   The headline inventory tile shows BOTH `cost` (measured) and the
  //   unmeasured-unit count so the figure is honest about its blind spot.
  const overviewTotals = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    let cost = 0;
    let sale = 0;
    let embeddedMargin = 0;
    let pricedCount = 0;
    let cogsCount = 0;

    let measurableRevenue = 0;
    let measuredRevenue = 0;
    let unmeasuredRevenue = 0; // revenue with sale price but COGS missing
    let activeSkus = 0;
    let measuredSkus = 0;
    let marginUnmeasuredSkus = 0;
    let revenueUnmeasuredSkus = 0;

    let unmeasuredOnHandUnits = 0;
    let unmeasuredOnHandSkus = 0;

    for (const r of rows) {
      const c = Number(r.fg_inventory_value_at_cost);
      if (r.fg_inventory_value_at_cost != null && Number.isFinite(c)) cost += c;
      const s = Number(r.fg_inventory_value_at_sale_price);
      if (r.fg_inventory_value_at_sale_price != null && Number.isFinite(s))
        sale += s;
      const e = Number(r.embedded_material_margin_in_stock);
      if (r.embedded_material_margin_in_stock != null && Number.isFinite(e))
        embeddedMargin += e;
      if (r.avg_sale_price_ils != null) pricedCount += 1;
      if (r.cogs_per_unit_ils != null) cogsCount += 1;

      const active = isActive90d(r);
      const rev = num(r.revenue_90d_ils);
      if (active) {
        activeSkus += 1;
        if (rev != null) measurableRevenue += rev;
        if (rev != null && r.cogs_complete) measuredRevenue += rev;
        if (rev != null && !r.cogs_complete) unmeasuredRevenue += rev;
        if (r.cogs_complete && r.avg_sale_price_ils != null) measuredSkus += 1;
        else if (!r.cogs_complete && r.avg_sale_price_ils != null)
          marginUnmeasuredSkus += 1;
        else if (r.avg_sale_price_ils == null) revenueUnmeasuredSkus += 1;
      }

      const onHand = num(r.qty_on_hand) ?? 0;
      if (r.cogs_per_unit_ils == null && onHand > 0) {
        unmeasuredOnHandUnits += onHand;
        unmeasuredOnHandSkus += 1;
      }
    }

    return {
      cost,
      sale,
      embeddedMargin,
      pricedCount,
      cogsCount,
      productCount: rows.length,
      // Coverage axes
      measurableRevenue,
      measuredRevenue,
      unmeasuredRevenue,
      revenueCoveragePct:
        measurableRevenue > 0 ? (measuredRevenue / measurableRevenue) * 100 : null,
      activeSkus,
      measuredSkus,
      marginUnmeasuredSkus,
      revenueUnmeasuredSkus,
      skuCoveragePct:
        activeSkus > 0 ? (measuredSkus / activeSkus) * 100 : null,
      // Inventory blind-spot
      unmeasuredOnHandUnits,
      unmeasuredOnHandSkus,
    };
  }, [economicsQuery.data]);

  // --- Filtered + sorted Overview ----------------------------------------

  const filteredOverview = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    const q = overviewQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q) {
        const hit =
          r.item_name.toLowerCase().includes(q) ||
          r.item_id.toLowerCase().includes(q);
        if (!hit) return false;
      }
      // Measurement chips: within-group OR.
      if (overviewMeasurement.size > 0) {
        const matches = OVERVIEW_MEASUREMENT_DEFS.some(
          (d) => overviewMeasurement.has(d.key) && d.match(r),
        );
        if (!matches) return false;
      }
      // Finding chips: within-group OR. Across groups: AND (rows must
      // satisfy both axes when both have selections). A row that doesn't
      // match any finding is excluded only if findings are explicitly
      // selected — orthogonality means "no finding" is a valid state.
      if (overviewFinding.size > 0) {
        const matches = OVERVIEW_FINDING_DEFS.some(
          (d) => overviewFinding.has(d.key) && d.match(r),
        );
        if (!matches) return false;
      }
      return true;
    });
    if (overviewSort) {
      const { col, dir } = overviewSort;
      filtered.sort((a, b) => {
        switch (col) {
          case "name":
            return cmp(a.item_name, b.item_name, dir);
          case "cogs":
            return cmp(num(a.cogs_per_unit_ils), num(b.cogs_per_unit_ils), dir);
          case "sale_price":
            return cmp(num(a.avg_sale_price_ils), num(b.avg_sale_price_ils), dir);
          case "margin":
            return cmp(
              num(a.material_margin_ils),
              num(b.material_margin_ils),
              dir,
            );
          case "margin_pct":
            return cmp(
              num(a.material_margin_pct),
              num(b.material_margin_pct),
              dir,
            );
          case "on_hand":
            return cmp(num(a.qty_on_hand), num(b.qty_on_hand), dir);
          case "inv_cost":
            return cmp(
              num(a.fg_inventory_value_at_cost),
              num(b.fg_inventory_value_at_cost),
              dir,
            );
          case "inv_sale":
            return cmp(
              num(a.fg_inventory_value_at_sale_price),
              num(b.fg_inventory_value_at_sale_price),
              dir,
            );
          case "snapshot":
            return cmp(
              a.cogs_snapshot_at ? new Date(a.cogs_snapshot_at).getTime() : null,
              b.cogs_snapshot_at ? new Date(b.cogs_snapshot_at).getTime() : null,
              dir,
            );
          case "sold_90d":
            return cmp(num(a.qty_sold_90d), num(b.qty_sold_90d), dir);
          case "revenue_90d":
            return cmp(num(a.revenue_90d_ils), num(b.revenue_90d_ils), dir);
          default:
            return 0;
        }
      });
    }
    return filtered;
  }, [
    economicsQuery.data,
    overviewQuery,
    overviewMeasurement,
    overviewFinding,
    overviewSort,
  ]);

  // Per-chip counts — derived from the unfiltered list so chip counts stay
  // stable as the user toggles filters (they represent "how many in the
  // whole dataset", not "how many in the current view").
  const overviewMeasurementCounts = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    const out: Record<OverviewMeasurementKey, number> = {
      fully_measured: 0,
      margin_unmeasured: 0,
      revenue_unmeasured: 0,
      inactive: 0,
    };
    for (const r of rows) {
      for (const d of OVERVIEW_MEASUREMENT_DEFS) {
        if (d.match(r)) out[d.key] += 1;
      }
    }
    return out;
  }, [economicsQuery.data]);

  const overviewFindingCounts = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    const out: Record<OverviewFindingKey, number> = {
      negative_margin: 0,
      low_margin: 0,
      healthy_margin: 0,
    };
    for (const r of rows) {
      for (const d of OVERVIEW_FINDING_DEFS) {
        if (d.match(r)) out[d.key] += 1;
      }
    }
    return out;
  }, [economicsQuery.data]);

  // --- Filtered + sorted Component Costs ---------------------------------

  const filteredCosts = useMemo(() => {
    const rows = costsQuery.data?.rows ?? [];
    const q = componentQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q) {
        const hit =
          r.component_name.toLowerCase().includes(q) ||
          r.component_id.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (componentSources.size > 0) {
        const matches = COMPONENT_SOURCE_DEFS.some(
          (d) => componentSources.has(d.key) && d.match(r),
        );
        if (!matches) return false;
      }
      if (componentClasses.size > 0) {
        if (!r.component_class || !componentClasses.has(r.component_class)) {
          return false;
        }
      }
      if (componentZeroOnly) {
        const eff = num(r.effective_cost);
        if (eff == null || eff !== 0) return false;
      }
      return true;
    });
    if (componentSort) {
      const { col, dir } = componentSort;
      filtered.sort((a, b) => {
        switch (col) {
          case "name":
            return cmp(a.component_name, b.component_name, dir);
          case "class":
            return cmp(a.component_class, b.component_class, dir);
          case "uom":
            return cmp(a.inventory_uom, b.inventory_uom, dir);
          case "effective_cost":
            return cmp(num(a.effective_cost), num(b.effective_cost), dir);
          case "source": {
            // Render order: supplier → fallback → recipe → missing.
            const rank = (r: ComponentCostRow) =>
              r.is_semi_base
                ? 2
                : r.cost_source === "supplier_items_primary"
                  ? 0
                  : r.cost_source === "components_fallback"
                    ? 1
                    : 3;
            return cmp(rank(a), rank(b), dir);
          }
          default:
            return 0;
        }
      });
    }
    return filtered;
  }, [
    costsQuery.data,
    componentQuery,
    componentSources,
    componentClasses,
    componentZeroOnly,
    componentSort,
  ]);

  const componentSourceCounts = useMemo(() => {
    const rows = costsQuery.data?.rows ?? [];
    const out: Record<ComponentSourceKey, number> = {
      supplier: 0,
      fallback: 0,
      missing: 0,
      recipe_rollup: 0,
    };
    for (const r of rows) {
      for (const d of COMPONENT_SOURCE_DEFS) {
        if (d.match(r)) out[d.key] += 1;
      }
    }
    return out;
  }, [costsQuery.data]);

  // --- Filtered + sorted Raw Materials -----------------------------------

  const filteredRm = useMemo(() => {
    const rows = rawMaterialsQuery.data?.rows ?? [];
    const q = rmQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q) {
        const name = (r.component_name ?? "").toLowerCase();
        const id = r.component_id.toLowerCase();
        if (!name.includes(q) && !id.includes(q)) return false;
      }
      if (rmTypes.size > 0) {
        if (!rmTypes.has(r.item_type as RmTypeKey)) return false;
      }
      if (rmSources.size > 0) {
        const sourceKey: ComponentSourceKey =
          r.cost_source === "supplier_items_primary"
            ? "supplier"
            : r.cost_source === "components_fallback"
              ? "fallback"
              : "missing";
        if (!rmSources.has(sourceKey)) return false;
      }
      if (rmZeroOnly) {
        const eff = num(r.effective_cost_ils);
        if (eff == null || eff !== 0) return false;
      }
      if (rmHasStockOnly) {
        const q2 = num(r.qty_on_hand);
        if (q2 == null || q2 <= 0) return false;
      }
      return true;
    });
    if (rmSort) {
      const { col, dir } = rmSort;
      filtered.sort((a, b) => {
        switch (col) {
          case "name":
            return cmp(a.component_name ?? a.component_id, b.component_name ?? b.component_id, dir);
          case "type":
            return cmp(a.item_type, b.item_type, dir);
          case "uom":
            return cmp(a.inventory_uom, b.inventory_uom, dir);
          case "on_hand":
            return cmp(num(a.qty_on_hand), num(b.qty_on_hand), dir);
          case "unit_cost":
            return cmp(num(a.effective_cost_ils), num(b.effective_cost_ils), dir);
          case "value":
            return cmp(num(a.inventory_value_ils), num(b.inventory_value_ils), dir);
          default:
            return 0;
        }
      });
    }
    return filtered;
  }, [
    rawMaterialsQuery.data,
    rmQuery,
    rmTypes,
    rmSources,
    rmZeroOnly,
    rmHasStockOnly,
    rmSort,
  ]);

  const rmTypeCounts = useMemo(() => {
    const rows = rawMaterialsQuery.data?.rows ?? [];
    const out: Record<RmTypeKey, number> = { RM: 0, PKG: 0 };
    for (const r of rows) {
      if (r.item_type === "RM") out.RM += 1;
      else if (r.item_type === "PKG") out.PKG += 1;
    }
    return out;
  }, [rawMaterialsQuery.data]);

  const rmSourceCounts = useMemo(() => {
    const rows = rawMaterialsQuery.data?.rows ?? [];
    const out: Record<ComponentSourceKey, number> = {
      supplier: 0,
      fallback: 0,
      missing: 0,
      recipe_rollup: 0,
    };
    for (const r of rows) {
      const key: ComponentSourceKey =
        r.cost_source === "supplier_items_primary"
          ? "supplier"
          : r.cost_source === "components_fallback"
            ? "fallback"
            : "missing";
      out[key] += 1;
    }
    return out;
  }, [rawMaterialsQuery.data]);

  // Resolve the active gaps drawer product from the live query so the drawer
  // re-reads after every recalc / save and the underlying row stays fresh.
  const gapsProduct = useMemo(() => {
    if (!gapsProductId) return null;
    return (
      economicsQuery.data?.rows.find((r) => r.item_id === gapsProductId) ?? null
    );
  }, [gapsProductId, economicsQuery.data]);

  // ----------------------------------------------------------------------

  // Toggle helpers — receive a set + key, return a new set with the key
  // toggled. Keeping these inline avoids creating a generic hook just for
  // three chip groups.
  function toggleSet<T>(set: Set<T>, key: T): Set<T> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  const headerActions = canEdit ? (
    <button
      type="button"
      className="btn-primary inline-flex items-center gap-1.5"
      onClick={() => {
        setBanner(null);
        recalculateMutation.mutate();
      }}
      disabled={recalculateMutation.isPending}
    >
      <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
      {recalculateMutation.isPending ? "Running…" : "Run Snapshot Now"}
    </button>
  ) : null;

  const overviewHasFilters =
    overviewQuery.length > 0 ||
    overviewMeasurement.size > 0 ||
    overviewFinding.size > 0;
  const componentHasFilters =
    componentQuery.length > 0 ||
    componentSources.size > 0 ||
    componentClasses.size > 0 ||
    componentZeroOnly;
  const rmHasFilters =
    rmQuery.length > 0 ||
    rmTypes.size > 0 ||
    rmSources.size > 0 ||
    rmZeroOnly ||
    rmHasStockOnly;

  return (
    <>
      <WorkflowHeader
        eyebrow="Economics"
        title="Economics"
        description="Close the books on this quarter — see P&L coverage by revenue and SKU count, find the measurement gaps, and fix them inline without leaving the page."
        meta={
          <>
            <Badge tone="info" dotted>
              {economicsQuery.data?.count ?? 0} products
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
        actions={headerActions}
      />

      {banner ? (
        <div
          className={
            banner.kind === "success"
              ? "flex items-start justify-between gap-3 rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "flex items-start justify-between gap-3 rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          <span>{banner.message}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 hover:bg-fg/10"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {(["overview", "component-costs", "raw-materials"] as const).map(
          (tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === tab
                  ? "border-b-2 border-accent text-accent -mb-px"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab === "overview"
                ? "Overview"
                : tab === "component-costs"
                  ? "Component Costs"
                  : "Raw Materials"}
            </button>
          ),
        )}
      </div>

      {activeTab === "overview" ? (
        <>
          <SectionCard
            eyebrow="P&L Coverage"
            title="Books closeable on this quarter"
            description="What share of this quarter's revenue has measured margin? The table sorts by the largest gap first — fix from the top down."
          >
            <div className="space-y-3">
              <CoverageTile
                loading={economicsQuery.isLoading}
                revenuePct={overviewTotals.revenueCoveragePct}
                measuredRevenue={overviewTotals.measuredRevenue}
                measurableRevenue={overviewTotals.measurableRevenue}
                unmeasuredRevenue={overviewTotals.unmeasuredRevenue}
                skuPct={overviewTotals.skuCoveragePct}
                measuredSkus={overviewTotals.measuredSkus}
                activeSkus={overviewTotals.activeSkus}
                marginUnmeasuredSkus={overviewTotals.marginUnmeasuredSkus}
                revenueUnmeasuredSkus={overviewTotals.revenueUnmeasuredSkus}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <InventoryHonestTile
                  label="FG inventory at cost"
                  measuredValue={formatIls(overviewTotals.cost)}
                  measuredCount={overviewTotals.cogsCount}
                  totalCount={overviewTotals.productCount}
                  unmeasuredUnits={overviewTotals.unmeasuredOnHandUnits}
                  unmeasuredSkus={overviewTotals.unmeasuredOnHandSkus}
                  hint="Sum of COGS per unit × on-hand units across every finished good with a measured COGS. The unmeasured-units line below the headline number is the blind spot — units sitting in stock whose value we cannot compute yet."
                />
                <StatTile
                  label="Embedded margin in stock"
                  value={formatIls(overviewTotals.embeddedMargin)}
                  hint="FG inventory at sale price minus FG inventory at cost — the material margin locked up in stock. Excludes SKUs missing either COGS or sale price (a NULL margin cannot contribute to the sum)."
                  tone={overviewTotals.embeddedMargin < 0 ? "danger" : "default"}
                  sub={`${overviewTotals.pricedCount} of ${overviewTotals.productCount} products have a sale price`}
                />
                <StatTile
                  label="Raw-material inventory"
                  value={
                    rawMaterialsQuery.data
                      ? formatIls(
                          rawMaterialsQuery.data.totals.total_inventory_value_ils,
                        )
                      : rawMaterialsQuery.isError
                        ? "—"
                        : "…"
                  }
                  hint="Raw material + packaging on hand valued at effective cost (primary supplier, then fallback). Full breakdown on the Raw Materials tab."
                  sub={
                    rawMaterialsQuery.data
                      ? `RM ${formatIls(rawMaterialsQuery.data.totals.rm_inventory_value_ils)} · PKG ${formatIls(rawMaterialsQuery.data.totals.pkg_inventory_value_ils)}`
                      : undefined
                  }
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Filter" density="compact">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input w-full sm:max-w-xs"
                  value={overviewQuery}
                  onChange={(e) => setOverviewQuery(e.target.value)}
                  placeholder="Search products…"
                  dir="auto"
                  aria-label="Search products"
                />
                {overviewQuery ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => setOverviewQuery("")}
                  >
                    Clear search
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Measurement state
                </div>
                <FilterChipBar
                  visible={filteredOverview.length}
                  total={economicsQuery.data?.rows.length ?? 0}
                  hasActiveFilters={overviewHasFilters}
                  onClear={() => {
                    setOverviewQuery("");
                    setOverviewMeasurement(new Set());
                    setOverviewFinding(new Set());
                  }}
                >
                  {OVERVIEW_MEASUREMENT_DEFS.map((d) => (
                    <FilterChip
                      key={d.key}
                      label={d.label}
                      tone={d.tone}
                      title={d.title}
                      count={overviewMeasurementCounts[d.key]}
                      active={overviewMeasurement.has(d.key)}
                      onToggle={() =>
                        setOverviewMeasurement((s) => toggleSet(s, d.key))
                      }
                    />
                  ))}
                </FilterChipBar>
              </div>
              <div className="space-y-2">
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Findings{" "}
                  <span className="font-normal normal-case text-fg-subtle/80">
                    (apply to rows whose margin is computable)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 -mx-0.5">
                  {OVERVIEW_FINDING_DEFS.map((d) => (
                    <FilterChip
                      key={d.key}
                      label={d.label}
                      tone={d.tone}
                      title={d.title}
                      count={overviewFindingCounts[d.key]}
                      active={overviewFinding.has(d.key)}
                      onToggle={() =>
                        setOverviewFinding((s) => toggleSet(s, d.key))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Economics"
            title="P&L per product"
            description="Sorted by Revenue 90d by default — the largest measurement gaps first. Click any column to re-sort. Click Measure on a margin-unmeasured row to open the Cost-gaps drawer; the badge underneath shows the revenue exposure."
            contentClassName="p-0"
          >
            {economicsQuery.isLoading ? (
              <TableSkeleton />
            ) : economicsQuery.isError ? (
              <ErrorCard
                message={(economicsQuery.error as Error).message}
                onRetry={() => economicsQuery.refetch()}
              />
            ) : (economicsQuery.data?.rows ?? []).length === 0 ? (
              <div className="p-10">
                <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
                  <div className="mb-1 text-sm font-semibold text-fg-strong">
                    No snapshot rows yet
                  </div>
                  <div className="mb-4 text-xs text-fg-muted">
                    Run the snapshot to compute COGS for every product.
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn-primary inline-flex items-center gap-1.5"
                      onClick={() => {
                        setBanner(null);
                        recalculateMutation.mutate();
                      }}
                      disabled={recalculateMutation.isPending}
                    >
                      <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
                      {recalculateMutation.isPending
                        ? "Running…"
                        : "Run Snapshot Now"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : filteredOverview.length === 0 ? (
              <div className="p-10">
                <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
                  <div className="mb-1 text-sm font-semibold text-fg-strong">
                    No products match
                  </div>
                  <div className="mb-4 text-xs text-fg-muted">
                    Try clearing the filters or text search.
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setOverviewQuery("");
                      setOverviewMeasurement(new Set());
                      setOverviewFinding(new Set());
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70">
                      <SortHeader
                        col="name"
                        label="Product"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                      />
                      <SortHeader
                        col="revenue_90d"
                        label="Revenue 90d"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Sold units in the last 90 days × avg sale price. Reads ‘—’ when no sale price is set (revenue itself unmeasurable). The default sort — biggest measurement gaps first."
                      />
                      <SortHeader
                        col="sold_90d"
                        label="Sold 90d"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Units sold in the last 90 days, summed from resolved LionWheel order lines (matches the Forecast Workspace numbers)."
                      />
                      <SortHeader
                        col="cogs"
                        label="COGS / unit"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Cost of goods sold per unit — the sum of every BOM component's effective cost. Computed by the COGS snapshot job; run a snapshot to refresh it."
                      />
                      <SortHeader
                        col="sale_price"
                        label="Avg sale price"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Manually-entered average sale price per unit. Click a cell to edit. Drives Revenue 90d, margin, and inventory-at-sale immediately."
                      />
                      <SortHeader
                        col="margin"
                        label="Margin / unit"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Avg sale price minus COGS per unit. Negative means the unit sells below its material cost."
                      />
                      <SortHeader
                        col="margin_pct"
                        label="Margin %"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Margin per unit as a percentage of the avg sale price (margin / sale price × 100)."
                      />
                      <SortHeader
                        col="on_hand"
                        label="On hand"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="Finished-good units currently in stock (current_balances)."
                      />
                      <SortHeader
                        col="inv_cost"
                        label="Inventory at cost"
                        align="right"
                        sort={overviewSort}
                        onSort={setOverviewSort}
                        hint="COGS per unit × on-hand units — the stock's value at material cost."
                      />
                      <th
                        scope="col"
                        className="sticky top-0 z-10 bg-bg-subtle/95 px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle backdrop-blur"
                      >
                        Measurement
                        <HelpHint text="Each row's state on the P&L coverage measurement axis — whether revenue and margin are both computable. The line under the badge shows the row's contribution to the gap or to measured P&L." />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverview.map((r) => {
                      const blockerCount = (r.missing_cost_components ?? [])
                        .length;
                      const showGaps = !r.cogs_complete && blockerCount > 0;
                      const qtySold = num(r.qty_sold_90d) ?? 0;
                      const inactive = !isActive90d(r);
                      return (
                        <tr
                          key={r.item_id}
                          className={`border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 ${inactive ? "opacity-55" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <span
                              className="block text-sm font-medium leading-snug text-fg-strong"
                              dir="auto"
                            >
                              {r.item_name}
                            </span>
                            <span className="block font-mono text-3xs text-fg-subtle">
                              {r.item_id}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {r.revenue_90d_ils != null ? (
                              <span className={qtySold === 0 ? "text-fg-muted" : "text-fg-strong"}>
                                {formatIls(r.revenue_90d_ils)}
                              </span>
                            ) : !inactive ? (
                              <span
                                className="text-3xs font-medium text-danger-fg/80"
                                title="No sale price set — revenue cannot be computed."
                              >
                                no price
                              </span>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {qtySold > 0 ? (
                              <>
                                <span className="text-fg-strong">
                                  {formatQtyInt(r.qty_sold_90d)}
                                </span>
                                <span className="ml-1 text-3xs text-fg-subtle">
                                  · {r.order_count_90d} ord
                                </span>
                              </>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {formatIls(r.cogs_per_unit_ils)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SalePriceEditCell
                              row={r}
                              canEdit={canEdit}
                              onSaved={() => {
                                setPriceSavedHint(true);
                                void queryClient.invalidateQueries({
                                  queryKey: ["admin", "economics"],
                                });
                              }}
                            />
                          </td>
                          <td
                            className={`px-3 py-2 text-right text-sm tabular-nums ${marginTone(
                              r.material_margin_ils,
                            )}`}
                          >
                            {formatIls(r.material_margin_ils)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right text-sm tabular-nums ${marginTone(
                              r.material_margin_pct,
                            )}`}
                          >
                            {formatPct(r.material_margin_pct)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-fg-muted">
                            {formatQtyInt(r.qty_on_hand)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {formatIls(r.fg_inventory_value_at_cost)}
                          </td>
                          <td className="px-3 py-2">
                            <MeasurementCell
                              row={r}
                              onOpenGaps={
                                showGaps
                                  ? () => setGapsProductId(r.item_id)
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/70 bg-bg-subtle/60">
                      <td
                        colSpan={10}
                        className="px-3 py-2 text-right text-sm font-semibold text-fg-strong tabular-nums"
                      >
                        Total inventory — at cost:{" "}
                        {formatIls(overviewTotals.cost)}
                        <span className="mx-2 text-fg-subtle">·</span>
                        at sale price:{" "}
                        {formatIls(overviewTotals.sale)}
                        <span className="mx-2 text-fg-subtle">·</span>
                        embedded margin:{" "}
                        <span
                          className={
                            overviewTotals.embeddedMargin < 0
                              ? "text-danger-fg"
                              : ""
                          }
                        >
                          {formatIls(overviewTotals.embeddedMargin)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
          {priceSavedHint ? (
            <div className="text-xs text-fg-muted">
              Average sale price saved — margin and inventory-at-sale columns
              have been refreshed.
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "component-costs" ? (
        <>
          <SectionCard title="Filter" density="compact">
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input w-full sm:max-w-xs"
                  value={componentQuery}
                  onChange={(e) => setComponentQuery(e.target.value)}
                  placeholder="Search components…"
                  dir="auto"
                  aria-label="Search components"
                />
                {componentQuery ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => setComponentQuery("")}
                  >
                    Clear search
                  </button>
                ) : null}
                <label className="ml-0 inline-flex items-center gap-1.5 text-xs text-fg-muted sm:ml-2">
                  <input
                    type="checkbox"
                    checked={componentZeroOnly}
                    onChange={(e) => setComponentZeroOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border/70"
                  />
                  Zero-cost only
                </label>
              </div>
              <FilterChipBar
                visible={filteredCosts.length}
                total={costsQuery.data?.rows.length ?? 0}
                hasActiveFilters={componentHasFilters}
                onClear={() => {
                  setComponentQuery("");
                  setComponentSources(new Set());
                  setComponentClasses(new Set());
                  setComponentZeroOnly(false);
                }}
              >
                {COMPONENT_SOURCE_DEFS.map((d) => (
                  <FilterChip
                    key={d.key}
                    label={d.label}
                    tone={d.tone}
                    title={d.title}
                    count={componentSourceCounts[d.key]}
                    active={componentSources.has(d.key)}
                    onToggle={() =>
                      setComponentSources((s) => toggleSet(s, d.key))
                    }
                  />
                ))}
                {componentClassesAvailable.map((cls) => {
                  const count =
                    costsQuery.data?.rows.filter(
                      (r) => r.component_class === cls,
                    ).length ?? 0;
                  return (
                    <FilterChip
                      key={`class-${cls}`}
                      label={cls}
                      tone="neutral"
                      title={`Components classified as ${cls}.`}
                      count={count}
                      active={componentClasses.has(cls)}
                      onToggle={() =>
                        setComponentClasses((s) => toggleSet(s, cls))
                      }
                    />
                  );
                })}
              </FilterChipBar>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Component costs"
            title={`Showing ${filteredCosts.length} of ${costsQuery.data?.rows.length ?? 0}`}
            description={
              canEdit
                ? "Click the cost cell to edit the fallback. Edits apply to components.std_cost_per_inv_uom; the primary supplier price still wins where one is set."
                : "Read-only — planner or admin access required to edit."
            }
            contentClassName="p-0"
          >
            {costsQuery.isLoading ? (
              <TableSkeleton />
            ) : costsQuery.isError ? (
              <ErrorCard
                message={(costsQuery.error as Error).message}
                onRetry={() => costsQuery.refetch()}
              />
            ) : filteredCosts.length === 0 ? (
              <div className="p-10">
                <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
                  <div className="mb-1 text-sm font-semibold text-fg-strong">
                    No components match
                  </div>
                  <div className="mb-4 text-xs text-fg-muted">
                    Try clearing the filters or text search.
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setComponentQuery("");
                      setComponentSources(new Set());
                      setComponentClasses(new Set());
                      setComponentZeroOnly(false);
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70">
                      <SortHeader
                        col="name"
                        label="Component"
                        sort={componentSort}
                        onSort={setComponentSort}
                      />
                      <SortHeader
                        col="class"
                        label="Class"
                        sort={componentSort}
                        onSort={setComponentSort}
                      />
                      <SortHeader
                        col="uom"
                        label="Unit"
                        sort={componentSort}
                        onSort={setComponentSort}
                      />
                      <SortHeader
                        col="effective_cost"
                        label="Effective cost (₪)"
                        align="right"
                        sort={componentSort}
                        onSort={setComponentSort}
                      />
                      <SortHeader
                        col="source"
                        label="Source"
                        sort={componentSort}
                        onSort={setComponentSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCosts.map((r) => (
                      <tr
                        key={r.component_id}
                        className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                      >
                        <td className="px-3 py-2">
                          <span
                            className="block text-sm font-medium leading-snug text-fg-strong"
                            dir="auto"
                          >
                            {r.component_name}
                          </span>
                          <span className="block font-mono text-3xs text-fg-subtle">
                            {r.component_id}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-fg-muted">
                          {r.component_class ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-fg-muted">
                          {r.inventory_uom ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <CostEditCell
                            row={r}
                            canEdit={canEdit}
                            onSaved={() => {
                              setCostSavedHint(true);
                              void queryClient.invalidateQueries({
                                queryKey: [
                                  "admin",
                                  "economics",
                                  "component-costs",
                                ],
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <CostSourceBadge
                            source={r.cost_source}
                            supplierCost={r.supplier_cost}
                            isSemiBase={r.is_semi_base}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {costSavedHint ? (
            <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent-soft p-3 text-sm text-accent shadow-raised">
              <div>
                <div className="font-semibold">Cost saved.</div>
                <div className="text-xs">
                  COGS still shows the previous value until you recalc. The
                  nightly snapshot runs at 04:00 UTC.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCostSavedHint(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Dismiss
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBanner(null);
                      recalculateMutation.mutate();
                    }}
                    disabled={recalculateMutation.isPending}
                    className="btn-primary inline-flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {recalculateMutation.isPending
                      ? "Running…"
                      : "Recalc affected products now"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "raw-materials" ? (
        <>
          <SectionCard title="Filter" density="compact">
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input w-full sm:max-w-xs"
                  value={rmQuery}
                  onChange={(e) => setRmQuery(e.target.value)}
                  placeholder="Search raw materials & packaging…"
                  dir="auto"
                  aria-label="Search raw materials"
                />
                {rmQuery ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => setRmQuery("")}
                  >
                    Clear search
                  </button>
                ) : null}
                <label className="ml-0 inline-flex items-center gap-1.5 text-xs text-fg-muted sm:ml-2">
                  <input
                    type="checkbox"
                    checked={rmZeroOnly}
                    onChange={(e) => setRmZeroOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border/70"
                  />
                  Zero-cost only
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={rmHasStockOnly}
                    onChange={(e) => setRmHasStockOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border/70"
                  />
                  On-hand &gt; 0 only
                </label>
              </div>
              <FilterChipBar
                visible={filteredRm.length}
                total={rawMaterialsQuery.data?.rows.length ?? 0}
                hasActiveFilters={rmHasFilters}
                onClear={() => {
                  setRmQuery("");
                  setRmTypes(new Set());
                  setRmSources(new Set());
                  setRmZeroOnly(false);
                  setRmHasStockOnly(false);
                }}
              >
                {RM_TYPE_DEFS.map((d) => (
                  <FilterChip
                    key={d.key}
                    label={d.label}
                    tone={d.tone}
                    title={d.title}
                    count={rmTypeCounts[d.key]}
                    active={rmTypes.has(d.key)}
                    onToggle={() => setRmTypes((s) => toggleSet(s, d.key))}
                  />
                ))}
                {COMPONENT_SOURCE_DEFS.filter(
                  (d) => d.key !== "recipe_rollup",
                ).map((d) => (
                  <FilterChip
                    key={`rm-${d.key}`}
                    label={d.label}
                    tone={d.tone}
                    title={d.title}
                    count={rmSourceCounts[d.key]}
                    active={rmSources.has(d.key)}
                    onToggle={() => setRmSources((s) => toggleSet(s, d.key))}
                  />
                ))}
              </FilterChipBar>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Raw materials"
            title="Raw-material & packaging inventory value"
            description="Every raw material and packaging component with stock on hand, valued at its effective unit cost (primary supplier price, then the components fallback). Sum of the value column is the total raw-material inventory value."
            contentClassName="p-0"
          >
            {rawMaterialsQuery.isLoading ? (
              <TableSkeleton />
            ) : rawMaterialsQuery.isError ? (
              <ErrorCard
                message={(rawMaterialsQuery.error as Error).message}
                onRetry={() => rawMaterialsQuery.refetch()}
              />
            ) : (rawMaterialsQuery.data?.rows ?? []).length === 0 ? (
              <div className="p-10">
                <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
                  <div className="mb-1 text-sm font-semibold text-fg-strong">
                    No raw-material stock
                  </div>
                  <div className="mb-4 text-xs text-fg-muted">
                    No raw material or packaging component currently holds an
                    on-hand balance.
                  </div>
                </div>
              </div>
            ) : filteredRm.length === 0 ? (
              <div className="p-10">
                <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
                  <div className="mb-1 text-sm font-semibold text-fg-strong">
                    No rows match
                  </div>
                  <div className="mb-4 text-xs text-fg-muted">
                    Try clearing the filters or text search.
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setRmQuery("");
                      setRmTypes(new Set());
                      setRmSources(new Set());
                      setRmZeroOnly(false);
                      setRmHasStockOnly(false);
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70">
                      <SortHeader
                        col="name"
                        label="Component"
                        sort={rmSort}
                        onSort={setRmSort}
                      />
                      <SortHeader
                        col="type"
                        label="Type"
                        sort={rmSort}
                        onSort={setRmSort}
                      />
                      <SortHeader
                        col="uom"
                        label="Unit"
                        sort={rmSort}
                        onSort={setRmSort}
                      />
                      <SortHeader
                        col="on_hand"
                        label="On hand"
                        align="right"
                        sort={rmSort}
                        onSort={setRmSort}
                        hint="Quantity currently in stock, in the component's inventory unit of measure."
                      />
                      <SortHeader
                        col="unit_cost"
                        label="Unit cost"
                        align="right"
                        sort={rmSort}
                        onSort={setRmSort}
                        hint="Effective cost per inventory unit: the primary supplier price, or the components fallback cost when no supplier price is set."
                      />
                      <SortHeader
                        col="value"
                        label="Inventory value"
                        align="right"
                        sort={rmSort}
                        onSort={setRmSort}
                        hint="On-hand quantity × effective unit cost."
                      />
                      <th
                        scope="col"
                        className="sticky top-0 z-10 bg-bg-subtle/95 px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle backdrop-blur"
                      >
                        Cost source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRm.map((r) => {
                      const effNum =
                        r.effective_cost_ils != null
                          ? Number(r.effective_cost_ils)
                          : null;
                      const zeroCost = effNum === 0;
                      return (
                        <tr
                          key={r.component_id}
                          className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                        >
                          <td className="px-3 py-2">
                            <span
                              className="block text-sm font-medium leading-snug text-fg-strong"
                              dir="auto"
                            >
                              {r.component_name ?? r.component_id}
                            </span>
                            <span className="block font-mono text-3xs text-fg-subtle">
                              {r.component_id}
                              {r.component_class
                                ? ` · ${r.component_class}`
                                : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              tone={r.item_type === "PKG" ? "info" : "neutral"}
                              dotted
                            >
                              {r.item_type}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-fg-muted">
                            {r.inventory_uom ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-fg-muted">
                            {fmtNumStr(r.qty_on_hand) || "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right text-sm tabular-nums ${
                              zeroCost ? "text-danger-fg" : ""
                            }`}
                          >
                            {formatIls(r.effective_cost_ils)}
                            {zeroCost ? (
                              <HelpHint text="Zero cost — this component is almost certainly missing a real price. It contributes nothing to inventory value or COGS." />
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {formatIls(r.inventory_value_ils)}
                          </td>
                          <td className="px-3 py-2">
                            <CostSourceBadge
                              source={r.cost_source}
                              supplierCost={r.supplier_cost_ils}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/70 bg-bg-subtle/60">
                      <td
                        colSpan={7}
                        className="px-3 py-2 text-right text-sm font-semibold text-fg-strong tabular-nums"
                      >
                        Total raw-material inventory:{" "}
                        {formatIls(
                          rawMaterialsQuery.data?.totals
                            .total_inventory_value_ils ?? null,
                        )}
                        <span className="mx-2 text-fg-subtle">·</span>
                        RM{" "}
                        {formatIls(
                          rawMaterialsQuery.data?.totals
                            .rm_inventory_value_ils ?? null,
                        )}
                        <span className="mx-2 text-fg-subtle">·</span>
                        PKG{" "}
                        {formatIls(
                          rawMaterialsQuery.data?.totals
                            .pkg_inventory_value_ils ?? null,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>

          {rawMaterialsQuery.data &&
          rawMaterialsQuery.data.totals.unpriced_component_count > 0 ? (
            <div className="text-xs text-fg-muted">
              {rawMaterialsQuery.data.totals.unpriced_component_count} of{" "}
              {rawMaterialsQuery.data.totals.component_count} components have no
              cost and are excluded from the total. Add a supplier price or a
              fallback cost on the Component Costs tab.
            </div>
          ) : null}
        </>
      ) : null}

      <CostGapsDrawer
        product={gapsProduct}
        canEdit={canEdit}
        costsByComponentId={costsByComponentId}
        onClose={() => setGapsProductId(null)}
        onRecalc={() => {
          setBanner(null);
          recalculateMutation.mutate();
        }}
        recalcBusy={recalculateMutation.isPending}
        onCostSaved={() => {
          setCostSavedHint(true);
          void queryClient.invalidateQueries({
            queryKey: ["admin", "economics", "component-costs"],
          });
        }}
      />
    </>
  );
}
