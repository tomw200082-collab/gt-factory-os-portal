import { proxyRequest } from "@/lib/api-proxy";

// POST /api/portal/access/[id]/revoke → POST /api/v1/mutations/portal/access/:id/revoke (idempotent; no body needed)

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
