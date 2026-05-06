"use client";

// ---------------------------------------------------------------------------
// SupplyFlowClient — client wrapper for /planning/inventory-flow/supply.
//
// Mirrors InventoryFlowClient (the FG flow page) with the planned-inflow
// overlay machinery removed: components do NOT model planned production
// inflow in v1. Tab nav across the top, otherwise identical layout —
// same FilterBar, same FlowGridDesktop, same MobileCardStream, same
// UnmappedSkusBanner gate, same EmptyState fallback.
//
// The shared sub-components are deliberately shape-agnostic so a single
// `FlowItem[]` carries either FG ITEM rows or COMPONENT rows
// (distinguished server-side by `sku_kind`). The supply-side projection
// (migration 0147) emits only `sku_kind='COMPONENT'`; BOUGHT_FINISHED
// items live on the FG flow page.
// ---------------------------------------------------------------------------

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import {
  EmptyState,
  ErrorState,
} from "@/components/feedback/states";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { FilterBar } from "../_components/FilterBar";
import { FlowGridDesktop } from "../_components/FlowGridDesktop";
import { InsightsHero } from "../_components/InsightsHero";
import { InventoryFlowTabs } from "../_components/InventoryFlowTabs";
import { MobileCardStream } from "../_components/MobileCardStream";
import { UnmappedSkusBanner } from "../_components/UnmappedSkusBanner";
import { useSupplyFlow } from "./_lib/useSupplyFlow";
import type { FlowItem, FlowQueryParams } from "../_lib/types";
import { isAtRisk } from "../_lib/risk";
import { cn } from "@/lib/cn";

const UNMAPPED_GATE = 0.1;

// Map raw fetcher errors (shaped as `supply_flow_<status>:<detail>`) into
// human-readable diagnostics. The detail portion comes from the proxy's
// JSON body when present.
function describeSupplyFlowError(raw: string): {
  title: string;
  description: string;
  hint: string | null;
} {
  const match = raw.match(/^supply_flow_(\d+)(?::(.*))?$/);
  const status = match ? Number(match[1]) : 0;
  const detail = match?.[2] ?? "";
  switch (status) {
    case 401:
      return {
        title: "Session expired",
        description:
          "Your sign-in expired. Sign out and sign back in to continue.",
        hint: "If you just got back to this tab after a long break, this is the most common cause.",
      };
    case 403:
      return {
        title: "Not allowed",
        description:
          "Your role can't see this page. Operator + Planner + Admin only.",
        hint: null,
      };
    case 404:
      return {
        title: "Endpoint missing",
        description:
          "The Supply API route was not found upstream. The backend may be mid-deploy.",
        hint: "Wait ~30 seconds and click Reload. If it sticks, ping the backend deploy.",
      };
    case 502:
      return {
        title: "Upstream unreachable",
        description:
          "The portal could not reach the Factory OS API. Likely a transient network blip.",
        hint: "Try Reload. If it persists, the API service may be down.",
      };
    case 504:
      return {
        title: "Upstream timeout",
        description:
          "The cold-start projection took longer than the proxy timeout. The next call should hit a warm cache.",
        hint: "Reload — repeat calls run from a 30-min server cache and return instantly.",
      };
    case 500:
      return {
        title: "Server error",
        description: detail || "The API threw an error while computing the supply projection.",
        hint: "If this persists, check Railway logs for a stack trace.",
      };
    default:
      return {
        title: "Could not load Components Flow",
        description: detail || raw,
        hint: null,
      };
  }
}

export function SupplyFlowClient() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isMobile = useMediaQuery("(max-width: 1023px)");

  // Read filters from URL.
  const params: FlowQueryParams = useMemo(() => {
    const family = searchParams.get("family") ?? undefined;
    const atRiskOnly = searchParams.get("at_risk_only") !== "false";
    return {
      family: family || undefined,
      at_risk_only: atRiskOnly,
    };
  }, [searchParams]);

  const flowQuery = useSupplyFlow(params);

  const data = flowQuery.data ?? null;
  const summary = data?.summary ?? null;

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const atRiskOnlyClient = searchParams.get("at_risk_only") !== "false";

  const filteredItems: FlowItem[] = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (q) {
      items = items.filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          it.item_id.toLowerCase().includes(q) ||
          (it.family ?? "").toLowerCase().includes(q),
      );
    }
    if (atRiskOnlyClient) {
      items = items.filter((it) => isAtRisk(it.risk_tier));
    }
    return items;
  }, [data, q, atRiskOnlyClient]);

  const families = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const it of data.items) {
      if (it.family) seen.add(it.family);
    }
    return [...seen].sort();
  }, [data]);

  // Tab nav — identical to FG client, with activeTab="supply".
  const tabs = (
    <div className="mb-3">
      <InventoryFlowTabs activeTab="supply" />
    </div>
  );

  // Header element
  const header = (
    <WorkflowHeader
      eyebrow="Planning"
      title="Components Flow"
      description="Raw materials + packaging daily projection (BOM-driven demand from production_plan)"
      meta={
        <>
          {flowQuery.isLoading ? (
            <Badge tone="neutral" dotted>
              Loading…
            </Badge>
          ) : flowQuery.isError ? (
            <Badge tone="danger" dotted>
              Error
            </Badge>
          ) : flowQuery.isFetching ? (
            <Badge tone="info" dotted>
              Refreshing…
            </Badge>
          ) : (
            <Badge tone="success" dotted>
              Live
            </Badge>
          )}
          {data?.as_of ? (
            <FreshnessBadge
              label="As of"
              lastAt={data.as_of}
              warnAfterMinutes={5}
              failAfterMinutes={30}
              producer="supply_flow_projection"
            />
          ) : null}
        </>
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void flowQuery.refetch()}
            disabled={flowQuery.isFetching}
            className="btn btn-ghost btn-sm gap-1.5"
            data-testid="supply-flow-refresh"
            title="Force a fresh projection. The auto-refresh runs every 60s; use this if you just posted a movement and want to see it immediately."
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", flowQuery.isFetching && "animate-spin")}
              strokeWidth={2}
            />
            {flowQuery.isFetching ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      }
    />
  );

  // SSR-safe: render skeleton until mounted.
  if (!isMounted) {
    return (
      <>
        {tabs}
        {header}
        <SkeletonGrid />
      </>
    );
  }

  // Error state — only render when there is no data at all.
  // If we have seeded data from a previous successful load, prefer to show
  // that data with a small "couldn't refresh" banner above. Showing an empty
  // ErrorState screen on top of usable data is worse than a stale-but-real
  // grid.
  if (flowQuery.isError && !data) {
    const rawMessage = (flowQuery.error as Error)?.message ?? "Unknown error";
    const { title, description, hint } = describeSupplyFlowError(rawMessage);
    return (
      <>
        {tabs}
        {header}
        <ErrorState
          title={title}
          description={description}
          action={
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger-fg hover:bg-danger-softer"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Reload
              </button>
              {hint ? (
                <div className="text-[11px] text-fg-muted max-w-md">{hint}</div>
              ) : null}
              <details className="text-[10px] text-fg-muted/80">
                <summary className="cursor-pointer">Show technical detail</summary>
                <code className="mt-1 block rounded border border-border bg-bg-elevated px-2 py-1 text-left">
                  {rawMessage}
                </code>
              </details>
            </div>
          }
        />
      </>
    );
  }

  // Loading state (first paint)
  if (flowQuery.isLoading || !data) {
    return (
      <>
        {tabs}
        {header}
        <div className="rounded border border-info/30 bg-info-softer px-4 py-3 text-xs text-info-fg">
          <div className="font-semibold">Calculating projection…</div>
          <div className="mt-0.5 text-fg-muted">
            Supply flow runs a heavy SQL pass over BOM consumption + open POs +
            on-hand for every active component and bought-finished item. First
            loads can take ~20 seconds. Subsequent loads use a cached snapshot
            and should be instant.
          </div>
        </div>
        <InsightsHero items={[]} summary={null} isLoading />
        <SkeletonGrid />
      </>
    );
  }

  // Unmapped-SKUs hard gate (mirrors FG behaviour).
  const fraction = summary?.unknown_sku_pct_of_demand ?? 0;
  const banner = fraction >= UNMAPPED_GATE;

  // Stale banner — render the (seeded) data we have, but tell the user the
  // most-recent refresh failed so they don't act on numbers that may be old.
  const staleBanner = flowQuery.isError ? (
    <div className="rounded border border-warning/40 bg-warning-softer px-4 py-2 text-xs">
      <span className="font-semibold text-warning-fg">Showing cached data — </span>
      <span className="text-fg-muted">
        the latest refresh failed. {describeSupplyFlowError((flowQuery.error as Error)?.message ?? "").description}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-2 underline underline-offset-2 hover:text-warning-fg"
      >
        Reload
      </button>
    </div>
  ) : null;

  return (
    <>
      {tabs}
      {header}
      {staleBanner}
      <div className="space-y-6">
        <InsightsHero
          items={data.items}
          summary={summary}
          isLoading={false}
          asOf={data.as_of}
        />

        {banner ? (
          <UnmappedSkusBanner fraction={fraction} />
        ) : (
          <>
            <FilterBar families={families} items={data.items} />
            {filteredItems.length === 0 ? (
              <EmptyState
                title="All clear ✨"
                description={
                  atRiskOnlyClient
                    ? "No supply items at risk in the next 14 days. Toggle off 'Show only at-risk' to see all components and bought-finished items."
                    : "No items match the current filters."
                }
              />
            ) : isMobile ? (
              <MobileCardStream
                items={filteredItems}
                summary={summary}
                disableRowLink
              />
            ) : (
              <FlowGridDesktop items={filteredItems} disableRowLink />
            )}
          </>
        )}
      </div>
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-md border border-border/40 bg-bg-muted/60"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-md border border-border/40 bg-bg-muted/60" />
    </div>
  );
}
