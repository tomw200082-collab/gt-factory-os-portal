// ---------------------------------------------------------------------------
// <ReadinessPill> — tiny badge used in table rows for per-entity readiness.
//
// AMMC v1 Slice 4. Complements the full <ReadinessCard> used on detail pages.
// Accepts the same payload shape — `{ is_ready?, blockers?: unknown[] }` —
// and renders a 3-dot colored badge plus a short label:
//   - green   "Ready"
//   - yellow  "Check"
//   - red     "Blocked"
//   - unknown "—"
// ---------------------------------------------------------------------------

import { Badge } from "@/components/badges/StatusBadge";
import { readinessToneFromPayload } from "@/lib/admin/mutations";

export interface ReadinessPillProps {
  readiness?: {
    is_ready?: boolean;
    blockers?: unknown[];
  } | null;
  /** Optional click/hover detail — blockers count shown on hover. */
  showBlockerCount?: boolean;
}

export function ReadinessPill({
  readiness,
  showBlockerCount = true,
}: ReadinessPillProps): JSX.Element {
  const tone = readinessToneFromPayload(readiness);
  const blockerCount = Array.isArray(readiness?.blockers)
    ? readiness!.blockers!.length
    : 0;

  if (tone === "unknown") {
    return (
      <Badge tone="neutral" dotted>
        —
      </Badge>
    );
  }
  if (tone === "red") {
    return (
      <Badge tone="danger" dotted>
        {showBlockerCount && blockerCount > 0 ? `Blocked (${blockerCount})` : "Blocked"}
      </Badge>
    );
  }
  if (tone === "yellow") {
    return (
      <Badge tone="warning" dotted>
        {showBlockerCount && blockerCount > 0 ? `Check (${blockerCount})` : "Check"}
      </Badge>
    );
  }
  return (
    <Badge tone="success" dotted>
      Ready
    </Badge>
  );
}
