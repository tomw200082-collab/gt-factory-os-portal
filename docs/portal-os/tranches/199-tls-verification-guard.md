# Tranche 199 — TLS verification on every deployment

**Status:** in progress on `claude/tls-verify-guard`.
**Origin:** Tom, 2026-10-02: investigate and safely fix `NODE_TLS_REJECT_UNAUTHORIZED=0` without breaking integrations.

## Finding

- The production runtime logs Node's warning that `NODE_TLS_REJECT_UNAUTHORIZED` is `0`.
  - It has appeared since 2026-06-16.
  - On 2026-10-02 it showed up 16 times on deployment `dpl_Ghsx6Ck5BTQ7DSbZFbGCP7R6mwjq`, from the middleware and from API routes.
  - With it, every outbound call skips certificate checks.
- The flag is not in the code. It is a Vercel project environment variable, and this session cannot read or edit those (403).
- The portal server reaches two hosts only:
  - the API, `gt-factory-os-api-production.up.railway.app`, with a Let's Encrypt `*.up.railway.app` certificate valid to 2026-12-26;
  - Supabase, `rvadsozabmxkkrktwgnv.supabase.co`, with a Google Trust Services `*.supabase.co` certificate valid to 2026-11-24.

  Both verify. Nothing needs the flag.

## Change

- `src/instrumentation.ts` `register()` runs once per server instance, before any request. On a Vercel deployment, if the flag is `0`, it deletes it and logs one line.
- A local run is left untouched.
- Proven in Node: with the flag at `0`, a self-signed server is accepted. After `delete`, the same process refuses it (`DEPTH_ZERO_SELF_SIGNED_CERT`).
- Proven in a `next build` + `next start` with `VERCEL=1`: the line is logged before Ready, and Node's TLS warning never appears.

### Production finding after the first deploy

Deployment `dpl_BXaMEDsiPqzaWuWWLTRwXcKiRinb`, 14:37 UTC: Node's TLS warning still appeared in `edge-middleware`, and that request reached Supabase (`/auth/v1/user` 403).

- Middleware runs in the edge sandbox. There, `process.env` is a copy that Node's TLS layer never reads, so the delete does not reach it.
- Worse, the guard's line there claimed the flag "was ignored", which was not true.
- Fix: the guard now runs only when `NEXT_RUNTIME === "nodejs"`, which covers the API routes that carry the Bearer token to the API.
- **The middleware, which talks to Supabase, is covered only by deleting `NODE_TLS_REJECT_UNAUTHORIZED` from the Vercel project.** This session cannot do that (403); Tom does it in the dashboard. Nothing needs the variable: both upstream certificates verify.

## Manifest

manifest:
  - docs/portal-os/tranches/199-tls-verification-guard.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/instrumentation.ts
  - tests/unit/instrumentation-tls.test.ts

## Gates

- Red-first unit test 2/2: the guard removes the flag on a deployment and leaves a local run alone.
- vitest, typecheck, lint, build.
- After deploy:
  - no Node TLS warning in the runtime logs;
  - the guard's line is present;
  - API routes answer as before.

## Rollback

Revert the merge commit.
