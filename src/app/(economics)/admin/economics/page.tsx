"use client";

// ---------------------------------------------------------------------------
// Economics — Phase 10A.
//
// Access: planner + admin (the (economics) route group gates on
// planning:execute). Lifted out of the (admin) group 2026-05-17 so planners
// own routine component-cost edits and on-demand re-snapshots.
//
// Two-tab view onto the economics pipeline:
//   - Overview        : COGS per SKU, editable average sale price, derived
//                       material margin, inventory valued at cost / sale.
//   - Component Costs : effective cost per component + inline fallback edit.
//
// Source of truth:
//   GET  /api/economics                          → economics rows (per item)
//   GET  /api/economics/component-costs          → cost view (one per component)
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
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useCapability } from "@/lib/auth/role-gate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EconomicsRow {
  item_id: string;
  item_name: string;
  cogs_per_unit_ils: string | null;
  cogs_complete: boolean;
  missing_cost_components: unknown[];
  cogs_snapshot_at: string | null;
  qty_on_hand: string;
  fg_inventory_value_at_cost: string | null;
  avg_sale_price_ils: string | null;
  material_margin_ils: string | null;
  material_margin_pct: string | null;
  fg_inventory_value_at_sale_price: string | null;
  embedded_material_margin_in_stock: string | null;
  reliability_flag: string;
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
// Format helpers
// ---------------------------------------------------------------------------

function formatIls(value: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₪${n.toFixed(2)}`;
}

function formatIlsGrouped(value: number): string {
  return `₪${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQtyZero(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPct(value: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

// Tailwind tone for a margin value: negative margins read as a loss.
function marginTone(value: string | null): string {
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

// ---------------------------------------------------------------------------
// Snapshot status badge (overview tab)
// ---------------------------------------------------------------------------

function SnapshotStatusBadge({ row }: { row: EconomicsRow }): JSX.Element {
  if (row.cogs_complete) {
    return <Badge tone="success" dotted>Complete</Badge>;
  }
  if (row.cogs_snapshot_at == null) {
    return <Badge tone="neutral" dotted>No snapshot</Badge>;
  }
  return <Badge tone="warning" dotted>Incomplete</Badge>;
}

// ---------------------------------------------------------------------------
// Source badge (component-costs tab)
// ---------------------------------------------------------------------------

function CostSourceBadge({
  source,
  supplierCost,
}: {
  source: ComponentCostRow["cost_source"];
  supplierCost: string | null;
}): JSX.Element {
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
// CostEditCell — the star of the component-costs tab
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
      payload = null;
    } else {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) {
        setError("Price must be a number ≥ 0, or blank to clear.");
        return;
      }
      payload = num;
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
// Page
// ---------------------------------------------------------------------------

export default function AdminEconomicsPage(): JSX.Element {
  // planning:execute is granted to planner + admin by the role lattice;
  // operator/viewer never reach this page (the (economics) layout gates on
  // the same capability), so canEdit is effectively always true here and the
  // read-only branches below are defence-in-depth.
  const canEdit = useCapability("planning:execute");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "component-costs">(
    "overview",
  );
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [costSavedHint, setCostSavedHint] = useState(false);
  const [priceSavedHint, setPriceSavedHint] = useState(false);
  const [componentQuery, setComponentQuery] = useState("");

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

  // Overview footer totals — inventory valued at cost and at sale price.
  const { totalInventoryAtCost, totalInventoryAtSalePrice } = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    let cost = 0;
    let sale = 0;
    for (const r of rows) {
      const c = Number(r.fg_inventory_value_at_cost);
      if (r.fg_inventory_value_at_cost != null && Number.isFinite(c)) cost += c;
      const s = Number(r.fg_inventory_value_at_sale_price);
      if (r.fg_inventory_value_at_sale_price != null && Number.isFinite(s))
        sale += s;
    }
    return {
      totalInventoryAtCost: cost,
      totalInventoryAtSalePrice: sale,
    };
  }, [economicsQuery.data]);

  // Filtered component-costs (client-side text search)
  const filteredCosts = useMemo(() => {
    const rows = costsQuery.data?.rows ?? [];
    if (!componentQuery) return rows;
    const q = componentQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.component_name.toLowerCase().includes(q) ||
        r.component_id.toLowerCase().includes(q),
    );
  }, [costsQuery.data, componentQuery]);

  // ----------------------------------------------------------------------

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

  return (
    <>
      <WorkflowHeader
        eyebrow="Economics"
        title="Economics"
        description="COGS, average sale price and material margin per SKU, plus component cost management. Enter sale prices on the Overview tab; edit raw material costs on Component Costs."
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
              ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          {banner.message}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {(["overview", "component-costs"] as const).map((tab) => (
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
            {tab === "overview" ? "Overview" : "Component Costs"}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <>
        <SectionCard
          eyebrow="Economics"
          title="COGS, sale price & margin per product"
          description="Per-unit COGS, the editable average sale price, and the material margin derived from the two. Click an Avg sale price cell to enter or update it — margins recompute immediately, no snapshot run required."
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
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Product
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      COGS / unit
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Avg sale price
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Margin / unit
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Margin %
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      On hand
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Inventory at cost
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Inventory at sale price
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Last snapshot
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(economicsQuery.data?.rows ?? []).map((r) => (
                    <tr
                      key={r.item_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
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
                        {formatQtyZero(r.qty_on_hand)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums">
                        {formatIls(r.fg_inventory_value_at_cost)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums">
                        {formatIls(r.fg_inventory_value_at_sale_price)}
                      </td>
                      <td className="px-3 py-2">
                        <SnapshotStatusBadge row={r} />
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {formatRelativeShort(r.cogs_snapshot_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/70 bg-bg-subtle/60">
                    <td
                      colSpan={10}
                      className="px-3 py-2 text-right text-sm font-semibold text-fg-strong tabular-nums"
                    >
                      Total inventory — at cost:{" "}
                      {formatIlsGrouped(totalInventoryAtCost)}
                      <span className="mx-2 text-fg-subtle">·</span>
                      at sale price:{" "}
                      {formatIlsGrouped(totalInventoryAtSalePrice)}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="block sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Search components
                </span>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={componentQuery}
                    onChange={(e) => setComponentQuery(e.target.value)}
                    placeholder="Search components…"
                    dir="auto"
                  />
                  {componentQuery ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm shrink-0"
                      onClick={() => setComponentQuery("")}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
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
                    Try clearing the search.
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60">
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Component
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Class
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Unit
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Effective cost (₪)
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Source
                      </th>
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
            <div className="text-xs text-fg-muted">
              Cost saved. New COGS will recalculate tonight at 04:00 UTC — or
              click Run Snapshot Now.
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
