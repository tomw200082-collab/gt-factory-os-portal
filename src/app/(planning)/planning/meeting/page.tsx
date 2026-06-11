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
//   • PROCURE (Sunday): buy for the firmed week — handled by the merged
//     Procurement surface (Tranche 045); the cockpit routes you there.
//   • EXECUTE (daily): make today's batch and report the actual.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  ShoppingCart,
  Factory,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Droplet,
  RefreshCw,
  PackageCheck,
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
  useGenerateDrafts,
  useFirmedWeekDemand,
  rollupDraftFgUnits,
  defaultFirmWeekStart,
  weekStartInWeeks,
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

// Single source of truth for the keyboard focus ring. Applied to every
// interactive control on this surface (buttons + nav links) so focus is always
// visible and identical, regardless of element type (tranche 037).
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-raised";

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
    <nav
      aria-label="Weekly cadence steps"
      className="flex w-full items-stretch gap-2 rounded-xl border border-border bg-bg-raised p-1.5 shadow-hairline"
    >
      {STEPS.map((s, i) => {
        const isActive = s.key === active;
        const isToday = s.key === today;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              aria-pressed={isActive}
              aria-current={isToday ? "step" : undefined}
              aria-label={`${s.label} — ${s.sub}${isToday ? " (today)" : ""}`}
              className={cn(
                "group flex flex-1 items-center gap-2 rounded-lg px-2.5 py-3 text-left transition-colors sm:gap-3 sm:px-3.5",
                focusRing,
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
              <ArrowRight className="mx-1 hidden h-4 w-4 shrink-0 text-fg-faint sm:block" aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </nav>
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
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconCls)} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-2xs uppercase tracking-ops text-fg-subtle">{label}</div>
        <div
          className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight"
          aria-label={`${label}: ${value}${meta ? ` (${meta})` : ""}`}
        >
          {value}
        </div>
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
  const packs = isTea ? row.packs : [];
  const packBreakdown = isTea
    ? row.packs.map((p) => `${p.item_name ?? p.item_id}: ${p.qty}`).join("\n")
    : (row.notes ?? undefined);
  const [open, setOpen] = useState(false);
  const ariaLabel = `${title} — ${sub}${packBreakdown ? `. ${packBreakdown.replace(/\n/g, ", ")}` : ""}`;

  // Tea batches carry a pack breakdown that desktop reveals on hover (title) and
  // SR users get via aria-label — but a touch user can see neither. Make those
  // chips a disclosure button that shows the breakdown inline on tap.
  const expandable = packs.length > 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-sm font-medium" dir="auto">{title}</span>
        {expandable ? (
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="mt-0.5 text-2xs uppercase tracking-ops text-fg-subtle">{sub}</div>
      {expandable && open ? (
        <ul className="mt-2 space-y-0.5 border-t border-border-faint pt-2">
          {packs.map((p) => (
            <li key={p.item_id} className="flex items-center justify-between gap-2 text-2xs">
              <span className="truncate text-fg-muted" dir="auto">{p.item_name ?? p.item_id}</span>
              <span className="shrink-0 tabular-nums text-fg">{p.qty}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
  const sharedStyle = { borderLeftWidth: 3, borderLeftColor: `hsl(${tint})` };

  if (!expandable) {
    return (
      <div
        className="rounded-md border border-border bg-bg-raised p-2.5 shadow-hairline"
        style={sharedStyle}
        title={packBreakdown}
        aria-label={ariaLabel}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-label={ariaLabel}
      title={packBreakdown}
      style={sharedStyle}
      className={cn(
        "w-full rounded-md border border-border bg-bg-raised p-2.5 text-left shadow-hairline transition-colors hover:bg-bg-muted",
        focusRing,
      )}
    >
      {body}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Commitment panel — FG-unit rollup that bridges firm → procure.
// ---------------------------------------------------------------------------
interface CommitmentEntry {
  item_id: string;
  item_name: string | null;
  units: number;
  track: "tea_tank" | "matcha_repack";
}

function CommitmentPanel({
  title,
  note,
  totalUnits,
  entries,
  pending,
}: {
  title: string;
  note: string;
  totalUnits: number;
  entries: CommitmentEntry[];
  pending: boolean;
}) {
  const TOP = 8;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? entries : entries.slice(0, TOP);
  const more = entries.length - TOP;
  return (
    <SectionCard title={title} description={note}>
      {pending ? (
        <div className="py-6 text-center text-sm text-fg-muted">Loading commitment…</div>
      ) : entries.length === 0 ? (
        <div className="py-4 text-center text-sm text-fg-muted">No finished goods committed.</div>
      ) : (
        <div>
          <div
            className="mb-3 flex items-baseline gap-2"
            aria-label={`${Math.round(totalUnits).toLocaleString()} units across ${entries.length} product${entries.length === 1 ? "" : "s"}`}
          >
            <span className="text-2xl font-semibold tabular-nums tracking-tight" aria-hidden="true">
              {Math.round(totalUnits).toLocaleString()}
            </span>
            <span className="text-sm text-fg-muted" aria-hidden="true">
              units across {entries.length} product{entries.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {shown.map((e) => (
              <div
                key={e.item_id}
                className="flex items-center justify-between gap-2 rounded-md border border-border-faint bg-bg-subtle/40 px-3 py-1.5"
              >
                <span className="min-w-0 flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        e.track === "tea_tank"
                          ? "hsl(var(--accent))"
                          : "hsl(var(--family-matcha))",
                    }}
                  />
                  <span className="truncate text-sm" dir="auto">
                    {e.item_name ?? e.item_id}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {Math.round(e.units).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {more > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={cn("mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-accent hover:underline", focusRing)}
            >
              {expanded ? "Show fewer" : `+${more} more product${more === 1 ? "" : "s"}`}
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// FIRM panel
// ---------------------------------------------------------------------------
function FirmPanel({ canAct }: { canAct: boolean }) {
  const [weekStart, setWeekStart] = useState<string>(() => defaultFirmWeekStart());
  const [confirming, setConfirming] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  // When the inline confirm appears, move focus to the primary action so
  // keyboard users land on it instead of hunting for the new control.
  useEffect(() => {
    if (confirming) confirmBtnRef.current?.focus();
  }, [confirming]);
  const draft = useDraftWeek(weekStart);
  const firm = useFirmWeek();
  const gen = useGenerateDrafts();

  const rows = draft.data?.rows ?? [];
  const firmedCount = draft.data?.firmed_count ?? 0;
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

  // FG commitment: pre-firm preview from the drafts in hand; once firmed (no
  // drafts left, but locked rows exist) fetch the committed demand the Sunday
  // session buys against.
  const draftRollup = useMemo(() => rollupDraftFgUnits(rows), [rows]);
  const firmedDemand = useFirmedWeekDemand(weekStart, batchCount === 0 && firmedCount > 0);

  // Two-touch Thursday: the firm panel above targets W2 (the new week entering
  // the plan); this is the near week W1 — already firmed last Thursday, here for
  // a final review/tweak before it produces.
  const nearWeek = useMemo(() => weekStartInWeeks(1), []);
  const nearDemand = useFirmedWeekDemand(nearWeek, true);

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
            className={cn(
              "rounded-md border border-border bg-bg-raised p-2 text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted hover:text-fg",
              focusRing,
            )}
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
            className={cn(
              "rounded-md border border-border bg-bg-raised p-2 text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted hover:text-fg",
              focusRing,
            )}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWeekStart(defaultFirmWeekStart())}
            className={cn("rounded text-xs text-accent hover:underline", focusRing)}
          >
            Jump to this week's target
          </button>
          {canAct ? (
            <button
              type="button"
              disabled={gen.isPending}
              aria-busy={gen.isPending}
              onClick={() => gen.mutate()}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border border-border bg-bg-raised px-3 py-2 text-sm font-medium text-fg shadow-hairline transition-colors hover:bg-bg-muted disabled:opacity-60",
                focusRing,
              )}
              title="Run the tea + matcha draft engines to (re)generate the draft horizon"
            >
              <RefreshCw className={cn("h-4 w-4", gen.isPending && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
              {gen.isPending ? "Generating…" : "Generate / refresh drafts"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Generate result / error */}
      {gen.isSuccess ? (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-accent-border bg-accent-softer p-3 text-sm">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="text-fg">
            {gen.data.idempotent_replay
              ? "Drafts already up to date."
              : `Generated drafts — ${gen.data.draft_total_upcoming} draft batch${gen.data.draft_total_upcoming === 1 ? "" : "es"} now waiting across the horizon.`}
          </span>
        </div>
      ) : gen.isError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-softer p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span className="text-danger-fg">{(gen.error as Error).message}</span>
        </div>
      ) : null}

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
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-success-border bg-success-softer p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
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
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-softer p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
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
        ) : batchCount === 0 && firmedCount > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-success-border bg-success-softer p-5">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <div className="text-sm font-semibold text-success-fg">
                This week is firmed — {firmedCount} batch{firmedCount === 1 ? "" : "es"} locked
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                The committed plan now lives in the production plan, where it can be adjusted or
                cancelled if something changes. Re-running Generate will not touch firmed batches.
              </div>
              <Link
                href="/planning/production-plan"
                className={cn("mt-2 inline-flex items-center gap-1.5 rounded text-xs font-medium text-accent hover:underline", focusRing)}
              >
                Open production plan to adjust <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : batchCount === 0 ? (
          <EmptyState
            title="No draft batches for this week"
            description={
              canAct
                ? "The engine hasn't proposed production for this week yet. Click “Generate / refresh drafts” above, or use the week arrows to check adjacent weeks."
                : "The engine hasn't proposed production for this week yet. Use the week arrows to check adjacent weeks."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {days.map((d) => {
              const { dayName, dateLabel } = fmtDayHeader(parseIsoDate(d));
              const dayRows = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  role="group"
                  aria-label={`${dayName} ${dateLabel} — ${dayRows.length === 0 ? "no batches" : `${dayRows.length} batch${dayRows.length === 1 ? "" : "es"}`}`}
                  className="rounded-lg border border-border-faint bg-bg-subtle/40 p-2"
                >
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-ops text-fg-muted">{dayName}</span>
                    <span className="text-2xs text-fg-subtle">{dateLabel}</span>
                  </div>
                  <div className="space-y-2">
                    {dayRows.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border-faint py-4 text-center text-2xs text-fg-faint" aria-hidden="true">
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

      {/* Near week (W1) — final-tune the incoming, already-firmed week */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border-faint bg-bg-subtle/40 px-4 py-3">
        <div className="min-w-0 text-sm">
          <span className="font-medium">Incoming week · {fmtWeekRange(nearWeek)}</span>
          <span className="text-fg-muted">
            {" — "}
            {(nearDemand.data?.total_fg_units ?? 0).toLocaleString()} units committed. Last tweaks
            before it produces.
          </span>
        </div>
        <Link
          href="/planning/production-plan"
          className={cn("shrink-0 rounded text-xs font-medium text-accent hover:underline", focusRing)}
        >
          Fine-tune →
        </Link>
      </div>

      {/* Production commitment — the firm → procure bridge */}
      {batchCount > 0 && draftRollup.length > 0 ? (
        <CommitmentPanel
          title="If you firm this week"
          note="These finished goods get committed to production when you firm — exactly what the Sunday procurement session buys components for."
          totalUnits={draftRollup.reduce((a, r) => a + r.units, 0)}
          entries={draftRollup.map((r) => ({
            item_id: r.item_id,
            item_name: r.item_name,
            units: r.units,
            track: r.track,
          }))}
          pending={false}
        />
      ) : batchCount === 0 && firmedCount > 0 ? (
        <CommitmentPanel
          title="Committed this week"
          note="What this firmed week will produce — the demand Sunday procurement buys components against."
          totalUnits={firmedDemand.data?.total_fg_units ?? 0}
          entries={(firmedDemand.data?.rows ?? []).map((r) => ({
            item_id: r.item_id,
            item_name: r.item_name,
            units: r.fg_units,
            track: r.track,
          }))}
          pending={firmedDemand.isLoading}
        />
      ) : null}

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
              ref={confirmBtnRef}
              type="button"
              disabled={firm.isPending}
              aria-busy={firm.isPending}
              onClick={() => {
                firm.mutate(
                  { week_start: weekStart },
                  { onSettled: () => setConfirming(false) },
                );
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent-hover disabled:opacity-60",
                focusRing,
              )}
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              {firm.isPending ? "Firming…" : "Confirm firm"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={batchCount === 0}
            onClick={() => setConfirming(true)}
            title={batchCount === 0 ? "Nothing to firm — generate drafts or pick a week with batches" : `Lock ${batchCount} batch${batchCount === 1 ? "" : "es"} for ${fmtWeekRange(weekStart)}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
              focusRing,
            )}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
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
  // Two-touch Sunday: ORDER for next week (the week starting next Sunday, which
  // was firmed last Thursday) and VERIFY arrivals for the week now producing.
  const nextWeek = useMemo(() => weekStartInWeeks(1), []);
  const demand = useFirmedWeekDemand(nextWeek, true);
  const entries = (demand.data?.rows ?? []).map((r) => ({
    item_id: r.item_id,
    item_name: r.item_name,
    units: r.fg_units,
    track: r.track,
  }));

  return (
    <div className="space-y-6">
      {/* Order for next week (W+1) — driven by what that week firmed */}
      <CommitmentPanel
        title={`Order for next week · ${fmtWeekRange(nextWeek)}`}
        note="What next week's firmed production needs. Place these supplier orders now so materials land before that week starts — long-lead items are ordered earlier by the engine."
        totalUnits={demand.data?.total_fg_units ?? 0}
        entries={entries}
        pending={demand.isLoading}
      />

      {/* Tranche 045 — purchase-session + purchase-calendar are superseded by
          the merged Procurement page (which carries its own calendar view). */}
      <SectionCard
        title="Place the orders"
        description="Procurement consolidates supplier orders by decision: what must go out today, what can wait, and what's handled."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/planning/procurement"
            className={cn("group flex items-center justify-between rounded-lg border border-accent-border bg-accent-softer p-4 transition-colors hover:bg-accent-soft", focusRing)}
          >
            <span className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-accent" />
              <span>
                <span className="block text-sm font-semibold">Open Procurement</span>
                <span className="block text-xs text-fg-muted">Review &amp; place supplier orders</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/planning/procurement"
            className={cn("group flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4 shadow-hairline transition-colors hover:bg-bg-muted", focusRing)}
          >
            <span className="flex items-center gap-3">
              <CalendarCheck className="h-5 w-5 text-fg-subtle" />
              <span>
                <span className="block text-sm font-semibold">Order calendar</span>
                <span className="block text-xs text-fg-muted">Calendar view inside Procurement</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </SectionCard>

      {/* Second touch: verify arrivals for the week now in production */}
      <SectionCard
        title="Verify this week's arrivals"
        description="For the week now in production, confirm what you ordered has landed — receive goods as they arrive so stock and the plan stay in sync."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/stock/receipts"
            className={cn("group flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4 shadow-hairline transition-colors hover:bg-bg-muted", focusRing)}
          >
            <span className="flex items-center gap-3">
              <PackageCheck className="h-5 w-5 text-success" />
              <span>
                <span className="block text-sm font-semibold">Receive goods</span>
                <span className="block text-xs text-fg-muted">Log arrivals against open orders</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/planning/inventory-flow"
            className={cn("group flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4 shadow-hairline transition-colors hover:bg-bg-muted", focusRing)}
          >
            <span className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-fg-subtle" />
              <span>
                <span className="block text-sm font-semibold">Inventory flow</span>
                <span className="block text-xs text-fg-muted">Confirm stock is covered for this week</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </SectionCard>
    </div>
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
          className={cn("group flex items-center justify-between rounded-lg border border-accent-border bg-accent-softer p-4 transition-colors hover:bg-accent-soft", focusRing)}
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
          className={cn("group flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4 shadow-hairline transition-colors hover:bg-bg-muted", focusRing)}
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
