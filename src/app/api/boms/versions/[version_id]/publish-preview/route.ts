import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/boms/versions/[version_id]/publish-preview — proxy to Fastify
//   GET /api/v1/queries/boms/versions/:version_id/publish-preview
//
// AMMC v1 Slice 6 UI (crystalline-drifting-dusk §F.4 + §I.1). Read-only
// preflight report consumed by the BOM editor before enabling the Publish
// button. Any authenticated role (read-only). Returns the decision matrix:
//   {
//     version_id, version_status,
//     is_empty,               // A — hard blocker if true
//     line_count,
//     running_planning_runs,  // B — array of { planning_run_id, started_at,
//                             //     triggered_by_display_name, ... };
//                             //     non-empty = hard blocker
//     unposted_production_actuals, // C — soft warning requiring override
//     blocking_issues: string[],   // e.g. ['EMPTY_VERSION', 'PLANNING_RUN_IN_FLIGHT']
//     warnings: string[],           // e.g. ['UNPOSTED_PRODUCTION_ACTUALS']
//     can_publish_clean: boolean,
//     can_publish_with_override: boolean,
//   }
//
// The UI renders the Publish button disabled if !can_publish_with_override
// and renders a confirmation dialog with override checkbox when
// can_publish_clean=false but can_publish_with_override=true. Per backend
// checkpoint A13 §3, preflight C is currently a no-op guardrail (posted_at
// NOT NULL on production_actual) but the shape is retained verbatim for
// future-proofing.
//
// Backend commit: canonical ac75ed1 (Railway redeploy
// ff39932c-750e-4f43-8721-26cb69beba07).
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/boms/versions/${encodeURIComponent(version_id)}/publish-preview`,
    errorLabel: "bom version publish preview",
  });
}
