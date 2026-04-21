import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/boms/versions/[version_id]/publish — proxy to Fastify
//   POST /api/v1/mutations/boms/versions/:version_id/publish
//
// AMMC v1 Slice 6 UI (crystalline-drifting-dusk §F.4 publish safety +
// §I.1 publish hard-stop). Promotes a DRAFT bom_version → ACTIVE after
// running the backend preflight (A/B/C):
//   A. EMPTY_VERSION check (hard stop — no confirm_override possible)
//   B. PLANNING_RUN_IN_FLIGHT check against any `planning_runs` row with
//      status='running' whose production-type recommendations resolve to
//      this head (hard stop — operator must wait)
//   C. Unposted production_actual snapshots against the current active
//      version (soft warning — requires confirm_override=true in the body)
//
// Body: { if_match_updated_at, idempotency_key, confirm_override?: boolean }.
// Returns 200 with { submission_id, bom_version_id, bom_head_id,
// previous_active_version_id, activated_at }; 409 EMPTY_VERSION;
// 409 PLANNING_RUN_IN_FLIGHT with { running_planning_runs: [...] };
// 409 VERSION_NOT_DRAFT; 409 STALE_ROW; 422 Zod. On success, the backend
// transactionally demotes the prior active, promotes this version, emits
// change_log BOM_VERSION_PUBLISHED, and opens an info-severity exception
// `bom_version_published` with an affected_planners array.
//
// Backend commit: canonical ac75ed1 (Railway redeploy
// ff39932c-750e-4f43-8721-26cb69beba07).
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/boms/versions/${encodeURIComponent(version_id)}/publish`,
    errorLabel: "bom version publish",
  });
}
