"use client";

// The chains tab: chain > branch > product, the way a chain is actually managed: the brand you
// negotiate with, the branch that does or does not order, the product inside that branch. Every
// level is a rollup of the same fact table, so chain, branch and product totals cannot disagree.
//
// The search filters this tree. (The Artifact's search box re-drew its flat customer grid under
// the chains sheet, so typing there did nothing visible.)

import { ChevronLeft } from "lucide-react";
import { Fragment, useMemo, useRef } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { buildChains, DORMANT_DAYS, type ChainBadge, type ChainBranch, type ChainNode, type ChainsModel } from "../../_lib/report/chains";
import { chainsCsvRows } from "../../_lib/report/csv";
import { amount, cell, shortDate } from "../../_lib/report/format";
import { useScrollToEnd } from "../../_lib/report/hooks";
import { monthLabel, periodMonths, periodYears } from "../../_lib/report/period";
import type { Period, ReportData, Unit } from "../../_lib/report/types";
import { ListEmpty } from "../EmptyStates";
import { CopyCsv } from "./CopyCsv";
import { ControlsBar, PeriodControl, SearchBox, UnitControl, ViewControl, type ViewMode } from "./ReportControls";

export interface ChainsTabProps {
  d: ReportData;
  period: Period;
  onPeriod: (p: Period) => void;
  unit: Unit;
  onUnit: (u: Unit) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  q: string;
  onQ: (q: string) => void;
  open: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

const BDG: Record<ChainBadge["kind"], string> = {
  br: "s-rp-bdg",
  sl: "s-rp-bdg s-rp-bdg-sl",
  mv: "s-rp-bdg s-rp-bdg-mv",
  di: "s-rp-bdg s-rp-bdg-di",
  gr: "s-rp-bdg",
};

function Badges({ badges }: { badges: readonly ChainBadge[] }) {
  return (
    <>
      {badges.map((b) => (
        <span key={`${b.kind}${b.text}`} className={BDG[b.kind]} data-testid="chain-badge">
          {b.text}
        </span>
      ))}
    </>
  );
}

function BranchBadges({ b }: { b: ChainBranch }) {
  return (
    <>
      {b.merged > 1 ? <span className="s-rp-bdg">{L.badgeMerged(b.merged)}</span> : null}
      {b.isDormant && b.age !== null ? <span className="s-rp-bdg s-rp-bdg-sl">{L.badgeQuiet(b.age)}</span> : null}
    </>
  );
}

export function chainsSummaryLine(c: ChainsModel, unit: Unit, filtered: boolean): string {
  if (filtered) return L.sumChainsFiltered(amount(c.totals.tot, unit), L.chainsWord(c.shown.length));
  const base = L.sumChains(amount(c.kpi.turnover, unit), L.chainsWord(c.kpi.chainCount), L.branchesWord(c.kpi.branchCount));
  return c.kpi.dormantCount ? `${base} · ${L.sumChainsDormant(c.kpi.dormantCount)}` : base;
}

export function ChainsTab(p: ChainsTabProps) {
  const { d, period, unit, q } = p;
  const ms = useMemo(() => periodMonths(d.months, period), [d.months, period]);
  const years = useMemo(() => periodYears(d.months), [d.months]);
  const model = useMemo(() => buildChains(d, ms, unit, q), [d, ms, unit, q]);
  const filtered = q.trim().length > 0;
  const k = model.kpi;

  const kpis: Array<{ key: string; label: string; value: string; sub: string; alert: boolean }> = [
    { key: "turnover", label: L.chainsKpiTurnover, value: amount(k.turnover, unit), sub: L.chainsKpiShare(k.turnoverShare), alert: false },
    { key: "chains", label: L.chainsKpiChains, value: String(k.chainCount), sub: L.chainsKpiBranches(k.branchCount), alert: false },
    { key: "dormant", label: L.chainsKpiDormant, value: String(k.dormantCount), sub: L.chainsKpiDormantSub(DORMANT_DAYS), alert: k.dormantCount > 0 },
    { key: "dormantRev", label: L.chainsKpiDormantRev, value: amount(k.dormantRev, unit), sub: L.chainsKpiDormantRevSub, alert: k.dormantRev > 0 },
    { key: "quiet", label: L.chainsKpiQuiet, value: k.quiet ? k.quiet.name : "—", sub: k.quiet ? L.chainsKpiQuietSub(k.quiet.branches) : L.chainsKpiQuietNone, alert: Boolean(k.quiet) },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="report-tab-chain">
      <ControlsBar>
        <PeriodControl years={years} value={period} onChange={p.onPeriod} />
        <UnitControl value={unit} onChange={p.onUnit} />
        <ViewControl value={p.view} onChange={p.onView} />
        <SearchBox value={q} onChange={p.onQ} placeholder={L.searchChain} />
        <CopyCsv rows={() => chainsCsvRows(d, model, ms, unit)} />
      </ControlsBar>

      <div className="s-rp-kpis" data-testid="chains-kpis">
        {kpis.map((x) => (
          <div key={x.key} className={`s-card s-rp-kpi ${x.alert ? "s-rp-kpi-alert" : ""}`} data-testid="chain-kpi" data-kpi={x.key}>
            <span className="s-rp-kpi-label">{x.label}</span>
            <b className="s-rp-kpi-value s-nums" data-testid="kpi-value">
              <bdi>{x.value}</bdi>
            </b>
            <span className="s-rp-kpi-sub">{x.sub}</span>
          </div>
        ))}
      </div>

      <p className="s-nums text-[13px] font-medium" style={{ color: "hsl(var(--s-fg-muted))" }} data-testid="report-summary" aria-live="polite">
        {chainsSummaryLine(model, unit, filtered)}
      </p>

      {model.shown.length === 0 ? (
        <ListEmpty label={filtered ? L.emptyChainSearch : L.emptyPeriod} />
      ) : p.view === "months" ? (
        <ChainsTable {...p} ms={ms} model={model} />
      ) : (
        <ChainsList {...p} model={model} />
      )}
    </div>
  );
}

type Inner = ChainsTabProps & { model: ChainsModel };

function ChainsTable({ d, unit, open, onToggle, model, ms }: Inner & { ms: number[] }) {
  const mcells = (months: Record<number, number>, cls = "") =>
    ms.map((i) => (
      <td key={i} className={`s-rp-num ${cls}`}>
        {cell(months[i] || 0, unit)}
      </td>
    ));
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToEnd(scroller, ms.length);
  return (
    <div ref={scroller} className="s-card s-rp-scroll s-rp-scroll-tall" data-testid="report-table">
      <table className="s-rp-table">
        <thead>
          <tr>
            <th className="s-rp-first" scope="col">
              {L.chainsColName}
            </th>
            <th className="s-rp-mid" scope="col">
              {L.chainsColMeta}
            </th>
            {ms.map((i) => (
              <th key={i} className="s-rp-mid" scope="col">
                {monthLabel(d.months, i)}
                {i === d.partialIdx ? ` ${L.partialMark}` : ""}
              </th>
            ))}
            <th className="s-rp-mid" scope="col">
              {L.colTotal}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.shown.map((c) => {
            const ck = `ch⊞${c.name}`;
            const cOpen = open.has(ck);
            return (
              <Fragment key={c.name}>
                <tr className="s-rp-main" data-testid="chain-row" data-chain={c.name}>
                  <td className="s-rp-first s-rp-first-wrap">
                    <button type="button" className="s-rp-rowbtn" style={{ alignItems: "flex-start" }} aria-expanded={cOpen} aria-label={L.chainsToggle(c.name, cOpen)} onClick={() => onToggle(ck)}>
                      <ChevronLeft size={14} className="s-rp-chev" style={{ marginBlockStart: 4 }} aria-hidden />
                      <span className="s-rp-wrapname">
                        <span>{c.name}</span>
                        <Badges badges={c.badges} />
                      </span>
                    </button>
                  </td>
                  <td className="s-rp-mid s-rp-muted" style={{ fontSize: 11.5 }}>
                    {c.seg}
                  </td>
                  {mcells(c.months)}
                  <td className="s-rp-num" style={{ fontWeight: 700 }} data-testid="cell-total">
                    {cell(c.tot, unit)}
                  </td>
                </tr>
                {cOpen
                  ? c.branches.map((b) => {
                      const bk = `br⊞${c.name}⊞${b.ci}`;
                      const bOpen = open.has(bk);
                      return (
                        <Fragment key={b.ci}>
                          <tr className={`s-rp-child ${b.isDormant ? "s-rp-quiet" : ""}`} data-testid="branch-row">
                            <td className="s-rp-first s-rp-first-wrap" style={{ paddingInlineStart: 22 }}>
                              <button type="button" className="s-rp-rowbtn" style={{ alignItems: "flex-start" }} aria-expanded={bOpen} aria-label={L.branchToggle(b.name, bOpen)} onClick={() => onToggle(bk)}>
                                <ChevronLeft size={13} className="s-rp-chev" style={{ marginBlockStart: 4 }} aria-hidden />
                                <span className="s-rp-wrapname">
                                  <span>{b.name}</span>
                                  <BranchBadges b={b} />
                                </span>
                              </button>
                            </td>
                            <td className="s-rp-mid" style={{ fontSize: 11.5 }}>
                              {shortDate(b.last)}
                            </td>
                            {mcells(b.months)}
                            <td className="s-rp-num">{cell(b.tot, unit)}</td>
                          </tr>
                          {bOpen
                            ? b.products.map((pr) => (
                                <tr key={pr.si} className="s-rp-child s-rp-lvl3" data-testid="product-row">
                                  <td className="s-rp-first" style={{ paddingInlineStart: 44, fontWeight: 400 }} title={`${d.sku[pr.si][0]} · ${d.sku[pr.si][1] || ""}`}>
                                    {d.sku[pr.si][0]} · {d.sku[pr.si][1] || ""}
                                  </td>
                                  <td className="s-rp-mid" style={{ fontSize: 11.5 }}>
                                    {d.sku[pr.si][3]}
                                  </td>
                                  {mcells(pr.months)}
                                  <td className="s-rp-num">{cell(pr.tot, unit)}</td>
                                </tr>
                              ))
                            : null}
                        </Fragment>
                      );
                    })
                  : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="s-rp-total" data-testid="report-total">
            <td className="s-rp-first">{L.chainsTotalRow}</td>
            <td />
            {mcells(model.totals.months)}
            <td className="s-rp-num" data-testid="total-tot">
              {cell(model.totals.tot, unit)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ChainsList({ d, unit, open, onToggle, model }: Inner) {
  return (
    <div className="s-card overflow-hidden" data-testid="report-summary-list">
      <ul className="s-rp-list">
        {model.shown.map((c: ChainNode) => {
          const ck = `ch⊞${c.name}`;
          const cOpen = open.has(ck);
          return (
            <li key={c.name} data-testid="chain-row" data-chain={c.name}>
              <button type="button" className="s-rp-item" aria-expanded={cOpen} aria-label={L.chainsToggle(c.name, cOpen)} onClick={() => onToggle(ck)}>
                <span className="s-rp-item-name">
                  <ChevronLeft size={14} className="s-rp-chev" aria-hidden />
                  <span>{c.name}</span>
                </span>
                <span className="s-rp-item-total" data-testid="cell-total">
                  {amount(c.tot, unit)}
                </span>
                <span className="s-rp-item-meta" style={{ gridColumn: "1 / -1" }}>
                  <Badges badges={c.badges} />
                  {c.seg ? <span>{c.seg}</span> : null}
                </span>
              </button>
              {cOpen ? (
                <ul className="s-rp-list">
                  {c.branches.map((b) => {
                    const bk = `br⊞${c.name}⊞${b.ci}`;
                    const bOpen = open.has(bk);
                    return (
                      <li key={b.ci} data-testid="branch-row">
                        <button type="button" className="s-rp-item s-rp-item-child" aria-expanded={bOpen} aria-label={L.branchToggle(b.name, bOpen)} onClick={() => onToggle(bk)}>
                          <span className="s-rp-item-name">
                            <ChevronLeft size={13} className="s-rp-chev" aria-hidden />
                            <span>{b.name}</span>
                          </span>
                          <span className="s-rp-item-total" style={{ fontSize: 13 }}>
                            {amount(b.tot, unit)}
                          </span>
                          <span className="s-rp-item-meta" style={{ gridColumn: "1 / -1" }}>
                            <BranchBadges b={b} />
                            {b.last ? <span className="s-nums">{shortDate(b.last)}</span> : null}
                          </span>
                        </button>
                        {bOpen ? (
                          <ul className="s-rp-list">
                            {b.products.map((pr) => (
                              <li key={pr.si} data-testid="product-row">
                                <div className="s-rp-item s-rp-item-child s-rp-lvl3" style={{ cursor: "default" }}>
                                  <span className="s-rp-item-name">
                                    <span title={`${d.sku[pr.si][0]} · ${d.sku[pr.si][1] || ""}`}>
                                      {d.sku[pr.si][0]} · {d.sku[pr.si][1] || ""}
                                    </span>
                                  </span>
                                  <span className="s-rp-item-total" style={{ fontSize: 13 }}>
                                    {amount(pr.tot, unit)}
                                  </span>
                                  <span className="s-rp-item-meta">{d.sku[pr.si][3]}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="s-rp-item s-rp-total" style={{ cursor: "default", background: "hsl(var(--s-accent-soft))" }} data-testid="report-total">
        <span className="s-rp-item-name" style={{ fontWeight: 600 }}>
          {L.chainsTotalRow}
        </span>
        <span className="s-rp-item-total" data-testid="total-tot">
          {amount(model.totals.tot, unit)}
        </span>
      </div>
    </div>
  );
}
