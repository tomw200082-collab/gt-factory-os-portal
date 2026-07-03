"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { RowFocusControls } from "./_components/RowFocusControls";
import { useRowVisibility } from "./_lib/useRowVisibility";
import { selectVisible, emptyStateKind } from "./_lib/visibility";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { FilterBar } from "./_components/FilterBar";
import { FlowGridDesktop } from "./_components/FlowGridDesktop";
import { InsightsHero } from "./_components/InsightsHero";
import { InventoryFlowTabs, INVENTORY_FLOW_TAB_IDS } from "./_components/InventoryFlowTabs";
import { MobileCardStream } from "./_components/MobileCardStream";
import { PlannedFooterCaveat } from "./_components/PlannedFooterCaveat";
import {
  PlannedOverlayToggle,
  usePlannedOverlayEnabled,
} from "./_components/PlannedOverlayToggle";
import { UnmappedSkusBanner } from "./_components/UnmappedSkusBanner";
import { useInventoryFlow } from "./_lib/useInventoryFlow";
import { usePlannedInflow, indexByItemDate } from "./_lib/plannedInflow";
import { useGroups } from "@/lib/taxonomy/groups";
import type { FlowQueryParams } from "./_lib/types";
import { useFlowItems } from "./_lib/useFlowItems";
import { parseSortKey } from "./_lib/production-lens";
import { cn } from "@/lib/cn";

const UNMAPPED_GATE = 0.1;

export function InventoryFlowClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isMobile = useMediaQuery("(max-width: 1023px)");

  const params: FlowQueryParams = useMemo(() => {
    const family = searchParams.get("family") ?? undefined;
    // Groups v1 (Tranche 044) — curated product-group filter, mirrored into
    // the query params exactly like family so the fetch URL AND the TanStack
    // cache key (["inventory-flow", params]) both carry it.
    const productGroup = searchParams.get("product_group") ?? undefined;
    const atRiskOnly = searchParams.get("at_risk_only") !== "false";
    return {
      family: family || undefined,
      product_group: productGroup || undefined,
      at_risk_only: atRiskOnly,
    };
  }, [searchParams]);

  const flowQuery = useInventoryFlow(params);

  // Groups v1 — shared vocabulary for the product-group chip row.
  const groupsQuery = useGroups();
  const productGroups = useMemo(
    () => (groupsQuery.data?.product_groups ?? []).filter((g) => g.active),
    [groupsQuery.data],
  );
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
  // Tranche 058 — production-lens ordering, URL-backed via ?sort= (chips in
  // FilterBar). Honored by both the mobile card stream and the desktop grid.
  const sortKey = parseSortKey(searchParams.get("sort"));

  const { filteredItems, families } = useFlowItems(data, q, atRiskOnlyClient);

  const vis = useRowVisibility();

  const visibleItems = useMemo(
    () => selectVisible(filteredItems, vis.hiddenIds),
    [filteredItems, vis.hiddenIds],
  );

  const hiddenItems = useMemo(
    () =>
      (data?.items ?? [])
        .filter((it) => vis.hiddenIds.has(it.item_id))
        .map((it) => ({ item_id: it.item_id, item_name: it.item_name })),
    [data, vis.hiddenIds],
  );

  const hideOtherCount = useMemo(
    () => visibleItems.filter((it) => !vis.isSelected(it.item_id)).length,
    [visibleItems, vis],
  );

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
      // Tranche 057 (FLOW-M07): size="section" + one-line description so the
      // header stops eating the phone's above-the-fold space — the first item
      // card must be visible without scrolling on a 667px-tall viewport. The
      // DR-018 FLOW-009 (Tranche 125) addition below stays a single short
      // clause to respect that budget.
      size="section"
      description="14-day daily finished-goods projection, then weekly to 8 weeks. Stockouts first. Run this before locking a week to check coverage gaps, or after receiving goods to confirm the week is covered."
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
            aria-label={flowQuery.isFetching ? "Refreshing" : "Refresh now"}
            title="Force a fresh projection. The auto-refresh runs every 60s; use this if you just posted a movement and want to see it immediately."
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", flowQuery.isFetching && "animate-spin")}
              strokeWidth={2}
            />
            {/* FLOW-M02: icon-only below sm so the toggle + refresh pair
                never compresses the header title (aria-label keeps the
                accessible name; the spinning icon carries the busy state). */}
            <span className="hidden sm:inline">
              {flowQuery.isFetching ? "Refreshing…" : "Refresh now"}
            </span>
          </button>
        </div>
      }
    />
  );

  // ---------------------------------------------------------------------------
  // Pre-mount skeleton (SSR-safe). isMobile === null means the viewport is
  // not yet known (FLOW-M01) — keep the skeleton so the desktop grid never
  // mounts-and-unmounts on a phone.
  // ---------------------------------------------------------------------------
  // A11Y-R08 (Tranche 079) — content region is the tabpanel labelled by the
  // currently-active tab. Reused across every return path below.
  const panelProps = {
    role: "tabpanel" as const,
    "aria-labelledby": INVENTORY_FLOW_TAB_IDS.fg,
  };

  if (!isMounted || isMobile === null) {
    return (
      <>
        {tabs}
        <div {...panelProps}>
          {header}
          <SkeletonGrid />
        </div>
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
        <div {...panelProps}>
          {header}
          <ErrorState
            title="Could not load Inventory Flow"
            description={(flowQuery.error as Error)?.message ?? "Unknown error"}
            onRetry={() => void flowQuery.refetch()}
          />
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (flowQuery.isLoading) {
    return (
      <>
        {tabs}
        <div {...panelProps}>
          {header}
          <div className="rounded border border-info/30 bg-info-softer px-4 py-3 text-xs text-info-fg">
            <div className="font-semibold">Calculating projection…</div>
            <div className="mt-0.5 text-fg-muted">
              This projection covers all active products across forecast, open
              orders, recipes, and on-hand stock. First-time loads can take up to
              20 seconds. Subsequent loads are instant.
            </div>
          </div>
          <InsightsHero items={[]} summary={null} isLoading />
          <SkeletonGrid />
        </div>
      </>
    );
  }

  // Terminal fallback — the query settled but returned no projection (and
  // did not error). Without this the loading skeleton would render forever.
  if (!data) {
    return (
      <>
        {tabs}
        <div {...panelProps}>
          {header}
          <EmptyState
            title="No projection available"
            description="The inventory flow projection finished but returned no data. This usually clears on a retry."
            action={
              <button
                type="button"
                onClick={() => void flowQuery.refetch()}
                className="btn btn-sm btn-outline"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Retry
              </button>
            }
          />
        </div>
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
      <div {...panelProps}>
        {header}
        <div className="space-y-4">
          <InsightsHero
            items={data.items ?? []}
            summary={summary}
            isLoading={false}
            asOf={data.as_of}
          />

        {showUnmappedGate ? (
          <UnmappedSkusBanner fraction={fraction} />
        ) : (
          <>
            <FilterBar
              families={families}
              items={data.items ?? []}
              productGroups={productGroups}
            />

            <RowFocusControls
              focusMode={vis.focusMode}
              onEnterFocus={vis.enterFocus}
              onCancelFocus={vis.cancelFocus}
              onConfirmFocus={() => vis.confirmFocus(visibleItems.map((it) => it.item_id))}
              selectedCount={vis.selectedCount}
              hideOtherCount={hideOtherCount}
              hiddenItems={hiddenItems}
              onRestore={vis.restore}
              onShowAll={vis.showAll}
            />

            {(() => {
              const kind = emptyStateKind(visibleItems.length, filteredItems.length);
              if (kind === "all-hidden") {
                return (
                  <div className="space-y-3">
                    <EmptyState
                      title="All rows hidden"
                      description="You hid every row in view. Show all to bring them back."
                    />
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={vis.showAll}
                        className="btn btn-ghost btn-sm"
                      >
                        Show all
                      </button>
                    </div>
                  </div>
                );
              }
              if (kind === "no-match") {
                return (
                  <EmptyState
                    title="No items match your filters"
                    description={
                      atRiskOnlyClient
                        ? "No products at risk in the next 14 days. Toggle to All items to see the full view."
                        : "No items match the current search or family filter."
                    }
                  />
                );
              }
              return isMobile ? (
                <MobileCardStream
                  items={visibleItems}
                  summary={summary}
                  overlayEnabled={overlayEnabled}
                  plannedByItemDate={plannedByItemDate}
                  sortKey={sortKey}
                  onHide={vis.hide}
                  selectMode={vis.focusMode}
                  selectedIds={vis.selectedIds}
                  onToggleSelect={vis.toggleSelect}
                />
              ) : (
                <FlowGridDesktop
                  items={visibleItems}
                  overlayEnabled={overlayEnabled}
                  plannedByItemDate={plannedByItemDate}
                  plannedRows={plannedRows}
                  sortKey={sortKey}
                  onSelectItem={(itemId) =>
                    router.push(
                      `/planning/inventory-flow/${encodeURIComponent(itemId)}`,
                    )
                  }
                  onHide={vis.hide}
                  selectMode={vis.focusMode}
                  selectedIds={vis.selectedIds}
                  onToggleSelect={vis.toggleSelect}
                />
              );
            })()}

            {overlayEnabled ? <PlannedFooterCaveat /> : null}
          </>
        )}
        </div>
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
