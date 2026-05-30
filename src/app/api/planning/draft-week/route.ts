import { proxyRequest } from "@/lib/api-proxy";

// GET /api/planning/draft-week?week_start=YYYY-MM-DD
//   → /api/v1/queries/planning/draft-week
//
// Weekly cadence (Brick A read) — the "review before you firm" preview for the
// Thursday cockpit. Returns the engine's DRAFT production rows for the week
// (tea base-batch + matcha repack), i.e. exactly what /api/planning/firm-week
// would promote to 'planned'. All four roles may read.
//
// Backend: gt-factory-os/api/src/planning/handler.draft_week.ts + route.ts.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/planning/draft-week",
    errorLabel: "planning draft week",
  });
}
