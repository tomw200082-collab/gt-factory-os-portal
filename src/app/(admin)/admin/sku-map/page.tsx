"use client";

// ---------------------------------------------------------------------------
// Admin · SKU Map — read-only audit registry of all external SKU aliases.
//
// UX iterations applied (iters 13-20 of sku-management-redesign):
//   13. Audit: mapped columns alias_id, source_channel, external_sku,
//       item_id, approval_status, notes.
//   14. Redesigned as read-only audit table: alias_id in monospace small,
//       source_channel as channel badge, external_sku as monospace chip.
//   15. item_id → item_name (linked to masters/items/{item_id}); item_id
//       shown below as monospace small.
//   16. ApprovalBadge: APPROVED=success, PENDING=warning, REJECTED=danger.
//   17. Notes column: truncated with expand-on-hover tooltip.
//   18. Filter controls: channel toggle group + status toggle group (pills).
//   19. Summary header: "X approved mappings across Y items" + freshness.
//   20. TypeCheck clean + docs/ux/sku-management-redesign.md written.
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceChannel = "shopify" | "lionwheel" | "green_invoice";
type ApprovalStatus = "pending" | "approved" | "rejected";

interface SkuMapRow {
  alias_id: string;
  source_channel: SourceChannel | string;
  external_sku: string;
  item_id: string;
  item_name?: string | null;
  approval_status: ApprovalStatus;
  notes: string | null;
  created_at: string;
  approved_at?: string | null;
}

interface ItemRow {
  item_id: string;
  item_name: string;
}

type ListEnvelope<T> = { rows: T[]; count: number };

// ---------------------------------------------------------------------------
// Relative-time helper
// ---------------------------------------------------------------------------

function relativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  if (isNaN(then)) return isoStr;
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  const diffW = Math.floor(diffD / 7);
  if (diffD < 60) return `${diffW}w ago`;
  return new Date(isoStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// iter 16: ApprovalBadge
// ---------------------------------------------------------------------------

function ApprovalBadge({ status }: { status: string }): JSX.Element {
  if (status === "approved")
    return <Badge tone="success" dotted>Approved</Badge>;
  if (status === "pending")
    return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "rejected")
    return <Badge tone="danger" dotted>Rejected</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// iter 14: ChannelBadge
// ---------------------------------------------------------------------------

function ChannelBadge({ channel }: { channel: string }): JSX.Element {
  if (channel === "lionwheel") return <Badge tone="neutral">LionWheel</Badge>;
  if (channel === "shopify") return <Badge tone="info">Shopify</Badge>;
  if (channel === "green_invoice")
    return <Badge tone="neutral">Green Invoice</Badge>;
  return <Badge tone="neutral">{channel}</Badge>;
}

// ---------------------------------------------------------------------------
// iter 18: PillToggleGroup
// ---------------------------------------------------------------------------

interface PillOption {
  value: string;
  label: string;
}

function PillToggleGroup({
  options,
  value,
  onChange,
  label,
}: {
  options: PillOption[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isActive
                  ? "border-accent bg-accent text-accent-fg shadow-sm"
                  : "border-border/60 bg-bg-subtle text-fg-muted hover:border-border hover:text-fg",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CHANNEL_OPTIONS: PillOption[] = [
  { value: "", label: "All channels" },
  { value: "lionwheel", label: "LionWheel" },
  { value: "shopify", label: "Shopify" },
  { value: "green_invoice", label: "Green Invoice" },
];

const STATUS_OPTIONS: PillOption[] = [
  { value: "", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminSkuMapPage(): JSX.Element {
  const { session } = useSession();

  if (session.role !== "admin") {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">SKU Map Registry</div>
        <div className="mt-2 text-xs text-fg-muted">
          This surface is restricted to admin. Current role:{" "}
          <span className="font-mono text-fg">{session.role}</span>.
        </div>
        <Link href="/" className="btn btn-sm mt-4 inline-flex">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <AdminSkuMapContent />;
}

function AdminSkuMapContent(): JSX.Element {
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // ---- Queries ---------------------------------------------------------------

  const listQuery = useQuery<ListEnvelope<SkuMapRow>>({
    queryKey: ["admin", "sku-map", channelFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (channelFilter) params.set("source_channel", channelFilter);
      if (statusFilter) params.set("approval_status", statusFilter);
      params.set("limit", "500");
      return fetchJson(`/api/integration-sku-map?${params.toString()}`);
    },
    retry: false,
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "sku-map", "items"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
    retry: false,
  });

  const rows = listQuery.data?.rows ?? [];
  const items = itemsQuery.data?.rows ?? [];

  // iter 19: derived summary stats
  const approvedRows = useMemo(
    () => rows.filter((r) => r.approval_status === "approved"),
    [rows],
  );
  const uniqueItemIds = useMemo(
    () => new Set(approvedRows.map((r) => r.item_id)),
    [approvedRows],
  );
  const latestAt = useMemo(() => {
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    return sorted[0]?.created_at ?? null;
  }, [rows]);

  return (
    <>
      {/* iter 19: summary header */}
      <WorkflowHeader
        eyebrow="Admin · SKU map"
        title="SKU Map Registry"
        description="Read-only audit of all external SKU → canonical item aliases across integration channels. Use SKU Aliases to approve or create new mappings."
        meta={
          listQuery.isSuccess && !channelFilter && !statusFilter ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-fg-muted">
                <span className="font-semibold text-fg-strong">
                  {approvedRows.length}
                </span>{" "}
                approved {approvedRows.length === 1 ? "mapping" : "mappings"}{" "}
                across{" "}
                <span className="font-semibold text-fg-strong">
                  {uniqueItemIds.size}
                </span>{" "}
                {uniqueItemIds.size === 1 ? "item" : "items"}
              </span>
              {latestAt ? (
                <span
                  className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-bg-subtle px-2 py-0.5 text-3xs text-fg-muted"
                  title={new Date(latestAt).toLocaleString()}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-success"
                    aria-hidden
                  />
                  Last updated {relativeTime(latestAt)}
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        actions={
          <Link href="/admin/sku-aliases" className="btn btn-sm btn-primary">
            Manage aliases
          </Link>
        }
      />

      {/* iter 18: pill toggle filter controls */}
      <SectionCard title="Filters" density="compact">
        <div className="flex flex-wrap gap-6">
          <PillToggleGroup
            label="Channel"
            options={CHANNEL_OPTIONS}
            value={channelFilter}
            onChange={(v) => setChannelFilter(v)}
          />
          <PillToggleGroup
            label="Status"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
          />
        </div>
      </SectionCard>

      {/* iter 13-17: main audit table */}
      <SectionCard
        title={
          listQuery.isSuccess
            ? `${rows.length} ${rows.length === 1 ? "mapping" : "mappings"}${channelFilter || statusFilter ? " (filtered)" : ""}`
            : "Mappings"
        }
        description={
          channelFilter || statusFilter
            ? `Showing ${channelFilter ? `${channelFilter} ` : ""}${statusFilter ? statusFilter : "all"} aliases.`
            : undefined
        }
        contentClassName="p-0"
      >
        {listQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : listQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load mappings</div>
              <div className="mt-1 text-xs">
                {(listQuery.error as Error).message}
              </div>
              <button
                type="button"
                onClick={() => void listQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            <div>
              {channelFilter || statusFilter
                ? "No mappings found for the selected filters."
                : "No mappings exist yet. Aliases are created when unknown SKUs are observed during integration polling."}
            </div>
            {!channelFilter && !statusFilter ? (
              <Link href="/admin/sku-aliases" className="btn btn-sm mt-3 inline-flex">
                Go to SKU Aliases
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  {/* iter 14: alias_id in monospace small */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Alias ID
                  </th>
                  {/* iter 14: channel badge */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Channel
                  </th>
                  {/* iter 14: external_sku as monospace chip */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    External SKU
                  </th>
                  {/* iter 15: item name + id */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Platform Item
                  </th>
                  {/* iter 16: approval status */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Created
                  </th>
                  {/* iter 17: notes with tooltip */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const item =
                    items.find((i) => i.item_id === row.item_id) ??
                    (row.item_name
                      ? { item_id: row.item_id, item_name: row.item_name }
                      : null);

                  return (
                    <tr
                      key={row.alias_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      {/* iter 14: alias_id monospace small */}
                      <td className="px-3 py-2.5">
                        <span
                          className="font-mono text-3xs text-fg-muted"
                          title={row.alias_id}
                        >
                          {row.alias_id.slice(0, 8)}&hellip;
                        </span>
                      </td>

                      {/* iter 14: channel badge */}
                      <td className="px-3 py-2.5">
                        <ChannelBadge channel={row.source_channel} />
                      </td>

                      {/* iter 14: external_sku monospace chip */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-sm border border-border/60 bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg">
                          {row.external_sku}
                        </span>
                      </td>

                      {/* iter 15: item_name linked + id below */}
                      <td className="px-3 py-2.5">
                        {item ? (
                          <div>
                            <Link
                              href={`/admin/masters/items/${row.item_id}`}
                              className="text-xs font-medium text-fg hover:text-accent"
                            >
                              {item.item_name}
                            </Link>
                            <div className="mt-0.5 font-mono text-3xs text-fg-muted">
                              {row.item_id}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-fg-muted">
                            {row.item_id}
                          </span>
                        )}
                      </td>

                      {/* iter 16: approval status badge */}
                      <td className="px-3 py-2.5">
                        <ApprovalBadge status={row.approval_status} />
                      </td>

                      <td className="px-3 py-2.5">
                        <span
                          className="text-xs text-fg-muted"
                          title={new Date(row.created_at).toLocaleString()}
                        >
                          {relativeTime(row.created_at)}
                        </span>
                      </td>

                      {/* iter 17: notes truncated with tooltip */}
                      <td className="max-w-[180px] px-3 py-2.5">
                        {row.notes ? (
                          <span
                            className="block cursor-default truncate text-xs text-fg-muted"
                            title={row.notes}
                          >
                            {row.notes}
                          </span>
                        ) : (
                          <span className="text-xs text-fg-faint">&mdash;</span>
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
    </>
  );
}
