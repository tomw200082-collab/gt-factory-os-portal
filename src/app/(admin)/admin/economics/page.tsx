"use client";

// ---------------------------------------------------------------------------
// Admin · Economics — unified cost-of-sale surface.
//
// Two tabs, each combining entry + analysis for one entity:
//   - Products      : per-FG COGS, average sale price (inline entry),
//                     material margin (₪ and %), on-hand, inventory value.
//   - Raw Materials : effective cost per component with a SMART cost cell
//                     that edits whichever source drives COGS — the primary
//                     supplier_items row, or the component fallback.
//
// Every cost / sale-price change is recorded to history; the per-row History
// button opens <PriceHistoryDrawer> (a secondary on-demand view).
//
// Source of truth:
//   GET   /api/economics                          → v_fg_economics rows
//   GET   /api/economics/component-costs           → component effective cost
//   PATCH /api/economics/component-costs/:id        → smart cost write
//   POST  /api/economics/sale-prices                → append FG sale price
//   POST  /api/economics/recalculate                → run COGS snapshot now
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, History } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { PriceHistoryDrawer } from "@/components/economics/PriceHistoryDrawer";

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
  supplier_item_id: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

interface RecalculateResponse {
  items_complete?: number;
  items_missing_cost?: number;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Data fetcher
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

/**
 * True when a numeric-string money value equals a number. Used to skip a
 * save (and the spurious history row it would create) when an edit cell is
 * opened and closed without an actual change.
 */
function sameAmount(a: string | null, b: number): boolean {
  if (a == null) return false;
  const n = Number(a);
  return Number.isFinite(n) && n === b;
}

// ---------------------------------------------------------------------------
// Source badge (raw-materials tab)
// ---------------------------------------------------------------------------

function CostSourceBadge({
  source,
}: {
  source: ComponentCostRow["cost_source"];
}): JSX.Element {
  if (source === "supplier_items_primary") {
    return <Badge tone="success" dotted>Primary supplier</Badge>;
  }
  if (source === "components_fallback") {
    return <Badge tone="warning" dotted>Component cost</Badge>;
  }
  return <Badge tone="danger" dotted>Missing</Badge>;
}

// ---------------------------------------------------------------------------
// MarginBadge — colour the margin % by health.
// ---------------------------------------------------------------------------

function MarginBadge({ pct }: { pct: string | null }): JSX.Element {
  if (pct == null) return <span className="text-fg-subtle">—</span>;
  const n = Number(pct);
  if (!Number.isFinite(n)) return <span className="text-fg-subtle">—</span>;
  const tone = n < 0 ? "danger" : n < 20 ? "warning" : "success";
  return (
    <Badge tone={tone} dotted>
      {n.toFixed(1)}%
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// History button — opens the secondary price-history drawer.
// ---------------------------------------------------------------------------

function HistoryButton({
  onClick,
}: {
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-accent"
      title="View price history"
    >
      <History className="h-3 w-3" strokeWidth={2} />
      History
    </button>
  );
}

// ---------------------------------------------------------------------------
// Smart cost cell — raw-materials tab.
//
// Edits whichever cost drives COGS: the primary supplier_items row when one
// exists, otherwise the component fallback. The PATCH endpoint routes the
// write and records a price_history row.
// ---------------------------------------------------------------------------

function CostEditCell({
  row,
  isAdmin,
  onSaved,
}: {
  row: ComponentCostRow;
  isAdmin: boolean;
  onSaved: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(() => row.effective_cost ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const startEdit = () => {
    if (!isAdmin) return;
    setValue(row.effective_cost ?? "");
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setValue(row.effective_cost ?? "");
  };

  const commit = async () => {
    if (busy) return;
    const trimmed = value.trim();
    // Empty input → treat as cancel; never write a 0 cost by accident.
    if (trimmed === "") {
      cancel();
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      setError("Cost must be a number ≥ 0.");
      return;
    }
    // Unchanged → close without a PATCH so no spurious price_history row.
    if (sameAmount(row.effective_cost, num)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const finalSource =
      row.cost_source === "missing" ? "components_fallback" : row.cost_source;
    const payload =
      finalSource === "supplier_items_primary"
        ? {
            std_cost_per_inv_uom: num,
            cost_source: finalSource,
            supplier_item_id: row.supplier_item_id,
          }
        : { std_cost_per_inv_uom: num, cost_source: finalSource };
    try {
      const res = await fetch(
        `/api/economics/component-costs/${encodeURIComponent(row.component_id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        throw new Error(
          body?.error ?? body?.message ?? `Save failed (HTTP ${res.status}).`,
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
            aria-label={`Edit cost for ${row.component_name}`}
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
            {row.cost_source === "supplier_items_primary"
              ? "Updates the primary supplier cost."
              : "Updates the component cost."}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={!isAdmin}
      title={
        isAdmin
          ? "Click to edit cost"
          : "Read-only — sign in as admin to edit"
      }
      className={`inline-flex min-w-[5rem] items-center justify-end rounded px-1.5 py-0.5 text-right text-sm tabular-nums transition-colors ${
        flash
          ? "bg-success-softer text-success-fg"
          : isAdmin
            ? "text-fg-strong hover:bg-bg-subtle hover:text-accent"
            : "cursor-default text-fg-strong"
      }`}
    >
      {formatIls(row.effective_cost)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sale-price entry cell — products tab.
//
// Appends a fg_sale_prices history row. Append-only — each save is a new
// snapshot, not an overwrite.
// ---------------------------------------------------------------------------

function SalePriceEditCell({
  row,
  isAdmin,
  onSaved,
}: {
  row: EconomicsRow;
  isAdmin: boolean;
  onSaved: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(() => row.avg_sale_price_ils ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const startEdit = () => {
    if (!isAdmin) return;
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
    // Empty input → treat as cancel; never append a 0 sale price by accident.
    if (trimmed === "") {
      cancel();
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      setError("Price must be a number ≥ 0.");
      return;
    }
    // Unchanged → close without a POST so no spurious fg_sale_prices row.
    if (sameAmount(row.avg_sale_price_ils, num)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/economics/sale-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          item_id: row.item_id,
          avg_sale_price_ils: num,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        throw new Error(
          body?.error ?? body?.message ?? `Save failed (HTTP ${res.status}).`,
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
      <div className="flex flex-col items-end gap-1">
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
            aria-label={`Edit sale price for ${row.item_name}`}
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
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={!isAdmin}
      title={
        isAdmin
          ? "Click to enter average sale price"
          : "Read-only — sign in as admin to edit"
      }
      className={`inline-flex min-w-[5rem] items-center justify-end rounded px-1.5 py-0.5 text-right text-sm tabular-nums transition-colors ${
        flash
          ? "bg-success-softer text-success-fg"
          : isAdmin
            ? "text-fg-strong hover:bg-bg-subtle hover:text-accent"
            : "cursor-default text-fg-strong"
      }`}
    >
      {row.avg_sale_price_ils == null ? (
        <span className="text-accent">Set price</span>
      ) : (
        formatIls(row.avg_sale_price_ils)
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
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
// Error card
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
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"products" | "raw-materials">(
    "products",
  );
  const [banner, setBanner] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);
  const [componentQuery, setComponentQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [history, setHistory] = useState<{
    mode: "rm" | "fg";
    id: string;
    name: string;
  } | null>(null);

  // --- Products data ------------------------------------------------------

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
        throw new Error(
          body?.message ?? `Snapshot failed (HTTP ${res.status}).`,
        );
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

  // --- Raw-materials data -------------------------------------------------

  const costsQuery = useQuery<ListEnvelope<ComponentCostRow>>({
    queryKey: ["admin", "economics", "component-costs"],
    queryFn: () =>
      fetchJson<ListEnvelope<ComponentCostRow>>(
        "/api/economics/component-costs",
      ),
  });

  const totalInventoryAtCost = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    let sum = 0;
    for (const r of rows) {
      const n = Number(r.fg_inventory_value_at_cost);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }, [economicsQuery.data]);

  const filteredProducts = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    if (!productQuery) return rows;
    const q = productQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.item_name.toLowerCase().includes(q) ||
        r.item_id.toLowerCase().includes(q),
    );
  }, [economicsQuery.data, productQuery]);

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

  const headerActions = isAdmin ? (
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
        eyebrow="Admin · economics"
        title="Economics"
        description="COGS, sale prices and material margins per product. Enter raw-material costs and average sale prices to see the full cost-of-sale picture."
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
        {(["products", "raw-materials"] as const).map((tab) => (
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
            {tab === "products" ? "Products" : "Raw Materials"}
          </button>
        ))}
      </div>

      {activeTab === "products" ? (
        <>
          <SectionCard title="Filter" density="compact">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="block sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Search products
                </span>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search products…"
                    dir="auto"
                  />
                  {productQuery ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm shrink-0"
                      onClick={() => setProductQuery("")}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Products"
            title="COGS, sale price and margin"
            description={
              isAdmin
                ? "Click a sale-price cell to enter the average sale price. Margin = sale price − COGS. COGS refreshes on the nightly snapshot or via Run Snapshot Now."
                : "Read-only — sign in as admin to enter sale prices."
            }
            contentClassName="p-0"
          >
            {economicsQuery.isLoading ? (
              <TableSkeleton />
            ) : economicsQuery.isError ? (
              <ErrorCard
                message={(economicsQuery.error as Error).message}
                onRetry={() => economicsQuery.refetch()}
              />
            ) : filteredProducts.length === 0 ? (
              <div className="p-10">
                <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
                  <div className="mb-1 text-sm font-semibold text-fg-strong">
                    No products
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
                        Product
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        COGS / unit
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Sale price
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Margin
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
                        History
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((r) => (
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
                            isAdmin={isAdmin}
                            onSaved={() => {
                              void queryClient.invalidateQueries({
                                queryKey: ["admin", "economics"],
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm tabular-nums">
                          {formatIls(r.material_margin_ils)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MarginBadge pct={r.material_margin_pct} />
                        </td>
                        <td className="px-3 py-2 text-right text-sm tabular-nums text-fg-muted">
                          {formatQtyZero(r.qty_on_hand)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm tabular-nums">
                          {formatIls(r.fg_inventory_value_at_cost)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <HistoryButton
                            onClick={() =>
                              setHistory({
                                mode: "fg",
                                id: r.item_id,
                                name: r.item_name,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/70 bg-bg-subtle/60">
                      <td
                        colSpan={8}
                        className="px-3 py-2 text-right text-sm font-semibold text-fg-strong tabular-nums"
                      >
                        Total inventory at cost:{" "}
                        {formatIlsGrouped(totalInventoryAtCost)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {activeTab === "raw-materials" ? (
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
            eyebrow="Raw materials"
            title={`Showing ${filteredCosts.length} of ${costsQuery.data?.rows.length ?? 0}`}
            description={
              isAdmin
                ? "Click a cost cell to edit. The cell edits whichever cost drives COGS — the primary supplier cost when one exists, otherwise the component cost. Every change is recorded to history."
                : "Read-only — sign in as admin to edit."
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
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        History
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
                            isAdmin={isAdmin}
                            onSaved={() => {
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
                          <CostSourceBadge source={r.cost_source} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <HistoryButton
                            onClick={() =>
                              setHistory({
                                mode: "rm",
                                id: r.component_id,
                                name: r.component_name,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      <PriceHistoryDrawer
        open={history != null}
        onClose={() => setHistory(null)}
        mode={history?.mode ?? "fg"}
        id={history?.id ?? null}
        name={history?.name ?? ""}
      />
    </>
  );
}
