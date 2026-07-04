import { proxyRequest } from "@/lib/api-proxy";

// POST /api/planning/cancel-firmed-week
//   → /api/v1/mutations/planning/cancel-firmed-week
//
// Weekly cadence (Brick A) — INT-06 (DR-019) bulk "undo Lock". Cancels this
// engine's PLANNED rows in [week_start, +6] (TEAEDD:%/MATCHA:% only — a
// manually-added plan for the same week is untouched). planner/admin only
// (role gate enforced upstream). Never touches stock_ledger.
//
// Body: { idempotency_key: string, week_start: ISO date, reason: string }.
// Returns: { week_start, week_end, cancelled_count,
//            skipped_already_done_or_cancelled, idempotent_replay }.
//
// Backend: gt-factory-os/api/src/planning/handler.cancel_firmed_week.ts + route.ts.

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/planning/cancel-firmed-week",
    errorLabel: "planning cancel firmed week",
  });
}
