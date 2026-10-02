import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/orgs/:id/contacts → GET /api/v1/queries/sales/orgs/:id/contacts

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/orgs/${encodeURIComponent(id)}/contacts`,
    forwardQuery: false,
    errorLabel: "sales org contacts",
  });
}
