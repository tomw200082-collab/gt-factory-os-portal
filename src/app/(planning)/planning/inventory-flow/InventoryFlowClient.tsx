"use client";

// ---------------------------------------------------------------------------
// InventoryFlowClient — client wrapper for the Inventory Flow page.
//
// Responsibilities:
//   - Read query string filters (family, q, at_risk_only)
//   - Call useInventoryFlow with those params
//   - Decide between desktop FlowGridDesktop and mobile MobileCardStream
//     based on viewport (useMediaQuery)
//   - Render UnmappedSkusBanner when fraction >= 0.10 (replaces grid)
//   - Render HeroBar + FilterBar always (when data is available)
//   - SSR-safe: render skeleton until isMounted to avoid hydration mismatch
// ---------------------------------------------------------------------------

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import {
  EmptyState,
  ErrorState,
} from "@/components/feedback/states";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { FilterBar } from "./_components/FilterBar";
import { FlowGridDesktop } from "./_components/FlowGridDesktop";
import { HeroBar } from "./_components/HeroBar";
import { MobileCardStream } from "./_components/MobileCardStream";
import { UnmappedSkusBanner } from "./_components/UnmappedSkusBanner";
import { useInventoryFlow } from "./_lib/useInventoryFlow";
import type { FlowItem, FlowQueryParams } from "./_lib/types";
import { isAtRisk } from "./_lib/risk";

const UNMAPPED_GATE = 0.1;

export function InventoryFlowClient() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isMobile = useMediaQuery("(max-width: 1023px)");

  // Read filters from URL.
  const params: FlowQueryParams = useMemo(() => {
    const family = searchParams.get("family") ?? undefined;
    // at_risk_only: default true unless explicitly "false"
    const atRiskOnly = searchParams.get("at_risk_only") !== "false";
    return {
      family: family || undefined,
      at_risk_only: atRiskOnly,
    };
  }, [searchParams]);

  const flowQuery = useInventoryFlow(params);

  const data = flowQuery.data ?? null;
  const summary = data?.summary ?? null;

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const atRiskOnlyClient = searchParams.get("at_risk_only") !== "false";

  const filteredItems: FlowItem[] = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    // Server already applies at_risk_only when forwarded. Apply client-side
    // search filter on top.
    if (q) {
      items = items.filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          it.item_id.toLowerCase().includes(q) ||
          (it.family ?? "").toLowerCase().includes(q),
      );
    }
    // Defense in depth: if API didn't filter (older deploys), filter here.
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

  // Header element
  const header = (
    <WorkflowHeader
      eyebrow="Planning"
      title="Inventory Flow"
      description="Daily projection of finished-goods stock over the next 14 days, then weekly through 8 weeks. Stockouts surface at the top; healthy items recede."
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
            />
          ) : null}
        </>
      }
    />
  );

  // SSR-safe: render skeleton until mounted.
  if (!isMounted) {
    return (
      <>
        {header}
        <SkeletonGrid />
      </>
    );
  }

  // Error state
  if (flowQuery.isError) {
    return (
      <>
        {header}
        <ErrorState
          title="Could not load Inventory Flow"
          description={(flowQuery.error as Error)?.message ?? "Unknown error"}
        />
      </>
    );
  }

  // Loading state (first paint). The upstream SQL projection takes ~22s on
  // a cold cache so we surface that explicitly instead of an open-ended
  // skeleton. On subsequent visits the localStorage-persisted cache + the
  // 24h gcTime + the dashboard prefetch usually mean this state never
  // shows — when it does, the user knows why.
  if (flowQuery.isLoading || !data) {
    return (
      <>
        {header}
        <div className="rounded border border-info/30 bg-info-softer px-4 py-3 text-xs text-info-fg">
          <div className="font-semibold">Calculating projection…</div>
          <div className="mt-0.5 text-fg-muted">
            Daily inventory flow runs a heavy SQL pass over forecast + open
            orders + BOM + on-hand for every active FG. First-time loads can
            take ~20 seconds. Subsequent loads use a cached snapshot and
            should be instant.
          </div>
        </div>
        <HeroBar summary={null} isLoading />
        <SkeletonGrid />
      </>
    );
  }

  // Unmapped-SKUs hard gate (contract §5).
  const fraction = summary?.unknown_sku_pct_of_demand ?? 0;
  const banner = fraction >= UNMAPPED_GATE;

  return (
    <>
      {header}
      <div className="space-y-6">
        <HeroBar summary={summary} isLoading={false} />

        {banner ? (
          <UnmappedSkusBanner fraction={fraction} />
        ) : (
          <>
            <FilterBar families={families} />
            {filteredItems.length === 0 ? (
              <EmptyState
                title="All clear ✨"
                description={
                  atRiskOnlyClient
                    ? "No products at risk in the next 14 days. Toggle off 'Show only at-risk' to see all items."
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
