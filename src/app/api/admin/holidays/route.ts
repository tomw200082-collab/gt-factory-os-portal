// ---------------------------------------------------------------------------
// /api/admin/holidays — list (GET) + create (POST) proxy.
//
// Mirror-only. Forwards to upstream Fastify endpoints landed by W1 cycle 7
// (signal #25 RUNTIME_READY(AdminHolidays), 2026-05-01T22:48:23Z, evidence
// Projects/gt-factory-os/docs/admin_holidays_crud_checkpoint.md):
//
//   GET  /api/v1/queries/admin/holidays         — planner + admin read
//   POST /api/v1/mutations/admin/holidays       — admin only create
//
// No contract authorship here. The upstream auth gate enforces role; this
// proxy only forwards the Bearer JWT extracted by the shared helper.
// ---------------------------------------------------------------------------

import { proxyRequest } from "@/lib/api-proxy";

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/admin/holidays",
    errorLabel: "admin holidays list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/admin/holidays",
    errorLabel: "admin holidays create",
  });
}
