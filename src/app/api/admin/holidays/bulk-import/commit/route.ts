// ---------------------------------------------------------------------------
// /api/admin/holidays/bulk-import/commit — durable bulk-import (admin only).
//
// Mirror-only. Forwards to upstream:
//   POST /api/v1/mutations/admin/holidays/bulk-import/commit
//
// Per spec §9 row 7: idempotency_key REQUIRED on commit. Replay with the
// same key + same rows returns idempotent_replay=true with the same
// submission_id and the same created/updated/skipped/rejected counts.
// ---------------------------------------------------------------------------

import { proxyRequest } from "@/lib/api-proxy";

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/admin/holidays/bulk-import/commit",
    errorLabel: "admin holidays bulk-import commit",
  });
}
