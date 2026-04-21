import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/supplier-items/[supplier_item_id]/status — proxy to Fastify
//   POST /api/v1/mutations/supplier-items/:supplier_item_id/status
//
// AMMC v1 Slice 2: admin-only status toggle.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ supplier_item_id: string }> },
): Promise<Response> {
  const { supplier_item_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/supplier-items/${encodeURIComponent(supplier_item_id)}/status`,
    errorLabel: "supplier-items status",
  });
}
