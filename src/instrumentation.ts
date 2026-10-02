// Runs once per server instance, before any request. A deployment always verifies TLS:
// NODE_TLS_REJECT_UNAUTHORIZED=0 in its environment is dropped (tranche 199). Node runtime only:
// the edge runtime's env is a copy that Node's TLS layer never reads, so only deleting the
// Vercel project variable covers the middleware.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL && process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    console.error("NODE_TLS_REJECT_UNAUTHORIZED=0 is set on this deployment and was ignored. Remove it from the Vercel project.");
  }
}
