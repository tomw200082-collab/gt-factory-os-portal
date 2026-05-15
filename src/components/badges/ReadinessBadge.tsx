// ---------------------------------------------------------------------------
// ReadinessBadge — per-check readiness indicator.
//
// Tranche 0A consolidation (2026-05-15): the bespoke CONFIG color map is
// deleted; the badge now composes the canonical <Badge> primitive. Only the
// verbatim label strings (OK / WARN / FAIL / ?) survive, in STATUS_LABEL.
//
// HARD RULE for Tranche 0A: label strings are verbatim. No copy changes.
// ---------------------------------------------------------------------------

import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface ReadinessBadgeProps {
  label: string;
  status: "ok" | "warn" | "fail" | "unknown";
  detail?: string;
}

// Verbatim short label per status — preserved exactly from the pre-
// consolidation CONFIG map.
const STATUS_LABEL: Record<ReadinessBadgeProps["status"], string> = {
  ok: "OK",
  warn: "WARN",
  fail: "FAIL",
  unknown: "?",
};

const STATUS_TONE: Record<ReadinessBadgeProps["status"], BadgeTone> = {
  ok: "success",
  warn: "warning",
  fail: "danger",
  unknown: "neutral",
};

export function ReadinessBadge({ label, status, detail }: ReadinessBadgeProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-transparent px-0.5 py-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {detail ? (
          <span className="font-mono text-3xs tabular-nums text-fg-subtle">
            {detail}
          </span>
        ) : null}
        <Badge tone={STATUS_TONE[status]} size="xs" dot>
          {STATUS_LABEL[status]}
        </Badge>
      </div>
    </div>
  );
}
