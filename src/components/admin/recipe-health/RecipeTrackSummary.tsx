// Recipe-Health card · single-track summary block. Pure presentational.
// Used twice in RecipeHealthCard — once for base, once for pack.

import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

interface RecipeTrackSummaryProps {
  trackLabel: string;
  activeVersionLabel: string | null;
  health: TrackHealth;
}

const TRACK_TONE: Record<
  TrackHealth["color"],
  { container: string; pill: string; label: string }
> = {
  green: {
    container: "border-success-border bg-success-soft",
    pill: "bg-success text-success-soft",
    label: "Ready",
  },
  yellow: {
    container: "border-warning-border bg-warning-soft",
    pill: "bg-warning text-warning-soft",
    label: "Warnings",
  },
  red: {
    container: "border-danger-border bg-danger-soft",
    pill: "bg-danger text-danger-soft",
    label: "Blocked",
  },
};

export function RecipeTrackSummary({
  trackLabel,
  activeVersionLabel,
  health,
}: RecipeTrackSummaryProps): JSX.Element {
  const tone = TRACK_TONE[health.color];
  return (
    <div
      data-track-color={health.color}
      className={`rounded-md border ${tone.container} p-4`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg-strong">{trackLabel}</h3>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops ${tone.pill}`}
        >
          {tone.label}
        </span>
      </div>
      <div className="mt-1 text-xs text-fg-muted">
        {health.hasActiveVersion && activeVersionLabel
          ? `Active: ${activeVersionLabel} · ${health.lineCount} ${health.lineCount === 1 ? "component" : "components"}`
          : "No active version"}
      </div>
      {health.blockers.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-danger-fg">
          {health.blockers.map((b) => (
            <li key={b} className="flex gap-1.5">
              <span aria-hidden className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {health.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-warning-fg">
          {health.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <span aria-hidden className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
