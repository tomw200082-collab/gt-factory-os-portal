"use client";

// /planning/meeting — Weekly Cadence cockpit.
//
// One day-aware surface that drives the operator rhythm. It opens on the step
// that matches today (Thursday → Firm, Sunday → Procure, otherwise → Execute)
// but the cadence rail lets you move between steps at any time.
//
//   • FIRM (Thursday): review the engine's draft week (~2 weeks out) and lock
//     it. Locking promotes draft → planned; the Sunday session then buys
//     against the committed week. Reversible via the production-plan workflow.
//   • PROCURE (Sunday): buy for the firmed week — handled by the existing
//     purchase-session surface; the cockpit routes you there.
//   • EXECUTE (daily): make today's batch and report the actual.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarCheck,
  ShoppingCart,
  Factory,
  ChevronLeft,
  ChevronRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Droplet,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";
import {
  useDraftWeek,
  useFirmWeek,
  defaultFirmWeekStart,
  stepForToday,
  fmtWeekRange,
  fmtDayHeader,
  workingDaysOf,
  parseIsoDate,
  toIsoDate,
  addDays,
  familyTintVar,
  type CadenceStep,
  type DraftWeekRow,
} from "./_lib/cadence";

// ---------------------------------------------------------------------------
// Cadence rail — the three-step rhythm, with today highlighted.
// ---------------------------------------------------------------------------
const STEPS: { key: CadenceStep; label: string; sub: string; icon: typeof Lock }[] = [
  { key: "firm", label: "Firm", sub: "Thursday", icon: CalendarCheck },
  { key: "procure", label: "Procure", sub: "Sunday", icon: ShoppingCart },
  { key: "execute", label: "Execute", sub: "Daily", icon: Factory },
];

function CadenceRail({
  active,
  today,
  onSelect,
}: {
  active: CadenceStep;
  today: CadenceStep;
  onSelect: (s: CadenceStep) => void;
}) {
  return (
    <div className="flex w-full items-stretch gap-2 rounded-xl border border-border bg-bg-raised p-1.5 shadow-hairline">
      {STEPS.map((s, i) => {
        const isActive = s.key === active;
        const isToday = s.key === today;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              className={cn(
                "group flex flex-1 items-center gap-3 rounded-lg px-3.5 py-3 text-left transition-colors",
                isActive
                  ? "bg-accent text-accent-fg shadow-raised"
                  : "text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", isActive ? "opacity-100" : "opacity-70")} />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tightish">{s.label}</span>
                  {isToday ? (
                    <Badge tone={isActive ? "neutral" : "accent"} variant="soft" size="xs">
                      Today
                    </Badge>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "block text-2xs uppercase tracking-ops",
                    isActive ? "text-accent-fg/80" : "text-fg-subtle",
                  )}
                >
                  {s.sub}
                </span>
              </span>
            </button>
            {i < STEPS.length - 1 ? (
              <ArrowRight className="mx-1 h-4 w-4 shrink-0 text-fg-faint" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile (mirrors the dashboard KpiTiles look at a smaller scale)
// ---------------------------------------------------------------------------
function StatTile({
  icon: Icon,
  label,
  value,
  meta,
  tone = "neutral",
}: {
  icon: typeof Lock;
  label: string;
  value: string;
  meta?: string;
  tone?: "neutral" | "accent" | "warning" | "danger";
}) {
  const toneCls = {
    neutral: "border-border",
    accent: "border-accent-border bg-accent-softer",
    warning: "border-warning-border bg-warning-softer",
    danger: "border-danger-border bg-danger-softer",
  }[tone];
  const iconCls = {
    neutral: "text-fg-subtle",
    accent: "text-accent",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-bg-raised p-4 shadow-hairline", toneCls)}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconCls)} />
      <div className="min-w-0">
        <div className="text-2xs uppercase tracking-ops text-fg-subtle">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {meta ? <div className="mt-0.5 text-xs text-fg-muted">{meta}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft batch chip
// ---------------------------------------------------------------------------
function BatchChip({ row }: { row: DraftWeekRow }) {
  const isTea = row.track === "tea_tank";
  const tint = isTea ? familyTintVar(row.base_family) : "var(--family-matcha)";
  const title = isTea
    ? row.base_name ?? "Tea base"
    : row.item_name ?? "Matcha repack";
  const sub = isTea
    ? `${row.batch_size_l ?? row.planned_qty} L · ${row.packs.length} pack${row.packs.length === 1 ? "" : "s"}`
    : `${row.planned_qty} ${row.uom}`;
  return (
    <div
      className="rounded-md border border-border bg-bg-raised p-2.5 shadow-hairline"
      style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${tint})` }}
      title={isTea ? row.packs.map((p) => `${p.item_name ?? p.item_id}: ${p.qty}`).join("\n") : (row.notes ?? undefined)}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium" dir="auto">{title}</span>
      </div>
      <div className="mt-0.5 text-2xs uppercase tracking-ops text-fg-subtle">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FIRM panel
// ---------------------------------------------------------------------------
function FirmPanel({ canAct }: { canAct: boolean }) {
  const [weekStart, setWeekStart] = useState<string>(() => defaultFirmWeekStart());
  const [confirming, setConfirming] = useState(false);
  const draft = useDraftWeek(weekStart);
  const firm = useFirmWeek();

  const rows = draft.data?.rows ?? [];
  const days = useMemo(() => workingDaysOf(weekStart), [weekStart]);
  const byDay = useMemo(() => {
    const m = new Map<string, DraftWeekRow[]>();
    for (const d of days) m.set(d, []);
    for (const r of rows) {
      if (!m.has(r.plan_date)) m.set(r.plan_date, []);
      m.get(r.plan_date)!.push(r);
    }
    return m;
  }, [rows, days]);

  const batchCount = draft.data?.batch_count ?? 0;
  const tankDaysUsed = useMemo(
    () => new Set(rows.map((r) => r.plan_date)).size,
    [rows],
  );

  const shiftWeek = (deltaWeeks: number) =>
    setWeekStart((w) => toIsoDate(addDays(parseIsoDate(w), deltaWeeks * 7)));

  const result = firm.data;

  return (
    <div className="space-y-5">
      {/* Week selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="rounded-md border border-border bg-bg-raised p-2 text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted hover:text-fg"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[14rem] text-center">
            <div className="text-lg font-semibold tracking-tight">{fmtWeekRange(weekStart)}</div>
            <div className="text-2xs uppercase tracking-ops text-fg-subtle">Target week to firm</div>
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="rounded-md border border-border bg-bg-raised p-2 text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted hover:text-fg"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setWeekStart(defaultFirmWeekStart())}
          className="text-xs text-accent hover:underline"
        >
          Jump to this week's target
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Boxes}
          label="Draft batches"
          value={String(batchCount)}
          meta={batchCount === 0 ? "Nothing to firm" : "Will be locked on firm"}
          tone={batchCount > 0 ? "accent" : "neutral"}
        />
        <StatTile
          icon={Droplet}
          label="Tank-days used"
          value={`${tankDaysUsed} / 5`}
          meta={tankDaysUsed >= 5 ? "Full week" : "Sun–Thu capacity"}
          tone={tankDaysUsed > 5 ? "warning" : "neutral"}
        />
        <Link href="/planning/inventory-flow" className="block">
          <StatTile
            icon={AlertTriangle}
            label="At-risk check"
            value="Flow"
            meta="Open Inventory Flow →"
          />
        </Link>
      </div>

      {/* Firm result banner */}
      {result ? (
        <div className="flex items-start gap-3 rounded-lg border border-success-border bg-success-softer p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <div className="text-sm font-semibold text-success-fg">
              {result.idempotent_replay || result.newly_firmed_count === 0
                ? "Week already firmed"
                : `Firmed ${result.newly_firmed_count} batch${result.newly_firmed_count === 1 ? "" : "es"}`}
            </div>
            <div className="mt-0.5 text-xs text-fg-muted">
              {result.week_firmed_total} batch{result.week_firmed_total === 1 ? "" : "es"} now committed for {fmtWeekRange(result.week_start)}. The Sunday session will buy against this week. Reversible via the production plan.
            </div>
          </div>
        </div>
      ) : null}

      {firm.isError ? (
        <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-softer p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="text-sm text-danger-fg">{(firm.error as Error).message}</div>
        </div>
      ) : null}

      {/* Week board */}
      <SectionCard
        title="Production week"
        description="The draft batches the engine proposes for each working day. Review, then firm to lock the week."
      >
        {draft.isLoading ? (
          <div className="py-10 text-center text-sm text-fg-muted">Loading the draft week…</div>
        ) : draft.isError ? (
          <ErrorState
            title="Could not load the draft week"
            description={(draft.error as Error).message}
          />
        ) : batchCount === 0 ? (
          <EmptyState
            title="No draft batches for this week"
            description="Either this week is already firmed, or the engine hasn't proposed production for it yet. Use the week arrows to check adjacent weeks."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {days.map((d) => {
              const { dayName, dateLabel } = fmtDayHeader(parseIsoDate(d));
              const dayRows = byDay.get(d) ?? [];
              return (
                <div key={d} className="rounded-lg border border-border-faint bg-bg-subtle/40 p-2">
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-ops text-fg-muted">{dayName}</span>
                    <span className="text-2xs text-fg-subtle">{dateLabel}</span>
                  </div>
                  <div className="space-y-2">
                    {dayRows.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border-faint py-4 text-center text-2xs text-fg-faint">
                        —
                      </div>
                    ) : (
                      dayRows.map((r) => <BatchChip key={r.plan_id} row={r} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Firm action */}
      <div className="flex items-center justify-end gap-3 border-t border-border-faint pt-4">
        {!canAct ? (
          <span className="text-xs text-fg-muted">Firming is restricted to planner / admin roles.</span>
        ) : confirming ? (
          <>
            <span className="text-sm text-fg-muted">
              Lock {batchCount} batch{batchCount === 1 ? "" : "es"} for {fmtWeekRange(weekStart)}?
            </span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border bg-bg-raised px-3.5 py-2 text-sm font-medium text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={firm.isPending}
              onClick={() => {
                firm.mutate(
                  { week_start: weekStart },
                  { onSettled: () => setConfirming(false) },
                );
              }}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              {firm.isPending ? "Firming…" : "Confirm firm"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={batchCount === 0}
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            Firm week
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROCURE panel — routes to the existing purchase surfaces (no rebuild here).
// ---------------------------------------------------------------------------
function ProcurePanel() {
  return (
    <SectionCard
      title="Sunday — procurement"
      description="Buy against the week you firmed on Thursday. The purchase session consolidates supplier orders by urgency (urgent / must / recommended)."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/planning/purchase-session"
          className="group flex items-center justify-between rounded-lg border border-accent-border bg-accent-softer p-4 transition-colors hover:bg-accent-soft"
        >
          <span className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-accent" />
            <span>
              <span className="block text-sm font-semibold">Open purchase session</span>
              <span className="block text-xs text-fg-muted">Review &amp; place supplier orders</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/planning/purchase-calendar"
          className="group flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4 shadow-hairline transition-colors hover:bg-bg-muted"
        >
          <span className="flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-fg-subtle" />
            <span>
              <span className="block text-sm font-semibold">Purchase calendar</span>
              <span className="block text-xs text-fg-muted">10-week order-by view</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// EXECUTE panel — the daily glance (no meeting).
// ---------------------------------------------------------------------------
function ExecutePanel() {
  return (
    <SectionCard
      title="Daily — execute"
      description="Make today's batch from the firmed plan and report the actual when it's done. Reporting the actual is what moves stock."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/planning/production-plan"
          className="group flex items-center justify-between rounded-lg border border-accent-border bg-accent-softer p-4 transition-colors hover:bg-accent-soft"
        >
          <span className="flex items-center gap-3">
            <Factory className="h-5 w-5 text-accent" />
            <span>
              <span className="block text-sm font-semibold">Production plan</span>
              <span className="block text-xs text-fg-muted">Today's batches &amp; report actuals</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/planning/inventory-flow"
          className="group flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4 shadow-hairline transition-colors hover:bg-bg-muted"
        >
          <span className="flex items-center gap-3">
            <Boxes className="h-5 w-5 text-fg-subtle" />
            <span>
              <span className="block text-sm font-semibold">Inventory flow</span>
              <span className="block text-xs text-fg-muted">Projected stock &amp; at-risk SKUs</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PlanningMeetingPage() {
  const { session } = useSession();
  const canAct = session.role === "planner" || session.role === "admin";

  const today = stepForToday();
  const [step, setStep] = useState<CadenceStep>(today);

  const todayLabel = useMemo(() => {
    const now = new Date();
    const { dayName, dateLabel } = fmtDayHeader(now);
    return `${dayName} · ${dateLabel}`;
  }, []);

  const stepBadgeTone =
    today === "firm" ? "accent" : today === "procure" ? "success" : "info";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <WorkflowHeader
        eyebrow="Weekly cadence"
        title="Weekly meeting"
        description="The factory rhythm in one place: firm next week's production on Thursday, buy for it on Sunday, build it daily."
        meta={
          <>
            <Badge tone="neutral" variant="outline" size="sm">{todayLabel}</Badge>
            <Badge tone={stepBadgeTone} variant="soft" size="sm">
              Today: {STEPS.find((s) => s.key === today)?.label}
            </Badge>
          </>
        }
      />

      <CadenceRail active={step} today={today} onSelect={setStep} />

      {step === "firm" ? (
        <FirmPanel canAct={canAct} />
      ) : step === "procure" ? (
        <ProcurePanel />
      ) : (
        <ExecutePanel />
      )}
    </div>
  );
}
