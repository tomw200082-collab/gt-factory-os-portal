// EMERGENCY DEBUG — trivial route handler with zero dependencies.
// Path: /api/auth/debug-ping
// (in /api/auth/* which is in middleware's isPublicPath — no auth required)
// Returns: 200 + minimal JSON, instantly.
// If THIS hangs on Vercel, the entire route handler runtime is broken.
// Remove after diagnosis.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
