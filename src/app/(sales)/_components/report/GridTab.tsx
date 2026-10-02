"use client";

// The customers and products tabs: one grid of rows over a period, in shekels or units.
//
// Phone: a summary list (name, total, share, year over year, a line), tap a row for what is inside
// it. Desktop, and "by month" on a phone: the month table, in its own scroller with the name column
// held in place and the headers held at the top. The page itself never scrolls sideways.

import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import { Fragment, useDeferredValue, useId, useMemo, useRef } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { buildGrid, gridChildren, type GridChild, type GridModel, type GridRow, type Heat, type SortCol, type SortState, type YoyCell, nextSort } from "../../_lib/report/aggregate";
import { gridCsvRows } from "../../_lib/report/csv";
import { amount, cell, cellCompact, fmtInt, money, pctTone, signedPct } from "../../_lib/report/format";
import { useMediaQuery, usePinnedScroller } from "../../_lib/report/hooks";
import { monthLabel, monthName, periodYears } from "../../_lib/report/period";
import type { Period, ReportData, Unit } from "../../_lib/report/types";
import { ListEmpty } from "../EmptyStates";
import { CopyCsv } from "./CopyCsv";
import { ControlsBar, HeatToggle, PeriodControl, SearchBox, UnitControl, ViewControl, type ViewMode } from "./ReportControls";
import { Sparkline } from "./Sparkline";

export interface GridTabProps {
  d: ReportData;
  tab: "cust" | "prod";
  period: Period;
  onPeriod: (p: Period) => void;
  unit: Unit;
  onUnit: (u: Unit) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  heat: boolean;
  onHeat: (v: boolean) => void;
  q: string;
  onQ: (q: string) => void;
  sort: SortState;
  onSort: (s: SortState) => void;
  open: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

export function heatBackground(h: Heat | null): string | undefined {
  if (!h) return undefined;
  return `hsl(var(${h.dir === "up" ? "--s-status-won" : "--s-sla-overdue"}) / ${h.alpha})`;
}

/** A heat tint is colour alone; the arrow says it again for a viewer who cannot tell the two apart. */
export function HeatMark({ h }: { h: Heat | null }) {
  if (!h) return null;
  return (
    <>
      <span className="s-rp-hm" aria-hidden>
        {h.dir === "up" ? "▲" : "▼"}
      </span>
      <span className="sr-only">{h.dir === "up" ? L.heatAbove : L.heatBelow}</span>
    </>
  );
}

/** A figure in a table cell. On a phone it is short (8.3K) and the full figure rides along for a screen reader and a long press. */
export function Fig({ v, unit, short }: { v: number; unit: Unit; short: boolean }) {
  const full = cell(v, unit);
  if (!short || !v) return <>{full}</>;
  return (
    <>
      <span aria-hidden title={full}>
        {cellCompact(v, unit)}
      </span>
      <span className="sr-only">{full}</span>
    </>
  );
}

/** A name in a narrow cell: two lines at most, and a Latin name keeps its start (it is isolated left-to-right). */
export function NameText({ name }: { name: string }) {
  return <span className="s-rp-name">{/[A-Za-z]/.test(name) ? <bdi dir="ltr">{name}</bdi> : name}</span>;
}

/** A percentage's colour follows what it prints: 0% is neither green nor red. */
export function YoyText({ cell: c }: { cell: YoyCell | null }) {
  if (!c) return null;
  if (c.kind === "new") return <span className="s-rp-muted">{L.yoyNew}</span>;
  const tone = pctTone(c.pct);
  return <span className={tone === "up" ? "s-rp-up" : tone === "dn" ? "s-rp-down" : "s-rp-muted"}>{signedPct(c.pct)}</span>;
}

function YoyChip({ cell: c }: { cell: YoyCell | null }) {
  if (!c) return null;
  if (c.kind === "new") return <span className="s-rp-chip">{L.yoyNew}</span>;
  return (
    <span className={`s-rp-chip s-rp-chip-${pctTone(c.pct)}`} dir="ltr">
      {signedPct(c.pct)}
    </span>
  );
}

/** The partial month is in the period: the line says so, and says up to when. */
export function partialNote(d: ReportData, ms: readonly number[]): string | null {
  return ms.includes(d.partialIdx) ? L.summaryIncludesPartial(monthName(d.months, d.partialIdx), d.pulledShort) : null;
}

export function summaryLine(g: GridModel, unit: Unit, d: ReportData): string {
  const s = g.summary;
  const base = s.filtered
    ? unit === "rev"
      ? L.sumFilteredRev(money(s.total), L.rowsWord(s.rows))
      : L.sumFilteredUnits(fmtInt(s.total), L.rowsWord(s.rows))
    : unit === "rev"
      ? L.sumRev(money(s.total), L.orders(s.orders), L.customers(s.customers))
      : L.sumUnits(fmtInt(s.total), L.orders(s.orders), L.customers(s.customers));
  const partial = partialNote(d, g.ms);
  return partial ? `${base} · ${partial}` : base;
}

function sortLabel(tab: "cust" | "prod", d: ReportData, sort: SortState): string {
  return sort.col === "k" ? (tab === "cust" ? L.colCust : L.colProd) : sort.col === "tot" ? L.colTotal : sort.col === "yoy" ? L.colYoy : monthLabel(d.months, sort.col);
}

export function GridTab(p: GridTabProps) {
  const { d, tab, period, unit, sort } = p;
  const dim = tab === "cust" ? "cust" : "fam";
  // typing stays instant; the grid catches up a moment later
  const q = useDeferredValue(p.q);
  const grid = useMemo(() => buildGrid(d, { dim, period, unit, q, sort }), [d, dim, period, unit, q, sort]);
  const years = useMemo(() => periodYears(d.months), [d.months]);
  const monthsView = p.view === "months";

  return (
    <div className="flex flex-col gap-3" data-testid={`report-tab-${tab}`}>
      <ControlsBar>
        <PeriodControl years={years} value={period} onChange={p.onPeriod} />
        <UnitControl value={unit} onChange={p.onUnit} />
        <ViewControl value={p.view} onChange={p.onView} />
        {monthsView ? <HeatToggle on={p.heat} onChange={p.onHeat} /> : null}
        <SearchBox value={p.q} onChange={p.onQ} placeholder={tab === "cust" ? L.searchCust : L.searchProd}>
          <CopyCsv rows={() => gridCsvRows(d, grid, tab, unit)} />
        </SearchBox>
      </ControlsBar>

      {grid.rows.length > 0 || !q.trim() ? (
        <p className="s-nums text-[13px] font-medium" style={{ color: "hsl(var(--s-fg-muted))" }} data-testid="report-summary" role="group" aria-label={L.summaryLabel} aria-live="polite">
          {summaryLine(grid, unit, d)}
        </p>
      ) : null}

      {grid.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2">
          <ListEmpty label={q.trim() ? L.emptySearch : L.emptyPeriod} />
          {q.trim() ? (
            <button type="button" className="s-btn s-btn-ghost" data-testid="report-clear-search" onClick={() => p.onQ("")}>
              {L.clearSearch}
            </button>
          ) : null}
        </div>
      ) : monthsView ? (
        <MonthTable {...p} grid={grid} />
      ) : (
        <SummaryList {...p} grid={grid} />
      )}
      {monthsView && grid.ms.includes(d.partialIdx) ? <p className="s-rp-note" data-testid="partial-key">* {L.partialKey(monthLabel(d.months, d.partialIdx), d.pulledShort)}</p> : null}
      {monthsView && p.heat ? <p className="s-rp-note">{L.heatHint}</p> : null}
    </div>
  );
}

type Inner = GridTabProps & { grid: GridModel };

function MonthTable({ d, tab, period, unit, heat, onSort, open, onToggle, grid }: Inner) {
  const { ms, sort } = grid;
  const dim = tab === "cust" ? "cust" : "fam";
  const aria = (col: SortCol): "ascending" | "descending" | "none" => (sort.col === col ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const arrow = (col: SortCol) => (sort.col === col ? sort.dir === "asc" ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden /> : null);
  const sortBtn = (col: SortCol, label: string) => (
    <button type="button" className="s-rp-sort" onClick={() => onSort(nextSort(sort, col))} title={L.sortBy(label)}>
      {label}
      {arrow(col)}
    </button>
  );
  const scroller = useRef<HTMLDivElement>(null);
  const short = useMediaQuery("(max-width: 639px)");
  usePinnedScroller(scroller, `${period}${ms.length}${tab}${short}`);
  const name = tab === "cust" ? L.colCust : L.colProd;
  return (
    <div ref={scroller} className="s-card s-rp-scroll s-rp-scroll-tall" role="region" tabIndex={0} aria-label={L.tableCaption(name)} data-testid="report-table">
      <table className="s-rp-table" aria-label={L.tableCaption(name)}>
        <caption className="sr-only">{L.tableCaption(tab === "cust" ? L.colCust : L.colProd)}</caption>
        <thead>
          <tr>
            <th className="s-rp-first" scope="col" aria-sort={aria("k")}>
              {sortBtn("k", tab === "cust" ? L.colCust : L.colProd)}
            </th>
            {ms.map((i) => {
              const label = monthLabel(d.months, i) + (i === d.partialIdx ? ` ${L.partialMark}` : "");
              return (
                <th key={i} className="s-rp-num" scope="col" aria-sort={aria(i)}>
                  {sortBtn(i, label)}
                </th>
              );
            })}
            <th className="s-rp-num" scope="col" aria-sort={aria("tot")}>
              {sortBtn("tot", L.colTotal)}
            </th>
            <th className="s-rp-mid s-rp-opt-sm" scope="col">
              {L.colShare}
            </th>
            {grid.hasYoy ? (
              <th className="s-rp-mid s-rp-opt-sm" scope="col" aria-sort={aria("yoy")}>
                {sortBtn("yoy", L.colYoy)}
              </th>
            ) : null}
            <th className="s-rp-mid s-rp-opt-lg" scope="col">
              {L.colTrend}
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => {
            const key = `${tab}⊞${r.k}`;
            const isOpen = open.has(key);
            return (
              <Fragment key={r.k}>
                <tr className="s-rp-main" data-testid="report-row" data-key={r.k}>
                  <th scope="row" className="s-rp-first" title={r.sub || undefined}>
                    <button type="button" className="s-rp-rowbtn" aria-expanded={isOpen} onClick={() => onToggle(key)}>
                      <ChevronLeft size={14} className="s-rp-chev" aria-hidden />
                      <NameText name={r.k} />
                      {r.sub ? <span className="s-rp-sub">· {r.sub}</span> : null}
                    </button>
                  </th>
                  {r.months.map((v, j) => (
                    <td key={ms[j]} className="s-rp-num" style={heat ? { background: heatBackground(r.heat[j]) } : undefined} data-testid="cell-month">
                      {heat ? <HeatMark h={r.heat[j]} /> : null}
                      <Fig v={v} unit={unit} short={short} />
                    </td>
                  ))}
                  <td className="s-rp-num" style={{ fontWeight: 700 }} data-testid="cell-total">
                    <Fig v={r.tot} unit={unit} short={short} />
                  </td>
                  <td className="s-rp-mid s-rp-muted s-rp-opt-sm">{r.share === null ? "" : `${r.share.toFixed(1)}%`}</td>
                  {grid.hasYoy ? (
                    <td className="s-rp-mid s-rp-opt-sm" data-testid="cell-yoy">
                      <YoyText cell={r.yoy} />
                    </td>
                  ) : null}
                  <td className="s-rp-mid s-rp-opt-lg">
                    <Sparkline vals={r.spark} w={72} />
                  </td>
                </tr>
                {isOpen ? <ChildRows d={d} dim={dim} period={period} unit={unit} parent={r.k} ms={ms} hasYoy={grid.hasYoy} short={short} /> : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="s-rp-total" data-testid="report-total">
            <th scope="row" className="s-rp-first">{grid.capped ? L.totalRowCapped(grid.rows.length, grid.matched) : L.totalRow}</th>
            {grid.total.months.map((v, j) => (
              <td key={ms[j]} className="s-rp-num">
                <Fig v={v} unit={unit} short={short} />
              </td>
            ))}
            <td className="s-rp-num" data-testid="total-tot">
              <Fig v={grid.total.tot} unit={unit} short={short} />
            </td>
            <td className="s-rp-mid s-rp-opt-sm">100%</td>
            {grid.hasYoy ? (
              <td className="s-rp-mid s-rp-opt-sm" data-testid="total-yoy">
                {grid.total.yoy ? <YoyText cell={{ kind: "pct", pct: grid.total.yoy.pct, up: grid.total.yoy.up }} /> : null}
              </td>
            ) : null}
            <td className="s-rp-opt-lg" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ChildRows({ d, dim, period, unit, parent, ms, hasYoy, short }: { d: ReportData; dim: "cust" | "fam"; period: Period; unit: Unit; parent: string; ms: number[]; hasYoy: boolean; short: boolean }) {
  const kids = useMemo(() => gridChildren(d, { dim, period, unit }, parent), [d, dim, period, unit, parent]);
  return (
    <>
      {kids.map((k) => (
        <tr key={k.k} className="s-rp-child" data-testid="report-child">
          <th scope="row" className="s-rp-first" style={{ paddingInlineStart: 30, fontWeight: 400 }} title={k.k}>
            <NameText name={k.k} />
          </th>
          {k.months.map((v, j) => (
            <td key={ms[j]} className="s-rp-num">
              <Fig v={v} unit={unit} short={short} />
            </td>
          ))}
          <td className="s-rp-num" style={{ fontWeight: 600 }}>
            <Fig v={k.tot} unit={unit} short={short} />
          </td>
          <td className="s-rp-mid s-rp-opt-sm">{k.share === null ? "" : `${k.share.toFixed(0)}%`}</td>
          {hasYoy ? <td className="s-rp-opt-sm" /> : null}
          <td className="s-rp-mid s-rp-opt-lg">
            <Sparkline vals={k.spark} w={72} h={18} />
          </td>
        </tr>
      ))}
    </>
  );
}

function SummaryList({ d, tab, period, unit, open, onToggle, grid }: Inner) {
  const dim = tab === "cust" ? "cust" : "fam";
  return (
    <div className="s-card overflow-hidden" data-testid="report-summary-list">
      <p className="s-rp-note px-4 pt-3" data-testid="report-sorted-by">
        {L.sortedBy(sortLabel(tab, d, grid.sort), grid.sort.dir === "asc")}
      </p>
      <ul className="s-rp-list">
        {grid.rows.map((r) => {
          const key = `${tab}⊞${r.k}`;
          const isOpen = open.has(key);
          return (
            <li key={r.k} data-testid="report-row" data-key={r.k}>
              <SummaryRow row={r} unit={unit} hasYoy={grid.hasYoy} isOpen={isOpen} onToggle={() => onToggle(key)} />
              {isOpen ? <SummaryChildren d={d} dim={dim} period={period} unit={unit} parent={r.k} /> : null}
            </li>
          );
        })}
      </ul>
      <div className="s-rp-item s-rp-total" style={{ cursor: "default", background: "hsl(var(--s-accent-soft))" }} data-testid="report-total">
        <span className="s-rp-item-name" style={{ fontWeight: 600 }}>
          {grid.capped ? L.totalRowCapped(grid.rows.length, grid.matched) : L.totalRow}
        </span>
        <span className="s-rp-item-total" data-testid="total-tot">
          {amount(grid.total.tot, unit)}
        </span>
        {grid.hasYoy && grid.total.yoy ? (
          <span className="s-rp-item-meta" data-testid="total-yoy">
            <YoyChip cell={{ kind: "pct", pct: grid.total.yoy.pct, up: grid.total.yoy.up }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The row's name is its button's name; its figures are the description. aria-expanded says open or closed. */
function SummaryRow({ row, unit, hasYoy, isOpen, onToggle }: { row: GridRow; unit: Unit; hasYoy: boolean; isOpen: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <button type="button" className="s-rp-item" aria-expanded={isOpen} aria-labelledby={`${id}n`} aria-describedby={`${id}t ${id}m`} onClick={onToggle}>
      <span className="s-rp-item-name">
        <ChevronLeft size={14} className="s-rp-chev" aria-hidden />
        <span id={`${id}n`}>{row.k}</span>
      </span>
      <span className="s-rp-item-total" id={`${id}t`} data-testid="cell-total">
        {amount(row.tot, unit)}
      </span>
      <span className="s-rp-item-meta" id={`${id}m`}>
        {row.sub ? <span className="s-rp-sub">{row.sub}</span> : null}
        {row.share !== null ? <span className="s-nums">{row.share.toFixed(1)}%</span> : null}
        {hasYoy ? <YoyChip cell={row.yoy} /> : null}
      </span>
      <span className="s-rp-item-spark">
        <Sparkline vals={row.spark} />
      </span>
    </button>
  );
}

function SummaryChildren({ d, dim, period, unit, parent }: { d: ReportData; dim: "cust" | "fam"; period: Period; unit: Unit; parent: string }) {
  const kids: GridChild[] = useMemo(() => gridChildren(d, { dim, period, unit }, parent), [d, dim, period, unit, parent]);
  return (
    <ul className="s-rp-list" data-testid="report-children">
      {kids.map((k) => (
        <li key={k.k}>
          <div className="s-rp-item s-rp-item-child" style={{ cursor: "default" }} data-testid="report-child">
            <span className="s-rp-item-name">
              <span title={k.k}>{k.k}</span>
            </span>
            <span className="s-rp-item-total" style={{ fontSize: 13 }}>
              {amount(k.tot, unit)}
            </span>
            <span className="s-rp-item-meta">{k.share === null ? null : <span className="s-nums">{k.share.toFixed(0)}%</span>}</span>
            <span className="s-rp-item-spark">
              <Sparkline vals={k.spark} h={18} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
