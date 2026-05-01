import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/inbox/credit/[exception_id]/approve — credit-needed Approve stub.
//
// Per W4 Doc B §3.2 (`docs/integrations/lionwheel_credit_inbox_contract.md`)
// the upstream Fastify endpoint is
//   POST /api/v1/mutations/lionwheel/credit-needed/approve
// which is NOT YET BUILT. W1 authors it under a future
//   RUNTIME_READY(LionWheelCreditInbox)
// dispatch (plan-of-record §Chunk 5b — Inbox runtime). Until then this stub
// returns 503 NOT_YET_WIRED so the portal credit-detail page renders an
// honest "ה-backend עדיין לא חי — האישור ייכנס אחרי soak" status without
// 500-ing.
//
// Mirrors the precedent of /api/admin/holidays/route.ts (cycle 6.5,
// 2026-04-26).
//
// Tracking key: UNRESOLVED-LWCI-APPROVE-API.
// Mode: B-LionWheelCreditInbox-NightRun (Tom auth 2026-04-30 + plan §5b).
// ---------------------------------------------------------------------------

const NOT_YET_WIRED_BODY = {
  error: "NOT_YET_WIRED",
  message:
    "Backend credit-needed Approve endpoint not yet built. W1 lands it post-soak per plan-of-record §Chunk 5b. See UNRESOLVED-LWCI-APPROVE-API.",
};

export function POST(): Promise<Response> {
  return Promise.resolve(
    NextResponse.json(NOT_YET_WIRED_BODY, { status: 503 }),
  );
}
