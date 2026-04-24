import { proxyRequest } from "@/lib/api-proxy";

// GET /api/inventory/weekly-outlook — proxy to Fastify API
//   GET /api/v1/queries/inventory/weekly-outlook
//
// Returns FG stock projection by week from the latest completed planning run.
// Any authenticated role may read.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/weekly-outlook",
    errorLabel: "inventory weekly-outlook",
  });
}
