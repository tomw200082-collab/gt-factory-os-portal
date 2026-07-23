"use client";

// ---------------------------------------------------------------------------
// TodayBoard — the 9:30 morning-briefing surface (Tranche 136).
//
// Mapping-v3 Q6 (Tom, 2026-07-22): one read-model, three outfits — this
// board IS the screen the briefing looks at. Mounts inside the existing
// /home for operator/planner/admin (viewer/bookkeeper cockpit unchanged in
// v1 — OQ-2 default). Read-only. Every number below comes from an existing
// portal proxy endpoint; nothing here is invented, and every named backend
// gap (G1-G4, see tranche manifest) renders an honest note instead of a
// guess or a fabricated zero.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { formatQty } from "@/lib/utils/format-quantity";
import { usePlans } from "@/app/(planning)/planning/production-plan/_lib/usePlans";
import { useInventoryFlow } from "@/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow";
import { todayIsoLocal } from "@/app/(planning)/planning/inventory-flow/_lib/format";
import type { ListEnvelope } from "@/components/purchase-orders/types";
import {
  addDaysIso,
  bucketArrivals,
  buildTodayPlan,
  buildTomorrowTiers,
  buildYesterdayCreditsSummary,
  buildYesterdayPlanVsActual,
  findUnmatchedActuals,
  PLAN_STATUS_LABEL,
  type CreditTrackingRowLite,
  type ProductionActualHistoryRow,
  type PurchaseOrderRowLite,
  type TodayPlanRow,
  type TomorrowItemRow,
  type YesterdayPlanRow,
} from "../_lib/today-board";
import {
  isTodayBoardTabKey,
  TodayBoardTabs,
  TODAY_BOARD_TAB_IDS,
  type TodayBoardTabKey,
} from "./TodayBoardTabs";

// ---------------------------------------------------------------------------
// Fetch helpers — thin, honest: no retry storms, no fabricated fallback data.
// A non-OK response or a network failure surfaces as query.isError, which
// every panel below renders as an explicit "unavailable" note.
// ---------------------------------------------------------------------------

async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

interface CreditTrackingListResponse {
  rows: CreditTrackingRowLite[];
  total: number;
  pending_count: number;
}

interface DemandCoverageResponse {
  total_distinct_skus: number;
  resolved_distinct_skus: number;
  is_partial: boolean;
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function Note({ tone = "muted", children }: { tone?: "muted" | "warning"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded border border-dashed px-3 py-2.5 text-xs leading-relaxed",
        tone === "warning"
          ? "border-warning/40 bg-warning-softer text-warning-fg"
          : "border-border text-fg-muted",
      )}
    >
      {children}
    </div>
  );
}

function GapNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-fg-faint">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yesterday panel
// ---------------------------------------------------------------------------

function YesterdayPanel({
  rows,
  unmatchedCount,
  plansError,
  actualsError,
  credits,
  creditsError,
}: {
  rows: YesterdayPlanRow[];
  unmatchedCount: number;
  plansError: boolean;
  actualsError: boolean;
  credits: ReturnType<typeof buildYesterdayCreditsSummary>;
  creditsError: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-sops text-fg-muted">
          Plan vs. actual
        </h3>
        {plansError ? (
          <Note>Yesterday&apos;s production plan couldn&apos;t be loaded right now.</Note>
        ) : rows.length === 0 ? (
          <Note>No production was planned for yesterday.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.plan_id}
                className={cn(
                  "flex flex-col gap-1 rounded border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between",
                  r.no_report ? "border-danger/50 bg-danger-softer" : "border-border",
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.no_report ? (
                      <Badge tone="danger" dot>
                        No report entered
                      </Badge>
                    ) : null}
                    <span className="truncate font-medium text-fg-strong">
                      {r.item_name ?? "—"}
                    </span>
                  </div>
                  <span className="text-xs text-fg-muted">
                    Planned {formatQty(r.planned_qty ?? 0, r.uom ?? "unit")} {r.uom ?? ""}
                  </span>
                </div>
                <div className="text-sm sm:text-right">
                  {r.actual ? (
                    <span className="text-fg-strong">
                      Reported {formatQty(r.actual.output_qty ?? 0, r.actual.output_uom ?? r.uom ?? "unit")}{" "}
                      {r.actual.output_uom ?? r.uom ?? ""}
                    </span>
                  ) : r.no_report ? (
                    <span className="text-danger-fg">Needs a report</span>
                  ) : (
                    <span className="text-fg-faint">{PLAN_STATUS_LABEL[r.status]}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!actualsError && unmatchedCount > 0 ? (
          <Note>
            {unmatchedCount} production report{unmatchedCount === 1 ? "" : "s"} yesterday
            {" "}
            {unmatchedCount === 1 ? "wasn't" : "weren't"} linked to a plan row.
          </Note>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-sops text-fg-muted">
          Picking gaps → credits
        </h3>
        {creditsError ? (
          <Note>Credit tracking couldn&apos;t be loaded right now.</Note>
        ) : credits.count === 0 ? (
          <Note>No picking-shortage credits recorded for yesterday.</Note>
        ) : (
          <Link
            href="/credit-tracking"
            className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2.5 text-sm hover:border-accent/40"
          >
            <span className="text-fg-strong">
              {credits.count} shortage{credits.count === 1 ? "" : "s"} · {credits.totalQtyMissing.toLocaleString()} missing units
            </span>
            <ArrowUpRight className="h-4 w-4 text-fg-faint" strokeWidth={2} aria-hidden />
          </Link>
        )}
      </div>

      <GapNote>
        Delivery exceptions aren&apos;t tracked in the portal yet — no LionWheel-mirror
        exceptions read model exists (gap G2). Nothing is shown rather than guessed.
      </GapNote>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today panel
// ---------------------------------------------------------------------------

function TodayPanel({
  rows,
  plansError,
  arrivalsToday,
  arrivalsOverdue,
  arrivalsError,
}: {
  rows: TodayPlanRow[];
  plansError: boolean;
  arrivalsToday: ReturnType<typeof bucketArrivals>["today"];
  arrivalsOverdue: ReturnType<typeof bucketArrivals>["overdue"];
  arrivalsError: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-sops text-fg-muted">
          Today&apos;s plan
        </h3>
        {plansError ? (
          <Note>Today&apos;s production plan couldn&apos;t be loaded right now.</Note>
        ) : rows.length === 0 ? (
          <Note>Nothing is planned for today yet.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.plan_id}
                className="flex flex-col gap-1 rounded border border-border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium text-fg-strong">
                    {r.item_name ?? "—"}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {formatQty(r.planned_qty ?? 0, r.uom ?? "unit")} {r.uom ?? ""}
                  </span>
                </div>
                <Badge tone={r.locked ? "success" : "muted"} size="xs">
                  {PLAN_STATUS_LABEL[r.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-sops text-fg-muted">
          Supplier arrivals expected today
        </h3>
        {arrivalsError ? (
          <Note>Purchase orders couldn&apos;t be loaded right now.</Note>
        ) : arrivalsToday.length === 0 && arrivalsOverdue.length === 0 ? (
          <Note>No supplier arrivals expected today.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {arrivalsOverdue.map((a) => (
              <li key={a.po_id}>
                <Link
                  href={`/stock/receipts?po_id=${encodeURIComponent(a.po_id)}`}
                  className="flex items-center justify-between gap-2 rounded border border-warning/40 bg-warning-softer px-3 py-2.5 text-sm hover:border-warning/70"
                >
                  <span className="text-warning-fg">
                    {a.po_number} · {a.supplier_name ?? "—"} · overdue since {a.expected_receive_date}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-faint" strokeWidth={2} aria-hidden />
                </Link>
              </li>
            ))}
            {arrivalsToday.map((a) => (
              <li key={a.po_id}>
                <Link
                  href={`/stock/receipts?po_id=${encodeURIComponent(a.po_id)}`}
                  className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2.5 text-sm hover:border-accent/40"
                >
                  <span className="text-fg-strong">
                    {a.po_number} · {a.supplier_name ?? "—"}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-faint" strokeWidth={2} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <GapNote>
        Route &amp; departure aren&apos;t tracked in the portal yet — that data lives in
        LionWheel + skill-side driver config, with no portal read model (gap G3).
      </GapNote>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tomorrow panel
// ---------------------------------------------------------------------------

const TIER_BADGE: Record<TomorrowItemRow["tier"], { tone: "danger" | "muted" | "success" | "neutral"; label: string }> = {
  short: { tone: "danger", label: "Short" },
  ready: { tone: "success", label: "Ready" },
  non_working: { tone: "muted", label: "Non-working day" },
  unknown: { tone: "neutral", label: "Unknown" },
};

function TomorrowPanel({
  rows,
  flowError,
  coverage,
  coverageError,
}: {
  rows: TomorrowItemRow[];
  flowError: boolean;
  coverage: DemandCoverageResponse | undefined;
  coverageError: boolean;
}) {
  const shortRows = rows.filter((r) => r.tier === "short");
  const restRows = rows.filter((r) => r.tier !== "short");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-sops text-fg-muted">
          Tomorrow&apos;s readiness
        </h3>
        {flowError ? (
          <Note>Inventory flow couldn&apos;t be loaded right now.</Note>
        ) : rows.length === 0 ? (
          <Note>No inventory flow data available for tomorrow.</Note>
        ) : (
          <>
            {shortRows.length === 0 ? (
              <Note>No items are projected short tomorrow.</Note>
            ) : (
              <ul className="flex flex-col gap-2">
                {shortRows.map((r) => (
                  <li
                    key={r.item_id}
                    className="flex flex-col gap-1 rounded border border-danger/50 bg-danger-softer px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone="danger" dot>
                        Short
                      </Badge>
                      <span className="font-medium text-fg-strong">{r.item_name}</span>
                    </span>
                    <span className="text-xs text-danger-fg">
                      Short by {r.shortfall_qty != null ? r.shortfall_qty.toLocaleString() : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <details className="rounded border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fg-muted">
                {restRows.length} other item{restRows.length === 1 ? "" : "s"}
              </summary>
              <ul className="flex flex-col gap-1 border-t border-border p-2">
                {restRows.map((r) => (
                  <li
                    key={r.item_id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs"
                  >
                    <span className="truncate text-fg-strong">{r.item_name}</span>
                    <Badge tone={TIER_BADGE[r.tier].tone} size="xs">
                      {TIER_BADGE[r.tier].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {coverageError ? (
          <Note>Demand coverage couldn&apos;t be loaded right now.</Note>
        ) : coverage ? (
          <Note tone={coverage.is_partial ? "warning" : "muted"}>
            Demand coverage: {coverage.resolved_distinct_skus.toLocaleString()} of{" "}
            {coverage.total_distinct_skus.toLocaleString()} SKUs resolved
            {coverage.is_partial ? " (partial)" : ""}. This is order-line coverage, not a
            per-item flag.
          </Note>
        ) : null}
        <GapNote>
          The aggregate READY flag (does stock cover ALL open demand for an item) needs a
          per-order/per-item open-demand read model that doesn&apos;t exist yet (gap G4).
          The Short/Ready tiers above are the daily projected-balance tier only — not that
          flag.
        </GapNote>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TodayBoard — orchestration
// ---------------------------------------------------------------------------

export function TodayBoard() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const activeTab: TodayBoardTabKey = isTodayBoardTabKey(tabParam) ? tabParam : "today";

  const today = todayIsoLocal();
  const yesterday = addDaysIso(today, -1);
  const tomorrow = addDaysIso(today, 1);

  const plansQuery = usePlans(yesterday, today);
  const actualsQuery = useQuery<ListEnvelope<ProductionActualHistoryRow>>({
    queryKey: ["today-board", "production-actuals-history"],
    queryFn: () => fetchJsonOrThrow("/api/production-actuals/history?limit=200"),
    staleTime: 60_000,
    retry: false,
  });
  const creditsQuery = useQuery<CreditTrackingListResponse>({
    queryKey: ["today-board", "credit-tracking"],
    queryFn: () => fetchJsonOrThrow("/api/credit-tracking?limit=1000"),
    staleTime: 60_000,
    retry: false,
  });
  const posQuery = useQuery<ListEnvelope<PurchaseOrderRowLite>>({
    queryKey: ["today-board", "purchase-orders"],
    queryFn: () =>
      fetchJsonOrThrow("/api/purchase-orders?status=OPEN&status=PARTIAL&limit=200"),
    staleTime: 30_000,
    retry: false,
  });
  const flowQuery = useInventoryFlow({ start: today, horizon_weeks: 1 });
  const coverageQuery = useQuery<DemandCoverageResponse>({
    queryKey: ["today-board", "demand-coverage"],
    queryFn: () => fetchJsonOrThrow("/api/planning/demand-coverage"),
    staleTime: 60_000,
    retry: false,
  });

  // useMemo (not `?? []` inline) so a new-empty-array reference doesn't
  // re-trigger every downstream builder's useMemo on every render.
  const planRowsData = plansQuery.data?.rows;
  const actualRowsData = actualsQuery.data?.rows;
  const creditRowsData = creditsQuery.data?.rows;
  const poRowsData = posQuery.data?.rows;
  const flowItemsData = flowQuery.data?.items;
  const planRows = useMemo(() => planRowsData ?? [], [planRowsData]);
  const actualRows = useMemo(() => actualRowsData ?? [], [actualRowsData]);
  const creditRows = useMemo(() => creditRowsData ?? [], [creditRowsData]);
  const poRows = useMemo(() => poRowsData ?? [], [poRowsData]);
  const flowItems = useMemo(() => flowItemsData ?? [], [flowItemsData]);

  const yesterdayRows = useMemo(
    () => buildYesterdayPlanVsActual(planRows, actualRows, yesterday),
    [planRows, actualRows, yesterday],
  );
  const unmatchedCount = useMemo(
    () => findUnmatchedActuals(planRows, actualRows).length,
    [planRows, actualRows],
  );
  const credits = useMemo(
    () => buildYesterdayCreditsSummary(creditRows, yesterday),
    [creditRows, yesterday],
  );
  const todayPlanRows = useMemo(() => buildTodayPlan(planRows, today), [planRows, today]);
  const arrivals = useMemo(() => bucketArrivals(poRows, today), [poRows, today]);
  const tomorrowTiers = useMemo(
    () => buildTomorrowTiers(flowItems, tomorrow),
    [flowItems, tomorrow],
  );

  return (
    <section
      data-testid="today-board"
      className="card animate-fade-in-up motion-reduce:animate-none flex flex-col gap-4 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-fg-strong">Today board</h2>
          <p className="text-sm text-fg-muted">
            Yesterday&apos;s plan vs. actual, today&apos;s locked plan, tomorrow&apos;s
            readiness.
          </p>
        </div>
        <TodayBoardTabs activeTab={activeTab} />
      </div>

      <div
        role="tabpanel"
        id={`${TODAY_BOARD_TAB_IDS[activeTab]}-panel`}
        aria-labelledby={TODAY_BOARD_TAB_IDS[activeTab]}
        data-testid={`today-board-panel-${activeTab}`}
      >
        {activeTab === "yesterday" ? (
          <YesterdayPanel
            rows={yesterdayRows}
            unmatchedCount={unmatchedCount}
            plansError={plansQuery.isError}
            actualsError={actualsQuery.isError}
            credits={credits}
            creditsError={creditsQuery.isError}
          />
        ) : activeTab === "today" ? (
          <TodayPanel
            rows={todayPlanRows}
            plansError={plansQuery.isError}
            arrivalsToday={arrivals.today}
            arrivalsOverdue={arrivals.overdue}
            arrivalsError={posQuery.isError}
          />
        ) : (
          <TomorrowPanel
            rows={tomorrowTiers}
            flowError={flowQuery.isError}
            coverage={coverageQuery.data}
            coverageError={coverageQuery.isError}
          />
        )}
      </div>
    </section>
  );
}
