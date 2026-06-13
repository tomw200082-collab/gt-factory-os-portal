"use client";

// ---------------------------------------------------------------------------
// Admin · SKU Health (iters 11-16)
//
//  11. Audit — header tiles, coverage table, exceptions panel.
//  12. Header tiles — KPI cards matching MasterSummaryCard KPI strip pattern.
//  13. Coverage table — item_name linked to detail; SKU monospace chip; dot badges.
//  14. Missing SKU rows — bg-warning-softer/20 + "Add SKU →" CTA per row.
//  15. Duplicates section — separate danger card listing conflicting aliases.
//  16. Empty state — "No SKU coverage issues" with CheckCircle.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { fmtSupplyMethod } from "@/lib/display";
import { cn } from "@/lib/cn";

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
// Iter 12 — KPI tile (matches MasterSummaryCard KPI strip pattern)
// ---------------------------------------------------------------------------

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  tone: "neutral" | "success" | "warning" | "danger";
  loading?: boolean;
}

function KpiTile({ label, value, sub, tone, loading }: KpiTileProps): JSX.Element {
  const valueClass =
    tone === "success"
      ? "text-success-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : tone === "danger"
          ? "text-danger-fg"
          : "text-fg-strong";

  const borderClass =
    tone === "danger"
      ? "border-danger/30"
      : tone === "warning"
        ? "border-warning/30"
        : tone === "success"
          ? "border-success/30"
          : "border-border/40";

  const bgClass =
    tone === "danger"
      ? "bg-danger-softer/40"
      : tone === "warning"
        ? "bg-warning-softer/40"
        : "bg-bg-subtle/40";

  return (
    <div
      className={cn(
        "flex min-w-[8rem] flex-1 flex-col gap-0.5 rounded-md border px-3 py-2",
        borderClass,
        bgClass,
      )}
    >
      <span className="text-3xs uppercase tracking-sops text-fg-subtle">{label}</span>
      <span className={cn("text-xl font-semibold leading-tight tabular-nums", valueClass)}>
        {loading ? "…" : value}
      </span>
      {sub ? <span className="text-xs text-fg-muted">{sub}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iter 13 — SKU monospace chip
// ---------------------------------------------------------------------------

function SkuChip({ sku }: { sku: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-bg-subtle/60 px-1.5 py-0.5 font-mono text-xs text-fg">
      {sku}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Iter 15 — Duplicates card
// ---------------------------------------------------------------------------

function DuplicatesCard({ fgItems }: { fgItems: ItemRow[] }): JSX.Element | null {
  const duplicates = useMemo(() => {
    const skuToItems = new Map<string, ItemRow[]>();
    for (const r of fgItems) {
      if (!r.sku || r.sku.trim().length === 0) continue;
      const key = r.sku.trim().toLowerCase();
      const existing = skuToItems.get(key) ?? [];
      existing.push(r);
      skuToItems.set(key, existing);
    }
    return Array.from(skuToItems.entries())
      .filter(([, items]) => items.length > 1)
      .map(([sku, items]) => ({ sku, items }));
  }, [fgItems]);

  if (duplicates.length === 0) return null;

  return (
    <SectionCard
      eyebrow="Conflicts"
      title={`Duplicate SKUs detected (${duplicates.length} group${duplicates.length === 1 ? "" : "s"})`}
      description="Multiple active items share the same SKU. Resolve conflicts in SKU aliases before the next Shopify sync."
      tone="danger"
      actions={
        <Link href="/admin/sku-aliases" className="btn btn-ghost btn-sm text-danger-fg">
          Resolve in aliases →
        </Link>
      }
    >
      <div className="space-y-3">
        {duplicates.map(({ sku, items }) => (
          <div key={sku} className="rounded-md border border-danger/20 bg-danger-softer/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-danger-fg" strokeWidth={2} />
              <SkuChip sku={sku} />
              <span className="text-xs font-semibold text-danger-fg">
                {items.length} items with this SKU
              </span>
            </div>
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.item_id} className="flex items-center gap-2 text-xs">
                  <Link
                    href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
                    className="font-medium text-fg-strong hover:text-accent hover:underline"
                  >
                    {item.item_name}
                  </Link>
                  <span className="font-mono text-fg-faint">{item.item_id}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  );
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
      const ok = r.last_status === "succeeded" || r.last_status === "success";
      if (!ok) continue;
      const ts = r.last_ended_at ?? r.last_started_at;
      if (!ts) continue;
      if (!best) { best = r; continue; }
      const bestTs = best.last_ended_at ?? best.last_started_at;
      if (!bestTs) { best = r; continue; }
      if (new Date(ts).getTime() > new Date(bestTs).getTime()) best = r;
    }
    return best;
  }, [jobsQuery.data]);

  const lastSyncIso = lastShopifySync
    ? (lastShopifySync.last_ended_at ?? lastShopifySync.last_started_at)
    : null;

  const filteredCoverage = useMemo(() => {
    const qLower = query.trim().toLowerCase();
    return fgItems.filter((r) => {
      if (qLower) {
        const hay = `${r.sku ?? ""} ${r.item_id} ${r.item_name}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      if (supplyFilter && r.supply_method !== supplyFilter) return false;
      if (hasSkuFilter === "yes" && !(r.sku && r.sku.trim().length > 0)) return false;
      if (hasSkuFilter === "no" && r.sku && r.sku.trim().length > 0) return false;
      return true;
    });
  }, [fgItems, query, supplyFilter, hasSkuFilter]);

  const skuExceptions = useMemo(() => {
    const rows = exceptionsQuery.data?.rows ?? [];
    return rows
      .filter((r) => SKU_EXCEPTION_CATEGORIES.has(r.category))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);
  }, [exceptionsQuery.data]);

  // Iter 16: all-clear check
  const allClear =
    !itemsQuery.isLoading &&
    !exceptionsQuery.isLoading &&
    stats.missingSku === 0 &&
    stats.duplicateGroups === 0 &&
    skuExceptions.length === 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · integrations"
        title="SKU Health"
        description="Canonical SKU coverage on active finished goods and Shopify alignment. Read-only."
        meta={
          <>
            <Badge tone="info" dotted>{stats.total} active FG</Badge>
            <Badge tone="neutral" dotted>Live data</Badge>
          </>
        }
      />

      {/* Iter 12 — KPI strip */}
      <SectionCard eyebrow="Coverage" title="At a glance" density="compact">
        {itemsQuery.isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 flex-1 animate-pulse rounded-md bg-bg-subtle min-w-[8rem]" />
            ))}
          </div>
        ) : itemsQuery.isError ? (
          <div className="text-sm text-danger-fg">{(itemsQuery.error as Error).message}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <KpiTile label="Active FG total" value={stats.total.toString()} tone="neutral" />
            <KpiTile label="With SKU" value={stats.withSku.toString()} tone="success" />
            <KpiTile
              label="Missing SKU"
              value={stats.missingSku.toString()}
              tone={stats.missingSku > 0 ? "warning" : "neutral"}
            />
            <KpiTile
              label="Duplicate SKU groups"
              value={stats.duplicateGroups.toString()}
              tone={stats.duplicateGroups > 0 ? "danger" : "success"}
            />
            <KpiTile
              label="Last Shopify FG sync"
              value={timeAgo(lastSyncIso)}
              sub={lastSyncIso ? fmtTs(lastSyncIso) : undefined}
              tone={lastSyncIso ? "neutral" : "warning"}
              loading={jobsQuery.isLoading}
            />
          </div>
        )}
      </SectionCard>

      {/* Iter 15 — Duplicates card (only when duplicates exist) */}
      {!itemsQuery.isLoading && stats.duplicateGroups > 0 && (
        <DuplicatesCard fgItems={fgItems} />
      )}

      {/* Filters */}
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
              <option value="MANUFACTURED">Manufactured</option>
              <option value="BOUGHT_FINISHED">Bought finished</option>
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

      {/* Iter 13/14 — Coverage table */}
      <SectionCard
        eyebrow="Coverage"
        title={`Showing ${filteredCoverage.length} of ${fgItems.length}`}
        contentClassName="p-0"
      >
        {itemsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex animate-pulse gap-3 border-b border-border/30 pb-2">
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
            <div>No items match these filters.</div>
            {query || supplyFilter || hasSkuFilter ? (
              <button
                type="button"
                className="btn btn-sm mt-3 inline-flex"
                onClick={() => {
                  setQuery("");
                  setSupplyFilter("");
                  setHasSkuFilter("");
                }}
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  {/* Iter 13: item name first, linked */}
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    SKU
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supply method
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Has SKU
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCoverage.map((r) => {
                  const hasSku = !!(r.sku && r.sku.trim().length > 0);
                  // Iter 14: warn row for missing SKU
                  const rowClass = !hasSku
                    ? "border-b border-border/40 last:border-b-0 bg-warning-softer/20 hover:bg-warning-softer/30"
                    : "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40";
                  return (
                    <tr key={r.item_id} className={rowClass}>
                      {/* Iter 13: item name linked to detail page */}
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                          className="font-medium text-fg-strong hover:text-accent hover:underline"
                        >
                          {r.item_name}
                        </Link>
                        <div className="font-mono text-xs text-fg-faint">{r.item_id}</div>
                      </td>
                      {/* Iter 13: monospace SKU chip */}
                      <td className="px-3 py-2">
                        {hasSku ? (
                          <SkuChip sku={r.sku!} />
                        ) : (
                          <span className="text-fg-faint text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                        {fmtSupplyMethod(r.supply_method)}
                      </td>
                      {/* Iter 13: dot-pattern badge */}
                      <td className="px-3 py-2">
                        {hasSku ? (
                          <Badge tone="success" dotted>yes</Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge tone="warning" dotted>no</Badge>
                            {/* Iter 14: "Add SKU →" CTA for missing rows */}
                            <Link
                              href={`/admin/sku-aliases?item_id=${encodeURIComponent(r.item_id)}`}
                              className="text-xs font-medium text-warning-fg underline-offset-2 hover:underline"
                            >
                              Add SKU →
                            </Link>
                          </div>
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

      {/* SKU exceptions + iter 16 empty state */}
      <SectionCard
        eyebrow="Exceptions"
        title="Recent SKU exceptions"
        description="Open or acknowledged exceptions in the SKU-related categories."
        contentClassName={skuExceptions.length === 0 ? "p-4 sm:p-5" : "p-0"}
      >
        {exceptionsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex animate-pulse gap-3 border-b border-border/30 pb-2">
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
          /* Iter 16: meaningful empty state */
          allClear ? (
            <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success-softer px-4 py-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" strokeWidth={2} />
              <div>
                <div className="text-sm font-semibold text-success-fg">No SKU coverage issues</div>
                <div className="text-xs text-fg-muted">
                  All active items have a unique SKU mapping.
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No open SKU exceptions"
              description="No open or acknowledged exceptions in the SKU-related categories."
              icon={<AlertTriangle className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Title
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
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
                    {/* Iter 13: item linked to detail */}
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                      {e.item_id ? (
                        <Link
                          href={`/admin/masters/items/${encodeURIComponent(e.item_id)}`}
                          className="hover:text-accent hover:underline"
                        >
                          {e.item_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">{e.category}</td>
                    <td className="px-3 py-2 text-xs text-fg-muted">{timeAgo(e.created_at)}</td>
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
