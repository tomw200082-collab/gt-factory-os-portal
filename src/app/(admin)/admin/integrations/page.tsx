"use client";

// ---------------------------------------------------------------------------
// Admin · Integration Health (iters 6-10)
//
//   6. Audit — integration cards, sync status fields, freshness indicators.
//   7. Per-integration health card — name/badge, connection status, last sync,
//      last sync counts.
//   8. Freshness warnings — card border turns warning/danger on stale/never.
//   9. Shopify — color-coded writes breakdown + lifetime totals.
//  10. Overall health banner — "All healthy" or "X need attention" with links.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, RefreshCw, Zap } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";

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
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_item_count: number | null;
  last_sync_writes_ok: number | null;
  last_sync_writes_failed: number | null;
  unmapped_count: number | null;
  ok_count: number | null;
  error_count: number | null;
  latest_cycle_at: string | null;
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
// Integration definitions
// ---------------------------------------------------------------------------

const INTEGRATIONS = [
  {
    key: "lionwheel",
    label: "LionWheel",
    description: "Open orders and shipment state mirror.",
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
    description: "FG stock sync target. Platform is authoritative on disagreement.",
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
    description: "Supplier invoice evidence and price history.",
    categories: ["gi_unmapped_supplier", "gi_non_ils_currency", "gi_stale"],
  },
  {
    key: "freshness",
    label: "Freshness / Heartbeat",
    description: "Stale-integration heartbeat checks.",
    categories: ["freshness_heartbeat", "stale_integration"],
  },
] as const;

type IntegrationKey = (typeof INTEGRATIONS)[number]["key"];
type CardTone = "success" | "warning" | "danger";

// ---------------------------------------------------------------------------
// Iter 10 — Overall health banner
// ---------------------------------------------------------------------------

interface HealthBannerProps {
  integrationStatuses: Array<{ key: IntegrationKey; label: string; tone: CardTone }>;
}

function OverallHealthBanner({ integrationStatuses }: HealthBannerProps) {
  const problemCount = integrationStatuses.filter((s) => s.tone !== "success").length;

  if (problemCount === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success-softer p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-fg-inverted">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
        </div>
        <div>
          <div className="text-sm font-semibold text-success-fg">All integrations healthy</div>
          <div className="text-xs text-fg-muted">No open exceptions or stale syncs detected.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-softer p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning text-fg-inverted">
          <AlertOctagon className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="text-sm font-semibold text-warning-fg">
          {problemCount} integration{problemCount === 1 ? "" : "s"} need attention
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-11">
        {integrationStatuses
          .filter((s) => s.tone !== "success")
          .map((s) => (
            <a
              key={s.key}
              href={`#integration-${s.key}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline",
                s.tone === "danger"
                  ? "border-danger/40 bg-danger-softer text-danger-fg"
                  : "border-warning/40 bg-warning-softer/60 text-warning-fg",
              )}
            >
              <Zap className="h-3 w-3" strokeWidth={2} />
              {s.label}
            </a>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iter 7/8 — Per-integration health card
// ---------------------------------------------------------------------------

interface IntegrationCardProps {
  intgKey: IntegrationKey;
  label: string;
  description: string;
  categories: readonly string[];
  relevant: ExRow[];
}

function IntegrationHealthCard({
  intgKey,
  label,
  description,
  categories,
  relevant,
}: IntegrationCardProps) {
  const criticalCount = relevant.filter((e) => e.severity === "critical").length;
  const warningCount = relevant.filter((e) => e.severity === "warning").length;
  const hasStale = relevant.some((e) => e.category.endsWith("_stale"));

  const tone: CardTone =
    criticalCount > 0 ? "danger" : hasStale || warningCount > 0 ? "warning" : "success";
  const statusLabel =
    tone === "danger"
      ? "Error"
      : tone === "warning"
        ? hasStale
          ? "Stale"
          : "Warning"
        : "Active";

  const newest = relevant
    .map((e) => (e.created_at ? new Date(e.created_at).getTime() : 0))
    .filter((t) => t > 0)
    .sort((a, b) => b - a)[0];
  const newestAgo = newest ? timeAgo(new Date(newest).toISOString()) : null;

  const inboxHref = `/inbox?view=exceptions&category=${categories.join(",")}`;

  const sectionTone: "default" | "warning" | "danger" | "info" | "success" =
    tone === "danger" ? "danger" : tone === "warning" ? "warning" : "success";

  return (
    <SectionCard
      eyebrow="Integration"
      title={label}
      description={description}
      tone={sectionTone}
      density="compact"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {(intgKey === "shopify" || intgKey === "lionwheel") && (
            <Link
              href={intgKey === "shopify" ? "/admin/sku-aliases?channel=shopify" : "/admin/sku-aliases"}
              className="btn btn-ghost btn-sm"
            >
              Map aliases →
            </Link>
          )}
          {relevant.length > 0 && (
            <Link
              href={inboxHref}
              className="btn btn-ghost btn-sm"
              data-testid={`integration-card-${intgKey}-inbox`}
            >
              Triage in inbox →
            </Link>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone} dotted>
          {statusLabel}
        </Badge>
        {relevant.length === 0 ? (
          <span className="text-xs text-fg-muted">No open exceptions</span>
        ) : (
          <span className="text-xs text-fg-muted">
            {relevant.length} open · {criticalCount} critical · {warningCount} warning
          </span>
        )}
        {newestAgo && (
          <span className="text-xs text-fg-muted" title={`Newest open exception ${newestAgo}`}>
            · last event {newestAgo}
          </span>
        )}
      </div>

      {/* Iter 8: stale notice inline */}
      {hasStale && (
        <div className="mt-2 flex items-center gap-2 rounded border border-warning/40 bg-warning-softer/60 px-3 py-2 text-xs text-warning-fg">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Stale — last synced {newestAgo ?? "unknown"}</span>
        </div>
      )}

      {relevant.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {relevant.slice(0, 3).map((e) => {
            const exTone =
              e.severity === "critical"
                ? "text-danger-fg"
                : e.severity === "warning"
                  ? "text-warning-fg"
                  : "text-fg-muted";
            return (
              <li key={e.exception_id} className={exTone}>
                <span className="font-mono opacity-70">{e.category}</span>{" "}
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
}

// ---------------------------------------------------------------------------
// Iter 9 — Shopify sync status card (color-coded breakdown)
// ---------------------------------------------------------------------------

function ShopifySyncStatusCard() {
  const { data, isLoading, isError, error } = useQuery<ShopifySyncStatus>({
    queryKey: ["admin", "shopify", "sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/shopify/sync-status");
      if (!res.ok) {
        await res.text().catch(() => "");
        throw new Error("Could not load sync status. Check your connection and try refreshing.");
      }
      return (await res.json()) as ShopifySyncStatus;
    },
    staleTime: 30_000,
    retry: false,
  });

  function deriveBadge(): { tone: "success" | "warning" | "danger"; label: string } {
    if (!data) return { tone: "warning", label: "Unknown" };
    const { ok_count, unmapped_count, error_count } = data;
    if ((error_count ?? 0) > 0) return { tone: "danger", label: "Sync errors" };
    if ((ok_count ?? 0) > 0) return { tone: "success", label: "Syncing" };
    if ((unmapped_count ?? 0) > 0) return { tone: "warning", label: "No aliases mapped — items skipped" };
    return { tone: "warning", label: "No data" };
  }

  const badge = deriveBadge();

  const cardTone: "default" | "warning" | "danger" | "info" | "success" =
    badge.tone === "danger" ? "danger" : badge.tone === "warning" ? "warning" : "success";

  return (
    <SectionCard
      eyebrow="Integration"
      title="Shopify FG Sync"
      description="One-way push from platform stock projections to Shopify inventory. Platform is authoritative on disagreement."
      tone={cardTone}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Last sync
              </div>
              <div className="mt-0.5 text-sm text-fg">{timeAgo(data.last_sync_at)}</div>
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

          {/* Iter 9: color-coded cycle breakdown */}
          <div>
            <div className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Items this cycle
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-md border border-success/30 bg-success-softer px-3 py-1.5">
                <span className="font-mono text-sm font-semibold tabular-nums text-success-fg">
                  {data.ok_count ?? 0}
                </span>
                <span className="ml-1 text-xs text-fg-muted">synced</span>
              </div>
              <div
                className={cn(
                  "rounded-md border px-3 py-1.5",
                  (data.unmapped_count ?? 0) > 0
                    ? "border-warning/30 bg-warning-softer"
                    : "border-border/40 bg-bg-subtle/40",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    (data.unmapped_count ?? 0) > 0 ? "text-warning-fg" : "text-fg-muted",
                  )}
                >
                  {data.unmapped_count ?? 0}
                </span>
                <span className="ml-1 text-xs text-fg-muted">unmapped</span>
              </div>
              <div
                className={cn(
                  "rounded-md border px-3 py-1.5",
                  (data.error_count ?? 0) > 0
                    ? "border-danger/30 bg-danger-softer"
                    : "border-border/40 bg-bg-subtle/40",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    (data.error_count ?? 0) > 0 ? "text-danger-fg" : "text-fg-muted",
                  )}
                >
                  {data.error_count ?? 0}
                </span>
                <span className="ml-1 text-xs text-fg-muted">errors</span>
              </div>
              <div className="rounded-md border border-border/40 bg-bg-subtle/40 px-3 py-1.5">
                <span className="font-mono text-sm tabular-nums text-fg-muted">
                  {data.last_sync_item_count ?? 0}
                </span>
                <span className="ml-1 text-xs text-fg-muted">scanned</span>
              </div>
            </div>
          </div>

          {/* Iter 9: lifetime totals smaller text */}
          <div>
            <div className="mb-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Lifetime totals
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-fg-muted">
              <span>
                <span className="font-mono font-semibold text-fg">
                  {data.lifetime_writes_ok ?? 0}
                </span>{" "}
                total writes
              </span>
              <span className={(data.lifetime_writes_failed ?? 0) > 0 ? "text-danger-fg" : ""}>
                <span className="font-mono font-semibold">
                  {data.lifetime_writes_failed ?? 0}
                </span>{" "}
                failed
              </span>
            </div>
          </div>
        </div>
      )}

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

  // Compute per-integration status tones for the health banner (iter 10)
  const integrationStatuses = INTEGRATIONS.map((intg) => {
    const cats = intg.categories as readonly string[];
    const relevant = data.filter((e) => cats.includes(e.category));
    const criticalCount = relevant.filter((e) => e.severity === "critical").length;
    const warningCount = relevant.filter((e) => e.severity === "warning").length;
    const hasStale = relevant.some((e) => e.category.endsWith("_stale"));
    const tone: CardTone =
      criticalCount > 0 ? "danger" : hasStale || warningCount > 0 ? "warning" : "success";
    return { key: intg.key, label: intg.label, tone };
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin"
        title="Integration Health"
        description="Sync status and open exceptions for all live integrations."
      />

      {/* Iter 10: overall health banner */}
      {!isLoading && <OverallHealthBanner integrationStatuses={integrationStatuses} />}

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

      {/* Iter 7/8: structured per-integration cards with anchor IDs for banner links */}
      {!isLoading &&
        INTEGRATIONS.map((intg) => {
          const cats = intg.categories as readonly string[];
          const relevant = data.filter((e) => cats.includes(e.category));
          return (
            <div key={intg.key} id={`integration-${intg.key}`}>
              <IntegrationHealthCard
                intgKey={intg.key}
                label={intg.label}
                description={intg.description}
                categories={intg.categories}
                relevant={relevant}
              />
            </div>
          );
        })}
    </>
  );
}
