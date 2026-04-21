import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/suppliers/[supplier_id]/status — proxy to Fastify
//   POST /api/v1/mutations/suppliers/:supplier_id/status
//
// AMMC v1 Slice 2: admin-only status toggle.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ supplier_id: string }> },
): Promise<Response> {
  const { supplier_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/suppliers/${encodeURIComponent(supplier_id)}/status`,
    errorLabel: "suppliers status",
  });
}
