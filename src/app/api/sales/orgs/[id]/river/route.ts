import { proxyRequest } from "@/lib/api-proxy";
import { badId, isUuid } from "@/app/api/sales/_ids";

// GET /api/sales/orgs/:id/river → GET /api/v1/queries/sales/orgs/:id/river

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return badId();
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/orgs/${encodeURIComponent(id)}/river`,
    forwardQuery: true,
    errorLabel: "sales org river",
  });
}
