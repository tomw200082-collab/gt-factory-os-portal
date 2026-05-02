import { proxyRequest } from "@/lib/api-proxy";

// GET /api/production-plan/recommendation-candidates?date=&item_id=&page=&page_size=
//   → /api/v1/queries/production-plan/recommendation-candidates
//
// W1 contract source: docs/recommendation_candidates_endpoint_checkpoint.md §6.
// Backend handler: gt-factory-os/api/src/production-plan/handler.recommendation_candidates.ts.
// Surfaces approved + production-type recommendations from completed planning
// runs that are NOT yet linked to any production_plan row. Feeds the
// "Add from Recommendations" picker on /planning/production-plan.
//
// Role gate is enforced upstream: planner + admin only (operator + viewer = 403).

export async function GET(req: Request): Promise<Response> {
  // proxyRequest's forwardQuery default (true for GET) appends the
  // incoming searchParams. Do NOT also concatenate ?qs into upstreamPath
  // — that would double-append the querystring and trip backend Zod
  // validation with a 422 (see /api/production-plan/route.ts comment).
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-plan/recommendation-candidates",
    errorLabel: "production plan recommendation candidates",
  });
}
