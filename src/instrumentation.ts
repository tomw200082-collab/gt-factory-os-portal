// Runs once per server instance, before any request. A deployment always verifies TLS:
// NODE_TLS_REJECT_UNAUTHORIZED=0 in its environment is dropped (tranche 199).
export function register() {
  if (process.env.VERCEL && process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    console.error("NODE_TLS_REJECT_UNAUTHORIZED=0 is set on this deployment and was ignored. Remove it from the Vercel project.");
  }
}
