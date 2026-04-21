import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/supplier-items/[supplier_item_id]/readiness — proxy to Fastify
//   GET /api/v1/queries/supplier-items/:supplier_item_id/readiness
//
// AMMC v1 Slice 5 UI: single supplier_item full readiness payload. Returns
// the { is_ready, readiness_summary?, blockers[] } shape. Read-only; any
// authenticated role allowed upstream. 422 on malformed uuid; 404 on unknown
// id; 200 on match. W1 backend landed at canonical 0d406c8 (Railway redeploy
// 15ae0eae-8ff1-45d8-a044-170266f1cfc3). View backing:
// api_read.v_supplier_item_readiness (migration 0069, plan §E.4).
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ supplier_item_id: string }> },
): Promise<Response> {
  const { supplier_item_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/supplier-items/${encodeURIComponent(supplier_item_id)}/readiness`,
    errorLabel: "supplier-item readiness",
  });
}
