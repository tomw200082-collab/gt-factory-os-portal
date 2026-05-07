"use client";

import type { ReactNode, CSSProperties } from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Flame,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";

import { useInventoryFlow } from "@/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow";
import type { FlowItem } from "@/app/(planning)/planning/inventory-flow/_lib/types";

/* ─────────────────────────────────────────────────────────────────────────────
   DASHBOARD — GT Factory OS
   Merged: Dashboard overview + Control Tower (v2)
   Dark-mode operational command center — all panels wired to live API data
───────────────────────────────────────────────────────────────────────────── */

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  gold:   "#F5A623",
  teal:   "#22D3A3",
  red:    "#FF4455",
  org:    "#FF8C40",
  blue:   "#5B9BFF",
  surf:   "rgba(255,255,255,0.04)",
  surfHi: "rgba(255,255,255,0.07)",
  bord:   "rgba(255,255,255,0.09)",
  txt:    "#EEEEF5",
  muted:  "rgba(238,238,245,0.50)",
  subtle: "rgba(238,238,245,0.28)",
  dim:    "rgba(238,238,245,0.14)",
} as const;

// ── API response types ────────────────────────────────────────────────────────
interface StockValueResponse {
  rm_value?: number | null;
  rm_total?: number | null;
  fg_value?: number | null;
  fg_total?: number | null;
  rm_sku_count?: number | null;
  fg_sku_count?: number | null;
  as_of?: string | null;
}

interface ExceptionRow {
  exception_id: string;
  severity: "critical" | "warning" | "info" | string;
  status: string;
}
interface ExceptionsResponse {
  rows?: ExceptionRow[];
  data?: ExceptionRow[];
  total?: number;
}

interface PlanningRunRow {
  run_id: string;
  executed_at: string;
  summary?: {
    purchase_recs_count?: number;
    production_recs_count?: number;
    exceptions_count?: number;
  };
}
interface PlanningRunsResponse {
  rows?: PlanningRunRow[];
  data?: PlanningRunRow[];
}

interface ProductionPlanRow {
  item_id: string;
  item_name?: string | null;
  plan_date: string;
  planned_qty: number | string;
  completed_qty?: number | string | null;
  planned_remaining_qty?: number | string | null;
  status?: string | null;
}
interface ProductionPlanResponse {
  rows?: ProductionPlanRow[];
  data?: ProductionPlanRow[];
}

interface ProductionActualRow {
  actual_id?: string;
  item_id: string;
  item_name?: string | null;
  output_qty: number | string;
  submitted_at?: string | null;
  produced_at?: string | null;
}
interface ProductionActualsResponse {
  rows?: ProductionActualRow[];
  data?: ProductionActualRow[];
}

interface CriticalTodayRow {
  trigger_kind: string;
  display_name: string;
  severity: string;
  triggered_at: string;
  detail_jsonb: unknown;
}
interface CriticalTodayResponse {
  rows: CriticalTodayRow[];
  as_of: string;
}

interface SlippedPlanRow {
  plan_id: string;
  plan_date: string;
  item_id: string;
  item_name: string | null;
  planned_qty: string;
  uom: string;
  days_overdue: number;
}
interface SlippedPlansResponse {
  rows: SlippedPlanRow[];
  as_of: string;
  window_days: 7;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}

function fmtILS(n: number | null | undefined): string {
  if (n == null) return "—";
  return "₪ " + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

function fmtRelative(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const delta = now.getTime() - new Date(iso).getTime();
  if (delta < 0) return "just now";
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fmtPlanDate(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch { return s; }
}

function weekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const sun = new Date(now);
  sun.setDate(now.getDate() - day);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(sun), to: fmt(sat) };
}

function urgencyColor(d: number) { return d <= 2 ? C.red : d <= 5 ? C.org : C.gold; }
function urgencyBg(d: number) {
  return d <= 2 ? "rgba(255,68,85,0.12)" : d <= 5 ? "rgba(255,140,64,0.10)" : "rgba(245,166,35,0.08)";
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function Card({ children, accent, hot, style: s }: {
  children: ReactNode; accent?: string; hot?: boolean; style?: CSSProperties;
}) {
  return (
    <div style={{
      background: hot ? "rgba(255,68,85,0.10)"
        : accent ? `radial-gradient(circle at top right, ${accent}18 0%, rgba(0,0,0,0) 65%), ${C.surf}`
        : C.surf,
      border: `1px solid ${accent ? (hot ? C.red + "38" : accent + "28") : C.bord}`,
      borderRadius: 14, padding: "20px 22px",
      position: "relative", overflow: "hidden", ...s,
    }}>
      {accent && !hot && (
        <div style={{ position: "absolute", top: -24, right: -24, width: 90, height: 90,
          borderRadius: "50%", background: accent, filter: "blur(44px)", opacity: 0.22, pointerEvents: "none" }} />
      )}
      {hot && (
        <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110,
          borderRadius: "50%", background: C.red, filter: "blur(50px)", opacity: 0.18, pointerEvents: "none" }} />
      )}
      {children}
    </div>
  );
}

function Label({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
      color: color ?? C.subtle, textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Pill({ color, bg, children }: { color: string; bg: string; children: ReactNode }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 8,
      padding: "6px 12px", fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>
      {children}
    </div>
  );
}

function Skel({ w, h }: { w?: number | string; h?: number }) {
  return (
    <div className="skel-pulse" style={{
      width: w ?? "100%", height: h ?? 18, borderRadius: 6,
      background: "rgba(255,255,255,0.07)",
    }} />
  );
}

// ── Value card ────────────────────────────────────────────────────────────────
function ValueCard({ label, value, sub, accent, loading }: {
  label: string; value: string | null; sub: string; accent: string; loading?: boolean;
}) {
  return (
    <Card accent={accent}>
      <Label color={accent}>{label}</Label>
      {loading ? (
        <Skel h={36} w="80%" />
      ) : (
        <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: C.txt,
          fontVariantNumeric: "tabular-nums", letterSpacing: "-0.035em" }}>
          {value ?? "—"}
        </div>
      )}
      <div style={{ fontSize: 11, color: C.subtle, marginTop: 9, fontWeight: 500 }}>{sub}</div>
      <div style={{ marginTop: 16, height: 2, borderRadius: 1,
        background: `linear-gradient(to right, ${accent}50, ${accent}10)` }} />
    </Card>
  );
}

// ── Stock donut ───────────────────────────────────────────────────────────────
function StockDonut({ healthy, watch, critical, total, loading }: {
  healthy: number; watch: number; critical: number; total: number; loading?: boolean;
}) {
  const r = 40, circ = 2 * Math.PI * r, gap = 6;
  function arc(count: number, color: string, offset: number) {
    return (
      <circle cx={52} cy={52} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${Math.max(0, (count / Math.max(1, total)) * circ - gap)} ${circ}`}
        strokeDashoffset={offset} transform="rotate(-90 52 52)" strokeLinecap="round" />
    );
  }
  const hShare = (healthy / Math.max(1, total)) * circ;
  const wShare = (watch   / Math.max(1, total)) * circ;
  return (
    <Card>
      <Label>Stock health</Label>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Skel w={104} h={104} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
            <Skel h={14} /><Skel h={14} /><Skel h={14} />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ flexShrink: 0 }}>
            <svg width={104} height={104} viewBox="0 0 104 104">
              <circle cx={52} cy={52} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
              {arc(healthy,  C.teal, 0)}
              {arc(watch,    C.org,  -hShare)}
              {arc(critical, C.red,  -(hShare + wShare))}
              <text x={52} y={48} textAnchor="middle" fill={C.txt} fontSize={22} fontWeight={900}>{total}</text>
              <text x={52} y={63} textAnchor="middle" fill="rgba(238,238,245,0.28)" fontSize={9} letterSpacing="1.5">ITEMS</text>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
            {([
              { color: C.teal, label: "Healthy",  n: healthy  },
              { color: C.org,  label: "Watch",     n: watch    },
              { color: C.red,  label: "Critical",  n: critical },
            ] as const).map(({ color, label, n }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: color,
                  boxShadow: `0 0 7px ${color}` }} />
                <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{label}</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.txt }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Exceptions card ───────────────────────────────────────────────────────────
function ExceptionsCard({ criticalN, warningN, infoN, loading }: {
  criticalN: number; warningN: number; infoN: number; loading?: boolean;
}) {
  const total = criticalN + warningN + infoN;
  const hot   = criticalN > 0;
  return (
    <Card hot={hot}>
      <Label color={hot ? C.red : undefined}>Exceptions</Label>
      {loading ? (
        <><Skel h={46} w="60%" /><div style={{ marginTop: 16 }}><Skel h={14} /></div></>
      ) : (
        <>
          <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1,
            color: hot ? C.red : C.txt, letterSpacing: "-0.045em", fontVariantNumeric: "tabular-nums" }}>
            {total}
          </div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {([
              { color: C.red,  label: "Critical", n: criticalN },
              { color: C.org,  label: "Warning",  n: warningN  },
              { color: C.blue, label: "Info",      n: infoN    },
            ] as const).map(({ color, label, n }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 11, color: C.subtle }}>{label}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: n > 0 ? color : C.dim }}>{n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Shortage risk ─────────────────────────────────────────────────────────────
function ShortageRisk({ items, loading }: { items: FlowItem[]; loading?: boolean }) {
  const shortageItems = useMemo(() =>
    items
      .filter(i => i.risk_tier === "critical" || i.risk_tier === "stockout" || i.risk_tier === "watch")
      .sort((a, b) => a.days_of_cover - b.days_of_cover)
      .slice(0, 6),
    [items]);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Label>Shortage risk</Label>
        <span style={{ fontSize: 10, color: C.dim, textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 10 }}>days to stockout</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map(i => <Skel key={i} h={54} />)}
        </div>
      ) : shortageItems.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle, textAlign: "center", padding: "20px 0" }}>
          No items at shortage risk in the current horizon.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shortageItems.map((item) => {
            const d   = item.days_of_cover;
            const col = urgencyColor(d);
            const bg  = urgencyBg(d);
            return (
              <Link key={item.item_id} href={`/planning/inventory-flow/${item.item_id}`}
                style={{ textDecoration: "none" }}>
                <div style={{
                  background: bg, border: `1px solid ${col}22`,
                  borderRadius: 10, padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
                }}>
                  <div style={{ minWidth: 60, display: "flex", alignItems: "baseline", gap: 2 }}>
                    <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1,
                      color: col, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.045em" }}>
                      {Math.round(d)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: col, opacity: 0.7 }}>d</span>
                  </div>
                  <div style={{ width: 1, height: 34, background: `${col}28`, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, lineHeight: 1.2 }}>
                      {item.item_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.subtle, marginTop: 3 }}>
                      {item.current_on_hand.toLocaleString()} on hand
                    </div>
                  </div>
                  <div style={{ width: 80, flexShrink: 0 }}>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div className="bar-grow" style={{ height: "100%", borderRadius: 2, background: col,
                        width: `${Math.max(8, (d / 14) * 100)}%`, opacity: 0.75 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 3, textAlign: "right" }}>
                      {Math.round((d / 14) * 100)}% horizon
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Planning card ─────────────────────────────────────────────────────────────
function PlanningCard({ run, loading }: { run: PlanningRunRow | null; loading?: boolean }) {
  const totalRecs = (run?.summary?.purchase_recs_count ?? 0) + (run?.summary?.production_recs_count ?? 0);
  const exceptions = run?.summary?.exceptions_count ?? 0;
  const lastRun = run?.executed_at ?? null;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Label>Planning run</Label>
      {loading ? (
        <><Skel h={50} w="60%" /><Skel h={32} /></>
      ) : (
        <>
          <div>
            <div style={{ fontSize: 50, fontWeight: 900, lineHeight: 1, color: C.txt, letterSpacing: "-0.045em" }}>
              {run ? totalRecs : "—"}
            </div>
            <div style={{ fontSize: 11, color: C.subtle, marginTop: 4 }}>
              {run ? "recommendations · latest run" : "No completed run found"}
            </div>
          </div>
          {run && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill color={C.org}  bg="rgba(255,140,64,0.12)">
                {exceptions} exception{exceptions !== 1 ? "s" : ""}
              </Pill>
              <Pill color={C.teal} bg="rgba(34,211,163,0.10)">
                {(run.summary?.purchase_recs_count ?? 0)} purchase
              </Pill>
              <Pill color={C.blue} bg="rgba(91,155,255,0.10)">
                {(run.summary?.production_recs_count ?? 0)} production
              </Pill>
            </div>
          )}
          <div style={{ paddingTop: 12, borderTop: `1px solid ${C.bord}` }}>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Last run
            </div>
            <div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>
              {lastRun ? new Date(lastRun).toLocaleString() : "—"}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Production this week ──────────────────────────────────────────────────────
interface ProdWeekItem {
  item_id: string;
  item_name: string;
  planned: number;
  completed: number;
  remaining: number;
  current_on_hand: number;
  color: string;
}

const COLORS = [C.gold, C.teal, C.blue, C.org, C.red];

function ProductionWeek({ rows, loading }: { rows: ProdWeekItem[]; loading?: boolean }) {
  return (
    <Card>
      <Label>Production this week</Label>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {[1,2,3].map(i => <Skel key={i} h={52} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle, textAlign: "center", padding: "20px 0" }}>
          No production planned for this week.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {rows.map((item) => {
            const total    = item.planned;
            const done     = item.completed;
            const pctDone  = total > 0 ? (done / total) * 100 : 0;
            const pctPlan  = 100;
            return (
              <div key={item.item_id}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", marginBottom: 9 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{item.item_name}</span>
                  <span style={{ fontSize: 11, color: C.subtle }}>
                    <span style={{ color: item.color, fontWeight: 800 }}>+{item.planned.toLocaleString()}</span>
                    {" planned · "}{item.completed.toLocaleString()} done
                  </span>
                </div>
                <div style={{ position: "relative", height: 10,
                  background: "rgba(255,255,255,0.05)", borderRadius: 5, overflow: "hidden" }}>
                  <div className="bar-grow" style={{ position: "absolute", inset: 0,
                    width: `${pctPlan}%`, background: item.color, opacity: 0.15, borderRadius: 5 }} />
                  <div className="bar-grow" style={{ position: "absolute", inset: 0,
                    width: `${pctDone}%`, background: item.color, borderRadius: 5,
                    boxShadow: `0 0 10px ${item.color}55` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                  <span style={{ fontSize: 10, color: C.dim }}>Done: {item.completed.toLocaleString()}</span>
                  <span style={{ fontSize: 10, color: C.dim }}>On hand: {item.current_on_hand.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Recent production ─────────────────────────────────────────────────────────
function RecentProduction({ rows, now, loading }: {
  rows: ProductionActualRow[]; now: Date; loading?: boolean;
}) {
  return (
    <Card>
      <Label>Recent production</Label>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[1,2,3,4,5].map(i => <Skel key={i} h={44} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle, textAlign: "center", padding: "20px 0" }}>
          No recent production actuals found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((r, i) => {
            const name = r.item_name ?? r.item_id;
            const qty  = toNum(r.output_qty);
            const time = fmtRelative(r.submitted_at ?? r.produced_at, now);
            return (
              <div key={r.actual_id ?? i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 10px", borderRadius: 8,
                background: i === 0 ? C.surfHi : "transparent",
                borderBottom: i < rows.length - 1 ? `1px solid ${C.bord}` : "none",
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: i === 0 ? `${C.teal}18` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${i === 0 ? C.teal + "45" : C.bord}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, color: i === 0 ? C.teal : C.dim,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.txt,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 10, color: C.subtle, marginTop: 2 }}>{time}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: C.teal, letterSpacing: "-0.025em" }}>
                    +{qty.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: C.dim }}>units</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Critical today (live endpoint) ────────────────────────────────────────────
function CriticalTodaySection({ now }: { now: Date }) {
  const q = useQuery({
    queryKey: ["dashboard", "critical-today"],
    queryFn: ({ signal }) => fetchJson<CriticalTodayResponse>("/api/dashboard/critical-today", signal),
    staleTime: 60_000,
  });
  if (q.isLoading || q.isError || !q.data) return null;
  const rows = q.data.rows ?? [];
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Flame style={{ width: 14, height: 14, color: C.red }} strokeWidth={2.25} />
          <Label>Critical today</Label>
        </div>
        {rows.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, color: C.teal, fontWeight: 600, marginBottom: 10 }}>
            <CheckCircle2 style={{ width: 12, height: 12 }} strokeWidth={2} />
            All clear
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: C.subtle }}>
          No stockouts, planning blockers, or stale integrations today.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              background: "rgba(255,68,85,0.08)", border: `1px solid ${C.red}28`,
              borderRadius: 10, padding: "10px 14px",
            }}>
              <AlertTriangle style={{ width: 14, height: 14, color: C.red,
                flexShrink: 0, marginTop: 2 }} strokeWidth={2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{row.display_name}</div>
                <div style={{ fontSize: 10, color: C.subtle, marginTop: 2 }}>
                  {fmtRelative(row.triggered_at, now)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Slipped plans (live endpoint) ─────────────────────────────────────────────
function SlippedPlansSection({ now }: { now: Date }) {
  const q = useQuery({
    queryKey: ["dashboard", "slipped-plans"],
    queryFn: ({ signal }) => fetchJson<SlippedPlansResponse>("/api/dashboard/slipped-plans", signal),
    staleTime: 60_000,
  });
  if (q.isLoading || q.isError || !q.data) return null;
  const rows = q.data.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TrendingDown style={{ width: 14, height: 14, color: C.org }} strokeWidth={2.25} />
        <Label>Slipped plans</Label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((row) => (
          <div key={row.plan_id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 0", borderBottom: `1px solid ${C.bord}`,
          }}>
            <div style={{ flexShrink: 0, textAlign: "center", minWidth: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.org }}>{fmtPlanDate(row.plan_date)}</div>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>{row.days_overdue}d late</div>
            </div>
            <div style={{ width: 1, height: 28, background: C.bord, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.txt,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.item_name ?? row.item_id}
              </div>
              <div style={{ fontSize: 10, color: C.subtle, marginTop: 2 }}>
                Planned: {row.planned_qty} {row.uom}
              </div>
            </div>
            <Link href={`/planning/production-plan?from=${row.plan_date}&to=${row.plan_date}`}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 600, color: C.muted, textDecoration: "none" }}>
              Open <ArrowRight style={{ width: 11, height: 11 }} strokeWidth={2} />
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const now  = useMemo(() => new Date(), []);
  const week = useMemo(() => weekRange(), []);

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const flowQ = useInventoryFlow({});

  const valueQ = useQuery({
    queryKey: ["stock", "value"],
    queryFn: ({ signal }) => fetchJson<StockValueResponse>("/api/stock/value", signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const exceptionsQ = useQuery({
    queryKey: ["exceptions", "open"],
    queryFn: ({ signal }) => fetchJson<ExceptionsResponse>("/api/exceptions?status=OPEN&page_size=200", signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const planningQ = useQuery({
    queryKey: ["planning", "runs", "latest"],
    queryFn: ({ signal }) => fetchJson<PlanningRunsResponse>("/api/planning/runs?status=completed&limit=1", signal),
    staleTime: 120_000,
  });

  const productionQ = useQuery({
    queryKey: ["production-plan", week.from, week.to],
    queryFn: ({ signal }) =>
      fetchJson<ProductionPlanResponse>(`/api/production-plan?from=${week.from}&to=${week.to}`, signal),
    staleTime: 60_000,
  });

  const actualsQ = useQuery({
    queryKey: ["production-actuals", "recent"],
    queryFn: ({ signal }) =>
      fetchJson<ProductionActualsResponse>("/api/production-actuals/history?limit=5", signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // ── Derived: stock health ────────────────────────────────────────────────────
  const flowItems = flowQ.data?.items ?? [];
  const healthy  = flowItems.filter(i => i.risk_tier === "healthy").length;
  const watch    = flowItems.filter(i => i.risk_tier === "watch").length;
  const critical = flowItems.filter(i => i.risk_tier === "critical" || i.risk_tier === "stockout").length;
  const total    = flowItems.length;

  // ── Derived: inventory values ────────────────────────────────────────────────
  const vd       = valueQ.data;
  const rmValue  = vd?.rm_value ?? vd?.rm_total ?? null;
  const fgValue  = vd?.fg_value ?? vd?.fg_total ?? null;
  const rmSkus   = vd?.rm_sku_count ?? null;
  const fgSkus   = vd?.fg_sku_count ?? null;

  // ── Derived: exceptions ──────────────────────────────────────────────────────
  const excRows   = exceptionsQ.data?.rows ?? exceptionsQ.data?.data ?? [];
  const criticalN = excRows.filter(e => e.severity === "critical").length;
  const warningN  = excRows.filter(e => e.severity === "warning").length;
  const infoN     = excRows.filter(e => e.severity === "info").length;

  // ── Derived: planning run ────────────────────────────────────────────────────
  const planRows = planningQ.data?.rows ?? planningQ.data?.data ?? [];
  const latestRun = planRows[0] ?? null;

  // ── Derived: production this week ────────────────────────────────────────────
  const prodWeekItems = useMemo<ProdWeekItem[]>(() => {
    const rawRows = productionQ.data?.rows ?? productionQ.data?.data ?? [];
    const byItem = new Map<string, ProdWeekItem>();
    rawRows.forEach((row, idx) => {
      if (row.status === "CANCELLED") return;
      const existing = byItem.get(row.item_id);
      const planned   = toNum(row.planned_qty);
      const completed = toNum(row.completed_qty);
      const flowItem  = flowItems.find(f => f.item_id === row.item_id);
      if (existing) {
        existing.planned   += planned;
        existing.completed += completed;
        existing.remaining += toNum(row.planned_remaining_qty);
      } else {
        byItem.set(row.item_id, {
          item_id:        row.item_id,
          item_name:      row.item_name ?? row.item_id,
          planned,
          completed,
          remaining:      toNum(row.planned_remaining_qty),
          current_on_hand: flowItem?.current_on_hand ?? 0,
          color:          COLORS[idx % COLORS.length],
        });
      }
    });
    return Array.from(byItem.values()).sort((a, b) => b.planned - a.planned).slice(0, 5);
  }, [productionQ.data, flowItems]);

  // ── Derived: recent production ───────────────────────────────────────────────
  const recentActuals = actualsQ.data?.rows ?? actualsQ.data?.data ?? [];

  return (
    <>
      <style>{`
        @keyframes pulse-live {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.30; }
        }
        @keyframes bar-fill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes skel-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 0.2; }
        }
        .pulse-live { animation: pulse-live 2.6s ease-in-out infinite; }
        .dot-ok     { box-shadow: 0 0 7px #22D3A3; animation: pulse-live 2.6s ease-in-out infinite; }
        .dot-err    { box-shadow: 0 0 7px #FF4455; animation: pulse-live 1.8s ease-in-out infinite; }
        .bar-grow   { transform-origin: left; animation: bar-fill 0.85s cubic-bezier(0.16,1,0.3,1) forwards; }
        .skel-pulse { animation: skel-pulse 1.6s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-end", paddingBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.20em",
              color: C.subtle, textTransform: "uppercase", marginBottom: 3 }}>
              GT Factory OS
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: C.txt,
              letterSpacing: "-0.04em", lineHeight: 1, margin: 0 }}>
              Dashboard
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingBottom: 2 }}>
            <div className="pulse-live" style={{ width: 8, height: 8, borderRadius: "50%",
              background: C.teal, boxShadow: `0 0 12px ${C.teal}` }} />
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>
              Live · {now.toLocaleDateString("en-IL", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* ── Row 1: Hero KPIs ───────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr 1fr", gap: 12 }}>
          <ValueCard
            label="RM Inventory Value"
            value={rmValue != null ? fmtILS(rmValue) : null}
            sub={rmSkus != null ? `${rmSkus} raw material SKUs` : "Raw materials"}
            accent={C.gold}
            loading={valueQ.isLoading}
          />
          <ValueCard
            label="FG Inventory Value"
            value={fgValue != null ? fmtILS(fgValue) : null}
            sub={fgSkus != null ? `${fgSkus} finished good SKUs` : "Finished goods"}
            accent={C.teal}
            loading={valueQ.isLoading}
          />
          <StockDonut
            healthy={healthy} watch={watch} critical={critical} total={total}
            loading={flowQ.isLoading}
          />
          <ExceptionsCard
            criticalN={criticalN} warningN={warningN} infoN={infoN}
            loading={exceptionsQ.isLoading}
          />
        </div>

        {/* ── Row 2: Shortage + Planning ─────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
          <ShortageRisk items={flowItems} loading={flowQ.isLoading} />
          <PlanningCard run={latestRun} loading={planningQ.isLoading} />
        </div>

        {/* ── Row 3: Production + Recent actuals ────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ProductionWeek rows={prodWeekItems} loading={productionQ.isLoading} />
          <RecentProduction rows={recentActuals} now={now} loading={actualsQ.isLoading} />
        </div>

        {/* ── Row 4: Live alerts ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <CriticalTodaySection now={now} />
          <SlippedPlansSection now={now} />
        </div>

      </div>
    </>
  );
}
