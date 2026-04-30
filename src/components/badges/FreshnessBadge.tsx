import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";

interface FreshnessBadgeProps {
  label?: string;
  lastAt?: string;
  warnAfterMinutes?: number;
  failAfterMinutes?: number;
  compact?: boolean;
  /** Producer / source name surfaced in the tooltip so the operator can
   * identify which integration or job is stale. e.g. "lionwheel_pull". */
  producer?: string;
}

function minutesSince(iso?: string): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 60_000);
}

function formatAgo(min: number | null): string {
  if (min == null) return "never";
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatAbsolute(iso?: string): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatThreshold(min: number): string {
  if (min < 60) return `${min}m`;
  const hrs = min / 60;
  if (hrs < 24) return `${hrs.toFixed(hrs % 1 ? 1 : 0)}h`;
  return `${(hrs / 24).toFixed(0)}d`;
}

export function FreshnessBadge({
  label,
  lastAt,
  warnAfterMinutes = 60,
  failAfterMinutes = 24 * 60,
  compact,
  producer,
}: FreshnessBadgeProps) {
  const min = minutesSince(lastAt);
  let tone: "success" | "warning" | "danger" | "neutral" = "success";
  let toneLabel = "Fresh";
  if (min == null) {
    tone = "neutral";
    toneLabel = "Never";
  } else if (min > failAfterMinutes) {
    tone = "danger";
    toneLabel = "Critical";
  } else if (min > warnAfterMinutes) {
    tone = "warning";
    toneLabel = "Stale";
  }

  const dotColor =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-fg-faint";

  // Tooltip: producer + state + relative + absolute + thresholds. Per S7
  // research §C: "Tooltip copy template: 'Producer: lionwheel_orders_mirror ·
  // Last emit: 2026-04-29 13:42:11Z (3m ago) · Warn at 10m · Crit at 30m'."
  const tooltipParts: string[] = [];
  if (producer) tooltipParts.push(`Producer: ${producer}`);
  tooltipParts.push(`State: ${toneLabel}`);
  tooltipParts.push(`Last: ${formatAbsolute(lastAt)} (${formatAgo(min)})`);
  tooltipParts.push(
    `Warn ≥ ${formatThreshold(warnAfterMinutes)} · Crit ≥ ${formatThreshold(failAfterMinutes)}`,
  );
  const tooltip = tooltipParts.join(" · ");

  // aria-label so screen readers can read the same context the tooltip
  // conveys to sighted users.
  const ariaLabel = label
    ? `${label}: ${toneLabel}, ${formatAgo(min)} ago${producer ? ` (${producer})` : ""}`
    : `${toneLabel}, ${formatAgo(min)} ago${producer ? ` (${producer})` : ""}`;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2",
        compact ? "" : "rounded-sm border border-border/70 bg-bg-raised px-2 py-1"
      )}
      title={tooltip}
      aria-label={ariaLabel}
    >
      {label ? (
        <>
          <Clock className="h-3 w-3 text-fg-faint" strokeWidth={2} aria-hidden />
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            {label}
          </span>
          <span className="h-3 w-px bg-border/60" aria-hidden />
        </>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span className={cn("dot", dotColor)} aria-hidden />
        <span className="font-mono text-2xs font-semibold tabular-nums text-fg-strong">
          {formatAgo(min)}
        </span>
        <span className="text-3xs text-fg-subtle">ago</span>
      </span>
    </div>
  );
}
