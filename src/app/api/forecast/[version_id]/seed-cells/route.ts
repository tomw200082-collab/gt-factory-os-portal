// ---------------------------------------------------------------------------
// Portal proxy — POST /api/forecast/:version_id/seed-cells
//
// Mirrors upstream POST /api/v1/mutations/forecast/:version_id/seed-cells
// authored by W1 (cycle 10, evidence: forecast_seed_cells_checkpoint.md,
// signal #27 RUNTIME_READY(ForecastSeedCells) emitted 2026-05-01T23:55:00Z).
//
// Singular "forecast" path is intentional per W1 task spec §4. The URL
// segment is the only difference from the rest of the forecasts/* proxy tree
// (which uses plural "forecasts"); both shapes coexist as separate Next.js
// route trees.
//
// Body (forwarded verbatim): { idempotency_key: string }
// Status codes preserved verbatim from upstream:
//   200 → { submission_id, version, added_count, expected_cells, total_cells,
//           all_seeded, idempotent_replay }
//   401 → missing auth
//   403 → viewer / operator caller
//   404 → { reason_code: 'VERSION_NOT_FOUND', detail }
//   409 → { reason_code: 'ILLEGAL_STATUS_TRANSITION' | 'CADENCE_NOT_SUPPORTED'
//           | 'SITE_NOT_SUPPORTED' | 'VERSION_CONFLICT' | 'FROZEN_PERIOD'
//           | 'IDEMPOTENCY_KEY_REUSED', detail }
//   422 → Zod validation
//   503 → { error: 'BREAK_GLASS_ACTIVE' }
// ---------------------------------------------------------------------------

import { proxyRequest } from "@/lib/api-proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/forecast/${encodeURIComponent(version_id)}/seed-cells`,
    errorLabel: "forecast seed-cells",
  });
}
