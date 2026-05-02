// ---------------------------------------------------------------------------
// /api/admin/holidays/[holiday_date] — edit (PATCH) + soft-archive (DELETE)
// proxy.
//
// Mirror-only. Forwards to upstream Fastify endpoints landed by W1 cycle 7
// (signal #25 RUNTIME_READY(AdminHolidays)):
//
//   PATCH  /api/v1/mutations/admin/holidays/:holiday_date — admin only edit
//   DELETE /api/v1/mutations/admin/holidays/:holiday_date — admin only archive
//
// Per W1 schemas:
// - PATCH body: subset of editable fields; holiday_date in body is rejected
//   with 422 PRIMARY_KEY_IMMUTABLE per spec §4.3 / AHC-5.
// - DELETE body: { reason: string (1..2048), idempotency_key?: string } —
//   reason is REQUIRED per dispatch row 4. 422 if missing or empty.
//   archived_at is set on success (soft-delete per CLAUDE.md +
//   spec §9 row 1).
// ---------------------------------------------------------------------------

import { proxyRequest } from "@/lib/api-proxy";

interface RouteContext {
  params: Promise<{ holiday_date: string }>;
}

export async function PATCH(
  req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { holiday_date } = await ctx.params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/admin/holidays/${encodeURIComponent(
      holiday_date,
    )}`,
    errorLabel: "admin holidays edit",
  });
}

export async function DELETE(
  req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { holiday_date } = await ctx.params;
  return proxyRequest(req, {
    method: "DELETE",
    upstreamPath: `/api/v1/mutations/admin/holidays/${encodeURIComponent(
      holiday_date,
    )}`,
    forwardBody: true,
    errorLabel: "admin holidays archive",
  });
}
