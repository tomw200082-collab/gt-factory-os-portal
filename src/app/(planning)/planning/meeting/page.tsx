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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Pencil,
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
  useCancelFirmedWeek,
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
// FLOW-G01 (DR-019) — the horizon-wide "are there drafts waiting anywhere"
// count reuses the production-plan list read (already date-range-filtered
// server-side) instead of adding a new backend contract.
import { usePlans } from "@/app/(planning)/planning/production-plan/_lib/usePlans";
// 2026-07-23 gate (Tom): "make it so I can tune EVERYTHING directly from the
// weekly meeting page." The meeting is now a tuning cockpit — every batch chip
// (draft W2) and every incoming-week (W1) batch opens the shared tune dialog:
// day, pack split with live liters meter, quantity, notes, cancel.
import {
  BatchTuneDialog,
  tunableFromPlanRow,
  type TunableBatch,
} from "@/app/(planning)/planning/production-plan/_components/BatchTuneDialog";
import type { ProductionPlanRow } from "@/app/(planning)/planning/production-plan/_lib/types";

function tunableFromDraftWeekRow(r: DraftWeekRow): TunableBatch {
  const isTea = r.track === "tea_tank";
  return {
    plan_id: r.plan_id,
    plan_date: r.plan_date,
    is_base_batch: isTea,
    title: isTea ? (r.base_name ?? "Tea base") : (r.item_name ?? "Matcha repack"),
    batch_size_l: r.batch_size_l ?? null,
    status: "draft",
    planned_qty: isTea ? null : r.planned_qty,
    uom: r.uom ?? null,
    notes: r.notes ?? null,
    packs: r.packs.map((p) => ({
      item_id: p.item_id,
      item_name: p.item_name ?? null,
      qty: p.qty,
      fill_l_per_unit:
        p.fill_l_per_unit != null && Number.isFinite(parseFloat(p.fill_l_per_unit))
          ? parseFloat(p.fill_l_per_unit)
          : null,
    })),
  };
}

// Single source of truth for the keyboard focus ring. Applied to every
// interactive control on this surface (buttons + nav links) so focus is always
// visible and identical, regardless of element type (tranche 037).
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-raised";

// ---------------------------------------------------------------------------
// Cadence rail — the three-step rhythm, with today highlighted.
// ---------------------------------------------------------------------------
const STEPS: { key: CadenceStep; label: string; sub: string; icon: typeof Lock }[] = [
  { key: "firm", label: "Lock", sub: "Thursday", icon: CalendarCheck },
  { key: "procure", label: "Procure", sub: "Sunday", icon: ShoppingCart },
  { key: "execute", label: "Execute", sub: "Daily", icon: Factory },
];

function CadenceRail({
  active,
  today,
  onSelect,
  pendingCount,
}: {
  active: CadenceStep;
  today: CadenceStep;
  onSelect: (s: CadenceStep) => void;
  // INT-04 (DR-019) — unfirmed drafts were invisible on the Lock step for
  // days at a stretch outside Thursday; a count on the step itself closes
  // that gap without requiring a visit to Execute's banner first.
  pendingCount?: number;
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
        const showPending = s.key === "firm" && (pendingCount ?? 0) > 0;
        return (
          <div key={s.key} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              aria-pressed={isActive}
              aria-current={isToday ? "step" : undefined}
              aria-label={`${s.label} — ${s.sub}${isToday ? " (today)" : ""}${showPending ? ` — ${pendingCount} draft batch${pendingCount === 1 ? "" : "es"} waiting to be locked` : ""}`}
              className={cn(
                // FLOW-008 (Tranche 053): <sm stacks icon above label so all
                // three steps fit one row at 390px; sm+ is the original row.
                "group relative flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition-colors",
                "sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3 sm:text-left",
                focusRing,
                isActive
                  ? "bg-accent text-accent-fg shadow-raised"
                  : "text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              {/* FLOW-008: on <sm the Today badge collapses to a corner dot
                  (the aria-label already announces "(today)"). */}
              {isToday ? (
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full sm:hidden",
                    isActive ? "bg-accent-fg" : "bg-accent",
                  )}
                  data-testid="cadence-today-dot"
                  aria-hidden="true"
                />
              ) : null}
              {/* VIS-04 (DR-019) — the rail read as three unordered tiles
                  with no sense of sequence; a numbered badge makes the
                  Thursday-Sunday-daily order legible at a glance. */}
              <span className="relative shrink-0">
                <Icon className={cn("h-5 w-5", isActive ? "opacity-100" : "opacity-70")} />
                <span
                  className={cn(
                    "absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold leading-none",
                    isActive ? "bg-accent-fg text-accent" : "bg-bg-raised text-fg-subtle shadow-hairline",
                  )}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
              </span>
              <span className="min-w-0">
                <span className="flex items-center justify-center gap-2 sm:justify-start">
                  <span className="text-xs font-semibold tracking-tightish sm:text-sm">{s.label}</span>
                  {isToday ? (
                    <span className="hidden sm:inline-flex">
                      <Badge tone={isActive ? "neutral" : "accent"} variant="soft" size="xs">
                        Today
                      </Badge>
                    </span>
                  ) : null}
                  {showPending ? (
                    <span data-testid="cadence-firm-pending-badge">
                      <Badge tone={isActive ? "neutral" : "warning"} variant="soft" size="xs">
                        {pendingCount}
                      </Badge>
                    </span>
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
function BatchChip({ row, onTune }: { row: DraftWeekRow; onTune?: (r: DraftWeekRow) => void }) {
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
    ? row.packs.map((p) => `${p.item_name ?? "Unknown product"}: ${p.qty}`).join("\n")
    : (row.notes ?? undefined);
  const [open, setOpen] = useState(false);
  // FLOW-G04 (DR-019): badge a hand-edited draft so a regenerate's "wipes
  // hand edits" warning has a concrete target on the board, not just a
  // generic confirm sentence.
  const editedLabel = row.is_user_modified ? "Edited" : null;
  const ariaLabel = `${title}${editedLabel ? ` (${editedLabel})` : ""} — ${sub}${packBreakdown ? `. ${packBreakdown.replace(/\n/g, ", ")}` : ""}`;

  // Tea batches carry a pack breakdown that desktop reveals on hover (title) and
  // SR users get via aria-label — but a touch user can see neither. Make those
  // chips a disclosure button that shows the breakdown inline on tap.
  const expandable = packs.length > 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium" dir="auto">{title}</span>
          {editedLabel ? (
            <Badge tone="accent" variant="soft" size="xs">
              {editedLabel}
            </Badge>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {/* 2026-07-23 cockpit — tune this batch without leaving the meeting. */}
          {onTune ? (
            <span
              role="button"
              tabIndex={0}
              className={cn(
                "inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded text-fg-muted transition-colors hover:bg-bg-muted hover:text-accent",
                focusRing,
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTune(row);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onTune(row);
                }
              }}
              aria-label={`Tune ${title} — quantities, day, or cancel`}
              title="Tune this batch"
              data-testid="batch-chip-tune"
            >
              <Pencil className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            </span>
          ) : null}
          {expandable ? (
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          ) : null}
        </span>
      </div>
      <div className="mt-0.5 text-2xs uppercase tracking-ops text-fg-subtle">{sub}</div>
      {expandable && open ? (
        <ul className="mt-2 space-y-0.5 border-t border-border-faint pt-2">
          {packs.map((p) => (
            <li key={p.item_id} className="flex items-center justify-between gap-2 text-2xs">
              <span className="truncate text-fg-muted" dir="auto">{p.item_name ?? "Unknown product"}</span>
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
  isError,
  onRetry,
  footer,
}: {
  title: string;
  note: string;
  totalUnits: number;
  entries: CommitmentEntry[];
  pending: boolean;
  /** FLOW-NEW-04 (ux-flow-architect re-audit) — a failed commitment fetch
   *  previously fell through to "No finished goods committed", which reads
   *  as a real zero-commitment week instead of an unknown one. */
  isError?: boolean;
  onRetry?: () => void;
  /** DR-018 VISUAL-002 (Tranche 122) — optional action strip rendered as
   *  part of the same card, so the "what gets committed" facts and the CTA
   *  that acts on them read as one unit instead of two visually detached
   *  sections. */
  footer?: ReactNode;
}) {
  const TOP = 8;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? entries : entries.slice(0, TOP);
  const more = entries.length - TOP;
  return (
    <SectionCard title={title} description={note} footer={footer}>
      {pending ? (
        <div className="py-6 text-center text-sm text-fg-muted">Loading commitment…</div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center text-sm">
          <span className="text-danger-fg">We couldn&apos;t load the commitment for this week.</span>
          <span className="text-fg-muted">Try refreshing. If the problem continues, contact the system administrator.</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn("mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-accent hover:underline", focusRing)}
            >
              Try again
            </button>
          ) : null}
        </div>
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
                  {/* DR-018 A11Y-009 (Tranche 122) — the track dot is a
                      color-only signal; a screen reader announced nothing
                      distinguishing a tea batch from a matcha one. */}
                  <span className="sr-only">
                    {e.track === "tea_tank" ? "Tea" : "Matcha"}
                  </span>
                  <span className="truncate text-sm" dir="auto">
                    {e.item_name ?? "Unknown product"}
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
function FirmPanel({ canAct, initialWeekStart }: { canAct: boolean; initialWeekStart?: string }) {
  const [weekStart, setWeekStart] = useState<string>(() => initialWeekStart ?? defaultFirmWeekStart());
  // 2026-07-23 cockpit — the one tune dialog for both weeks' batches. Cache
  // refresh after save/cancel is handled inside usePatchPlan (which now
  // invalidates ["cadence"] too), keeping this page QueryClient-free for the
  // existing mock-based test suites.
  const [tuning, setTuning] = useState<TunableBatch | null>(null);
  // FLOW-NEW-01 (ux-flow-architect re-audit) — initialWeekStart arrives one
  // tick after mount (the parent page reads ?week= from window.location.search
  // inside its own useEffect), so the useState initializer above always saw
  // undefined and a cross-page ?week= deep-link was silently dropped. Apply it
  // once, the first time it's defined.
  const appliedInitialWeekRef = useRef(false);
  useEffect(() => {
    if (!appliedInitialWeekRef.current && initialWeekStart) {
      appliedInitialWeekRef.current = true;
      setWeekStart(initialWeekStart);
    }
  }, [initialWeekStart]);
  const [confirming, setConfirming] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  // A11Y-01 (DR-019) — the trigger button that opened the inline confirm,
  // so focus can return to it when the confirm collapses (Cancel or the
  // mutation settling) instead of dropping to document.body. wasOpenRef
  // guards against stealing focus on first mount, when confirming starts
  // (and stays) false.
  const lockTriggerRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(false);
  useEffect(() => {
    if (confirming) {
      confirmBtnRef.current?.focus();
      wasConfirmingRef.current = true;
    } else if (wasConfirmingRef.current) {
      lockTriggerRef.current?.focus();
      wasConfirmingRef.current = false;
    }
  }, [confirming]);
  // DR-018 INTER-001 (Tranche 121) — Generate/refresh drafts wipes every
  // TEAEDD:%-generated draft, including hand-edits, with zero warning.
  // Same two-step inline confirm pattern as Firm week above.
  const [confirmingGen, setConfirmingGen] = useState(false);
  const confirmGenBtnRef = useRef<HTMLButtonElement>(null);
  const genTriggerRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingGenRef = useRef(false);
  useEffect(() => {
    if (confirmingGen) {
      confirmGenBtnRef.current?.focus();
      wasConfirmingGenRef.current = true;
    } else if (wasConfirmingGenRef.current) {
      genTriggerRef.current?.focus();
      wasConfirmingGenRef.current = false;
    }
  }, [confirmingGen]);
  const draft = useDraftWeek(weekStart);
  const firm = useFirmWeek();
  const gen = useGenerateDrafts();
  // INT-06 (DR-019) — the bulk "undo Lock" the success banner claimed
  // existed without any actual affordance behind it.
  const cancelWeek = useCancelFirmedWeek();
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const unlockTriggerRef = useRef<HTMLButtonElement>(null);
  const unlockReasonRef = useRef<HTMLInputElement>(null);
  const wasConfirmingUnlockRef = useRef(false);
  useEffect(() => {
    if (confirmingUnlock) {
      unlockReasonRef.current?.focus();
      wasConfirmingUnlockRef.current = true;
    } else if (wasConfirmingUnlockRef.current) {
      unlockTriggerRef.current?.focus();
      wasConfirmingUnlockRef.current = false;
    }
  }, [confirmingUnlock]);
  // FLOW-NEW-05 (ux-flow-architect re-audit) — the unlock success message
  // used to live only inside the "week is locked" block, gated on
  // firmedCount > 0. The same onSuccess that shows it also invalidates the
  // draft-week query, and once that refetch resolves firmedCount drops to 0
  // and the whole block (message included) stops rendering — the operator
  // saw it for a few hundred ms, then landed on a bare empty-week state.
  // Collapse the confirm form on success so it doesn't linger stale during
  // that window; the persisted result banner below (driven directly off
  // cancelWeek.isSuccess/data, same pattern as the firm result banner) is
  // what actually survives the refetch.
  useEffect(() => {
    if (cancelWeek.isSuccess) setConfirmingUnlock(false);
  }, [cancelWeek.isSuccess]);

  const rows = draft.data?.rows ?? [];
  const firmedCount = draft.data?.firmed_count ?? 0;
  // FLOW-007 — how many of this week's drafts carry hand edits (regeneration
  // wipes them; the confirm copy names the count).
  const editedDraftCount = useMemo(
    () => rows.filter((r) => r.is_user_modified).length,
    [rows],
  );
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

  // FLOW-G02 (DR-019, portal half) — the engine that proposes these drafts is
  // blind to manually-added item-level plans when it computes tank capacity,
  // so a fresh base-batch draft can land on a day that already carries a
  // manual plan the engine never saw (confirmed live, 2026-07-04). The
  // backend capacity fix is a separate, Tom-approved change to
  // fn_plan_tea_production; this is the portal-visible guard until then —
  // cross-check this week's full plan list (drafts + manual + firmed)
  // against the draft rows, and flag any day where they collide.
  const weekPlans = usePlans(weekStart, toIsoDate(addDays(parseIsoDate(weekStart), 6)));
  const engineOverlapDays = useMemo(() => {
    const draftPlanIds = new Set(rows.map((r) => r.plan_id));
    const baseBatchDays = new Set(rows.filter((r) => r.track === "tea_tank").map((r) => r.plan_date));
    const days = new Set<string>();
    for (const p of weekPlans.data?.rows ?? []) {
      if (!p.is_base_batch && !draftPlanIds.has(p.plan_id) && baseBatchDays.has(p.plan_date)) {
        days.add(p.plan_date);
      }
    }
    return days;
  }, [rows, weekPlans.data]);

  // Two-touch Thursday: the firm panel above targets W2 (the new week entering
  // the plan); this is the near week W1 — already firmed last Thursday, here for
  // a final review/tweak before it produces.
  const nearWeek = useMemo(() => weekStartInWeeks(1), []);
  const nearDemand = useFirmedWeekDemand(nearWeek, true);
  // FLOW-G01 (DR-019) — this week is supposed to already be fully locked;
  // any batch still sitting in draft here is an orphan (e.g. a stray
  // engine regenerate) that will silently miss production unless caught.
  const nearDraft = useDraftWeek(nearWeek);
  // 2026-07-23 cockpit — the incoming week's actual plan rows, tunable
  // in place (same list read the production-plan board uses).
  const nearPlans = usePlans(nearWeek, toIsoDate(addDays(parseIsoDate(nearWeek), 6)));
  const nearWeekTunables = useMemo(() => {
    const m = new Map<string, ProductionPlanRow[]>();
    for (const p of nearPlans.data?.rows ?? []) {
      if (p.plan_type !== "production" || p.rendered_state === "cancelled") continue;
      if (!m.has(p.plan_date)) m.set(p.plan_date, []);
      m.get(p.plan_date)!.push(p);
    }
    return m;
  }, [nearPlans.data]);

  const shiftWeek = (deltaWeeks: number) =>
    setWeekStart((w) => toIsoDate(addDays(parseIsoDate(w), deltaWeeks * 7)));

  const result = firm.data;

  return (
    <div className="space-y-5">
      {/* Week selector — FLOW-007 (Tranche 053): the label no longer forces a
          14rem minimum (min-w-0 + truncate so it fits 390px), and the
          Generate/refresh action lives on its own row below the week nav. */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
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
            <div className="min-w-0 text-center">
              <div className="truncate text-lg font-semibold tracking-tight">{fmtWeekRange(weekStart)}</div>
              <div className="text-2xs uppercase tracking-ops text-fg-subtle">Target week to lock</div>
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
          <button
            type="button"
            onClick={() => setWeekStart(defaultFirmWeekStart())}
            className={cn("shrink-0 rounded text-xs text-accent hover:underline", focusRing)}
          >
            Jump to this week&apos;s target
          </button>
        </div>
        {canAct ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            {confirmingGen ? (
              <>
                <span className="max-w-[46ch] text-xs text-fg-muted" data-testid="meeting-gen-confirm-copy">
                  Re-generating replaces the engine&apos;s drafts across the whole horizon — including the {batchCount} batch{batchCount === 1 ? "" : "es"} shown here for {fmtWeekRange(weekStart)}
                  {/* FLOW-007 — quantify the hand-edit blast radius. */}
                  {editedDraftCount > 0
                    ? `, ${editedDraftCount} of which ${editedDraftCount === 1 ? "carries" : "carry"} your hand edits`
                    : ""}
                  . Manually added plans are not affected.
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingGen(false)}
                  className={cn(
                    "rounded-md border border-border bg-bg-raised px-3.5 py-2 text-sm font-medium text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted",
                    focusRing,
                  )}
                  data-testid="meeting-gen-keep"
                >
                  Keep current drafts
                </button>
                <button
                  ref={confirmGenBtnRef}
                  type="button"
                  disabled={gen.isPending}
                  aria-busy={gen.isPending}
                  onClick={() => {
                    gen.mutate(undefined, { onSettled: () => setConfirmingGen(false) });
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border border-border bg-bg-raised px-3 py-2 text-sm font-medium text-fg shadow-hairline transition-colors hover:bg-bg-muted disabled:opacity-60",
                    focusRing,
                  )}
                  data-testid="meeting-gen-confirm"
                >
                  <RefreshCw className={cn("h-4 w-4", gen.isPending && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                  {gen.isPending ? "Generating…" : "Regenerate drafts"}
                </button>
              </>
            ) : (
              <button
                ref={genTriggerRef}
                type="button"
                onClick={() => setConfirmingGen(true)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border border-border bg-bg-raised px-3 py-2 text-sm font-medium text-fg shadow-hairline transition-colors hover:bg-bg-muted disabled:opacity-60",
                  focusRing,
                )}
                title="Runs the tea + matcha draft engines. If drafts already exist, this replaces them — hand edits included."
                data-testid="meeting-gen-trigger"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {/* COPY-012 — one unambiguous verb per state. */}
                {batchCount > 0 ? "Regenerate drafts" : "Generate drafts"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Generate result / error */}
      {gen.isSuccess ? (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-accent-border bg-accent-softer p-3 text-sm">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1 text-fg">
            <div>
              {gen.data.idempotent_replay
                ? "Drafts already up to date."
                : `Generated drafts — ${gen.data.draft_total_upcoming} draft batch${gen.data.draft_total_upcoming === 1 ? "" : "es"} now waiting across the horizon.`}
            </div>
            {/* FLOW-G05 (DR-019) — a count with no destination left the
                operator to hunt for which week the new drafts actually
                landed in; bridge straight there when it's not this one. */}
            {gen.data.earliest_draft_week_start && gen.data.earliest_draft_week_start !== weekStart ? (
              <button
                type="button"
                onClick={() => setWeekStart(gen.data!.earliest_draft_week_start!)}
                className={cn("mt-1 inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline", focusRing)}
              >
                Jump to {fmtWeekRange(gen.data.earliest_draft_week_start)} <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      ) : gen.isError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-softer p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span className="flex-1 text-danger-fg">{(gen.error as Error).message}</span>
          {/* DR-018 INTER-004 (Tranche 122) — a transient 503 previously had
              no recovery path short of the next manual click on the (now
              two-step) trigger above. */}
          <button
            type="button"
            onClick={() => {
              gen.reset();
              setConfirmingGen(true);
            }}
            className={cn(
              "shrink-0 rounded-md border border-danger-border bg-bg-raised px-2.5 py-1 text-xs font-medium text-danger-fg shadow-hairline transition-colors hover:bg-danger-softer",
              focusRing,
            )}
            data-testid="meeting-gen-error-retry"
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Boxes}
          label="Draft batches"
          value={String(batchCount)}
          meta={
            // FLOW-G07 (DR-019): orphaned past-dated drafts never got
            // reviewed in their own window and the next regenerate silently
            // drops them — surface them here instead of letting that happen
            // unseen. Only known right after a Generate call (the field
            // isn't in a standing query).
            gen.data && gen.data.orphaned_past_dated_draft_count > 0
              ? `${gen.data.orphaned_past_dated_draft_count} from past dates — will be dropped`
              : batchCount === 0
                ? "Nothing to lock"
                : "Will be locked"
          }
          tone={gen.data && gen.data.orphaned_past_dated_draft_count > 0 ? "warning" : batchCount > 0 ? "accent" : "neutral"}
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

      {/* VIS-01 (DR-019, 2026-07-04) — the lock CTA used to render after the
          full day-by-day board, off-screen on a normal viewport. It now
          leads the panel, right after the KPIs, since committing the week
          is the one decision this panel exists for. Footer-vs-standalone
          rendering choice is unchanged from DR-018 VISUAL-002. */}
      {(() => {
        const lockActionRow = (
          <div className="flex items-center justify-end gap-3">
            {!canAct ? (
              <span className="text-xs text-fg-muted">Locking is restricted to planner / admin roles.</span>
            ) : confirming ? (
              <>
                <span className="text-sm text-fg-muted">
                  Lock {batchCount} batch{batchCount === 1 ? "" : "es"} for {fmtWeekRange(weekStart)}?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className={cn(
                    "rounded-md border border-border bg-bg-raised px-3.5 py-2 text-sm font-medium text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted",
                    focusRing,
                  )}
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
                  {firm.isPending ? "Locking…" : "Confirm lock"}
                </button>
              </>
            ) : (
              <>
                <button
                  ref={lockTriggerRef}
                  type="button"
                  disabled={batchCount === 0}
                  onClick={() => setConfirming(true)}
                  title={batchCount === 0 ? "Nothing to lock — generate drafts or pick a week with batches" : `Lock ${batchCount} batch${batchCount === 1 ? "" : "es"} for ${fmtWeekRange(weekStart)}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
                    focusRing,
                  )}
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Lock week
                </button>
                {/* UX-flow audit (FLOW-D05): the disabled reason was only in a
                    title tooltip — invisible on touch. Surface it inline. */}
                {batchCount === 0 && (
                  <span className="text-2xs text-fg-muted max-w-[28ch]">
                    Nothing to lock — generate drafts above, or pick a week with batches.
                  </span>
                )}
              </>
            )}
          </div>
        );

        if (batchCount > 0 && draftRollup.length > 0) {
          return (
            <CommitmentPanel
              title="If you lock this week"
              note="These finished goods get committed to production when you lock — exactly what the Sunday procurement session buys components for."
              totalUnits={draftRollup.reduce((a, r) => a + r.units, 0)}
              entries={draftRollup.map((r) => ({
                item_id: r.item_id,
                item_name: r.item_name,
                units: r.units,
                track: r.track,
              }))}
              pending={false}
              footer={lockActionRow}
            />
          );
        }
        if (batchCount === 0 && firmedCount > 0) {
          return (
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
              isError={firmedDemand.isError}
              onRetry={() => firmedDemand.refetch()}
              footer={lockActionRow}
            />
          );
        }
        // No commitment card to attach to (nothing drafted, nothing firmed
        // yet) — render the CTA standalone.
        return (
          <div className="rounded-lg border border-border-faint bg-bg-subtle/40 px-4 py-3">
            {lockActionRow}
          </div>
        );
      })()}

      {/* Firm result banner */}
      {result ? (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-success-border bg-success-softer p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <div className="text-sm font-semibold text-success-fg">
              {result.idempotent_replay || result.newly_firmed_count === 0
                ? "Week already locked"
                : `${result.newly_firmed_count} batch${result.newly_firmed_count === 1 ? "" : "es"} locked`}
            </div>
            <div className="mt-0.5 text-xs text-fg-muted">
              {result.week_firmed_total} batch{result.week_firmed_total === 1 ? "" : "es"} now committed for {fmtWeekRange(result.week_start)}. The Sunday session will buy against this week. To undo, cancel batches one at a time from the production plan, or unlock the whole week below.
            </div>
            {/* FLOW-009 (2026-07-23 gate) — Thursday's real next step is
                verifying the locked week on the board; procurement is Sunday's.
                Both links stay, correctly ranked and labeled. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href={`/planning/production-plan?week=${result.week_start}`}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-semibold text-success-fg underline underline-offset-2 hover:no-underline",
                  focusRing,
                )}
                data-testid="meeting-firm-success-view-week"
              >
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                View the locked week on the board →
              </Link>
              <Link
                href="/planning/procurement"
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium text-success-fg/80 underline underline-offset-2 hover:no-underline",
                  focusRing,
                )}
                data-testid="meeting-firm-success-go-procurement"
              >
                <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                For Sunday: open Procurement
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {firm.isError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-softer p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="flex-1 text-sm text-danger-fg">{(firm.error as Error).message}</div>
          {/* COPY-06 (DR-019) — the gen-error banner already had a retry;
              this one had none, leaving the operator to re-click the
              (now two-step) trigger above on their own. Same INT-01
              pattern: re-enter the confirm, never re-fire directly. */}
          <button
            type="button"
            onClick={() => {
              firm.reset();
              setConfirming(true);
            }}
            className={cn(
              "shrink-0 rounded-md border border-danger-border bg-bg-raised px-2.5 py-1 text-xs font-medium text-danger-fg shadow-hairline transition-colors hover:bg-danger-softer",
              focusRing,
            )}
            data-testid="meeting-firm-error-retry"
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* Unlock result — FLOW-NEW-05 (ux-flow-architect re-audit): driven
          directly off cancelWeek.isSuccess/data (same pattern as the firm
          result banner above), so it survives the draft-week refetch that
          the mutation's own onSuccess triggers, instead of disappearing the
          moment firmedCount drops to 0. */}
      {cancelWeek.isSuccess ? (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-accent-border bg-accent-softer p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1 text-fg">
            <div>
              {cancelWeek.data.cancelled_count} batch{cancelWeek.data.cancelled_count === 1 ? "" : "es"} unlocked (cancelled) for {fmtWeekRange(cancelWeek.data.week_start)}.
              {cancelWeek.data.skipped_already_done_or_cancelled > 0
                ? ` ${cancelWeek.data.skipped_already_done_or_cancelled} left alone — already reported or cancelled.`
                : ""}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => {
                  cancelWeek.reset();
                  setConfirmingGen(true);
                }}
                className={cn("inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline", focusRing)}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Generate new drafts
              </button>
              <Link
                href="/planning/production-plan"
                onClick={() => cancelWeek.reset()}
                className={cn("inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg hover:underline", focusRing)}
              >
                View production plan <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Week board */}
      <SectionCard
        title="Production week"
        description="The draft batches the engine proposes for each working day. Review, then lock the week."
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
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-success-fg">
                This week is locked — {firmedCount} batch{firmedCount === 1 ? "" : "es"} committed
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                The committed plan now lives in the production plan, where it can be adjusted or
                cancelled one at a time if something changes. Re-running Generate will not touch
                locked batches.
              </div>
              {/* FLOW-003 — carry the week; landing on today's board and
                  arrowing twice was silent context loss. */}
              <Link
                href={`/planning/production-plan?week=${weekStart}`}
                className={cn("mt-2 inline-flex items-center gap-1.5 rounded text-xs font-medium text-accent hover:underline", focusRing)}
              >
                Open production plan to adjust <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {/* INT-06 (DR-019) — the bulk "undo Lock" the success banner
                  used to claim existed with no affordance behind it. */}
              {canAct ? (
                <div className="mt-3 border-t border-success-border/50 pt-3">
                  {confirmingUnlock ? (
                    <div className="space-y-2">
                      {/* COPY-002 (2026-07-23 gate) — a bulk-destructive action
                          must state its procurement consequence, not just its
                          mechanics. */}
                      <div
                        role="status"
                        className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-softer px-3 py-2 text-xs text-danger-fg"
                        data-testid="unlock-consequence-banner"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          Unlocking cancels all {firmedCount} locked batch{firmedCount === 1 ? "" : "es"}.
                          The Sunday procurement session will no longer buy materials for this week —
                          regenerate and re-lock a week to resume production.
                        </span>
                      </div>
                      <label className="block text-xs text-fg-muted" htmlFor="unlock-week-reason">
                        Reason for unlocking (required — kept with the cancelled batches)
                      </label>
                      <input
                        ref={unlockReasonRef}
                        id="unlock-week-reason"
                        type="text"
                        value={unlockReason}
                        onChange={(e) => setUnlockReason(e.target.value)}
                        placeholder="e.g. demand dropped, wrong week firmed"
                        className={cn(
                          "w-full rounded-md border border-border bg-bg-raised px-2.5 py-1.5 text-xs shadow-hairline",
                          focusRing,
                        )}
                      />
                      {cancelWeek.isError ? (
                        <div role="alert" className="text-xs text-danger-fg">{(cancelWeek.error as Error).message}</div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingUnlock(false)}
                          className={cn(
                            "rounded-md border border-border bg-bg-raised px-2.5 py-1.5 text-xs font-medium text-fg-muted shadow-hairline transition-colors hover:bg-bg-muted",
                            focusRing,
                          )}
                        >
                          Keep it locked
                        </button>
                        <button
                          type="button"
                          disabled={unlockReason.trim().length === 0 || cancelWeek.isPending}
                          aria-busy={cancelWeek.isPending}
                          onClick={() => {
                            cancelWeek.mutate({ week_start: weekStart, reason: unlockReason.trim() });
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border border-danger-border bg-bg-raised px-2.5 py-1.5 text-xs font-semibold text-danger-fg shadow-hairline transition-colors hover:bg-danger-softer disabled:cursor-not-allowed disabled:opacity-50",
                            focusRing,
                          )}
                        >
                          {cancelWeek.isPending
                            ? "Unlocking…"
                            : `Cancel ${firmedCount} batch${firmedCount === 1 ? "" : "es"} and stop procurement`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      ref={unlockTriggerRef}
                      type="button"
                      onClick={() => {
                        cancelWeek.reset();
                        setUnlockReason("");
                        setConfirmingUnlock(true);
                      }}
                      className={cn("text-xs font-medium text-fg-muted hover:text-danger-fg hover:underline", focusRing)}
                    >
                      Unlock this week (cancels every batch it locked)
                    </button>
                  )}
                </div>
              ) : null}
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
          <>
            {engineOverlapDays.size > 0 && (
              <div
                className="mb-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-softer px-3 py-2 text-xs text-warning-fg"
                role="alert"
                data-testid="meeting-engine-overlap-warning"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  The engine can&apos;t see manually-added plans when it proposes batches.{" "}
                  {engineOverlapDays.size} day{engineOverlapDays.size === 1 ? "" : "s"} below (marked)
                  already {engineOverlapDays.size === 1 ? "has" : "have"} a manual plan alongside the
                  new draft — check for double-booked capacity before locking.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {days.map((d) => {
                const { dayName, dateLabel } = fmtDayHeader(parseIsoDate(d));
                const dayRows = byDay.get(d) ?? [];
                const hasOverlap = engineOverlapDays.has(d);
                return (
                  <div
                    key={d}
                    role="group"
                    aria-label={`${dayName} ${dateLabel} — ${dayRows.length === 0 ? "no batches" : `${dayRows.length} batch${dayRows.length === 1 ? "" : "es"}`}${hasOverlap ? " — also has a manual plan the engine didn't account for" : ""}`}
                    className={cn(
                      "rounded-lg border p-2",
                      hasOverlap
                        ? "border-warning-border bg-warning-softer/40"
                        : "border-border-faint bg-bg-subtle/40",
                    )}
                  >
                    <div className="mb-2 flex items-baseline justify-between px-1">
                      <span className="text-xs font-semibold uppercase tracking-ops text-fg-muted">{dayName}</span>
                      <span className="text-2xs text-fg-subtle">{dateLabel}</span>
                    </div>
                    {hasOverlap && (
                      <div className="mb-2 flex items-center gap-1 px-1 text-2xs font-medium text-warning-fg">
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Also has a manual plan
                      </div>
                    )}
                    <div className="space-y-2">
                      {dayRows.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border-faint py-4 text-center text-2xs text-fg-faint" aria-hidden="true">
                          —
                        </div>
                      ) : (
                        dayRows.map((r) => (
                          <BatchChip
                            key={r.plan_id}
                            row={r}
                            onTune={canAct ? (row) => setTuning(tunableFromDraftWeekRow(row)) : undefined}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>

      {/* Near week (W1) — final-tune the incoming, already-firmed week.
          2026-07-23 cockpit: was a one-line strip whose only affordance was a
          link away to the board; the batches themselves now render here with
          the same tune dialog, so last tweaks happen inside the meeting. */}
      <SectionCard
        title={`Incoming week · ${fmtWeekRange(nearWeek)}`}
        description={`${(nearDemand.data?.total_fg_units ?? 0).toLocaleString()} units committed — last tweaks before it produces. Tap a batch to tune it.`}
      >
        {(nearDraft.data?.batch_count ?? 0) > 0 && (
          <div
            className="mb-3 flex items-center gap-1.5 text-xs font-medium text-warning-fg"
            data-testid="near-week-orphan-drafts"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {nearDraft.data!.batch_count} draft batch{nearDraft.data!.batch_count === 1 ? "" : "es"} here{" "}
            {nearDraft.data!.batch_count === 1 ? "was" : "were"} never locked — won&apos;t produce unless firmed.
          </div>
        )}
        {nearPlans.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-bg-subtle motion-reduce:animate-none" />
            ))}
          </div>
        ) : nearPlans.isError ? (
          <div className="py-3 text-sm text-fg-muted">
            We couldn&apos;t load the incoming week.{" "}
            <button
              type="button"
              onClick={() => nearPlans.refetch()}
              className={cn("font-medium text-accent hover:underline", focusRing)}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {workingDaysOf(nearWeek).map((d) => {
              const { dayName, dateLabel } = fmtDayHeader(parseIsoDate(d));
              const dayPlans = nearWeekTunables.get(d) ?? [];
              return (
                <div
                  key={d}
                  role="group"
                  aria-label={`${dayName} ${dateLabel} — ${dayPlans.length === 0 ? "no batches" : `${dayPlans.length} batch${dayPlans.length === 1 ? "" : "es"}`}`}
                  className="rounded-lg border border-border-faint bg-bg-subtle/40 p-2"
                >
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-ops text-fg-muted">{dayName}</span>
                    <span className="text-2xs text-fg-subtle">{dateLabel}</span>
                  </div>
                  <div className="space-y-2">
                    {dayPlans.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border-faint py-4 text-center text-2xs text-fg-faint" aria-hidden="true">
                        —
                      </div>
                    ) : (
                      dayPlans.map((p) => {
                        const t = tunableFromPlanRow(p);
                        const done = p.rendered_state === "done";
                        return (
                          <button
                            key={p.plan_id}
                            type="button"
                            disabled={!canAct || done}
                            onClick={() => setTuning(t)}
                            className={cn(
                              "w-full rounded-md border border-border bg-bg-raised p-2.5 text-left shadow-hairline transition-colors",
                              canAct && !done && "hover:bg-bg-muted",
                              done && "opacity-70",
                              focusRing,
                            )}
                            aria-label={
                              done
                                ? `${t.title} — completed`
                                : `Tune ${t.title} — quantities, day, or cancel`
                            }
                            title={done ? "Already reported" : "Tune this batch"}
                            data-testid="near-week-batch"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="truncate text-sm font-medium" dir="auto">{t.title}</span>
                              {done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                              ) : canAct ? (
                                <Pencil className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden="true" />
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-2xs uppercase tracking-ops text-fg-subtle">
                              {t.is_base_batch
                                ? `${t.batch_size_l ?? "?"} L · ${t.packs.length} pack${t.packs.length === 1 ? "" : "s"}`
                                : `${t.planned_qty ?? "?"} ${t.uom ?? ""}`}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-right">
          <Link
            href={`/planning/production-plan?week=${nearWeek}`}
            className={cn("rounded text-xs font-medium text-accent hover:underline", focusRing)}
          >
            Open on the full board →
          </Link>
        </div>
      </SectionCard>

      {/* The cockpit's tune dialog — one dialog for W1 batches and W2 drafts. */}
      {tuning ? (
        <BatchTuneDialog batch={tuning} onClose={() => setTuning(null)} />
      ) : null}
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
        isError={demand.isError}
        onRetry={() => demand.refetch()}
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
            href="/planning/procurement?view=calendar"
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
function ExecutePanel({ onGoToFirm, pendingDraftCount }: { onGoToFirm: () => void; pendingDraftCount: number }) {
  return (
    <SectionCard
      title="Daily — execute"
      description="Make today's batch from the firmed plan and report the actual when it's done. Reporting the actual is what moves stock."
    >
      {pendingDraftCount > 0 && (
        <button
          type="button"
          onClick={onGoToFirm}
          className={cn(
            "mb-3 flex w-full items-center gap-2 rounded-lg border border-info-border bg-info-softer px-3 py-2 text-left text-xs text-info-fg transition-colors hover:bg-info-soft",
            focusRing,
          )}
          data-testid="execute-pending-drafts-banner"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {pendingDraftCount} draft batch{pendingDraftCount === 1 ? "" : "es"} still waiting to be locked, within
            the next 4 weeks.
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/planning/production-plan"
          className={cn("group flex items-center justify-between rounded-lg border border-accent-border bg-accent-softer p-4 transition-colors hover:bg-accent-soft", focusRing)}
        >
          <span className="flex items-center gap-3">
            <Factory className="h-5 w-5 text-accent" />
            <span>
              <span className="block text-sm font-semibold">Production plan</span>
              <span className="block text-xs text-fg-muted">Today&apos;s batches &amp; report actuals</span>
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
              <span className="block text-xs text-fg-muted">Projected stock &amp; at-risk products</span>
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
const VALID_STEPS: readonly CadenceStep[] = ["firm", "procure", "execute"];

export default function PlanningMeetingPage() {
  const { session } = useSession();
  const canAct = session.role === "planner" || session.role === "admin";

  const today = stepForToday();
  const [step, setStep] = useState<CadenceStep>(today);
  // FLOW-G08 (DR-019) — a cross-page link (e.g. from production-plan's
  // draft banner) previously always landed on today's default step and the
  // Firm panel's default week, discarding exactly the context the link was
  // trying to hand off. Honored once on mount, same SSR-safe pattern as
  // production-plan's ?week= (window.location.search directly — no
  // useSearchParams/Suspense wrapper needed).
  const [initialWeekStart, setInitialWeekStart] = useState<string | undefined>(undefined);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    if (stepParam && (VALID_STEPS as string[]).includes(stepParam)) {
      setStep(stepParam as CadenceStep);
    }
    const weekParam = params.get("week");
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      setInitialWeekStart(weekParam);
    }
  }, []);

  const todayLabel = useMemo(() => {
    const now = new Date();
    const { dayName, dateLabel } = fmtDayHeader(now);
    return `${dayName} · ${dateLabel}`;
  }, []);

  const stepBadgeTone =
    today === "firm" ? "accent" : today === "procure" ? "success" : "info";

  // FLOW-G01 / INT-04 (DR-019) — horizon-wide, week-independent pending-draft
  // count shared by the Execute banner and the Lock step's badge, so both
  // read the same number from one query instead of two independent fetches.
  const horizon = usePlans(
    useMemo(() => toIsoDate(new Date()), []),
    useMemo(() => toIsoDate(addDays(new Date(), 28)), []),
  );
  const pendingDraftCount = (horizon.data?.rows ?? []).filter(
    (r) => r.plan_type === "production" && r.status === "draft",
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <WorkflowHeader
        eyebrow="Weekly cadence"
        title="Weekly meeting"
        description="The factory rhythm in one place: lock next week's production on Thursday, buy for it on Sunday, build it daily."
        meta={
          <>
            <Badge tone="neutral" variant="outline" size="sm">{todayLabel}</Badge>
            <Badge tone={stepBadgeTone} variant="soft" size="sm">
              Today: {STEPS.find((s) => s.key === today)?.label}
            </Badge>
          </>
        }
      />

      <CadenceRail active={step} today={today} onSelect={setStep} pendingCount={pendingDraftCount} />

      {step === "firm" ? (
        <FirmPanel canAct={canAct} initialWeekStart={initialWeekStart} />
      ) : step === "procure" ? (
        <ProcurePanel />
      ) : (
        <ExecutePanel onGoToFirm={() => setStep("firm")} pendingDraftCount={pendingDraftCount} />
      )}
    </div>
  );
}
