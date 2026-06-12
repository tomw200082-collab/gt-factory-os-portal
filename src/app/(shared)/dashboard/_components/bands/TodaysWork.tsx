"use client";

// ---------------------------------------------------------------------------
// TodaysWork — Band 2, the unified action queue (Tranche 060, design-doc §4).
// Replaces the three separate live blocks (Critical Today / Urgent
// Procurement / Slipped Plans) + late-PO rows with ONE ranked list.
//
// Row anatomy: severity dot + age · verb-object title · MRP why-now line ·
// one transaction button. Empty state = ONE all-clear ribbon + a Tomorrow
// strip that points forward (design-doc: an empty queue is never just
// "nothing to do").
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Flame } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { AllClearRibbon, ErrorAlert, SkeletonRow } from "@/components/feedback/states";
import { cn } from "@/lib/cn";
import type { QueueRowSpec } from "../../_lib/queue";

export interface TomorrowItem {
  key: string;
  label: string;
  href: string | null;
}

export interface TodaysWorkProps {
  rows: QueueRowSpec[];
  overflow: number;
  loading?: boolean;
  /** FLOW-D08: per-source errors — the queue renders whatever it has and
   *  shows an inline error row per failed source. The full-panel error
   *  appears only when BOTH sources fail. */
  criticalError?: boolean;
  slippedError?: boolean;
  onRetry: () => void;
  /** Forward pointers shown when the queue is empty. */
  tomorrow: TomorrowItem[];
  /** Band provenance, e.g. "updated 2m ago". */
  asOfLabel: string | null;
}

// FLOW-D01: plain language a factory owner reads without MRP training —
// "Slipped plan" and "Late PO" were system jargon.
const CATEGORY_LABEL: Record<QueueRowSpec["category"], string> = {
  stops_production: "Stops production",
  procurement: "Procurement",
  slipped: "Production overdue",
  late_po: "Late delivery",
};

export function TodaysWork({
  rows,
  overflow,
  loading,
  criticalError,
  slippedError,
  onRetry,
  tomorrow,
  asOfLabel,
}: TodaysWorkProps) {
  const allSourcesFailed = !!criticalError && !!slippedError;
  const someSourceFailed = !!criticalError || !!slippedError;
  const criticalCount = rows.filter((r) => r.severity === "critical").length;
  const hot = criticalCount > 0;
  const tone: "danger" | "warning" | "default" =
    hot ? "danger" : rows.length > 0 ? "warning" : "default";

  return (
    <div id="todays-work" className="scroll-mt-24">
      <SectionCard
        tone={tone}
        className={cn(
          "dash-panel dash-live-block",
          hot && "is-hot shadow-pop",
          !hot && rows.length > 0 && "is-warm",
        )}
        eyebrow="Act now"
        title={
          <span className="inline-flex items-center gap-2">
            {hot ? (
              <Flame
                className="h-4 w-4 text-danger animate-pulse-soft motion-reduce:animate-none"
                strokeWidth={2.25}
              />
            ) : rows.length > 0 ? (
              <CalendarClock className="h-4 w-4 text-warning" strokeWidth={2.25} />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2.25} />
            )}
            Today&apos;s work
            {rows.length > 0 ? (
              <Badge
                tone={hot ? "danger" : "warning"}
                size="sm"
                className="ml-2 align-middle tabular-nums"
              >
                {rows.length}
              </Badge>
            ) : null}
          </span>
        }
        description="Everything that needs a decision or a transaction today, worst first."
        footer={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {asOfLabel ? <span>{asOfLabel}</span> : null}
            {asOfLabel ? (
              <span aria-hidden className="text-fg-faint">
                ·
              </span>
            ) : null}
            <Link
              href="/inbox"
              className="font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {overflow > 0 ? `${overflow} more in inbox` : "Open inbox"}
            </Link>
          </span>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : allSourcesFailed ? (
          <ErrorAlert label="Today's work unavailable." onRetry={onRetry} />
        ) : rows.length === 0 && !someSourceFailed ? (
          <div className="flex flex-col gap-3">
            <AllClearRibbon
              title="All clear — nothing needs a decision right now."
              description="No production blockers, no supplier orders due, no slipped plans, no late receipts."
            />
            {tomorrow.length > 0 ? (
              <div className="dash-tomorrow" data-testid="dash-tomorrow">
                <span className="dash-tomorrow-label">Tomorrow</span>
                {tomorrow.map((t) =>
                  t.href ? (
                    <Link
                      key={t.key}
                      href={t.href}
                      className="dash-chip transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      {t.label}
                    </Link>
                  ) : (
                    <span key={t.key} className="dash-chip">
                      {t.label}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <>
          {/* FLOW-D01: the working instruction, readable at scan speed —
              the muted description above was being skipped. */}
          {rows.length > 0 ? (
            <p className="mb-2 text-xs font-medium text-fg-muted" data-testid="todays-work-hint">
              These items need your action today.{" "}
              <span className="font-semibold text-fg-strong">
                Start at the top — the list is ranked by urgency.
              </span>{" "}
              Each button opens the screen where the action happens; a finished
              item disappears on the next refresh.
            </p>
          ) : null}
          {/* FLOW-D08: inline per-source error rows — the rows we DO have
              stay visible. */}
          {criticalError ? (
            <div className="mb-2">
              <ErrorAlert label="Critical alerts unavailable — other items still shown." onRetry={onRetry} />
            </div>
          ) : null}
          {slippedError ? (
            <div className="mb-2">
              <ErrorAlert label="Overdue-production items unavailable — other items still shown." onRetry={onRetry} />
            </div>
          ) : null}
          <ol className="flex flex-col gap-2" data-testid="todays-work-list">
            {rows.map((row) => {
              const danger = row.severity === "critical";
              return (
                <li
                  key={row.id}
                  className={cn(
                    "dash-queue-row flex flex-col gap-1.5 rounded border bg-bg-raised px-3 py-3 sm:flex-row sm:items-center sm:gap-3",
                    danger ? "border-danger/40" : "border-warning/40",
                  )}
                  data-severity={row.severity}
                  data-category={row.category}
                >
                  <div className="flex flex-wrap items-center gap-2 sm:w-44 sm:shrink-0">
                    <Badge
                      tone={danger ? "danger" : "warning"}
                      variant={danger ? "solid" : "soft"}
                      dotted={danger}
                    >
                      {CATEGORY_LABEL[row.category]}
                    </Badge>
                    {row.ageLabel ? (
                      <span className="text-2xs tabular-nums text-fg-faint">{row.ageLabel}</span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-fg-strong">
                      {row.title}
                    </div>
                    {row.whyNow ? (
                      <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                        {row.whyNow}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href={row.href}
                    className={cn(
                      "dash-queue-cta inline-flex shrink-0 items-center gap-1 self-start rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 sm:self-center",
                      danger
                        ? "border-danger/40 text-danger-fg hover:bg-danger-softer focus-visible:ring-danger/40"
                        : "border-border text-fg-strong hover:border-accent/50 hover:bg-accent-soft hover:text-accent focus-visible:ring-accent/40",
                    )}
                  >
                    {row.cta}
                    <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ol>
          </>
        )}
      </SectionCard>
    </div>
  );
}
