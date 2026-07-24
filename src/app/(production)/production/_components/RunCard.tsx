"use client";

// ---------------------------------------------------------------------------
// RunCard — one run in today's work order. Reads like a work-order line:
// a big step number, the stage kind (Make tank / Fill), the product name big,
// the target quantity in tabular mono, a status badge, and one tap target to
// open the picking screen. Never colour-alone — every status pairs an icon +
// word with its tone.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ArrowRight, Ban, CheckCircle2, FlaskConical, PackageOpen } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../_lib/copy";
import {
  isRunTerminal,
  runDisplayName,
  type RunStatusMeta,
  runStatusMeta,
  stageKindKey,
  stepNumber,
} from "../_lib/runs";
import type { ProductionRunTodayRow } from "../_lib/types";

function StageIcon({ stage, className }: { stage: ProductionRunTodayRow["stage"]; className?: string }) {
  // TANK = liquids (flask); PACK = packaging (box); SINGLE = both → flask.
  const Icon = stage === "PACK" ? PackageOpen : FlaskConical;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

/** Status pill on the run card — the canonical <Badge> primitive rather than
 *  the one-off `.chip` classes (VISUAL-141-03). Icon + word, never colour
 *  alone. */
function StatusChip({
  status,
  done,
  cancelled,
}: {
  status: RunStatusMeta;
  done: boolean;
  cancelled: boolean;
}) {
  const icon = done ? (
    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
  ) : cancelled ? (
    <Ban className="h-3.5 w-3.5" strokeWidth={2.5} />
  ) : undefined;
  return (
    <Badge tone={status.tone} size="xs" icon={icon}>
      {t(status.labelKey)}
    </Badge>
  );
}

export function RunCard({
  run,
  index,
}: {
  run: ProductionRunTodayRow;
  index: number;
}) {
  const status = runStatusMeta(run.status);
  const terminal = isRunTerminal(run.status);
  const cancelled = run.status === "CANCELLED";
  const done = run.status === "REPORTED";
  const name = runDisplayName(run);

  return (
    <Link
      href={`/production/runs/${encodeURIComponent(run.run_id)}`}
      data-testid={`run-card-${run.run_id}`}
      data-status={run.status}
      aria-label={`${t("run_step_prefix")} ${stepNumber(index)} · ${name} · ${t(status.labelKey)}`}
      className={cn(
        "card group flex items-stretch gap-0 overflow-hidden p-0 transition-all duration-200 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-pop",
        "motion-reduce:hover:translate-y-0",
        terminal && "opacity-70 hover:translate-y-0",
      )}
    >
      {/* Step rail — the work-order sequence marker */}
      <div
        className={cn(
          "flex w-14 shrink-0 flex-col items-center justify-center border-r border-border/70 bg-bg-subtle/50 sm:w-16",
          done && "bg-success-softer/40",
        )}
        aria-hidden
      >
        <span className="eyebrow">{t("run_step_prefix")}</span>
        <span className="font-mono text-2xl font-bold tabular-nums text-fg-strong sm:text-3xl">
          {stepNumber(index)}
        </span>
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 sm:px-5">
        <StageIcon
          stage={run.stage}
          className="h-6 w-6 shrink-0 text-accent"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="eyebrow text-accent">
              {t(stageKindKey(run.stage))}
            </span>
            {run.unplanned ? (
              <Badge tone="warning" size="xs">
                {t("run_unplanned_tag")}
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-lg font-bold text-fg-strong sm:text-xl">
            {name}
          </div>
          {run.name_he ? (
            <div className="truncate text-xs text-fg-muted">
              <bdi>{run.name_he}</bdi>
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
            <span>{t("pick_target")}</span>
            <span className="font-mono font-semibold tabular-nums text-fg">
              {fmtNumStr(run.target_qty)} {run.uom}
            </span>
          </div>
          {/* Status inline on mobile — the right rail is too narrow at 390px,
              so the chip rides under the qty line there (VISUAL-141-01). */}
          <div className="mt-2 sm:hidden">
            <StatusChip status={status} done={done} cancelled={cancelled} />
          </div>
        </div>

        {/* Status + affordance — right rail from sm up */}
        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
          <StatusChip status={status} done={done} cancelled={cancelled} />
          {!terminal ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
              {t("run_open")}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none group-hover:translate-x-0.5"
                strokeWidth={2.5}
                aria-hidden
              />
            </span>
          ) : null}
        </div>

        {/* On mobile the affordance sits at the far right, always visible */}
        {!terminal ? (
          <ArrowRight
            className="h-5 w-5 shrink-0 text-accent transition-transform duration-200 motion-reduce:transition-none group-hover:translate-x-0.5 sm:hidden"
            strokeWidth={2.5}
            aria-hidden
          />
        ) : null}
      </div>
    </Link>
  );
}
