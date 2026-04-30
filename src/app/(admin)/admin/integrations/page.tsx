"use client";

// ---------------------------------------------------------------------------
// Admin · Integration Health
//
// Two sections:
//
//   1. SHOPIFY SYNC STATUS — live read from
//      GET /api/shopify/sync-status (proxied to W1's
//      GET /api/v1/queries/shopify/sync-status). Shows last sync times,
//      per-cycle write breakdown (ok / unmapped / errors), lifetime totals,
//      and a status badge. Includes a "Map SKU aliases →" deep-link.
//
//   2. INTEGRATION HEALTH CARDS — one card per integration (LionWheel,
//      Shopify, Green Invoice, Freshness/Heartbeat) derived from open
//      exceptions. Same logic as before.
//
// Role gate: admin only (admin layout enforces this).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExRow {
  exception_id: string;
  category: string;
  severity: string;
  title: string;
  created_at: string;
}

interface ShopifySyncStatus {
  // Latest cycle
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_item_count: number | null;
  last_sync_writes_ok: number | null;
  last_sync_writes_failed: number | null;
  // Per-cycle breakdown from shopify_fg_sync_history
  unmapped_count: number | null;
  ok_count: number | null;
  error_count: number | null;
  latest_cycle_at: string | null;
  // Lifetime totals
  lifetime_writes_ok: number | null;
  lifetime_writes_failed: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string | null): string {
  if (!isoString) return "never";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function utcLabel(isoString: string | null): string {
  if (!isoString) return "—";
  return new Date(isoString).toUTCString().replace(/ GMT$/, " UTC");
}

// ---------------------------------------------------------------------------
// Integration health card definitions
// ---------------------------------------------------------------------------

const INTEGRATIONS = [
  {
    key: "lionwheel",
    label: "LionWheel",
    categories: [
      "lionwheel_unknown_sku",
      "lionwheel_schema_drift",
      "lionwheel_auth_failure",
      "lionwheel_stale",
    ],
  },
  {
    key: "shopify",
    label: "Shopify",
    categories: [
      "shopify_unmapped_item",
      "shopify_drift",
      "shopify_auth_failure",
      "shopify_network_failure",
      "shopify_stale",
    ],
  },
  {
    key: "green_invoice",
    label: "Green Invoice",
    categories: ["gi_unmapped_supplier", "gi_non_ils_currency", "gi_stale"],
  },
  {
    key: "freshness",
    label: "Freshness / Heartbeat",
    categories: ["freshness_heartbeat", "stale_integration"],
  },
];

// ---------------------------------------------------------------------------
// Shopify sync status card
// ---------------------------------------------------------------------------

function ShopifySyncStatusCard() {
  const { data, isLoading, isError, error } = useQuery<ShopifySyncStatus>({
    queryKey: ["admin", "shopify", "sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/shopify/sync-status");
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error("Could not load sync status. Check your connection and try refreshing.");
      }
      return (await res.json()) as ShopifySyncStatus;
    },
    staleTime: 30_000,
    retry: false,
  });

  // Derive status badge
  function deriveBadge(): { tone: "success" | "warning" | "danger"; label: string } {
    if (!data) return { tone: "warning", label: "Unknown" };
    const { ok_count, unmapped_count, error_count } = data;
    if ((error_count ?? 0) > 0) return { tone: "danger", label: "Sync errors" };
    if ((ok_count ?? 0) > 0) return { tone: "success", label: "Syncing" };
    if ((unmapped_count ?? 0) > 0)
      return { tone: "warning", label: "No aliases mapped — all items skipped" };
    return { tone: "warning", label: "No data" };
  }

  const badge = deriveBadge();

  return (
    <SectionCard
      eyebrow="Integration"
      title="Shopify FG Sync"
      description="One-way push from platform stock projections to Shopify inventory. Platform is authoritative on disagreement."
    >
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="h-5 w-20 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 w-32 animate-pulse rounded bg-bg-subtle" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-12 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-12 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
          <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
        </div>
      )}

      {isError && (
        <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <div className="font-semibold">Could not load Shopify sync status</div>
          <div className="mt-1 text-xs">
            {error instanceof Error ? error.message : String(error)}
          </div>
          <div className="mt-1 text-xs text-fg-muted">
            The sync status endpoint may be unavailable. The integration itself may still be running — check the Jobs Monitor.
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href="/admin/sku-aliases?channel=shopify"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              Map SKU aliases →
            </Link>
            <Link
              href="/admin/jobs"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              Open Jobs Monitor →
            </Link>
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Status badge + link */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={badge.tone} dotted>
              {badge.label}
            </Badge>
            <Link
              href="/admin/sku-aliases?channel=shopify"
              className="text-sm text-accent underline-offset-4 hover:underline"
            >
              Map SKU aliases →
            </Link>
          </div>

          {/* Sync times */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Last sync
              </div>
              <div className="mt-0.5 text-sm text-fg">
                {timeAgo(data.last_sync_at)}
              </div>
              <div className="text-xs text-fg-muted">{utcLabel(data.last_sync_at)}</div>
            </div>
            <div>
              <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Last successful sync
              </div>
              <div className="mt-0.5 text-sm text-fg">
                {timeAgo(data.last_successful_sync_at)}
              </div>
              <div className="text-xs text-fg-muted">
                {utcLabel(data.last_successful_sync_at)}
              </div>
            </div>
          </div>

          {/* This-cycle breakdown */}
          <div>
            <div className="mb-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Items this cycle
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-success-fg font-mono tabular-nums">
                {data.ok_count ?? 0} synced
              </span>
              <span className="text-warning-fg font-mono tabular-nums">
                {data.unmapped_count ?? 0} unmapped
              </span>
              <span
                className={
                  (data.error_count ?? 0) > 0
                    ? "text-danger-fg font-mono tabular-nums"
                    : "text-fg-muted font-mono tabular-nums"
                }
              >
                {data.error_count ?? 0} errors
              </span>
              <span className="text-fg-muted font-mono tabular-nums">
                {data.last_sync_item_count ?? 0} total scanned
              </span>
            </div>
          </div>

          {/* Lifetime totals */}
          <div>
            <div className="mb-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Lifetime totals
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-fg font-mono tabular-nums">
                {data.lifetime_writes_ok ?? 0} total writes
              </span>
              <span
                className={
                  (data.lifetime_writes_failed ?? 0) > 0
                    ? "text-danger-fg font-mono tabular-nums"
                    : "text-fg-muted font-mono tabular-nums"
                }
              >
                {data.lifetime_writes_failed ?? 0} failed
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Always show the alias link even when data is loading/error */}
      {!data && !isLoading && (
        <div className="mt-3">
          <Link
            href="/admin/sku-aliases?channel=shopify"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Map SKU aliases →
          </Link>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminIntegrationsPage() {
  const { data = [], isLoading } = useQuery<ExRow[]>({
    queryKey: ["exceptions-all-open"],
    queryFn: async () => {
      const res = await fetch("/api/exceptions?statuses=open,acknowledged");
      if (!res.ok) throw new Error("Failed to load exceptions");
      const d = await res.json();
      return (d.rows ?? []) as ExRow[];
    },
    staleTime: 30_000,
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin"
        title="Integration Health"
        description="Sync status and open exceptions for all live integrations."
      />

      {/* Shopify sync-status card */}
      <ShopifySyncStatusCard />

      {/* Per-integration exception health cards */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded border border-border/40 bg-bg-subtle"
            />
          ))}
        </div>
      )}
      {!isLoading && INTEGRATIONS.map((intg) => {
        const relevant = data.filter((e) =>
          intg.categories.includes(e.category),
        );
        const criticalCount = relevant.filter((e) => e.severity === "critical").length;
        const warningCount = relevant.filter((e) => e.severity === "warning").length;
        // Derive a 4-state pill per S7 research §A: Active / Stale / Error / Disabled.
        // Without a real auth/last-sync feed for non-Shopify integrations we
        // approximate via exception severity: critical → Error, stale_*
        // category present → Stale, otherwise Active.
        const hasStale = relevant.some((e) => e.category.endsWith("_stale"));
        const statusTone =
          criticalCount > 0
            ? ("danger" as const)
            : hasStale
              ? ("warning" as const)
              : warningCount > 0
                ? ("warning" as const)
                : ("success" as const);
        const statusLabel =
          criticalCount > 0
            ? "Error"
            : hasStale
              ? "Stale"
              : warningCount > 0
                ? "Warning"
                : "Active";

        // Newest exception age — proxy for "last event".
        const newest = relevant
          .map((e) => (e.created_at ? new Date(e.created_at).getTime() : 0))
          .filter((t) => t > 0)
          .sort((a, b) => b - a)[0];
        const newestAgo = newest ? timeAgo(new Date(newest).toISOString()) : null;

        // Per-integration deep-links into the inbox with category prefilter.
        const inboxHref = `/inbox?view=exceptions&category=${intg.categories.join(",")}`;

        return (
          <SectionCard
            key={intg.key}
            eyebrow="Integration"
            title={intg.label}
            density="compact"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={statusTone} dotted>
                {statusLabel}
              </Badge>
              <span className="text-xs text-fg-muted">
                {relevant.length === 0
                  ? "No open exceptions"
                  : `${relevant.length} open · ${criticalCount} crit · ${warningCount} warn`}
              </span>
              {newestAgo ? (
                <span className="text-xs text-fg-muted" title={`Newest open exception ${newestAgo}`}>
                  · last event {newestAgo}
                </span>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {(intg.key === "shopify" || intg.key === "lionwheel") && (
                  <Link
                    href={
                      intg.key === "shopify"
                        ? "/admin/sku-aliases?channel=shopify"
                        : "/admin/sku-aliases"
                    }
                    className="btn btn-ghost btn-sm"
                  >
                    Map aliases →
                  </Link>
                )}
                {relevant.length > 0 ? (
                  <Link
                    href={inboxHref}
                    className="btn btn-ghost btn-sm"
                    data-testid={`integration-card-${intg.key}-inbox`}
                  >
                    Triage in inbox →
                  </Link>
                ) : null}
              </div>
            </div>
            {relevant.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {relevant.slice(0, 3).map((e) => {
                  const tone =
                    e.severity === "critical"
                      ? "text-danger-fg"
                      : e.severity === "warning"
                        ? "text-warning-fg"
                        : "text-fg-muted";
                  return (
                    <li key={e.exception_id} className={tone}>
                      <span className="font-mono opacity-70">
                        {e.category}
                      </span>{" "}
                      — {e.title}{" "}
                      <span className="opacity-50">
                        ({e.created_at ? timeAgo(e.created_at) : "—"})
                      </span>
                    </li>
                  );
                })}
                {relevant.length > 3 && (
                  <li className="text-fg-faint">
                    +{relevant.length - 3} more —{" "}
                    <Link href={inboxHref} className="underline">
                      view all
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </>
  );
}
