import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/boms/versions/[version_id]/lines/[line_id] — dual-method proxy.
//
// PATCH  → Fastify PATCH  /api/v1/mutations/boms/versions/:version_id/lines/:line_id
//          Edit a DRAFT line. Body: { final_component_id?, final_component_qty?,
//          if_match_updated_at, idempotency_key }. Returns 200 with the
//          updated row; 409 STALE_ROW on mismatched if_match_updated_at; 409
//          VERSION_NOT_DRAFT if the version is no longer DRAFT; 422 Zod.
//
// DELETE → Fastify DELETE /api/v1/mutations/boms/versions/:version_id/lines/:line_id
//          Hard-DELETE a DRAFT line (A13 §1 of backend checkpoint — DRAFT
//          lines have no downstream history implications, so physical
//          DELETE inside the same transaction as change_log BOM_LINE_DELETED
//          is the schema-appropriate shape). Body: { idempotency_key }.
//          Returns 200 on success; 409 VERSION_NOT_DRAFT if the version is
//          not DRAFT (defense-in-depth — client also gates via status check).
//
// AMMC v1 Slice 6 UI. Admin-only upstream. Backend commit: canonical ac75ed1
// (Railway redeploy ff39932c-750e-4f43-8721-26cb69beba07).
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ version_id: string; line_id: string }> },
): Promise<Response> {
  const { version_id, line_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/boms/versions/${encodeURIComponent(version_id)}/lines/${encodeURIComponent(line_id)}`,
    errorLabel: "bom line patch",
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ version_id: string; line_id: string }> },
): Promise<Response> {
  const { version_id, line_id } = await params;
  return proxyRequest(req, {
    method: "DELETE",
    upstreamPath: `/api/v1/mutations/boms/versions/${encodeURIComponent(version_id)}/lines/${encodeURIComponent(line_id)}`,
    // DELETE body forwarding — proxy default gates on method membership
    // (POST/PUT/PATCH). Line-delete upstream accepts { idempotency_key }
    // in the body, so forward it explicitly.
    forwardBody: true,
    errorLabel: "bom line delete",
  });
}
