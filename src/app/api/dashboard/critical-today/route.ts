import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/dashboard/critical-today
//
// Mirror-only proxy to upstream Fastify API:
//   GET /api/v1/queries/dashboard/critical-today
//
// Backed by signal #23 RUNTIME_READY(DashboardCriticalToday) (2026-05-02).
// Source view: api_read.v_critical_today (db/migrations/0117).
//
// Response shape (per api/src/dashboard/schemas.ts CriticalTodayResponse):
//   { rows: CriticalTodayRow[], as_of: string }
// where each row has 5 verbatim view columns: trigger_kind, display_name,
// severity, triggered_at, detail_jsonb (opaque jsonb).
//
// No query parameters. Role gate enforced upstream:
//   missing auth = 401, viewer = 403, operator/planner/admin = 200.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/dashboard/critical-today",
    forwardQuery: false,
    errorLabel: "dashboard critical-today",
  });
}
