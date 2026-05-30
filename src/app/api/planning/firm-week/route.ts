import { proxyRequest } from "@/lib/api-proxy";

// POST /api/planning/firm-week
//   → /api/v1/mutations/planning/firm-week
//
// Weekly cadence (Brick A) — Thursday "Firm the Week" action. Promotes this
// engine's DRAFT production_plan rows in [week_start, +6] to status='planned'
// (the MPS time-fence lock) via the backend handler, which invokes
// fn_firm_production_week (migration 0218). planner/admin only (role gate
// enforced upstream).
//
// Body: { idempotency_key: string, week_start: ISO date (the Sunday that
//         opens the week being firmed) }.
// Returns: { week_start, week_end, newly_firmed_count, week_firmed_total,
//            idempotent_replay }.
//
// Backend: gt-factory-os/api/src/planning/handler.firm_week.ts + route.ts.

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/planning/firm-week",
    errorLabel: "planning firm week",
  });
}
