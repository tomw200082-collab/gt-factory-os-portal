"use client";

// ---------------------------------------------------------------------------
// /planning/inventory-flow/[itemId] — per-item drill-down.
//
// Used primarily as the mobile detail screen, but also reachable from the
// DayPopover on desktop. Surfaces:
//   - Header: item name + family + risk badge + days-of-cover hero
//   - 3 tabs: Demand (LionWheel orders), Supply (open POs), Timeline
//
// Read-only. No actions. (v1 plan §"Out of scope").
// ---------------------------------------------------------------------------

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Badge } from "@/components/badges/StatusBadge";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/feedback/states";
import { cn } from "@/lib/cn";
import {
  fmtDate,
  fmtDateLong,
  fmtDaysOfCover,
  fmtQty,
} from "../_lib/format";
import { RISK_TIER_STYLE } from "../_lib/risk";
import { useInventoryFlowItem } from "../_lib/useInventoryFlow";
import { PlannedItemSection } from "../_components/PlannedItemSection";

type TabKey = "demand" | "supply" | "timeline";

const TABS: { key: TabKey; label: string }[] = [
  { key: "demand", label: "Demand" },
  { key: "supply", label: "Supply" },
  { key: "timeline", label: "Timeline" },
];

interface PageParams {
  params: Promise<{ itemId: string }>;
}

export default function InventoryFlowItemPage({ params }: PageParams) {
  const { itemId } = use(params);
  const detailQuery = useInventoryFlowItem(itemId);
  const [activeTab, setActiveTab] = useState<TabKey>("demand");

  // Planned-inflow horizon — same 8-week window the main board uses so
  // the per-day mini-section sees every plan visible on the grid.
  const plannedHorizon = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const from = `${yyyy}-${mm}-${dd}`;
    const end = new Date(today.getTime() + 56 * 24 * 3600 * 1000);
    const ey = end.getFullYear();
    const em = String(end.getMonth() + 1).padStart(2, "0");
    const ed = String(end.getDate()).padStart(2, "0");
    const to = `${ey}-${em}-${ed}`;
    return { from, to };
  }, []);

  const detail = detailQuery.data ?? null;
  const style = detail ? RISK_TIER_STYLE[detail.risk_tier] : null;

  const orders = detail?.orders ?? [];
  const pos = detail?.pos ?? [];

  // Build a chronological timeline of demand + supply events for the Timeline tab.
  const timeline = useMemo(() => {
    if (!detail) return [];
    const entries: Array<{
      date: string;
      kind: "demand" | "supply";
      label: string;
      qty: number;
    }> = [];
    for (const o of detail.orders) {
      if (o.pickup_at) {
        entries.push({
          date: o.pickup_at.slice(0, 10),
          kind: "demand",
          label: o.customer_name ?? o.lw_task_id,
          qty: o.qty,
        });
      }
    }
    for (const p of detail.pos) {
      if (p.expected_delivery_date) {
        entries.push({
          date: p.expected_delivery_date,
          kind: "supply",
          label: p.supplier_name ?? p.po_id,
          qty: p.qty_open,
        });
      }
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }, [detail]);

  return (
    <>
      <div className="mb-2">
        <Link
          href="/planning/inventory-flow"
          className="inline-flex items-center gap-1 text-2xs uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to Inventory Flow
        </Link>
      </div>

      <WorkflowHeader
        eyebrow={detail?.family ?? "Inventory item"}
        title={detail?.item_name ?? itemId}
        description={
          detail
            ? `${detail.supply_method} · effective lead time ${detail.effective_lead_time_days}d`
            : "Loading…"
        }
        meta={
          style ? (
            <Badge tone={style.badgeTone} variant="soft" dotted>
              {style.label}
            </Badge>
          ) : null
        }
      />

      {detailQuery.isLoading ? (
        <LoadingState title="Loading item detail…" />
      ) : detailQuery.isError ? (
        <ErrorState
          title="Could not load item detail"
          description={(detailQuery.error as Error)?.message ?? ""}
        />
      ) : !detail ? (
        <EmptyState title="No data" description="Item not found." />
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label="Days of cover"
              value={fmtDaysOfCover(detail.days_of_cover)}
              tone={
                detail.risk_tier === "stockout"
                  ? "danger"
                  : detail.risk_tier === "critical" || detail.risk_tier === "watch"
                    ? "warning"
                    : "neutral"
              }
            />
            <Kpi
              label="Earliest stockout"
              value={
                detail.earliest_stockout_date
                  ? fmtDate(detail.earliest_stockout_date)
                  : "—"
              }
              tone={detail.earliest_stockout_date ? "danger" : "neutral"}
            />
            <Kpi
              label="Current on-hand"
              value={fmtQty(detail.current_on_hand)}
              tone="neutral"
            />
          </div>

          {/* Planned-inflow per-day mini-section (signal #32 / contract §5.2).
              Renders only when the planned-overlay toggle is ON and at
              least one plan_remaining row exists for this item over the
              horizon. Silent otherwise. */}
          <PlannedItemSection
            itemId={detail.item_id}
            from={plannedHorizon.from}
            to={plannedHorizon.to}
          />

          {/* Tabs */}
          <div className="mt-6 flex gap-1 border-b border-border/40">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-sops transition-colors",
                  activeTab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="mt-4">
            {activeTab === "demand" ? (
              orders.length === 0 ? (
                <EmptyState
                  title="No open orders"
                  description="No LionWheel orders found for this item in the next 14 days."
                />
              ) : (
                <ul className="divide-y divide-border/40 rounded-md border border-border/40 bg-bg-raised">
                  {orders.map((o) => (
                    <li
                      key={o.lw_task_id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg-strong">
                          {o.customer_name ?? o.lw_task_id}
                        </div>
                        <div className="mt-0.5 text-3xs text-fg-muted">
                          {o.pickup_at ? fmtDateLong(o.pickup_at.slice(0, 10)) : "no pickup date"}
                          {" · "}
                          <span className="font-mono">{o.lw_task_id}</span>
                          {o.legacy_sku ? <> · SKU {o.legacy_sku}</> : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-fg-strong">
                          {fmtQty(o.qty)}
                        </div>
                        <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                          {o.status}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {activeTab === "supply" ? (
              pos.length === 0 ? (
                <EmptyState
                  title="No open POs"
                  description="No open purchase orders found for this item."
                />
              ) : (
                <ul className="divide-y divide-border/40 rounded-md border border-border/40 bg-bg-raised">
                  {pos.map((p) => (
                    <li
                      key={p.po_id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg-strong">
                          {p.supplier_name ?? "Unknown supplier"}
                        </div>
                        <div className="mt-0.5 text-3xs text-fg-muted">
                          {p.po_number ? <>PO #{p.po_number} · </> : null}
                          {p.expected_delivery_date
                            ? `expected ${fmtDate(p.expected_delivery_date)}`
                            : "no ETA"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-info-fg">
                          +{fmtQty(p.qty_open)}
                        </div>
                        <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                          {p.status}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {activeTab === "timeline" ? (
              timeline.length === 0 ? (
                <EmptyState
                  title="No dated events"
                  description="No demand or supply events with dates in the visible window."
                />
              ) : (
                <ol className="space-y-2 rounded-md border border-border/40 bg-bg-raised p-4">
                  {timeline.map((e, idx) => (
                    <li
                      key={`${e.date}-${idx}`}
                      className="flex items-center gap-3"
                    >
                      <span className="w-20 shrink-0 text-3xs uppercase tracking-sops text-fg-subtle">
                        {fmtDate(e.date)}
                      </span>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          e.kind === "demand" ? "bg-warning" : "bg-info",
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate text-xs text-fg">
                        {e.label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          e.kind === "demand"
                            ? "text-warning-fg"
                            : "text-info-fg",
                        )}
                      >
                        {e.kind === "demand" ? "−" : "+"}
                        {fmtQty(e.qty)}
                      </span>
                    </li>
                  ))}
                </ol>
              )
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

interface KpiProps {
  label: string;
  value: string;
  tone: "neutral" | "warning" | "danger";
}

function Kpi({ label, value, tone }: KpiProps) {
  const toneClass =
    tone === "danger"
      ? "text-danger-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : "text-fg-strong";

  return (
    <div className="rounded-md border border-border/40 bg-bg-raised px-3 py-2">
      <div className="text-3xs uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold leading-none tabular-nums",
          toneClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}
