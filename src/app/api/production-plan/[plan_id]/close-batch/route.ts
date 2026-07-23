import { proxyRequest } from "@/lib/api-proxy";

// POST /api/production-plan/[plan_id]/close-batch
//   → POST /api/v1/mutations/production-plan/:plan_id/close-batch
//
// Terminal close for a base-batch plan (item_id NULL + pack_manifest). A base
// batch receives one production_actual per pack-manifest member (linked via
// production_actual.from_plan_id); it does NOT complete through the 1:1
// completed_submission_id path item-linked plans use, so the operator closes
// it explicitly once every product has been reported. The backend returns a
// per-member coverage summary (reported qty vs manifest qty). Planner/admin.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/production-plan/${encodeURIComponent(plan_id)}/close-batch`,
    errorLabel: "production plan close-batch",
  });
}
