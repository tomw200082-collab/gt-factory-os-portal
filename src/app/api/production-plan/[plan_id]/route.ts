import { proxyRequest } from "@/lib/api-proxy";

// PATCH /api/production-plan/[plan_id]
//   → /api/v1/mutations/production-plan/:id
// Edit OR cancel modes are discriminated by the request body shape.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/production-plan/${encodeURIComponent(plan_id)}`,
    errorLabel: "production plan patch",
  });
}
