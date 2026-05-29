import { proxyRequest } from "@/lib/api-proxy";

// POST /api/planning/generate-drafts
//   → /api/v1/mutations/planning/generate-drafts
//
// Weekly cadence (Brick A) — the cockpit's "Generate / refresh drafts" action.
// Runs the two draft engines (tea + matcha) so the Thursday cockpit has draft
// batches to review and firm. Idempotent regeneration of the unlocked horizon;
// firmed ('planned') rows are untouched. planner/admin only; 503 under
// break-glass (enforced upstream).
//
// Body: { idempotency_key: string }.
// Returns: { tea_proposal_id, matcha_proposal_id, draft_total_upcoming,
//            generated_at, idempotent_replay }.
//
// Backend: gt-factory-os/api/src/planning/handler.generate_drafts.ts + route.ts.

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/planning/generate-drafts",
    errorLabel: "planning generate drafts",
  });
}
