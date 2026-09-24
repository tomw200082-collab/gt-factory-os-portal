import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/portal/registrations/[id]/decide — approve or reject one customer-portal
// access request (Tranche 179).
//
// POST → Fastify POST /api/v1/mutations/portal/registrations/:id/decide
// body: { decision: "approve" | "reject", shopify_customer_id?: string }
//       (shopify_customer_id is required to approve)
// 200: { ok: true, wa_link: string | null }
// 404: no such registration · 409: already decided · 422: body not accepted
// 401: no session · 403: not admin
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/portal/registrations/${encodeURIComponent(id)}/decide`,
    errorLabel: "portal registration decision",
  });
}
