// Stacked progress bar for /planning/purchase-session.
//
// Three segments: placed (success), skipped (neutral), pending (subtle).
// Renders a textual breakdown above the bar so colour is not the sole
// signal (portal_ux_standard.md §4).

import { cn } from "@/lib/cn";

interface ProgressBreakdownProps {
  placed: number;
  skipped: number;
  pending: number;
}

export function ProgressBreakdown({
  placed,
  skipped,
  pending,
}: ProgressBreakdownProps) {
  const total = placed + skipped + pending;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div
      className="space-y-1"
      role="group"
      aria-label="Session progress"
      data-testid="purchase-session-progress"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xs text-fg-muted">
        <span>
          <span className="font-semibold text-fg">{placed}</span> placed
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-semibold text-fg">{skipped}</span> skipped
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-semibold text-fg">{pending}</span> pending
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-semibold text-fg">{total}</span> total
        </span>
      </div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
        aria-hidden
      >
        <div
          className={cn("h-full bg-success/70")}
          style={{ width: `${pct(placed)}%` }}
        />
        <div
          className={cn("h-full bg-fg-faint/30")}
          style={{ width: `${pct(skipped)}%` }}
        />
        <div
          className={cn("h-full bg-bg-subtle")}
          style={{ width: `${pct(pending)}%` }}
        />
      </div>
    </div>
  );
}
