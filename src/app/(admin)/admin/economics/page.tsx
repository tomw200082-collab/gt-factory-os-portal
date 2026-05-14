"use client";

// ---------------------------------------------------------------------------
// Admin · Economics — Phase 10A.
//
// Two-tab view onto the COGS snapshot pipeline:
//   - Overview        : COGS per SKU, inventory at cost, snapshot freshness.
//   - Component Costs : effective cost per component + inline fallback edit.
//
// Source of truth:
//   GET  /api/economics                          → snapshot rows (one per item)
//   GET  /api/economics/component-costs          → cost view (one per component)
//   PATCH /api/economics/component-costs/:id     → updates fallback (components
//                                                  .std_cost_per_inv_uom)
//   POST /api/economics/recalculate              → run snapshot now
//
// Edits to the fallback do NOT change the active effective cost when the
// component has a primary supplier — the supplier_items row wins. That nuance
// is surfaced on the row and inside the edit cell so admins do not silently
// edit a value with no effect.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";

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
  isAdmin: boolean;
  onSaved: () => void;
}

function CostEditCell({ row, isAdmin, onSaved }: CostEditCellProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(() => row.fallback_cost ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const display = formatIls(row.effective_cost);

  const startEdit = () => {
    if (!isAdmin) return;
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
      disabled={!isAdmin}
      title={
        isAdmin
          ? "Click to edit fallback cost"
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
      {display}
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
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "component-costs">(
    "overview",
  );
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [costSavedHint, setCostSavedHint] = useState(false);
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

  // Total inventory at cost (overview footer)
  const totalInventoryAtCost = useMemo(() => {
    const rows = economicsQuery.data?.rows ?? [];
    let sum = 0;
    for (const r of rows) {
      if (r.fg_inventory_value_at_cost == null) continue;
      const n = Number(r.fg_inventory_value_at_cost);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
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
        description="COGS per SKU and component cost management. Edit raw material costs → snapshot runs nightly."
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
        <SectionCard
          eyebrow="Snapshot"
          title="COGS per product"
          description="Per-unit COGS and on-hand inventory valued at the same snapshot. Edits to component costs flow into tonight’s 04:00 UTC re-snapshot — or run one now."
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
                      On hand
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Inventory at cost
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
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-fg-muted">
                        {formatQtyZero(r.qty_on_hand)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums">
                        {formatIls(r.fg_inventory_value_at_cost)}
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
                      colSpan={6}
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
              isAdmin
                ? "Click the cost cell to edit the fallback. Edits apply to components.std_cost_per_inv_uom; the primary supplier price still wins where one is set."
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
