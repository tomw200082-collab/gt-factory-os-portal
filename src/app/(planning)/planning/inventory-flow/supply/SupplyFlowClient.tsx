"use client";

// ---------------------------------------------------------------------------
// SupplyFlowClient — client wrapper for /planning/inventory-flow/supply.
//
// Mirrors InventoryFlowClient (the FG flow page) with the planned-inflow
// overlay machinery removed: the supply universe (RM + PKG components +
// BOUGHT_FINISHED items) does NOT model planned production inflow in v1.
// Tab nav across the top, otherwise identical layout — same FilterBar,
// same FlowGridDesktop, same MobileCardStream, same UnmappedSkusBanner
// gate, same EmptyState fallback.
//
// The shared sub-components are deliberately shape-agnostic so a single
// `FlowItem[]` carries either FG ITEM rows or supply COMPONENT/ITEM rows
// (distinguished server-side by `sku_kind`).
//
// Wave 3 of the supply-side inventory flow plan (2026-05-06).
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
      title="Supply Flow"
      description="Raw materials + bought-finished daily projection"
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

  // Error state
  if (flowQuery.isError) {
    return (
      <>
        {tabs}
        {header}
        <ErrorState
          title="Could not load Supply Flow"
          description={(flowQuery.error as Error)?.message ?? "Unknown error"}
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

  return (
    <>
      {tabs}
      {header}
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
              <MobileCardStream items={filteredItems} summary={summary} />
            ) : (
              <FlowGridDesktop items={filteredItems} />
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
