import { proxyRequest } from "@/lib/api-proxy";
import { badId, isUuid } from "@/app/api/sales/_ids";

// GET /api/sales/orgs/:id/circle → GET /api/v1/queries/sales/orgs/:id/circle

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return badId();
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/orgs/${encodeURIComponent(id)}/circle`,
    forwardQuery: false,
    errorLabel: "sales org circle",
  });
}
