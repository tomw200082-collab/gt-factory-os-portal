import { proxyRequest } from "@/lib/api-proxy";

// POST /api/portal/registrations/[id]/decide → POST /api/v1/mutations/portal/registrations/:id/decide

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
