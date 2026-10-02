// The chains tab: chain > branch > product, with dormancy, merged branches and the KPI strip.
// Pure: no DOM, no React.
//
// Ported from report_template.html (renderChains). Definitions that stay as they were:
//   - the roster comes from the customer dimension, not from the sales in the window, so a
//     branch that bought nothing still shows at zero, because "which went quiet" is the
//     question this tab exists to answer;
//   - a branch is quiet after DORMANT_DAYS (90) without an order, counted to the pull date;
//     one that never ordered is counted as quiet but carries no "quiet N days" badge;
//   - a branch that changed operating company has two customer records and is one branch;
//   - "the big quiet chain" is the biggest chain with more than one branch, every branch
//     quiet, and no status: a one-record chain going quiet is a lost customer, and a chain
//     that moved to a distributor has not gone dark.

import { REPORT_UI as L } from "../labels";
import type { ChainMeta, ReportData, Unit } from "./types";

export const DORMANT_DAYS = 90;

/** Whole days from an ISO date to the pull date; null when there is no date. */
export function ageDays(d: Pick<ReportData, "epoch0" | "todayEpoch">, iso: string): number | null {
  if (!iso) return null;
  const then = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
  return Math.round(d.todayEpoch + d.epoch0 - then);
}

type Months = Record<number, number>;

export interface ChainProduct {
  /** index into the SKU dimension */
  si: number;
  months: Months;
  tot: number;
}

export interface ChainBranch {
  ci: number;
  /** the merged branch's label, when it has one */
  label: string | null;
  /** what to show: the label, else the customer record's name */
  name: string;
  /** every customer record folded into this branch, for search */
  names: string[];
  /** how many records the branch is made of */
  merged: number;
  last: string;
  age: number | null;
  months: Months;
  tot: number;
  /** products with sales in the window, biggest first */
  products: ChainProduct[];
  /** quiet with a date: the row gets its "quiet N days" badge */
  isDormant: boolean;
}

export type BadgeKind = "br" | "sl" | "mv" | "di" | "gr";
export interface ChainBadge {
  kind: BadgeKind;
  text: string;
}

export interface ChainNode {
  name: string;
  meta: ChainMeta;
  seg: string;
  months: Months;
  tot: number;
  branches: ChainBranch[];
  /** quiet branches, a branch that never ordered included */
  dormant: ChainBranch[];
  badges: ChainBadge[];
}

export interface ChainsKpi {
  turnover: number;
  /** percent of all sales in the window */
  turnoverShare: number;
  chainCount: number;
  branchCount: number;
  dormantCount: number;
  dormantRev: number;
  quiet: { name: string; branches: number } | null;
}

export interface ChainsModel {
  chains: ChainNode[];
  /** after the search */
  shown: ChainNode[];
  kpi: ChainsKpi;
  /** totals of what is shown */
  totals: { months: Months; tot: number };
}

interface Node {
  months: Months;
  tot: number;
}
interface Branch extends Node {
  sk: Map<number, Node>;
}

function badgesOf(meta: ChainMeta, branches: number, dormant: number): ChainBadge[] {
  const out: ChainBadge[] = [];
  if (meta.kind === "מפיץ") {
    // a distributor row is meaningless without naming whose volume it carries
    out.push({ kind: "di", text: meta.rosterBadge || L.badgeDistributor });
  } else {
    // One record is not always one shop: a warehouse feeding every branch of a chain, or a
    // partner with no branches at all, would read as a single café under "סניף אחד".
    out.push({ kind: "br", text: meta.rosterBadge || (branches === 1 ? L.badgeOneBranch : L.badgeBranches(branches)) });
    if (dormant) out.push({ kind: "sl", text: dormant === 1 ? L.badgeOneDormant : L.badgeDormant(dormant) });
  }
  if (meta.group) out.push({ kind: "gr", text: L.badgeGroup(meta.group) });
  if (meta.status === "moved_to_distributor") out.push({ kind: "mv", text: L.badgeMoved(meta.movedTo ?? "", meta.movedOn ?? "") });
  return out;
}

export function buildChains(d: ReportData, ms: readonly number[], unit: Unit, q = ""): ChainsModel {
  const mset = new Set(ms);

  // roster: every customer record with a chain, at zero until the facts arrive
  const tree = new Map<string, { node: Node; seg: string; br: Map<number, Branch> }>();
  const chainOf = new Map<number, string>();
  d.cust.forEach((c, ci) => {
    const ch = c[1];
    if (!ch) return;
    chainOf.set(ci, ch);
    let t = tree.get(ch);
    if (!t) {
      t = { node: { months: {}, tot: 0 }, seg: c[5] || "", br: new Map() };
      tree.set(ch, t);
    }
    t.br.set(ci, { months: {}, tot: 0, sk: new Map() });
  });
  for (const r of d.rows) {
    if (!mset.has(r[0])) continue;
    const ch = chainOf.get(r[1]);
    if (!ch) continue;
    const t = tree.get(ch)!;
    const b = t.br.get(r[1])!;
    let s = b.sk.get(r[2]);
    if (!s) {
      s = { months: {}, tot: 0 };
      b.sk.set(r[2], s);
    }
    const v = unit === "rev" ? r[4] : r[3];
    for (const n of [t.node, b, s]) {
      n.months[r[0]] = (n.months[r[0]] || 0) + v;
      n.tot += v;
    }
  }

  const chains: ChainNode[] = [...tree.entries()].map(([name, t]) => {
    const meta: ChainMeta = d.chainMeta?.[name] ?? {};
    let brs: Array<{ ci: number; B: Branch; last: string; age: number | null; label: string | null; names: string[]; merged: number }> = [
      ...t.br.entries(),
    ].map(([ci, B]) => {
      const last = d.cust[ci][4];
      return { ci, B, last, age: ageDays(d, last), label: null, names: [d.cust[ci][0]], merged: 1 };
    });
    // A branch that changed operating company has two customer records and is still one
    // branch. Counting it twice inflates the roster and splits its history.
    if (meta.merge) {
      const byLabel = new Map<string, (typeof brs)[number]>();
      const kept: typeof brs = [];
      for (const b of brs) {
        const lbl = meta.merge[d.cust[b.ci][0]];
        if (!lbl) {
          kept.push(b);
          continue;
        }
        const prev = byLabel.get(lbl);
        if (!prev) {
          // a copy: merging must not write into the roster the other record still reads
          b.label = lbl;
          b.B = { months: { ...b.B.months }, tot: b.B.tot, sk: new Map([...b.B.sk].map(([si, s]) => [si, { months: { ...s.months }, tot: s.tot }])) };
          byLabel.set(lbl, b);
          kept.push(b);
          continue;
        }
        for (const m in b.B.months) prev.B.months[+m] = (prev.B.months[+m] || 0) + b.B.months[+m];
        prev.B.tot += b.B.tot;
        prev.merged++;
        prev.names.push(...b.names);
        for (const [si, s] of b.B.sk) {
          const t2 = prev.B.sk.get(si);
          if (!t2) {
            prev.B.sk.set(si, { months: { ...s.months }, tot: s.tot });
            continue;
          }
          for (const m in s.months) t2.months[+m] = (t2.months[+m] || 0) + s.months[+m];
          t2.tot += s.tot;
        }
        if ((b.last || "") > (prev.last || "")) {
          prev.last = b.last;
          prev.age = b.age;
        }
      }
      brs = kept;
    }
    const branches: ChainBranch[] = brs
      .map((b) => ({
        ci: b.ci,
        label: b.label,
        name: b.label || d.cust[b.ci][0],
        names: b.names,
        merged: b.merged,
        last: b.last,
        age: b.age,
        months: b.B.months,
        tot: b.B.tot,
        products: [...b.B.sk.entries()]
          .filter((e) => e[1].tot > 0)
          .sort((x, y) => y[1].tot - x[1].tot)
          .map(([si, s]) => ({ si, months: s.months, tot: s.tot })),
        isDormant: b.age !== null && b.age > DORMANT_DAYS,
      }))
      .sort((a, b) => b.tot - a.tot);
    const dormant = branches.filter((b) => b.age === null || b.age > DORMANT_DAYS);
    return {
      name,
      meta,
      seg: meta.segment || t.seg,
      months: t.node.months,
      tot: t.node.tot,
      branches,
      dormant,
      badges: badgesOf(meta, branches.length, dormant.length),
    };
  });
  chains.sort((a, b) => b.tot - a.tot);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? chains.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.branches.some(
            (b) =>
              b.name.toLowerCase().includes(needle) ||
              b.names.some((n) => n.toLowerCase().includes(needle)) ||
              b.products.some((p) => {
                const s = d.sku[p.si];
                return s[0].toLowerCase().includes(needle) || (s[1] || "").toLowerCase().includes(needle);
              }),
          ),
      )
    : chains;

  let totAll = 0;
  for (const r of d.rows) if (mset.has(r[0])) totAll += unit === "rev" ? r[4] : r[3];
  const turnover = chains.reduce((s, c) => s + c.tot, 0);
  const worst = chains
    .filter((c) => c.branches.length > 1 && c.dormant.length === c.branches.length && !c.meta.status)
    .sort((a, b) => b.tot - a.tot)[0];

  const totals: Months = {};
  let totTot = 0;
  for (const c of shown) {
    totTot += c.tot;
    for (const m of ms) totals[m] = (totals[m] || 0) + (c.months[m] || 0);
  }

  return {
    chains,
    shown,
    kpi: {
      turnover,
      turnoverShare: (100 * turnover) / (totAll || 1),
      chainCount: chains.length,
      branchCount: chains.reduce((s, c) => s + c.branches.length, 0),
      dormantCount: chains.reduce((s, c) => s + c.dormant.length, 0),
      dormantRev: chains.reduce((s, c) => s + c.dormant.reduce((x, b) => x + b.tot, 0), 0),
      quiet: worst ? { name: worst.name, branches: worst.branches.length } : null,
    },
    totals: { months: totals, tot: totTot },
  };
}
