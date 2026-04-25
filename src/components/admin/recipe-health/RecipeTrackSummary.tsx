// Recipe-Health card · single-track summary block. Pure presentational.
// Used twice in RecipeHealthCard — once for base, once for pack.

import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

interface RecipeTrackSummaryProps {
  trackLabel: string;
  activeVersionLabel: string | null;
  health: TrackHealth;
}

const COLOR_CLASS: Record<TrackHealth["color"], string> = {
  green: "border-green-500 bg-green-50",
  yellow: "border-yellow-500 bg-yellow-50",
  red: "border-red-500 bg-red-50",
};

export function RecipeTrackSummary({
  trackLabel,
  activeVersionLabel,
  health,
}: RecipeTrackSummaryProps): JSX.Element {
  return (
    <div
      data-track-color={health.color}
      className={`rounded-md border-l-4 p-3 ${COLOR_CLASS[health.color]}`}
    >
      <div className="font-semibold">{trackLabel}</div>
      <div className="text-sm text-gray-600">
        {health.hasActiveVersion && activeVersionLabel
          ? `Active: ${activeVersionLabel} · ${health.lineCount} lines`
          : "אין גרסה פעילה"}
      </div>
      {health.blockers.length > 0 && (
        <ul className="mt-2 text-sm text-red-700">
          {health.blockers.map((b) => (
            <li key={b}>🔴 {b}</li>
          ))}
        </ul>
      )}
      {health.warnings.length > 0 && (
        <ul className="mt-2 text-sm text-yellow-800">
          {health.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
