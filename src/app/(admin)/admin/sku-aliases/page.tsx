"use client";

// ---------------------------------------------------------------------------
// Admin · SKU Aliases — external-SKU → item_id review + batch approval.
//
// Endgame Phase E1-UI (crystalline-drifting-dusk §B.E1):
//
//   Problem: LionWheel (and Shopify) send us external SKUs / item IDs that
//   do not match our canonical items. When the poller receives an unknown
//   SKU/item, it opens an exceptions row:
//     - LionWheel: category='lionwheel_unknown_sku', title='Unknown SKU <sku>'
//     - Shopify:   category='shopify_unmapped_item', title='Unmapped FG item <item_id>'
//
//   This surface lets admin-Tom:
//     1. SEE the list of unmapped external SKUs / items, filtered by channel.
//     2. CHOOSE an internal items.item_id for each.
//     3. BATCH-APPROVE the selected rows via POST /api/integration-sku-map/approve.
//     4. Review the existing ALREADY-APPROVED aliases as a read-only audit list.
//
//   Channel tabs: "LionWheel" (default) | "Shopify". The active channel is
//   URL-backed via ?channel=shopify. The approve mutation accepts
//   source_channel='lionwheel' or 'shopify' verbatim — confirmed in
//   api/src/integration-sku-map/schemas.ts IntegrationSkuMapApproveAliasSchema.
//
// Role gate: admin only.
//
// UX iterations (iters 1-12 of sku-management-redesign):
//   1.  Audit: channel tabs, unmapped list, item picker, batch approve, audit list.
//   2.  Channel tabs: count badge per channel; warning tone when pending > 0.
//   3.  Unmapped summary card "X aliases need approval" with tone by count.
//   4.  Exception row: monospace SKU chip, channel badge, relative timestamp.
//   5.  Item picker: SearchableSelect with item_name + monospace id below.
//   6.  Batch approve: "Approve N selected" button, prominent when selected.
//   7.  Per-row Approve inline action button.
//   8.  Audit list: item_name linked, approval status badge.
//   9.  Client-side search on external_sku and item_name in both lists.
//  10.  Green "All clear" empty state when no unmapped SKUs pending.
//  11.  Channel-specific context note per tab.
//  12.  Page header KPI row: Total / Approved / Pending / Rejected chips.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState, Suspense, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { SearchableSelect } from "@/components/fields/SearchableSelect";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Inline response shapes
// ---------------------------------------------------------------------------

type ListEnvelope<T> = { rows: T[]; count: number };

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved" | "auto_resolved";
  title: string;
  detail: string | null;
  item_id: string | null;
  component_id: string | null;
  emitted_at: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom: string | null;
  family: string | null;
}

interface SkuAliasRow {
  alias_id: string;
  source_channel: "lionwheel" | "shopify" | "green_invoice" | string;
  external_sku: string;
  item_id: string;
  approval_status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
  approved_at: string | null;
}

interface UnmappedSkuRow {
  external_sku: string;
  source_channel: string;
  first_seen_at: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Channel configuration
// ---------------------------------------------------------------------------

type ChannelKey = "lionwheel" | "shopify";

interface ChannelConfig {
  key: ChannelKey;
  label: string;
  exceptionCategory: string;
  externalSkuColumnLabel: string;
  extractSku: (title: string | null | undefined) => string | null;
  contextNote: string;
}

const CHANNEL_CONFIGS: Record<ChannelKey, ChannelConfig> = {
  lionwheel: {
    key: "lionwheel",
    label: "LionWheel",
    exceptionCategory: "lionwheel_unknown_sku",
    externalSkuColumnLabel: "External SKU",
    extractSku: (title) => {
      if (!title) return null;
      const match = title.match(/Unknown SKU (.+)$/);
      return match ? match[1].trim() : null;
    },
    contextNote:
      "LionWheel SKUs appear on order line items. Each unknown SKU here means a customer order contained a product identifier that has no canonical item mapping yet. Approving unblocks planning demand calculations for that product.",
  },
  shopify: {
    key: "shopify",
    label: "Shopify",
    exceptionCategory: "shopify_unmapped_item",
    externalSkuColumnLabel: "Item ID",
    extractSku: (title) => {
      if (!title) return null;
      const match = title.match(/Unmapped FG item (.+)$/);
      return match ? match[1].trim() : null;
    },
    contextNote:
      "Shopify SKUs / product handles appear during finished-goods stock sync. Each unmapped entry means Shopify reported stock for a product whose handle or SKU field doesn't match a canonical item. Approving lets the platform reconcile on-hand counts and detect drift.",
  },
};

function parseChannel(raw: string | null): ChannelKey {
  if (raw === "shopify") return "shopify";
  return "lionwheel";
}

function extractSourceChannel(category: string): string {
  if (category.startsWith("lionwheel_")) return "lionwheel";
  if (category.startsWith("shopify_")) return "shopify";
  if (category.startsWith("gi_") || category.startsWith("green_invoice"))
    return "green_invoice";
  return "unknown";
}

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
// ApprovalBadge
// ---------------------------------------------------------------------------

function ApprovalBadge({
  status,
}: {
  status: "approved" | "pending" | "rejected" | string;
}): JSX.Element {
  if (status === "approved")
    return <Badge tone="success" dotted>Approved</Badge>;
  if (status === "rejected")
    return <Badge tone="danger" dotted>Rejected</Badge>;
  if (status === "pending")
    return <Badge tone="warning" dotted>Pending</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// ChannelBadge
// ---------------------------------------------------------------------------

function ChannelBadge({ channel }: { channel: string }): JSX.Element {
  if (channel === "lionwheel") return <Badge tone="neutral">LionWheel</Badge>;
  if (channel === "shopify") return <Badge tone="info">Shopify</Badge>;
  if (channel === "green_invoice") return <Badge tone="neutral">Green Invoice</Badge>;
  return <Badge tone="neutral">{channel}</Badge>;
}

// ---------------------------------------------------------------------------
// MetricChip — iter 12
// ---------------------------------------------------------------------------

function MetricChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "warning" | "success" | "danger" | "info";
}): JSX.Element {
  const toneClasses: Record<string, string> = {
    neutral: "border-border/60 bg-bg-subtle/60 text-fg-muted",
    warning: "border-warning/40 bg-warning-softer text-warning-fg",
    success: "border-success/40 bg-success-softer text-success-fg",
    danger: "border-danger/40 bg-danger-softer text-danger-fg",
    info: "border-info/40 bg-info-softer text-info-fg",
  };
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-0.5 rounded-md border px-3 py-1.5",
        toneClasses[tone],
      )}
    >
      <span className="text-3xs font-semibold uppercase tracking-sops opacity-80">
        {label}
      </span>
      <span className="text-base font-semibold tabular-nums leading-tight">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClearIcon — small X svg for search clear buttons
// ---------------------------------------------------------------------------

function ClearIcon(): JSX.Element {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface AssignmentState {
  [externalSku: string]: string;
}

interface NotesState {
  [externalSku: string]: string;
}

function AdminSkuAliasesPageInner(): JSX.Element {
  const { session } = useSession();

  if (session.role !== "admin") {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">SKU alias admin surface</div>
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

  return <AdminSkuAliasesContent />;
}

function AdminSkuAliasesContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeChannel = parseChannel(searchParams.get("channel"));
  const channelCfg = CHANNEL_CONFIGS[activeChannel];

  const [assignments, setAssignments] = useState<AssignmentState>({});
  const [notes, setNotes] = useState<NotesState>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [unmappedSearch, setUnmappedSearch] = useState<string>("");
  const [auditSearch, setAuditSearch] = useState<string>("");
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string; detail?: string }
    | null
  >(null);
  const [quickCreateForSku, setQuickCreateForSku] = useState<string | null>(
    null,
  );

  const handleChannelSwitch = (ch: ChannelKey) => {
    if (ch === activeChannel) return;
    setAssignments({});
    setNotes({});
    setSelected(new Set());
    setBanner(null);
    setUnmappedSearch("");
    const params = new URLSearchParams(searchParams.toString());
    if (ch === "lionwheel") {
      params.delete("channel");
    } else {
      params.set("channel", ch);
    }
    const qs = params.toString();
    router.replace(`/admin/sku-aliases${qs ? `?${qs}` : ""}`);
  };

  // ---- Queries ---------------------------------------------------------------

  const exceptionsQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "sku-aliases", "exceptions", activeChannel],
    queryFn: () =>
      fetchJson(
        `/api/exceptions?category=${channelCfg.exceptionCategory}&status=open&limit=500`,
      ),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "sku-aliases", "items"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const approvedQuery = useQuery<ListEnvelope<SkuAliasRow>>({
    queryKey: ["admin", "sku-aliases", "approved"],
    queryFn: () =>
      fetchJson("/api/integration-sku-map?approval_status=approved&limit=500"),
    retry: false,
  });

  const pendingQuery = useQuery<ListEnvelope<SkuAliasRow>>({
    queryKey: ["admin", "sku-aliases", "pending"],
    queryFn: () =>
      fetchJson("/api/integration-sku-map?approval_status=pending&limit=500"),
    retry: false,
  });

  const rejectedQuery = useQuery<ListEnvelope<SkuAliasRow>>({
    queryKey: ["admin", "sku-aliases", "rejected"],
    queryFn: () =>
      fetchJson("/api/integration-sku-map?approval_status=rejected&limit=500"),
    retry: false,
  });

  // iter 2: per-channel exception counts for tab badges
  const lionwheelCountQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "sku-aliases", "exceptions-count", "lionwheel"],
    queryFn: () =>
      fetchJson(
        `/api/exceptions?category=${CHANNEL_CONFIGS.lionwheel.exceptionCategory}&status=open&limit=1`,
      ),
    retry: false,
  });
  const shopifyCountQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "sku-aliases", "exceptions-count", "shopify"],
    queryFn: () =>
      fetchJson(
        `/api/exceptions?category=${CHANNEL_CONFIGS.shopify.exceptionCategory}&status=open&limit=1`,
      ),
    retry: false,
  });

  const channelCounts: Record<ChannelKey, number> = {
    lionwheel: lionwheelCountQuery.data?.count ?? 0,
    shopify: shopifyCountQuery.data?.count ?? 0,
  };

  // ---- Derived state ---------------------------------------------------------

  const unmappedRows = useMemo<UnmappedSkuRow[]>(() => {
    const rows = exceptionsQuery.data?.rows ?? [];
    const byKey = new Map<string, UnmappedSkuRow>();
    for (const r of rows) {
      const sku = channelCfg.extractSku(r.title);
      if (!sku) continue;
      const channel = extractSourceChannel(r.category);
      const key = `${channel}::${sku}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (r.emitted_at < existing.first_seen_at) {
          existing.first_seen_at = r.emitted_at;
        }
      } else {
        byKey.set(key, {
          external_sku: sku,
          source_channel: channel,
          first_seen_at: r.emitted_at,
          count: 1,
        });
      }
    }
    return [...byKey.values()].sort((a, b) =>
      a.external_sku.localeCompare(b.external_sku),
    );
  }, [exceptionsQuery.data, channelCfg]);

  const items = itemsQuery.data?.rows ?? [];

  // iter 5: SearchableSelect options (name primary, id as meta)
  const itemOptions = useMemo(
    () =>
      items.map((it) => ({
        value: it.item_id,
        label: it.item_name,
        meta: it.item_id,
      })),
    [items],
  );

  const approvedRows = approvedQuery.data?.rows ?? [];
  const pendingCount = pendingQuery.data?.count ?? 0;
  const approvedCount = approvedQuery.data?.count ?? approvedRows.length;
  const rejectedCount = rejectedQuery.data?.count ?? 0;
  const totalCount = pendingCount + approvedCount + rejectedCount;

  const backendLive =
    !approvedQuery.isError &&
    !pendingQuery.isError &&
    !rejectedQuery.isError;

  // iter 9: filtered unmapped rows (search on external_sku + assigned item name)
  const filteredUnmapped = useMemo<UnmappedSkuRow[]>(() => {
    if (!unmappedSearch.trim()) return unmappedRows;
    const q = unmappedSearch.trim().toLowerCase();
    return unmappedRows.filter((r) => {
      if (r.external_sku.toLowerCase().includes(q)) return true;
      const assignedId = assignments[r.external_sku];
      if (assignedId) {
        const item = items.find((i) => i.item_id === assignedId);
        if (item && item.item_name.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [unmappedRows, unmappedSearch, assignments, items]);

  // iter 9: filtered audit rows (search on external_sku + item_name)
  const filteredAudit = useMemo<SkuAliasRow[]>(() => {
    if (!auditSearch.trim()) return approvedRows;
    const q = auditSearch.trim().toLowerCase();
    return approvedRows.filter((r) => {
      if (r.external_sku.toLowerCase().includes(q)) return true;
      const item = items.find((i) => i.item_id === r.item_id);
      if (item && item.item_name.toLowerCase().includes(q)) return true;
      if (r.item_id.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [approvedRows, auditSearch, items]);

  // ---- Mutation --------------------------------------------------------------

  interface ApproveResponse {
    approved_aliases: unknown[];
    resolved_exceptions_count: number;
    idempotent_replay: boolean;
    submission_id: string;
  }

  const approveMutation = useMutation<
    ApproveResponse | null,
    Error,
    Array<{
      source_channel: string;
      external_sku: string;
      item_id: string;
      notes: string | null;
    }>
  >({
    mutationFn: async (rows) => {
      const res = await fetch("/api/integration-sku-map/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          aliases: rows,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ??
            "Could not approve aliases. Check your connection and try again.",
        );
      }
      return body as ApproveResponse | null;
    },
    onSuccess: (data, rows) => {
      const resolvedCount = data?.resolved_exceptions_count ?? 0;
      const aliasWord = rows.length === 1 ? "alias" : "aliases";
      setBanner({
        kind: "success",
        message: `${rows.length} ${aliasWord} approved. ${resolvedCount} ${channelCfg.label} exception${resolvedCount === 1 ? "" : "s"} resolved.`,
        detail:
          resolvedCount < rows.length
            ? "Remaining exceptions stay open if no matching records were found for those SKUs."
            : "All matching exceptions resolved. Refresh in ~30s to confirm.",
      });
      setSelected(new Set());
      setAssignments({});
      setNotes({});
      void queryClient.invalidateQueries({
        queryKey: ["admin", "sku-aliases"],
      });
    },
    onError: (err) => {
      setBanner({
        kind: "error",
        message: "Batch approval failed.",
        detail: err.message,
      });
    },
  });

  const queryClient = useQueryClient();

  // ---- Handlers --------------------------------------------------------------

  const toggleRow = (externalSku: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalSku)) next.delete(externalSku);
      else next.add(externalSku);
      return next;
    });
  };

  const selectAllWithAssignment = () => {
    const next = new Set<string>();
    for (const row of unmappedRows) {
      if (assignments[row.external_sku]) next.add(row.external_sku);
    }
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());

  const handleApprove = () => {
    setBanner(null);
    const payload: Array<{
      source_channel: string;
      external_sku: string;
      item_id: string;
      notes: string | null;
    }> = [];
    for (const row of unmappedRows) {
      if (!selected.has(row.external_sku)) continue;
      const itemId = assignments[row.external_sku];
      if (!itemId) continue;
      payload.push({
        source_channel: row.source_channel,
        external_sku: row.external_sku,
        item_id: itemId,
        notes: notes[row.external_sku]?.trim() ?? "",
      });
    }
    if (payload.length === 0) {
      setBanner({
        kind: "error",
        message:
          "Select at least one row with an item assignment to approve.",
      });
      return;
    }
    approveMutation.mutate(payload);
  };

  // ---- Render ----------------------------------------------------------------

  const loadingExceptions = exceptionsQuery.isLoading;
  const loadingItems = itemsQuery.isLoading;
  const exceptionsError = exceptionsQuery.error as Error | null;

  const canApprove =
    selected.size > 0 &&
    [...selected].every((sku) => Boolean(assignments[sku])) &&
    !approveMutation.isPending;

  return (
    <>
      {/* iter 12: page header KPI row */}
      <WorkflowHeader
        eyebrow="Admin · SKU aliases"
        title="External SKU → Item mapping"
        description="Map external SKUs observed in LionWheel and Shopify to canonical items. Approved aliases unblock planning demand calculations and FG stock sync."
        meta={
          <div className="flex flex-wrap gap-2">
            <MetricChip
              label="Total aliases"
              value={totalCount}
              tone="neutral"
            />
            <MetricChip
              label="Approved"
              value={approvedCount}
              tone="success"
            />
            <MetricChip
              label="Pending"
              value={pendingCount}
              tone={pendingCount > 0 ? "warning" : "neutral"}
            />
            <MetricChip
              label="Rejected"
              value={rejectedCount}
              tone={rejectedCount > 0 ? "danger" : "neutral"}
            />
            {unmappedRows.length > 0 ? (
              <MetricChip
                label="Unmapped (open)"
                value={unmappedRows.length}
                tone="warning"
              />
            ) : null}
          </div>
        }
      />

      {/* iter 2: channel tabs with count badge */}
      <div className="flex gap-1 border-b border-border/60">
        {(["lionwheel", "shopify"] as ChannelKey[]).map((ch) => {
          const cfg = CHANNEL_CONFIGS[ch];
          const isActive = activeChannel === ch;
          const pendingForChannel = channelCounts[ch];
          return (
            <button
              key={ch}
              type="button"
              onClick={() => handleChannelSwitch(ch)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 -mb-px outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-sm",
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              <span>{cfg.label}</span>
              <span
                className={cn(
                  "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border px-1.5 text-3xs font-semibold leading-none",
                  pendingForChannel > 0
                    ? "border-warning/40 bg-warning-softer text-warning-fg"
                    : "border-border/40 bg-bg-subtle text-fg-muted",
                )}
                title={`${pendingForChannel} pending exceptions`}
              >
                {pendingForChannel}
              </span>
            </button>
          );
        })}
      </div>

      {/* iter 11: channel-specific context note */}
      <div className="rounded-md border border-info/30 bg-info-softer/50 px-4 py-2.5 text-xs text-info-fg">
        <span className="font-semibold">{channelCfg.label} — </span>
        {channelCfg.contextNote}
      </div>

      {banner ? (
        <div
          className={cn(
            "rounded-md border p-4 text-sm",
            banner.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-danger/40 bg-danger-softer text-danger-fg",
          )}
        >
          <div className="font-semibold">{banner.message}</div>
          {banner.detail ? (
            <div className="mt-1 text-xs opacity-80">{banner.detail}</div>
          ) : null}
        </div>
      ) : null}

      {!backendLive ? (
        <SectionCard
          tone="warning"
          title="Alias approval not yet available"
          density="compact"
        >
          <p className="text-xs text-fg-muted">
            The approved-alias list and approval submission are not yet live.
            The unmapped SKU view below is available and you can review
            exceptions, but approvals cannot be submitted yet.
          </p>
        </SectionCard>
      ) : null}

      {/* iter 3: unmapped summary card / iter 10: all-clear empty state */}
      {!loadingExceptions && !exceptionsError ? (
        unmappedRows.length === 0 ? (
          <div className="rounded-md border border-success/40 bg-success-softer px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full bg-success"
                aria-hidden
              />
              <div>
                <div className="text-sm font-semibold text-success-fg">
                  All clear — no unmapped {channelCfg.label} SKUs pending
                  approval.
                </div>
                <div className="mt-0.5 text-xs text-success-fg/80">
                  Every {channelCfg.label} SKU observed so far has an approved
                  alias.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-md border px-5 py-4",
              unmappedRows.length >= 10
                ? "border-danger/40 bg-danger-softer"
                : "border-warning/40 bg-warning-softer",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-block h-2.5 w-2.5 rounded-full",
                    unmappedRows.length >= 10 ? "bg-danger" : "bg-warning",
                  )}
                  aria-hidden
                />
                <div>
                  <div
                    className={cn(
                      "text-sm font-semibold",
                      unmappedRows.length >= 10
                        ? "text-danger-fg"
                        : "text-warning-fg",
                    )}
                  >
                    {unmappedRows.length}{" "}
                    {unmappedRows.length === 1 ? "alias needs" : "aliases need"}{" "}
                    approval
                  </div>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    Assign each external SKU to an internal item, then select
                    rows and click Approve.
                  </div>
                </div>
              </div>
              {selected.size > 0 ? (
                <span className="text-xs text-fg-muted">
                  {selected.size} selected
                </span>
              ) : null}
            </div>
          </div>
        )
      ) : null}

      {/* Unmapped external SKUs table */}
      <SectionCard
        eyebrow={`Step 1 · ${channelCfg.label}`}
        title="Unmapped external SKUs"
        contentClassName="p-0"
        actions={
          unmappedRows.length > 0 ? (
            <div className="relative">
              <input
                type="text"
                className="input h-8 pl-3 pr-8 text-xs w-48"
                placeholder="Search SKU or item name…"
                value={unmappedSearch}
                onChange={(e) => setUnmappedSearch(e.target.value)}
                aria-label="Search unmapped SKUs"
              />
              {unmappedSearch ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                  onClick={() => setUnmappedSearch("")}
                  aria-label="Clear search"
                >
                  <ClearIcon />
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {loadingExceptions ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-10 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : exceptionsError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">
                Could not load {channelCfg.label} exceptions
              </div>
              <div className="mt-1 text-xs">{exceptionsError.message}</div>
              <button
                type="button"
                onClick={() => void exceptionsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : unmappedRows.length === 0 ? null : filteredUnmapped.length ===
          0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No unmapped SKUs match &ldquo;{unmappedSearch}&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th scope="col" className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select rows with assignments"
                      checked={
                        selected.size > 0 &&
                        selected.size ===
                          unmappedRows.filter(
                            (r) => assignments[r.external_sku],
                          ).length
                      }
                      onChange={(e) => {
                        if (e.target.checked) selectAllWithAssignment();
                        else clearSelection();
                      }}
                    />
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    {channelCfg.externalSkuColumnLabel}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Channel
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    First seen
                  </th>
                  <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Occurrences
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Assign to item
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Notes
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUnmapped.map((row) => {
                  const assigned = assignments[row.external_sku] ?? "";
                  const note = notes[row.external_sku] ?? "";
                  const isSelected = selected.has(row.external_sku);
                  const canSelect = Boolean(assigned);
                  return (
                    <tr
                      key={`${row.source_channel}::${row.external_sku}`}
                      className={cn(
                        "border-b border-border/40 last:border-b-0",
                        isSelected
                          ? "bg-accent-soft/30"
                          : "hover:bg-bg-subtle/40",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={isSelected}
                          onChange={() => toggleRow(row.external_sku)}
                          aria-label={`Select ${row.external_sku}`}
                        />
                      </td>
                      {/* iter 4: monospace SKU chip */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-sm border border-border/60 bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg">
                          {row.external_sku}
                        </span>
                      </td>
                      {/* iter 4: channel badge */}
                      <td className="px-3 py-2.5">
                        <ChannelBadge channel={row.source_channel} />
                      </td>
                      {/* iter 4: relative timestamp */}
                      <td className="px-3 py-2.5">
                        <span
                          className="text-xs text-fg-muted"
                          title={new Date(row.first_seen_at).toLocaleString()}
                        >
                          {relativeTime(row.first_seen_at)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-fg-muted">
                        {row.count}
                      </td>
                      {/* iter 5: SearchableSelect with item_name + monospace id */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {loadingItems ? (
                            <div className="input flex h-9 min-w-[220px] items-center text-xs text-fg-muted opacity-60">
                              Loading items…
                            </div>
                          ) : (
                            <div className="min-w-[260px]">
                              <SearchableSelect
                                value={assigned}
                                onChange={(v) => {
                                  setAssignments((prev) => ({
                                    ...prev,
                                    [row.external_sku]: v,
                                  }));
                                  if (!v && isSelected) {
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      next.delete(row.external_sku);
                                      return next;
                                    });
                                  }
                                }}
                                options={itemOptions}
                                placeholder="— choose item —"
                                searchPlaceholder="Search by name or ID…"
                                emptyMessage="No items match"
                                ariaLabel={`Assign item for ${row.external_sku}`}
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm shrink-0 px-2 text-base font-bold leading-none"
                            title="Create a new item and assign to this row"
                            aria-label="Create new item"
                            onClick={() =>
                              setQuickCreateForSku(row.external_sku)
                            }
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          className="input min-w-[140px] text-xs"
                          placeholder="optional"
                          value={note}
                          onChange={(e) =>
                            setNotes((prev) => ({
                              ...prev,
                              [row.external_sku]: e.target.value,
                            }))
                          }
                        />
                      </td>
                      {/* iter 7: per-row Approve action */}
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!backendLive || !canSelect || approveMutation.isPending}
                          onClick={() => {
                            if (!backendLive || !canSelect) return;
                            setBanner(null);
                            approveMutation.mutate([
                              {
                                source_channel: row.source_channel,
                                external_sku: row.external_sku,
                                item_id: assigned,
                                notes: note.trim() || null,
                              },
                            ]);
                          }}
                          title={
                            !backendLive
                              ? "Alias approval is not yet available"
                              : canSelect
                                ? "Approve this mapping"
                                : "Assign an item first"
                          }
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* iter 6: batch approve action bar */}
      {unmappedRows.length > 0 ? (
        <SectionCard
          eyebrow="Step 2"
          title={`Batch approve (${selected.size} selected)`}
          description="Approving links each selected SKU to its assigned item and clears any matching open alerts automatically."
          density="compact"
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={cn(
                "btn-primary disabled:cursor-not-allowed disabled:opacity-50",
                canApprove && backendLive ? "ring-2 ring-accent/30 ring-offset-1" : "",
              )}
              disabled={!backendLive || !canApprove}
              onClick={handleApprove}
              title={
                !backendLive ? "Alias approval is not yet available" : undefined
              }
            >
              {approveMutation.isPending
                ? "Approving…"
                : selected.size > 0
                  ? `Approve ${selected.size} selected`
                  : "Approve selected"}
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={selectAllWithAssignment}
              disabled={unmappedRows.every(
                (r) => !assignments[r.external_sku],
              )}
            >
              Select all with assignment
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={clearSelection}
              disabled={selected.size === 0}
            >
              Clear selection
            </button>
            <div className="text-xs text-fg-muted">
              Rows without an item assignment cannot be selected.
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* iter 8: audit list with item_name + approval status badge */}
      <SectionCard
        eyebrow="Audit"
        title={`Approved aliases (${approvedCount})`}
        description="Approved aliases are read-only. Contact your system administrator to reject or modify an existing alias."
        contentClassName="p-0"
        actions={
          approvedRows.length > 0 ? (
            <div className="relative">
              <input
                type="text"
                className="input h-8 pl-3 pr-8 text-xs w-48"
                placeholder="Search SKU or item…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                aria-label="Search approved aliases"
              />
              {auditSearch ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                  onClick={() => setAuditSearch("")}
                  aria-label="Clear search"
                >
                  <ClearIcon />
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {approvedQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : approvedQuery.isError ? (
          <div className="p-5 text-sm text-fg-muted">
            Approved aliases are not yet available. The alias list will appear
            here once the backend endpoint is live.
          </div>
        ) : approvedRows.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No approved aliases yet. Approve some rows above to populate this
            list.
          </div>
        ) : filteredAudit.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No approved aliases match &ldquo;{auditSearch}&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    External SKU
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Channel
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Approved
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.map((r) => {
                  const item = items.find((i) => i.item_id === r.item_id);
                  return (
                    <tr
                      key={r.alias_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-sm border border-border/60 bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg">
                          {r.external_sku}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ChannelBadge channel={r.source_channel} />
                      </td>
                      {/* iter 8: item_name linked + monospace id */}
                      <td className="px-3 py-2.5">
                        {item ? (
                          <div>
                            <Link
                              href={`/admin/masters/items/${r.item_id}`}
                              className="text-xs font-medium text-fg hover:text-accent"
                            >
                              {item.item_name}
                            </Link>
                            <div className="mt-0.5 font-mono text-3xs text-fg-muted">
                              {r.item_id}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-fg-muted">
                            {r.item_id}
                          </span>
                        )}
                      </td>
                      {/* iter 8: approval status badge */}
                      <td className="px-3 py-2.5">
                        <ApprovalBadge status={r.approval_status} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="text-xs text-fg-muted"
                          title={
                            r.approved_at
                              ? new Date(r.approved_at).toLocaleString()
                              : undefined
                          }
                        >
                          {r.approved_at ? relativeTime(r.approved_at) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-fg-muted">
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {quickCreateForSku !== null ? (
        <QuickCreateItemModal
          externalSku={quickCreateForSku}
          onClose={() => setQuickCreateForSku(null)}
          onCreated={(newItemId) => {
            setAssignments((prev) => ({
              ...prev,
              [quickCreateForSku]: newItemId,
            }));
            setSelected((prev) => {
              const next = new Set(prev);
              next.add(quickCreateForSku);
              return next;
            });
            void queryClient.invalidateQueries({
              queryKey: ["admin", "sku-aliases", "items"],
            });
            setQuickCreateForSku(null);
            setBanner({
              kind: "success",
              message: `New item created and assigned to SKU ${quickCreateForSku}. Click Approve to confirm the mapping.`,
            });
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// QuickCreateItemModal
// ---------------------------------------------------------------------------

const SUPPLY_METHODS = ["BOUGHT_FINISHED", "MANUFACTURED", "REPACK"] as const;
type SupplyMethod = (typeof SUPPLY_METHODS)[number];

// Human-readable labels for the supply-method select — never show the raw enum
// value to the operator (portal_ux_standard §1).
const SUPPLY_METHOD_LABELS: Record<SupplyMethod, string> = {
  BOUGHT_FINISHED: "Purchased / ready-made",
  MANUFACTURED: "Manufactured in-house",
  REPACK: "Repack",
};

const COMMON_SALES_UOMS = ["EACH", "BOTTLE", "CAN", "BOX", "PACK"] as const;

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function QuickCreateItemModal({
  externalSku,
  onClose,
  onCreated,
}: {
  externalSku: string;
  onClose: () => void;
  onCreated: (newItemId: string) => void;
}): JSX.Element {
  const [itemId, setItemId] = useState<string>(externalSku);
  const [itemName, setItemName] = useState<string>("");
  const [supplyMethod, setSupplyMethod] =
    useState<SupplyMethod>("BOUGHT_FINISHED");
  const [salesUom, setSalesUom] = useState<string>("EACH");
  const [family, setFamily] = useState<string>("");
  const [casePack, setCasePack] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !submitting &&
    itemId.trim().length > 0 &&
    itemName.trim().length > 0 &&
    salesUom.trim().length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        idempotency_key: randomIdempotencyKey(),
        item_id: itemId.trim(),
        item_name: itemName.trim(),
        supply_method: supplyMethod,
        sales_uom: salesUom.trim(),
      };
      if (family.trim()) body.family = family.trim();
      if (casePack.trim()) {
        const n = Number(casePack);
        if (Number.isFinite(n) && n > 0) body.case_pack = n;
      }
      const res = await fetch("/api/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `Error (HTTP ${res.status})`;
        try {
          const json = JSON.parse(text);
          if (
            Array.isArray(json?.validation_errors) &&
            json.validation_errors.length > 0
          ) {
            message = json.validation_errors
              .map((v: { path?: unknown[]; message?: string }) => {
                const path = Array.isArray(v.path) ? v.path.join(".") : "";
                return path
                  ? `${path}: ${v.message ?? ""}`.trim()
                  : (v.message ?? "");
              })
              .filter(Boolean)
              .join(" · ");
          } else if (typeof json?.detail === "string") {
            message = json.detail;
          } else if (typeof json?.message === "string") {
            message = json.message;
          } else if (typeof json?.error === "string") {
            message = json.error;
          } else if (typeof json?.reason_code === "string") {
            message = `${json.reason_code}${json.detail ? `: ${json.detail}` : ""}`;
          }
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }
      onCreated(itemId.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitting, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create new item"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-fg-strong">
              Create new item
            </div>
            <div className="mt-0.5 text-xs text-fg-muted">
              Will be created in the items master and auto-assigned to SKU{" "}
              <span className="font-mono text-fg">{externalSku}</span>.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Item ID <span className="text-danger">*</span>
            </span>
            <input
              className="input font-mono"
              value={itemId}
              onChange={(e) => setItemId(e.target.value.trim())}
              placeholder="GT-XXX-YYY-ZZZ"
              dir="ltr"
              autoFocus
              required
            />
            <span className="mt-1 block text-3xs text-fg-subtle">
              Unique identifier. Defaults to the external SKU value.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Item name <span className="text-danger">*</span>
            </span>
            <input
              className="input"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Matcha Cup 600ml"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Supply type <span className="text-danger">*</span>
              </span>
              <select
                className="input"
                value={supplyMethod}
                onChange={(e) =>
                  setSupplyMethod(e.target.value as SupplyMethod)
                }
              >
                {SUPPLY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {SUPPLY_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-3xs text-fg-subtle">
                &ldquo;Purchased / ready-made&rdquo; is correct for most items
                sourced externally.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Sales unit <span className="text-danger">*</span>
              </span>
              <input
                className="input font-mono"
                list="quick-create-uom-list"
                value={salesUom}
                onChange={(e) =>
                  setSalesUom(e.target.value.trim().toUpperCase())
                }
                placeholder="EACH"
                dir="ltr"
                required
              />
              <datalist id="quick-create-uom-list">
                {COMMON_SALES_UOMS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                family
              </span>
              <input
                className="input"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="optional"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Case pack
              </span>
              <input
                className="input tabular-nums"
                type="number"
                min="1"
                value={casePack}
                onChange={(e) => setCasePack(e.target.value)}
                placeholder="optional"
                dir="ltr"
              />
            </label>
          </div>

          {error ? (
            <div className="rounded-md border border-danger/40 bg-danger-softer p-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={!canSubmit}
            >
              {submitting ? "Creating…" : "Create and assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminSkuAliasesPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-fg-muted">Loading…</div>}>
      <AdminSkuAliasesPageInner />
    </Suspense>
  );
}
