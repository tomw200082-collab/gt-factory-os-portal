"use client";

// The sales report as a screen: five tabs over one data blob, every state stated.
//
// What is on screen is always one of: the skeleton of the report while it loads; "not built yet";
// an error with a retry; or the report itself, under an amber band when it is stale. A rep who
// opens the URL gets the manager-only message and no request is made on their behalf.

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useSession } from "@/lib/auth/session-provider";
import { useSalesReport } from "../../_lib/api";
import { NAV_LABELS, REPORT_UI as L } from "../../_lib/labels";
import { DEFAULT_SORT, nextSort, type SortCol, type SortState } from "../../_lib/report/aggregate";
import { freshnessOf, validReportData, type Freshness } from "../../_lib/report/freshness";
import { useMediaQuery, useNow, useReportTab } from "../../_lib/report/hooks";
import { defaultPeriod, periodYears } from "../../_lib/report/period";
import type { Period, ReportData, ReportPayload, ReportTab, Unit } from "../../_lib/report/types";
import { QueueError } from "../EmptyStates";
import { ChainsTab } from "./ChainsTab";
import { DailyTab } from "./DailyTab";
import { GridTab } from "./GridTab";
import { RefreshFailed, ReportHeader, StaleBand } from "./ReportHeader";
import { ReportInvalid, ReportNever, ReportSkeleton } from "./ReportStates";
import type { ViewMode } from "./ReportControls";
import { TrendTab } from "./TrendTab";

const TAB_ORDER: readonly ReportTab[] = ["daily", "cust", "prod", "chain", "trend"];

export function ReportScreen() {
  const { session } = useSession();
  const manager = session?.role === "admin" || session?.role === "planner";
  const report = useSalesReport(manager);
  const now = useNow();
  const [tab, setTab] = useReportTab();

  if (!manager) {
    return (
      <div className="flex flex-col gap-4" data-testid="sales-report">
        <ReportHeader fresh={null} />
        <p className="text-sm" style={{ color: "hsl(var(--s-fg-muted))" }} data-testid="report-manager-only">
          {L.managerOnly}
        </p>
      </div>
    );
  }

  const payload = report.data;
  const fresh = payload ? freshnessOf(payload, now) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="sales-report">
      <ReportHeader fresh={fresh} />
      {report.isLoading ? <ReportSkeleton /> : null}
      {report.isError && !payload ? <QueueError onRetry={() => void report.refetch()} what={L.loadErrorWhat} /> : null}
      {payload ? (
        <ReportBody
          payload={payload}
          fresh={fresh!}
          refreshFailed={report.isError}
          onRetry={() => void report.refetch()}
          tab={tab}
          onTab={setTab}
        />
      ) : null}
    </div>
  );
}

function ReportBody({ payload, fresh, refreshFailed, onRetry, tab, onTab }: { payload: ReportPayload; fresh: Freshness; refreshFailed: boolean; onRetry: () => void; tab: ReportTab; onTab: (t: ReportTab) => void }) {
  if (payload.state === "never") return <ReportNever />;
  if (!validReportData(payload.data)) return <ReportInvalid onRetry={onRetry} />;
  const missed = payload.notes?.historic_sku_over_threshold;
  return (
    <>
      {fresh.stale ? <StaleBand fresh={fresh} /> : null}
      {refreshFailed ? <RefreshFailed clock={fresh.clock} onRetry={onRetry} /> : null}
      {missed && missed > 0 ? (
        <p className="s-rp-note" data-testid="report-note-historic">
          {L.historicSku(missed)}
        </p>
      ) : null}
      <Report d={payload.data} tab={tab} onTab={onTab} />
    </>
  );
}

const freshSort = (): Record<ReportTab, SortState> => ({ daily: DEFAULT_SORT, cust: DEFAULT_SORT, prod: DEFAULT_SORT, chain: DEFAULT_SORT, trend: DEFAULT_SORT });

/** The report itself: tab bar, and the preferences each tab shares or keeps for itself. */
function Report({ d, tab, onTab }: { d: ReportData; tab: ReportTab; onTab: (t: ReportTab) => void }) {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(d));
  const [unit, setUnit] = useState<Unit>("rev");
  const [viewPref, setViewPref] = useState<ViewMode | null>(null);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [heat, setHeat] = useState(true);
  const [range, setRange] = useState(30);
  const [qs, setQs] = useState<Record<ReportTab, string>>({ daily: "", cust: "", prod: "", chain: "", trend: "" });
  const [sorts, setSorts] = useState<Record<ReportTab, SortState>>(freshSort);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  // a period the new data no longer has (the year turned) falls back to the default
  const years = useMemo(() => periodYears(d.months), [d.months]);
  const periodOk = period === "all" || period === "12" || years.includes(period);
  const effPeriod = periodOk ? period : defaultPeriod(d);
  // a phone opens on the summary, a desktop on the month table, until the viewer chooses
  const view: ViewMode = viewPref ?? (desktop ? "months" : "summary");

  const setQ = useCallback((t: ReportTab, v: string) => setQs((cur) => ({ ...cur, [t]: v })), []);
  const toggle = useCallback(
    (key: string) =>
      setOpen((cur) => {
        const next = new Set(cur);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );
  const choose = (t: ReportTab) => {
    // the Artifact sorts afresh on every tab
    setSorts(freshSort());
    onTab(t);
  };
  const sortBy = (t: ReportTab) => (col: SortCol) => setSorts((cur) => ({ ...cur, [t]: nextSort(cur[t], col) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // the first tab is at the right: the key that points left reaches the next one
    const step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TAB_ORDER[(TAB_ORDER.indexOf(tab) + step + TAB_ORDER.length) % TAB_ORDER.length];
    choose(next);
    document.getElementById(`rp-tab-${next}`)?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label={L.tabsLabel} className="s-rp-seg" style={{ maxInlineSize: 560 }} data-testid="report-tabs" onKeyDown={onKeyDown}>
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            id={`rp-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls="rp-panel"
            tabIndex={tab === t ? 0 : -1}
            data-testid={`report-tabbtn-${t}`}
            onClick={() => choose(t)}
          >
            {L.tabs[t]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="rp-panel" aria-labelledby={`rp-tab-${tab}`} aria-label={NAV_LABELS.reportFull} className="flex flex-col gap-3">
        {tab === "daily" ? <DailyTab d={d} range={range} onRange={setRange} /> : null}
        {tab === "cust" || tab === "prod" ? (
          <GridTab
            d={d}
            tab={tab}
            period={effPeriod}
            onPeriod={setPeriod}
            unit={unit}
            onUnit={setUnit}
            view={view}
            onView={setViewPref}
            heat={heat}
            onHeat={setHeat}
            q={qs[tab]}
            onQ={(v) => setQ(tab, v)}
            sort={sorts[tab]}
            onSort={sortBy(tab)}
            open={open}
            onToggle={toggle}
          />
        ) : null}
        {tab === "chain" ? (
          <ChainsTab d={d} period={effPeriod} onPeriod={setPeriod} unit={unit} onUnit={setUnit} view={view} onView={setViewPref} q={qs.chain} onQ={(v) => setQ("chain", v)} open={open} onToggle={toggle} />
        ) : null}
        {tab === "trend" ? <TrendTab d={d} unit={unit} onUnit={setUnit} /> : null}
      </div>
    </>
  );
}
