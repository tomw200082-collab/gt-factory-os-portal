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

/* ─────────────────────────────────────────────────────────────────────────────
   DASHBOARD — GT Factory OS
   Merged: Dashboard overview + Control Tower (v2)
   Dark-mode operational command center
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

// ── Fixture data — replaced by API once backend exposes these endpoints ────────
const SHIPMENTS = [
  { product: "Mojito cocktail 450ml",    qty: 48,  unit: "btl", time: "Today 13:42" },
  { product: "Peach iced tea 1L",        qty: 72,  unit: "btl", time: "Today 11:15" },
  { product: "Mango smoothie 330ml",     qty: 36,  unit: "btl", time: "Today 09:30" },
  { product: "Classic lemonade 500ml",   qty: 120, unit: "btl", time: "Yesterday"   },
  { product: "Margarita cocktail 450ml", qty: 24,  unit: "btl", time: "Yesterday"   },
];

const PROD_WEEK = [
  { name: "Mojito 450ml",    current: 132, target: 480, planned: 240, color: C.gold },
  { name: "Peach Tea 1L",   current: 310, target: 800, planned: 400, color: C.teal },
  { name: "Lemonade 500ml", current: 220, target: 960, planned: 480, color: C.blue },
];

const SHORTAGE = [
  { name: "Fresh mint",   onHand: "0.6 kg",  days: 1 },
  { name: "Lime juice",   onHand: "9.4 L",   days: 3 },
  { name: "Mojito label", onHand: "420 pcs", days: 5 },
  { name: "Mojito 450ml", onHand: "132 btl", days: 6 },
];

const FRESHNESS = [
  { label: "Ledger",        ago: "2 min",  ok: true  },
  { label: "LionWheel",     ago: "2h 12m", ok: false },
  { label: "Shopify",       ago: "44 min", ok: true  },
  { label: "Green Invoice", ago: "4h 58m", ok: true  },
];

// ── Live API types (from Control Tower v2) ────────────────────────────────────
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

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function urgencyColor(d: number) { return d <= 2 ? C.red : d <= 5 ? C.org : C.gold; }
function urgencyBg(d: number) {
  return d <= 2 ? "rgba(255,68,85,0.12)" : d <= 5 ? "rgba(255,140,64,0.10)" : "rgba(245,166,35,0.08)";
}

// ── Shared card ───────────────────────────────────────────────────────────────
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

// ── Value card ────────────────────────────────────────────────────────────────
function ValueCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string; accent: string;
}) {
  return (
    <Card accent={accent}>
      <Label color={accent}>{label}</Label>
      <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: C.txt,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.035em" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.subtle, marginTop: 9, fontWeight: 500 }}>{sub}</div>
      <div style={{ marginTop: 16, height: 2, borderRadius: 1,
        background: `linear-gradient(to right, ${accent}50, ${accent}10)` }} />
    </Card>
  );
}

// ── Stock donut ───────────────────────────────────────────────────────────────
function StockDonut({ healthy, shortage, overstock, total }: {
  healthy: number; shortage: number; overstock: number; total: number;
}) {
  const r = 40, circ = 2 * Math.PI * r, gap = 6;
  function arc(count: number, color: string, offset: number) {
    return (
      <circle cx={52} cy={52} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${Math.max(0, (count / total) * circ - gap)} ${circ}`}
        strokeDashoffset={offset} transform="rotate(-90 52 52)" strokeLinecap="round" />
    );
  }
  const hShare = (healthy / total) * circ;
  const sShare = (shortage / total) * circ;
  return (
    <Card>
      <Label>Stock health</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ flexShrink: 0 }}>
          <svg width={104} height={104} viewBox="0 0 104 104">
            <circle cx={52} cy={52} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
            {arc(healthy,   C.teal, 0)}
            {arc(shortage,  C.red,  -hShare)}
            {arc(overstock, C.org,  -(hShare + sShare))}
            <text x={52} y={48} textAnchor="middle" fill={C.txt} fontSize={22} fontWeight={900}>{total}</text>
            <text x={52} y={63} textAnchor="middle" fill="rgba(238,238,245,0.28)" fontSize={9} letterSpacing="1.5">ITEMS</text>
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
          {([
            { color: C.teal, label: "Healthy",   n: healthy   },
            { color: C.red,  label: "Shortage",  n: shortage  },
            { color: C.org,  label: "Overstock", n: overstock },
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
    </Card>
  );
}

// ── Exceptions card ───────────────────────────────────────────────────────────
function ExceptionsCard({ critical, warning, info }: {
  critical: number; warning: number; info: number;
}) {
  const total = critical + warning + info;
  const hot   = critical > 0;
  return (
    <Card hot={hot}>
      <Label color={hot ? C.red : undefined}>Exceptions</Label>
      <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1,
        color: hot ? C.red : C.txt, letterSpacing: "-0.045em", fontVariantNumeric: "tabular-nums" }}>
        {total}
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {([
          { color: C.red,  label: "Critical", n: critical },
          { color: C.org,  label: "Warning",  n: warning  },
          { color: C.blue, label: "Info",     n: info     },
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
    </Card>
  );
}

// ── Shortage risk ─────────────────────────────────────────────────────────────
function ShortageRisk() {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Label>Shortage risk</Label>
        <span style={{ fontSize: 10, color: C.dim, textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 10 }}>days to stockout</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SHORTAGE.map((item) => {
          const col = urgencyColor(item.days);
          const bg  = urgencyBg(item.days);
          return (
            <div key={item.name} style={{
              background: bg, border: `1px solid ${col}22`,
              borderRadius: 10, padding: "12px 16px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{ minWidth: 60, display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1,
                  color: col, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.045em" }}>
                  {item.days}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: col, opacity: 0.7 }}>d</span>
              </div>
              <div style={{ width: 1, height: 34, background: `${col}28`, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, lineHeight: 1.2 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: C.subtle, marginTop: 3 }}>{item.onHand} on hand</div>
              </div>
              <div style={{ width: 80, flexShrink: 0 }}>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div className="bar-grow" style={{ height: "100%", borderRadius: 2, background: col,
                    width: `${Math.max(8, (item.days / 14) * 100)}%`, opacity: 0.75 }} />
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 3, textAlign: "right" }}>
                  {Math.round((item.days / 14) * 100)}% horizon
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Planning card ─────────────────────────────────────────────────────────────
function PlanningCard() {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Label>Planning run</Label>
      <div>
        <div style={{ fontSize: 50, fontWeight: 900, lineHeight: 1, color: C.txt, letterSpacing: "-0.045em" }}>18</div>
        <div style={{ fontSize: 11, color: C.subtle, marginTop: 4 }}>recommendations · latest run</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill color={C.org}  bg="rgba(255,140,64,0.12)">4 flagged</Pill>
        <Pill color={C.teal} bg="rgba(34,211,163,0.10)">14 pending</Pill>
      </div>
      <div style={{ paddingTop: 12, borderTop: `1px solid ${C.bord}` }}>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Last run</div>
        <div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Today at 05:00</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {([
          { label: "Ledger integrity", status: "warn" as const },
          { label: "Jobs health",      status: "warn" as const },
          { label: "Projection lag",   status: "ok"  as const, detail: "12s" },
        ]).map(({ label, status, detail }) => {
          const col = status === "ok" ? C.teal : status === "warn" ? C.org : C.red;
          return (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.subtle }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: col }}>
                {status === "ok" ? "● " : "⚠ "}{detail ?? status.toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Production this week ──────────────────────────────────────────────────────
function ProductionWeek() {
  return (
    <Card>
      <Label>Production this week</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {PROD_WEEK.map((item) => {
          const after    = Math.min(item.current + item.planned, item.target);
          const pctNow   = (item.current / item.target) * 100;
          const pctAfter = (after        / item.target) * 100;
          return (
            <div key={item.name}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "baseline", marginBottom: 9 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{item.name}</span>
                <span style={{ fontSize: 11, color: C.subtle }}>
                  <span style={{ color: item.color, fontWeight: 800 }}>+{item.planned}</span>
                  {" "}→ {after}<span style={{ opacity: 0.4 }}> / {item.target}</span>
                </span>
              </div>
              <div style={{ position: "relative", height: 10,
                background: "rgba(255,255,255,0.05)", borderRadius: 5, overflow: "hidden" }}>
                <div className="bar-grow" style={{ position: "absolute", inset: 0,
                  width: `${pctAfter}%`, background: item.color, opacity: 0.20, borderRadius: 5 }} />
                <div className="bar-grow" style={{ position: "absolute", inset: 0,
                  width: `${pctNow}%`, background: item.color, borderRadius: 5,
                  boxShadow: `0 0 10px ${item.color}55` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontSize: 10, color: C.dim }}>Now: {item.current}</span>
                <span style={{ fontSize: 10, color: C.dim }}>Target: {item.target}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Last 5 shipments ──────────────────────────────────────────────────────────
function Shipments() {
  return (
    <Card>
      <Label>Last 5 shipments</Label>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {SHIPMENTS.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 10px", borderRadius: 8,
            background: i === 0 ? C.surfHi : "transparent",
            borderBottom: i < SHIPMENTS.length - 1 ? `1px solid ${C.bord}` : "none",
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
                {s.product}
              </div>
              <div style={{ fontSize: 10, color: C.subtle, marginTop: 2 }}>{s.time}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.red, letterSpacing: "-0.025em" }}>
                −{s.qty}
              </div>
              <div style={{ fontSize: 10, color: C.dim }}>{s.unit}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Freshness strip ───────────────────────────────────────────────────────────
function FreshnessStrip() {
  return (
    <div style={{
      background: C.surf, border: `1px solid ${C.bord}`, borderRadius: 14,
      padding: "13px 22px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
        color: C.dim, textTransform: "uppercase", marginRight: 4 }}>Data freshness</span>
      {FRESHNESS.map((f) => (
        <div key={f.label} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: f.ok ? "rgba(34,211,163,0.08)" : "rgba(255,68,85,0.10)",
          border: `1px solid ${f.ok ? C.teal + "28" : C.red + "35"}`,
          borderRadius: 20, padding: "4px 12px",
        }}>
          <div className={f.ok ? "dot-ok" : "dot-err"}
            style={{ width: 6, height: 6, borderRadius: "50%", background: f.ok ? C.teal : C.red }} />
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{f.label}</span>
          <span style={{ fontSize: 11, color: f.ok ? C.teal : C.red, fontWeight: 700 }}>{f.ago}</span>
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 10, color: C.dim }}>Auto-refresh · 30s</div>
    </div>
  );
}

// ── Live: Critical Today (merged from Control Tower v2 §4.1) ─────────────────
function CriticalTodaySection({ now }: { now: Date }) {
  const q = useQuery({
    queryKey: ["dashboard", "critical-today"],
    queryFn: ({ signal }) => fetchJson<CriticalTodayResponse>("/api/dashboard/critical-today", signal),
    staleTime: 60_000,
  });

  if (q.isLoading || q.isError) return null;
  const rows = q.data?.rows ?? [];

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

// ── Live: Slipped Plans (merged from Control Tower v2 §4.4) ──────────────────
function SlippedPlansSection({ now }: { now: Date }) {
  const q = useQuery({
    queryKey: ["dashboard", "slipped-plans"],
    queryFn: ({ signal }) => fetchJson<SlippedPlansResponse>("/api/dashboard/slipped-plans", signal),
    staleTime: 60_000,
  });

  if (q.isLoading || q.isError) return null;
  const rows = q.data?.rows ?? [];
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
  const now = useMemo(() => new Date(), []);

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
        .pulse-live { animation: pulse-live 2.6s ease-in-out infinite; }
        .dot-ok     { box-shadow: 0 0 7px #22D3A3; animation: pulse-live 2.6s ease-in-out infinite; }
        .dot-err    { box-shadow: 0 0 7px #FF4455; animation: pulse-live 1.8s ease-in-out infinite; }
        .bar-grow   { transform-origin: left; animation: bar-fill 0.85s cubic-bezier(0.16,1,0.3,1) forwards; }
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
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>Live · May 7, 2026</span>
          </div>
        </div>

        {/* ── Row 1: Hero KPIs ───────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr 1fr", gap: 12 }}>
          <ValueCard label="RM Inventory Value" value="₪ 48,200"  sub="14 raw material SKUs" accent={C.gold} />
          <ValueCard label="FG Inventory Value" value="₪ 127,500" sub="8 finished good SKUs"  accent={C.teal} />
          <StockDonut healthy={23} shortage={3} overstock={2} total={28} />
          <ExceptionsCard critical={1} warning={3} info={2} />
        </div>

        {/* ── Row 2: Shortage + Planning ─────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
          <ShortageRisk />
          <PlanningCard />
        </div>

        {/* ── Row 3: Production + Shipments ─────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ProductionWeek />
          <Shipments />
        </div>

        {/* ── Row 4: Live alerts (from Control Tower v2) ────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <CriticalTodaySection now={now} />
          <SlippedPlansSection now={now} />
        </div>

        {/* ── Row 5: Data freshness strip ────────────────────────────────── */}
        <FreshnessStrip />

      </div>
    </>
  );
}
