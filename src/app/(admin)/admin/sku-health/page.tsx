"use client";

// ---------------------------------------------------------------------------
// Admin · SKU Health
//
// Operational view of canonical SKU coverage on active finished-goods items
// and Shopify alignment. Powered entirely by existing endpoints — no new
// backend SQL or migration required.
//
// Sections:
//   1. Header tiles — Active FG total, With SKU, Missing SKU, Duplicate SKU
//      groups, Last Shopify FG sync.
//   2. Coverage table — every active FG item with sku / item_id / name /
//      supply_method / has_sku / shopify_variant_match (v1: unknown — see
//      TODO below).
//   3. SKU exceptions — recent rows in shopify_variant_not_found,
//      sku_collision, sku_alias_pending_approval categories.
//
// Data sources:
//   - GET /api/items?status=ACTIVE&limit=1000&include_readiness=false
//     (recently extended to return `sku`). Counts and coverage table both
//     derive from this single fetch — fine for ~70 rows.
//   - GET /api/admin/jobs (returns last_started_at / last_status per
//     job_name). The "Last Shopify FG sync" tile picks the most recent
//     succeeded run from any job whose name contains "shopify".
//   - GET /api/exceptions?statuses=open,acknowledged for the bottom panel,
//     filtered client-side to the three SKU-relevant categories.
//
// TODO(future-tranche): the "shopify_variant_match" column is currently
// "unknown" for every item with a SKU. Powering it correctly requires a
// backend join against integration_sku_map (or an equivalent
// v_sku_health view) so the portal can ask "is this canonical SKU present
// as a Shopify variant?" without a per-row Shopify API call. Add when that
// query lands; the column header and helper are already in place.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { fmtSupplyMethod } from "@/lib/display";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemRow {
  item_id: string;
  item_name: string;
  sku: string | null;
  supply_method: string;
  status: string;
}

interface JobRow {
  job_name: string;
  last_started_at: string | null;
  last_ended_at: string | null;
  last_status: string | null;
}

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: string;
  title: string;
  item_id?: string | null;
  created_at: string;
}

type ListEnvelope<T> = { rows: T[]; count?: number };

const FG_SUPPLY_METHODS = new Set(["BOUGHT_FINISHED", "MANUFACTURED"]);
const SKU_EXCEPTION_CATEGORIES = new Set([
  "shopify_variant_not_found",
  "sku_collision",
  "sku_alias_pending_approval",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSkuHealthPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [supplyFilter, setSupplyFilter] = useState<string>("");
  const [hasSkuFilter, setHasSkuFilter] = useState<string>("");

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "sku-health", "items"],
    queryFn: () =>
      fetchJson<ListEnvelope<ItemRow>>(
        "/api/items?status=ACTIVE&limit=1000&include_readiness=false",
      ),
    staleTime: 30_000,
  });

  const jobsQuery = useQuery<ListEnvelope<JobRow>>({
    queryKey: ["admin", "sku-health", "jobs"],
    queryFn: () => fetchJson<ListEnvelope<JobRow>>("/api/admin/jobs"),
    staleTime: 30_000,
  });

  const exceptionsQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "sku-health", "exceptions"],
    queryFn: () =>
      fetchJson<ListEnvelope<ExceptionRow>>(
        "/api/exceptions?statuses=open,acknowledged&limit=100",
      ),
    staleTime: 30_000,
  });

  const allItems = itemsQuery.data?.rows ?? [];
  const fgItems = useMemo(
    () =>
      allItems.filter(
        (r) => r.status === "ACTIVE" && FG_SUPPLY_METHODS.has(r.supply_method),
      ),
    [allItems],
  );

  const stats = useMemo(() => {
    const total = fgItems.length;
    let withSku = 0;
    let missingSku = 0;
    const skuCounts = new Map<string, number>();
    for (const r of fgItems) {
      if (r.sku && r.sku.trim().length > 0) {
        withSku += 1;
        const key = r.sku.trim().toLowerCase();
        skuCounts.set(key, (skuCounts.get(key) ?? 0) + 1);
      } else {
        missingSku += 1;
      }
    }
    let duplicateGroups = 0;
    for (const c of skuCounts.values()) {
      if (c > 1) duplicateGroups += 1;
    }
    return { total, withSku, missingSku, duplicateGroups };
  }, [fgItems]);

  const lastShopifySync = useMemo(() => {
    const rows = jobsQuery.data?.rows ?? [];
    let best: JobRow | null = null;
    for (const r of rows) {
      const name = (r.job_name ?? "").toLowerCase();
      if (!name.includes("shopify")) continue;
      // Prefer succeeded runs; the upstream "succeeded" string matches the
      // jobs page convention. Treat "success" as a synonym for resilience.
      const ok = r.last_status === "succeeded" || r.last_status === "success";
      if (!ok) continue;
      const ts = r.last_ended_at ?? r.last_started_at;
      if (!ts) continue;
      if (!best) {
        best = r;
        continue;
      }
      const bestTs = best.last_ended_at ?? best.last_started_at;
      if (!bestTs) {
        best = r;
        continue;
      }
      if (new Date(ts).getTime() > new Date(bestTs).getTime()) best = r;
    }
    return best;
  }, [jobsQuery.data]);

  const lastSyncIso = lastShopifySync
    ? lastShopifySync.last_ended_at ?? lastShopifySync.last_started_at
    : null;

  const filteredCoverage = useMemo(() => {
    const qLower = query.trim().toLowerCase();
    return fgItems.filter((r) => {
      if (qLower) {
        const hay = `${r.sku ?? ""} ${r.item_id} ${r.item_name}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      if (supplyFilter && r.supply_method !== supplyFilter) return false;
      if (hasSkuFilter === "yes" && !(r.sku && r.sku.trim().length > 0)) {
        return false;
      }
      if (hasSkuFilter === "no" && r.sku && r.sku.trim().length > 0) {
        return false;
      }
      return true;
    });
  }, [fgItems, query, supplyFilter, hasSkuFilter]);

  const skuExceptions = useMemo(() => {
    const rows = exceptionsQuery.data?.rows ?? [];
    return rows
      .filter((r) => SKU_EXCEPTION_CATEGORIES.has(r.category))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 20);
  }, [exceptionsQuery.data]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · integrations"
        title="SKU Health"
        description="Canonical SKU coverage on active finished goods and Shopify alignment. Read-only."
        meta={
          <>
            <Badge tone="info" dotted>
              {stats.total} active FG
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
      />

      {/* -------------------------------------------------------------- */}
      {/* Header tiles                                                    */}
      {/* -------------------------------------------------------------- */}
      <SectionCard eyebrow="Coverage" title="At a glance" density="compact">
        {itemsQuery.isLoading ? (
          <div className="text-sm text-fg-muted">Loading…</div>
        ) : itemsQuery.isError ? (
          <div className="text-sm text-danger-fg">
            {(itemsQuery.error as Error).message}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile
              label="Active FG total"
              value={stats.total.toString()}
              tone="neutral"
            />
            <Tile
              label="With SKU"
              value={stats.withSku.toString()}
              tone="success"
            />
            <Tile
              label="Missing SKU"
              value={stats.missingSku.toString()}
              tone={stats.missingSku > 0 ? "warning" : "neutral"}
            />
            <Tile
              label="Duplicate SKU groups"
              value={stats.duplicateGroups.toString()}
              tone={stats.duplicateGroups > 0 ? "danger" : "success"}
            />
            <Tile
              label="Last Shopify FG sync"
              value={timeAgo(lastSyncIso)}
              sub={lastSyncIso ? fmtTs(lastSyncIso) : undefined}
              tone={lastSyncIso ? "neutral" : "warning"}
              loading={jobsQuery.isLoading}
            />
          </div>
        )}
      </SectionCard>

      {/* -------------------------------------------------------------- */}
      {/* Coverage table                                                  */}
      {/* -------------------------------------------------------------- */}
      <SectionCard title="Filters" density="compact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="block sm:col-span-2">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search
            </span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search SKU, item ID, or name…"
                dir="auto"
              />
              {query ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() => setQuery("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Supply method
            </span>
            <select
              className="input"
              value={supplyFilter}
              onChange={(e) => setSupplyFilter(e.target.value)}
            >
              <option value="">(all)</option>
              <option value="MANUFACTURED">MANUFACTURED</option>
              <option value="BOUGHT_FINISHED">BOUGHT_FINISHED</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Has SKU
            </span>
            <select
              className="input"
              value={hasSkuFilter}
              onChange={(e) => setHasSkuFilter(e.target.value)}
            >
              <option value="">(all)</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Coverage"
        title={`Showing ${filteredCoverage.length} of ${fgItems.length}`}
        contentClassName="p-0"
      >
        {itemsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : itemsQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load coverage</div>
              <div className="mt-1 text-xs">{(itemsQuery.error as Error).message}</div>
              <button
                type="button"
                onClick={() => void itemsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredCoverage.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No items match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    SKU
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item ID
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supply method
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Has SKU
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Shopify variant
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCoverage.map((r) => {
                  const hasSku = !!(r.sku && r.sku.trim().length > 0);
                  return (
                    <tr
                      key={r.item_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-fg">
                        {hasSku ? (
                          r.sku
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                        <Link
                          href={`/admin/masters/items/${encodeURIComponent(
                            r.item_id,
                          )}`}
                          className="hover:text-accent"
                        >
                          {r.item_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-fg-strong">
                        {r.item_name}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                        {fmtSupplyMethod(r.supply_method)}
                      </td>
                      <td className="px-3 py-2">
                        {hasSku ? (
                          <Badge tone="success" dotted>
                            yes
                          </Badge>
                        ) : (
                          <Badge tone="warning" dotted>
                            no
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {hasSku ? (
                          <Badge tone="neutral">unknown</Badge>
                        ) : (
                          <span className="text-fg-faint text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* -------------------------------------------------------------- */}
      {/* SKU exceptions                                                  */}
      {/* -------------------------------------------------------------- */}
      <SectionCard
        eyebrow="Exceptions"
        title="Recent SKU exceptions"
        description="Open or acknowledged exceptions in the SKU-related categories."
        contentClassName="p-0"
      >
        {exceptionsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : exceptionsQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load SKU exceptions</div>
              <div className="mt-1 text-xs">{(exceptionsQuery.error as Error).message}</div>
              <button
                type="button"
                onClick={() => void exceptionsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : skuExceptions.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No open SKU exceptions. Nothing to see here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Title
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Category
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {skuExceptions.map((e) => (
                  <tr
                    key={e.exception_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 text-fg-strong">{e.title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                      {e.item_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                      {e.category}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {timeAgo(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tile (lightweight inline component)
// ---------------------------------------------------------------------------

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  tone: "neutral" | "success" | "warning" | "danger";
  loading?: boolean;
}

function Tile({ label, value, sub, tone, loading }: TileProps): JSX.Element {
  const toneText =
    tone === "success"
      ? "text-success-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : tone === "danger"
          ? "text-danger-fg"
          : "text-fg-strong";
  return (
    <div className="rounded-md border border-border/70 bg-bg-subtle/40 p-3">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneText}`}>
        {loading ? "…" : value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-fg-muted">{sub}</div>
      ) : null}
    </div>
  );
}
