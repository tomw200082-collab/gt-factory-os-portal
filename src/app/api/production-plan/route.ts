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
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/production-plan${qs ? "?" + qs : ""}`,
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
