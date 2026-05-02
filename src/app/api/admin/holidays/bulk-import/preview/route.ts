// ---------------------------------------------------------------------------
// /api/admin/holidays/bulk-import/preview — diff preview (admin only).
//
// Mirror-only. Forwards to upstream:
//   POST /api/v1/mutations/admin/holidays/bulk-import/preview
//
// Stateless preview per W1 checkpoint §2 row 11: server re-validates the
// payload and computes the diff against the live DB; commit re-computes.
// No idempotency on preview (read-only diff).
// ---------------------------------------------------------------------------

import { proxyRequest } from "@/lib/api-proxy";

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/admin/holidays/bulk-import/preview",
    errorLabel: "admin holidays bulk-import preview",
  });
}
