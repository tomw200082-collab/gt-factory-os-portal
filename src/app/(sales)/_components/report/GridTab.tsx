"use client";

// The customers and products tabs: one grid of rows over a period, in shekels or units.
//
// Phone: a summary list (name, total, share, year over year, a line), tap a row for what is inside
// it. Desktop, and "by month" on a phone: the month table, in its own horizontal scroller with
// the name column held in place. The page itself never scrolls sideways.

import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import { Fragment, useMemo, useRef } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { buildGrid, gridChildren, type GridChild, type GridModel, type GridRow, type Heat, type SortCol, type SortState, type YoyCell } from "../../_lib/report/aggregate";
import { gridCsvRows } from "../../_lib/report/csv";
import { amount, cell, fmtInt, money, signedPct } from "../../_lib/report/format";
import { useScrollToEnd } from "../../_lib/report/hooks";
import { monthLabel, periodYears } from "../../_lib/report/period";
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
  onSort: (col: SortCol) => void;
  open: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

export function heatBackground(h: Heat | null): string | undefined {
  if (!h) return undefined;
  return `hsl(var(${h.dir === "up" ? "--s-status-won" : "--s-sla-overdue"}) / ${h.alpha})`;
}

export function YoyText({ cell }: { cell: YoyCell | null }) {
  if (!cell) return null;
  if (cell.kind === "new") return <span className="s-rp-muted">{L.yoyNew}</span>;
  return <span className={cell.up ? "s-rp-up" : "s-rp-down"}>{signedPct(cell.pct)}</span>;
}

function YoyChip({ cell }: { cell: YoyCell | null }) {
  if (!cell) return null;
  if (cell.kind === "new") return <span className="s-rp-chip">{L.yoyNew}</span>;
  return (
    <span className={`s-rp-chip ${cell.up ? "s-rp-chip-up" : "s-rp-chip-dn"}`} dir="ltr">
      {signedPct(cell.pct)}
    </span>
  );
}

export function summaryLine(g: GridModel, unit: Unit): string {
  const s = g.summary;
  if (s.filtered) return unit === "rev" ? L.sumFilteredRev(money(s.total), L.rowsWord(s.rows)) : L.sumFilteredUnits(fmtInt(s.total), L.rowsWord(s.rows));
  return unit === "rev"
    ? L.sumRev(money(s.total), L.orders(s.orders), L.customers(s.customers))
    : L.sumUnits(fmtInt(s.total), L.orders(s.orders), L.customers(s.customers));
}

export function GridTab(p: GridTabProps) {
  const { d, tab, period, unit, q, sort } = p;
  const dim = tab === "cust" ? "cust" : "fam";
  const grid = useMemo(() => buildGrid(d, { dim, period, unit, q, sort }), [d, dim, period, unit, q, sort]);
  const years = useMemo(() => periodYears(d.months), [d.months]);
  const monthsView = p.view === "months";

  return (
    <div className="flex flex-col gap-3" data-testid={`report-tab-${tab}`}>
      <ControlsBar>
        <PeriodControl years={years} value={period} onChange={p.onPeriod} />
        <UnitControl value={unit} onChange={p.onUnit} />
        <ViewControl value={p.view} onChange={p.onView} />
        <SearchBox value={q} onChange={p.onQ} placeholder={tab === "cust" ? L.searchCust : L.searchProd} />
        {monthsView ? <HeatToggle on={p.heat} onChange={p.onHeat} /> : null}
        <CopyCsv rows={() => gridCsvRows(d, grid, tab, unit)} />
      </ControlsBar>

      <p className="s-nums text-[13px] font-medium" style={{ color: "hsl(var(--s-fg-muted))" }} data-testid="report-summary" aria-live="polite">
        {summaryLine(grid, unit)}
      </p>

      {grid.rows.length === 0 ? (
        <ListEmpty label={q.trim() ? L.emptySearch : L.emptyPeriod} />
      ) : monthsView ? (
        <MonthTable {...p} grid={grid} />
      ) : (
        <SummaryList {...p} grid={grid} />
      )}
      {monthsView && p.heat ? (
        <p className="s-rp-note">{L.heatHint}</p>
      ) : null}
    </div>
  );
}

type Inner = GridTabProps & { grid: GridModel };

function MonthTable({ d, tab, period, unit, heat, sort, onSort, open, onToggle, grid }: Inner) {
  const { ms } = grid;
  const dim = tab === "cust" ? "cust" : "fam";
  const aria = (col: SortCol): "ascending" | "descending" | "none" => (sort.col === col ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const arrow = (col: SortCol) => (sort.col === col ? sort.dir === "asc" ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden /> : null);
  const sortBtn = (col: SortCol, label: string) => (
    <button type="button" className="s-rp-sort" onClick={() => onSort(col)} title={L.sortBy(label)}>
      {label}
      {arrow(col)}
    </button>
  );
  const scale = (v: number) => cell(v, unit);
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToEnd(scroller, `${period}${ms.length}`);
  return (
    <div ref={scroller} className="s-card s-rp-scroll s-rp-scroll-tall" data-testid="report-table">
      <table className="s-rp-table">
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
                  <td className="s-rp-first" title={r.sub || undefined}>
                    <button type="button" className="s-rp-rowbtn" aria-expanded={isOpen} aria-label={isOpen ? L.closeRow(r.k) : L.openRow(r.k)} onClick={() => onToggle(key)}>
                      <ChevronLeft size={14} className="s-rp-chev" aria-hidden />
                      <span>{r.k}</span>
                      {r.sub ? <span className="s-rp-sub">· {r.sub}</span> : null}
                    </button>
                  </td>
                  {r.months.map((v, j) => (
                    <td key={ms[j]} className="s-rp-num" style={heat ? { background: heatBackground(r.heat[j]) } : undefined} data-testid="cell-month">
                      {scale(v)}
                    </td>
                  ))}
                  <td className="s-rp-num" style={{ fontWeight: 700 }} data-testid="cell-total">
                    {scale(r.tot)}
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
                {isOpen ? <ChildRows d={d} dim={dim} period={period} unit={unit} parent={r.k} ms={ms} hasYoy={grid.hasYoy} scale={scale} /> : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="s-rp-total" data-testid="report-total">
            <td className="s-rp-first">{grid.capped ? L.totalRowCapped(grid.rows.length, grid.matched) : L.totalRow}</td>
            {grid.total.months.map((v, j) => (
              <td key={ms[j]} className="s-rp-num">
                {scale(v)}
              </td>
            ))}
            <td className="s-rp-num" data-testid="total-tot">
              {scale(grid.total.tot)}
            </td>
            <td className="s-rp-mid s-rp-opt-sm">100%</td>
            {grid.hasYoy ? (
              <td className="s-rp-mid s-rp-opt-sm" data-testid="total-yoy">
                {grid.total.yoy ? <span className={grid.total.yoy.up ? "s-rp-up" : "s-rp-down"}>{signedPct(grid.total.yoy.pct)}</span> : null}
              </td>
            ) : null}
            <td className="s-rp-opt-lg" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ChildRows({ d, dim, period, unit, parent, ms, hasYoy, scale }: { d: ReportData; dim: "cust" | "fam"; period: Period; unit: Unit; parent: string; ms: number[]; hasYoy: boolean; scale: (v: number) => string }) {
  const kids = useMemo(() => gridChildren(d, { dim, period, unit }, parent), [d, dim, period, unit, parent]);
  return (
    <>
      {kids.map((k) => (
        <tr key={k.k} className="s-rp-child" data-testid="report-child">
          <td className="s-rp-first" style={{ paddingInlineStart: 30, fontWeight: 400 }} title={k.k}>
            {k.k}
          </td>
          {k.months.map((v, j) => (
            <td key={ms[j]} className="s-rp-num">
              {scale(v)}
            </td>
          ))}
          <td className="s-rp-num" style={{ fontWeight: 600 }}>
            {scale(k.tot)}
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
            <span className={`s-rp-chip ${grid.total.yoy.up ? "s-rp-chip-up" : "s-rp-chip-dn"}`} dir="ltr">
              {signedPct(grid.total.yoy.pct)}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SummaryRow({ row, unit, hasYoy, isOpen, onToggle }: { row: GridRow; unit: Unit; hasYoy: boolean; isOpen: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="s-rp-item" aria-expanded={isOpen} aria-label={isOpen ? L.closeRow(row.k) : L.openRow(row.k)} onClick={onToggle}>
      <span className="s-rp-item-name">
        <ChevronLeft size={14} className="s-rp-chev" aria-hidden />
        <span>{row.k}</span>
      </span>
      <span className="s-rp-item-total" data-testid="cell-total">
        {amount(row.tot, unit)}
      </span>
      <span className="s-rp-item-meta">
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
