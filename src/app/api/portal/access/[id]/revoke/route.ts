import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/portal/access/[id]/revoke — withdraw an approved customer's portal
// access (Tranche 179).
//
// POST → Fastify POST /api/v1/mutations/portal/access/:id/revoke
// body: {} (the page sends an empty JSON object with a JSON content-type)
// 200: { ok: true }
// 404: no such access, or already revoked · 401: no session · 403: not admin
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/portal/access/${encodeURIComponent(id)}/revoke`,
    errorLabel: "portal access revoke",
  });
}
