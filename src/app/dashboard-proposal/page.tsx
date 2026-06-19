"use client";

// ---------------------------------------------------------------------------
// DESIGN PROPOSAL — isolated prototype. NOT wired into nav, NOT a production
// surface. Combines direction #1 (Linear: calm dark, single rationed accent,
// hairline borders) + #5 (KPI-hero: one bold metric, big numerics). Uses only
// the existing "Operational Precision" tokens — no tailwind.config / globals
// changes. Representative factory data; English labels, Hebrew data values
// per the repo UI-language contract. Screenshot target for /dashboard-proposal.
// ---------------------------------------------------------------------------

import {
  LayoutDashboard,
  Inbox,
  PackageCheck,
  ClipboardList,
  Boxes,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  FlaskConical,
  Calendar,
  Search,
  Bell,
  ArrowUpRight,
  ChevronRight,
  Circle,
} from "lucide-react";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Inbox, label: "Inbox", badge: 3 },
  { icon: PackageCheck, label: "Goods receipt" },
  { icon: ClipboardList, label: "Physical count" },
  { icon: Boxes, label: "Inventory" },
  { icon: TrendingUp, label: "Planning" },
  { icon: FlaskConical, label: "Recipes" },
  { icon: ShoppingCart, label: "Procurement" },
  { icon: Calendar, label: "Weekly outlook" },
];

const KPIS = [
  { label: "Open POs", value: "7", sub: "2 due today", tone: "fg" },
  { label: "Low-stock items", value: "4", sub: "needs ordering", tone: "warning" },
  { label: "Pending approvals", value: "3", sub: "2 waste · 1 count", tone: "fg" },
];

const TODAY = [
  { title: "Receive PO #1042", meta: "ספק תה ירוק · 8 lines", tone: "accent" },
  { title: "Count raw material", meta: "מאצ'ה 30g · last counted 6d ago", tone: "warning" },
  { title: "Approve waste report", meta: "מרגריטה · 12 units · operator Avi", tone: "fg" },
  { title: "Place tea-line order", meta: "4 components below reorder point", tone: "fg" },
];

const FLOW = [
  { name: "תה קלם 1 ליטר", tier: "healthy", days: "18d cover" },
  { name: "תה אנרג'י 500", tier: "medium", days: "11d cover" },
  { name: "דיטוקס 1 ליטר", tier: "low", days: "6d cover" },
  { name: "מאצ'ה 30g", tier: "at-risk", days: "3d cover" },
  { name: "מרגריטה 3.85L", tier: "critical", days: "stockout" },
  { name: "סנגריה אדומה", tier: "healthy", days: "21d cover" },
];

const PRODUCTION = [40, 62, 48, 71, 55, 83, 68, 91, 77];

const tierBg: Record<string, string> = {
  critical: "bg-tier-critical-bg text-tier-critical-fg",
  "at-risk": "bg-tier-at-risk-bg text-tier-at-risk-fg",
  low: "bg-tier-low-bg text-tier-low-fg",
  medium: "bg-tier-medium-bg text-tier-medium-fg",
  healthy: "bg-tier-healthy-bg text-tier-healthy-fg",
};

export default function DashboardProposal() {
  return (
    <div className="flex min-h-screen bg-bg font-sans text-fg antialiased">
      {/* ─── Sidebar (calm, single active accent) ─────────────────────── */}
      <aside className="flex w-60 flex-col border-r border-border-faint bg-bg-subtle">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-7 w-7 place-items-center rounded bg-accent text-2xs font-bold text-accent-fg">
            GT
          </div>
          <div className="text-sm font-semibold tracking-tight text-fg-strong">
            Factory OS
          </div>
        </div>
        <nav className="mt-2 flex flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <div
              key={item.label}
              className={[
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                item.active
                  ? "bg-bg-muted font-medium text-fg-strong shadow-[inset_2px_0_0_0_hsl(var(--accent))]"
                  : "text-fg-muted hover:bg-bg-muted/60 hover:text-fg",
              ].join(" ")}
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-accent px-1.5 text-2xs font-semibold text-accent-fg">
                  {item.badge}
                </span>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="mt-auto m-3 rounded-lg border border-border-faint bg-bg-raised p-3">
          <div className="text-2xs uppercase tracking-ops text-fg-subtle">Shift</div>
          <div className="mt-1 text-sm font-medium text-fg-strong">Day · 07:00–15:00</div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border-faint px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-fg-strong">
              Good afternoon, Alex
            </h1>
            <p className="text-xs text-fg-subtle">Friday, June 19 · everything in one view</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-border-faint bg-bg-subtle px-3 py-1.5 text-xs text-fg-subtle">
              <Search className="h-3.5 w-3.5" />
              <span>Search…</span>
            </div>
            <button className="grid h-8 w-8 place-items-center rounded-md border border-border-faint text-fg-muted">
              <Bell className="h-4 w-4" />
            </button>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              AL
            </div>
          </div>
        </header>

        <div className="space-y-6 p-8">
          {/* ─── Hero band (#5): one bold metric + 3 calm KPIs ─────────── */}
          <section className="grid grid-cols-12 gap-4">
            {/* Hero card */}
            <div className="col-span-6 overflow-hidden rounded-xl border border-border-faint bg-bg-raised p-6 shadow-pop">
              <div className="flex items-center justify-between">
                <span className="text-2xs uppercase tracking-ops text-fg-subtle">
                  Stock value · at current prices
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-2xs font-medium text-success-fg">
                  <ArrowUpRight className="h-3 w-3" /> +2.4%
                </span>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums text-fg-strong">
                  ₪1,284,500
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                Updated 14 min ago · 312 SKUs across 4 stores
              </p>

              {/* Sparkline */}
              <svg viewBox="0 0 320 56" className="mt-5 h-14 w-full" preserveAspectRatio="none">
                <polyline
                  points="0,44 36,40 72,42 108,30 144,33 180,22 216,26 252,14 288,18 320,8"
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <button className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover">
                Open inventory <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* 3 calm KPI tiles */}
            <div className="col-span-6 grid grid-cols-3 gap-4">
              {KPIS.map((k) => (
                <div
                  key={k.label}
                  className="flex flex-col justify-between rounded-xl border border-border-faint bg-bg-raised p-5"
                >
                  <div className="text-2xs uppercase tracking-ops text-fg-subtle">
                    {k.label}
                  </div>
                  <div
                    className={[
                      "mt-4 font-mono text-4xl font-semibold tabular-nums tracking-tight",
                      k.tone === "warning" ? "text-warning" : "text-fg-strong",
                    ].join(" ")}
                  >
                    {k.value}
                  </div>
                  <div className="mt-1 text-xs text-fg-subtle">{k.sub}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Supporting row: Today / Flow / Production ─────────────── */}
          <section className="grid grid-cols-12 gap-4">
            {/* Today's work */}
            <div className="col-span-5 rounded-xl border border-border-faint bg-bg-raised p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg-strong">Today&apos;s work</h2>
                <span className="text-2xs text-fg-subtle">4 items</span>
              </div>
              <div className="divide-y divide-border-faint">
                {TODAY.map((t) => (
                  <div key={t.title} className="flex items-center gap-3 py-3">
                    <Circle
                      className={[
                        "h-2 w-2 shrink-0 fill-current",
                        t.tone === "accent"
                          ? "text-accent"
                          : t.tone === "warning"
                          ? "text-warning"
                          : "text-fg-faint",
                      ].join(" ")}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{t.title}</div>
                      <div className="truncate text-xs text-fg-subtle">{t.meta}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-fg-faint" />
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory flow */}
            <div className="col-span-4 rounded-xl border border-border-faint bg-bg-raised p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg-strong">Inventory flow</h2>
                <AlertTriangle className="h-4 w-4 text-warning" />
              </div>
              <div className="space-y-1.5">
                {FLOW.map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span
                      className={[
                        "inline-block h-3 w-3 rounded-sm",
                        tierBg[f.tier].split(" ")[0],
                      ].join(" ")}
                    />
                    <span className="flex-1 truncate text-xs text-fg" dir="rtl">
                      {f.name}
                    </span>
                    <span className="font-mono text-2xs tabular-nums text-fg-subtle">
                      {f.days}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Production sparkbars */}
            <div className="col-span-3 rounded-xl border border-border-faint bg-bg-raised p-5">
              <h2 className="mb-1 text-sm font-semibold text-fg-strong">Production</h2>
              <div className="text-2xs uppercase tracking-ops text-fg-subtle">last 9 days</div>
              <div className="mt-4 flex h-24 items-end gap-1.5">
                {PRODUCTION.map((v, i) => (
                  <div
                    key={i}
                    className={[
                      "flex-1 rounded-sm",
                      i === PRODUCTION.length - 1 ? "bg-accent" : "bg-border-strong",
                    ].join(" ")}
                    style={{ height: `${v}%` }}
                  />
                ))}
              </div>
              <div className="mt-3 font-mono text-2xl font-semibold tabular-nums text-fg-strong">
                91
              </div>
              <div className="text-xs text-fg-subtle">units today · +18%</div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
