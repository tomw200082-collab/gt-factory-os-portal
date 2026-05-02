import { proxyRequest } from "@/lib/api-proxy";

// GET  /api/production-plan?from=&to=&item_id=&status=&include_completed=
//   → /api/v1/queries/production-plan
//
// POST /api/production-plan
//   → /api/v1/mutations/production-plan
//
// PATCH (single plan) lives at /api/production-plan/[plan_id]/route.ts
//
// Gate 3B backend: gt-factory-os/api/src/production-plan/route.ts.

export async function GET(req: Request): Promise<Response> {
  // proxyRequest's forwardQuery default (true for GET) appends the
  // incoming searchParams. Do NOT also concatenate ?qs into upstreamPath
  // — that would double-append the querystring (`?from=...?from=...`),
  // mangle `to` to `2026-05-02?from=…`, and trip backend Zod validation
  // with a 422.
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-plan",
    errorLabel: "production plan list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/production-plan",
    errorLabel: "production plan create",
  });
}
