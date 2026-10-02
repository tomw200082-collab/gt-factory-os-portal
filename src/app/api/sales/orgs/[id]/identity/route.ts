import { proxyRequest } from "@/lib/api-proxy";
import { badId, isUuid } from "@/app/api/sales/_ids";

// POST /api/sales/orgs/:id/identity → POST /api/v1/mutations/sales/orgs/:id/identity
// Managers only: { action: confirm | pick | reject, customer_gid? }.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return badId();
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/sales/orgs/${encodeURIComponent(id)}/identity`,
    errorLabel: "sales org identity",
  });
}
