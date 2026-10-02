"use client";

// The sales report as a screen: five tabs over one data blob, every state stated.
//
// What is on screen is always one of: the skeleton of the report while it loads; "not built yet";
// an error with a retry (or, for a signed-out viewer, a way back in); or the report itself, under an
// amber band when it is stale. A rep who opens the URL gets a card that says it is not theirs and no
// request is made on their behalf.

import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSession } from "@/lib/auth/session-provider";
import { useSalesReport } from "../../_lib/api";
import { NAV_LABELS, REPORT_UI as L } from "../../_lib/labels";
import { DEFAULT_SORT, type SortState } from "../../_lib/report/aggregate";
import { freshnessOf, historicNoteLine, validReportData, type Freshness } from "../../_lib/report/freshness";
import { useMediaQuery, useNow, useReportTab } from "../../_lib/report/hooks";
import { defaultPeriod, periodYears } from "../../_lib/report/period";
import type { Period, ReportData, ReportPayload, ReportTab, Unit } from "../../_lib/report/types";
import { QueueError } from "../EmptyStates";
import { ChainsTab } from "./ChainsTab";
import { DailyTab } from "./DailyTab";
import { GridTab } from "./GridTab";
import { RefreshFailed, ReportHeader, StaleBand } from "./ReportHeader";
import type { ViewMode } from "./ReportControls";
import { ReportInvalid, ReportNever, ReportNotYours, ReportSignedOut, ReportSkeleton } from "./ReportStates";
import { TrendTab } from "./TrendTab";

const TAB_ORDER: readonly ReportTab[] = ["daily", "cust", "prod", "chain", "trend"];
/** The app bar is 56px; the tab bar stays under it while the report scrolls. */
const APPBAR = 56;

export function ReportScreen() {
  const { session } = useSession();
  const manager = session?.role === "admin" || session?.role === "planner";
  const report = useSalesReport(manager);
  const now = useNow();
  const [tab, setTab] = useReportTab();

  if (!manager) {
    return (
      <div className="flex flex-col gap-4" data-testid="sales-report">
        <ReportHeader fresh={null} scope={false} />
        <ReportNotYours />
      </div>
    );
  }

  const payload = report.data;
  const usable = Boolean(payload && (payload.state === "never" || validReportData(payload.data)));
  // no freshness pill over a report that cannot be shown
  const fresh = payload && usable ? freshnessOf(payload, now) : null;
  const status = report.error?.status;

  return (
    <div className="flex flex-col gap-4" data-testid="sales-report">
      <ReportHeader fresh={fresh} />
      {report.isLoading ? <ReportSkeleton /> : null}
      {report.isError && !payload ? (
        status === 401 ? <ReportSignedOut /> : status === 403 ? <ReportNotYours /> : <QueueError onRetry={() => void report.refetch()} what={L.loadErrorWhat} />
      ) : null}
      {payload ? (
        <ReportBody
          payload={payload}
          fresh={fresh ?? freshnessOf(payload, now)}
          usable={usable}
          refreshFailed={report.isError}
          pending={report.isFetching}
          onRetry={() => void report.refetch()}
          tab={tab}
          onTab={setTab}
        />
      ) : null}
    </div>
  );
}

function ReportBody({ payload, fresh, usable, refreshFailed, pending, onRetry, tab, onTab }: { payload: ReportPayload; fresh: Freshness; usable: boolean; refreshFailed: boolean; pending: boolean; onRetry: () => void; tab: ReportTab; onTab: (t: ReportTab) => void }) {
  if (payload.state === "never") return <ReportNever why={fresh.why === "delayed" ? null : fresh.why} />;
  if (!usable || !validReportData(payload.data)) return <ReportInvalid onRetry={onRetry} />;
  const note = historicNoteLine(payload.notes?.historic_sku_over_threshold);
  return (
    <>
      {fresh.stale ? <StaleBand fresh={fresh} /> : null}
      {refreshFailed ? <RefreshFailed clock={fresh.clock} pending={pending} onRetry={onRetry} /> : null}
      {note ? (
        <p className="s-rp-note" data-testid="report-note-historic">
          {note}
        </p>
      ) : null}
      <Report d={payload.data} tab={tab} onTab={onTab} />
    </>
  );
}

const freshSorts = (): Record<ReportTab, SortState> => ({ daily: DEFAULT_SORT, cust: DEFAULT_SORT, prod: DEFAULT_SORT, chain: DEFAULT_SORT, trend: DEFAULT_SORT });

/** The report itself: tab bar, and the preferences each tab shares or keeps for itself. */
function Report({ d, tab, onTab }: { d: ReportData; tab: ReportTab; onTab: (t: ReportTab) => void }) {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(d));
  const [unit, setUnit] = useState<Unit>("rev");
  const [viewPref, setViewPref] = useState<ViewMode | null>(null);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [heat, setHeat] = useState(true);
  const [range, setRange] = useState(30);
  const [qs, setQs] = useState<Record<ReportTab, string>>({ daily: "", cust: "", prod: "", chain: "", trend: "" });
  // a sort belongs to its tab and stays there; a column the period does not have is dropped at read time
  const [sorts, setSorts] = useState<Record<ReportTab, SortState>>(freshSorts);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  // a focused control or a keyboard jump is never left under the bars: the page keeps room for both
  useEffect(() => {
    const el = document.documentElement;
    el.style.scrollPaddingTop = `${APPBAR + 64}px`;
    el.style.scrollPaddingBottom = "96px";
    return () => {
      el.style.scrollPaddingTop = "";
      el.style.scrollPaddingBottom = "";
    };
  }, []);

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
    onTab(t);
    // a new tab opens at its top, not wherever the last one was scrolled to
    requestAnimationFrame(() => {
      const top = (sentinel.current?.getBoundingClientRect().top ?? 0) + window.scrollY - APPBAR - 4;
      if (window.scrollY > top) window.scrollTo({ top });
    });
  };
  const sortFor = (t: ReportTab) => (s: SortState) => setSorts((cur) => ({ ...cur, [t]: s }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TAB_ORDER.indexOf(tab);
    // the first tab is at the right: the key that points left reaches the next one
    const next =
      e.key === "ArrowLeft" ? TAB_ORDER[(i + 1) % TAB_ORDER.length] : e.key === "ArrowRight" ? TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length] : e.key === "Home" ? TAB_ORDER[0] : e.key === "End" ? TAB_ORDER[TAB_ORDER.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    choose(next);
    document.getElementById(`rp-tab-${next}`)?.focus();
  };

  return (
    <>
      <div ref={sentinel} aria-hidden />
      <div className="s-rp-sticky" data-testid="report-sticky">
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
      </div>

      <div role="tabpanel" id="rp-panel" aria-labelledby={`rp-tab-${tab}`} className="flex flex-col gap-3">
        <h2 className="sr-only">{`${NAV_LABELS.reportFull} · ${L.tabs[tab]}`}</h2>
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
            onSort={sortFor(tab)}
            open={open}
            onToggle={toggle}
          />
        ) : null}
        {tab === "chain" ? (
          <ChainsTab d={d} period={effPeriod} onPeriod={setPeriod} unit={unit} onUnit={setUnit} view={view} onView={setViewPref} q={qs.chain} onQ={(v) => setQ("chain", v)} open={open} onToggle={toggle} />
        ) : null}
        {tab === "trend" ? <TrendTab d={d} unit={unit} onUnit={setUnit} /> : null}
      </div>
      <BackToTop />
    </>
  );
}

/** After two screens of scrolling, one tap back to the top (the tab bar is there, but a long list is a long way down). */
function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="s-btn s-btn-primary s-fab fixed z-30"
      aria-label={L.toTop}
      data-testid="report-to-top"
      onClick={() => window.scrollTo({ top: 0 })}
      style={{ insetInlineStart: 16, bottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))", borderRadius: "var(--s-radius-pill)" }}
    >
      <ArrowUp size={22} aria-hidden />
      <span className="hidden md:inline">{L.toTop}</span>
    </button>
  );
}
