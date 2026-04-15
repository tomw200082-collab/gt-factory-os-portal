import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";

interface FreshnessBadgeProps {
  label?: string;
  lastAt?: string;
  warnAfterMinutes?: number;
  failAfterMinutes?: number;
  compact?: boolean;
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

export function FreshnessBadge({
  label,
  lastAt,
  warnAfterMinutes = 60,
  failAfterMinutes = 24 * 60,
  compact,
}: FreshnessBadgeProps) {
  const min = minutesSince(lastAt);
  let tone: "success" | "warning" | "danger" | "neutral" = "success";
  if (min == null) tone = "neutral";
  else if (min > failAfterMinutes) tone = "danger";
  else if (min > warnAfterMinutes) tone = "warning";

  const dotColor =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-fg-faint";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2",
        compact ? "" : "rounded-sm border border-border/70 bg-bg-raised px-2 py-1"
      )}
    >
      {label ? (
        <>
          <Clock className="h-3 w-3 text-fg-faint" strokeWidth={2} />
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
