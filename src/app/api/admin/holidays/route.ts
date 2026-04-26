import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET / PATCH /api/admin/holidays — Israel holidays admin (NOT YET WIRED).
//
// Per inventory_flow_contract.md §7.4 the upstream Fastify endpoints
// (GET /api/v1/queries/admin/holidays + PATCH /api/v1/admin/holidays/:date)
// are NOT YET BUILT as of 2026-04-26. W1 will land them in a follow-on
// cycle. This stub returns 503 SERVICE_UNAVAILABLE so the portal page can
// render an honest "not yet wired" empty state without 500-ing.
//
// Tracking key: UNRESOLVED-IF-ADMIN-HOLIDAYS-API.
// ---------------------------------------------------------------------------

const NOT_YET_WIRED_BODY = {
  error: "NOT_YET_WIRED",
  message:
    "Backend admin holidays endpoint not yet built. Holiday data is seeded from Hebcal (75 rows for 2026–2028); admin override UI activates once W1 lands the CRUD handler. See UNRESOLVED-IF-ADMIN-HOLIDAYS-API.",
};

export function GET(): Promise<Response> {
  return Promise.resolve(
    NextResponse.json(NOT_YET_WIRED_BODY, { status: 503 }),
  );
}

export function PATCH(): Promise<Response> {
  return Promise.resolve(
    NextResponse.json(NOT_YET_WIRED_BODY, { status: 503 }),
  );
}
