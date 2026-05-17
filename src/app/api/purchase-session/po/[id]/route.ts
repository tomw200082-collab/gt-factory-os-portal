import { proxyRequest } from "@/lib/api-proxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/purchase-session/po/${encodeURIComponent(id)}`,
    errorLabel: "purchase session PO edit",
  });
}
