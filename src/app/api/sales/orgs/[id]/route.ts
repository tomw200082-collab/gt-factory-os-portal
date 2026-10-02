import { proxyRequest } from "@/lib/api-proxy";
import { badId, isUuid } from "@/app/api/sales/_ids";

// GET /api/sales/orgs/:id → GET /api/v1/queries/sales/orgs/:id
// The API is the permission boundary: a rep gets 403 with no body data for any org
// that is not theirs, including one that does not exist.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return badId();
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/orgs/${encodeURIComponent(id)}`,
    forwardQuery: false,
    errorLabel: "sales org",
  });
}
