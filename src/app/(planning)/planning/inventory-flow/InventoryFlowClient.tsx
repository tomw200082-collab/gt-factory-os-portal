"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { FilterBar } from "./_components/FilterBar";
import { FlowGridDesktop } from "./_components/FlowGridDesktop";
import { InsightsHero } from "./_components/InsightsHero";
import { InventoryFlowTabs } from "./_components/InventoryFlowTabs";
import { MobileCardStream } from "./_components/MobileCardStream";
import { PlannedFooterCaveat } from "./_components/PlannedFooterCaveat";
import {
  PlannedOverlayToggle,
  usePlannedOverlayEnabled,
} from "./_components/PlannedOverlayToggle";
import { UnmappedSkusBanner } from "./_components/UnmappedSkusBanner";
import { useInventoryFlow } from "./_lib/useInventoryFlow";
import { usePlannedInflow, indexByItemDate } from "./_lib/plannedInflow";
import type { FlowItem, FlowQueryParams } from "./_lib/types";
import { isAtRisk } from "./_lib/risk";
import { cn } from "@/lib/cn";

const UNMAPPED_GATE = 0.1;

export function InventoryFlowClient() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isMobile = useMediaQuery("(max-width: 1023px)");

  const params: FlowQueryParams = useMemo(() => {
    const family = searchParams.get("family") ?? undefined;
    const atRiskOnly = searchParams.get("at_risk_only") !== "false";
    return { family: family || undefined, at_risk_only: atRiskOnly };
  }, [searchParams]);

  const flowQuery = useInventoryFlow(params);
  const data = flowQuery.data ?? null;
  const summary = data?.summary ?? null;

  // ---------------------------------------------------------------------------
  // Planned-inflow overlay (signal #32)
  // ---------------------------------------------------------------------------
  const overlayEnabled = usePlannedOverlayEnabled();
  const horizon = useMemo(() => {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = new Date();
    const end = new Date(today.getTime() + 56 * 24 * 3600 * 1000);
    return { from: fmt(today), to: fmt(end) };
  }, []);
  const plannedInflowQuery = usePlannedInflow(
    { from: horizon.from, to: horizon.to },
    { enabled: overlayEnabled },
  );
  const plannedRows = plannedInflowQuery.data?.rows ?? [];
  const plannedByItemDate = useMemo(
    () => indexByItemDate(plannedRows),
    [plannedRows],
  );

  // ---------------------------------------------------------------------------
  // Client-side filtering
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Shared layout elements
  // ---------------------------------------------------------------------------
  const tabs = (
    <div className="mb-3">
      <InventoryFlowTabs activeTab="fg" />
    </div>
  );

  const header = (
    <WorkflowHeader
      eyebrow="Planning"
      title="Inventory Flow"
      description="Daily projection of finished-goods stock over the next 14 days, then weekly through 8 weeks. Stockouts surface at the top; healthy items recede."
      meta={
        <>
          {flowQuery.isLoading ? (
            <Badge tone="neutral" dotted>Loading…</Badge>
          ) : flowQuery.isError ? (
            <Badge tone="danger" dotted>Error</Badge>
          ) : flowQuery.isFetching ? (
            <Badge tone="info" dotted>Refreshing…</Badge>
          ) : (
            <Badge tone="success" dotted>Live</Badge>
          )}
          {data?.as_of ? (
            <FreshnessBadge
              label="As of"
              lastAt={data.as_of}
              warnAfterMinutes={5}
              failAfterMinutes={30}
              producer="inventory_flow_projection"
            />
          ) : null}
        </>
      }
      actions={
        <div className="flex items-center gap-2">
          <PlannedOverlayToggle />
          <button
            type="button"
            onClick={() => void flowQuery.refetch()}
            disabled={flowQuery.isFetching}
            className="btn btn-ghost btn-sm gap-1.5"
            data-testid="inventory-flow-refresh"
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

  // ---------------------------------------------------------------------------
  // Pre-mount skeleton (SSR-safe)
  // ---------------------------------------------------------------------------
  if (!isMounted) {
    return (
      <>
        {tabs}
        {header}
        <SkeletonGrid />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (flowQuery.isError) {
    return (
      <>
        {tabs}
        {header}
        <ErrorState
          title="Could not load Inventory Flow"
          description={(flowQuery.error as Error)?.message ?? "Unknown error"}
        />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (flowQuery.isLoading || !data) {
    return (
      <>
        {tabs}
        {header}
        <div className="rounded border border-info/30 bg-info-softer px-4 py-3 text-xs text-info-fg">
          <div className="font-semibold">Calculating projection…</div>
          <div className="mt-0.5 text-fg-muted">
            Daily inventory flow runs a heavy SQL pass over forecast + open orders + BOM + on-hand
            for every active FG. First-time loads can take ~20 seconds. Subsequent loads use a
            cached snapshot and should be instant.
          </div>
        </div>
        <InsightsHero items={[]} summary={null} isLoading />
        <SkeletonGrid />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  const fraction = summary?.unknown_sku_pct_of_demand ?? 0;
  const showUnmappedGate = fraction >= UNMAPPED_GATE;

  return (
    <>
      {tabs}
      {header}
      <div className="space-y-4">
        <InsightsHero
          items={data.items}
          summary={summary}
          isLoading={false}
          asOf={data.as_of}
        />

        {showUnmappedGate ? (
          <UnmappedSkusBanner fraction={fraction} />
        ) : (
          <>
            <FilterBar families={families} items={data.items} />

            {filteredItems.length === 0 ? (
              <EmptyState
                title="No items match your filters"
                description={
                  atRiskOnlyClient
                    ? "No products at risk in the next 14 days. Toggle to All items to see the full view."
                    : "No items match the current search or family filter."
                }
              />
            ) : isMobile ? (
              <MobileCardStream
                items={filteredItems}
                summary={summary}
                overlayEnabled={overlayEnabled}
                plannedByItemDate={plannedByItemDate}
              />
            ) : (
              <FlowGridDesktop
                items={filteredItems}
                overlayEnabled={overlayEnabled}
                plannedByItemDate={plannedByItemDate}
                plannedRows={plannedRows}
              />
            )}

            {overlayEnabled ? <PlannedFooterCaveat /> : null}
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
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-md border border-border/40 bg-bg-muted/60" />
    </div>
  );
}
