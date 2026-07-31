# Tranche 157 — the Users page can actually hand out passwords

**Status:** built — tsc 0, eslint 0, vitest 1148/1148 (was 1137/1137; +11 new)
**Origin:** Tom, 2026-07-31, in writing, with a screenshot of `/admin/users` showing every row reading
*"No password set"* under a red *"Password control is not configured on this deployment
(SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD_DISPLAY_KEY missing)"*:
*"שים לכולם את הסיסמאות שלהם שאראה אותן בדף המשתמשים באדמין ושאוכל לשנות בקלות משם הכל."*
sizing: S
scorecard_target_category: admin_surface
expected_delta: the owner opens `/admin/users`, gives every user a password in one action, reads them
on the page, and types a specific one for anyone who needs it — without leaving the row or touching a
deployment console.

## 1. Why nothing worked

Tranche-scope note: the Users password control shipped in PR #195 (portal) against PR #192 (API,
migration 0300). The code was complete and the migration is applied in production —
`private_core.app_users.password_encrypted` exists. The feature was nevertheless dead on the
deployment, and the red text in Tom's screenshot is the API's own 503: `ADMIN_PASSWORD_DISPLAY_KEY`
was never provisioned on the Railway API service, so `getPasswordDisplayKey()` returned null and
every `Generate` refused before it started.

So the surface was not broken. It was un-provisioned, and it announced that in a sentence naming two
environment variables — which is a correct thing for a log line to say and a useless thing to say to
the person trying to give a warehouse operator a password.

## 2. The fix, in the layer where it belongs

**The display key provisions itself** (API, `password_crypto.ts`). Key resolution is now:
explicit `ADMIN_PASSWORD_DISPLAY_KEY` → otherwise HKDF-SHA256 over `SUPABASE_SERVICE_ROLE_KEY` under
a fixed salt/info → otherwise null.

The reasoning: the service role key is *already required* to set a password at all — it is what
authenticates the Supabase Auth Admin call that actually changes the credential. A deployment that
can set a password can therefore always also encrypt it for display, and there was never a state
worth having where the first half works and the second half refuses. The second secret bought
nothing but an outage. An explicit key still wins when one is set, for anyone who wants the display
cache rotatable on its own schedule.

HKDF is one-way, so the derived key cannot be walked back to the service role key. What is protected
here is a cache of a secret this system itself just issued, behind an admin-only route — not a
user-chosen credential, which Supabase stores as a bcrypt hash and nobody, including this code, can
read back.

**The 503 now names what is actually absent** rather than listing two variables and letting the
reader guess which one.

## 3. What the page can do now

| Control | Where | What it does |
|---|---|---|
| `Generate` / `Regenerate` | per row | unchanged — a fresh generated password, revealed in place |
| `Type one` | per row | an inline field: the admin types the exact value, confirms, it is live |
| `Set for the N without one` | table toolbar | walks every listed user that has no password, one at a time, revealing each as it lands |
| `Show all` / `Hide all` | table toolbar | reveals every already-set password in the list at once |

**Why `Type one` exists.** "שאוכל לשנות בקלות משם הכל" — a generated string is fine when you are
mailing it, and wrong when you are standing next to someone reading it off a screen. The field is
`type="text"` on purpose: the admin is choosing a value they are about to hand over out loud, and
masking it would only hide typos. It refuses <6 or >72 characters and surrounding whitespace while
typing, mirroring the API schema so a doomed request is never sent — and the API stays the authority.

**Why the bulk action skips users who already have one.** "שים לכולם" reads as *everybody ends up
with a password*, not *everybody's password changes*. Regenerating over a password somebody is
already signing in with would silently lock them out for no reason the admin asked for. The button
names its own scope, and the per-row `Regenerate` remains the way to deliberately replace one.

**Why bulk reveals as it goes.** There is no second chance to read a generated value — it exists on
screen or it is gone. The bulk run therefore leaves every new password visible rather than requiring
a second click per row to see what it just created.

**Why the walk is sequential.** Ordered `change_log`, no burst against Supabase Auth, and one row's
failure is reported against that row while the rest still complete.

## 3b. Follow-up in the same tranche — the page stopped speaking in environment variables

After the portal shipped and the API had not yet been redeployed, Tom hit `Type one`, typed a
password, pressed Save, and the row answered:

> Password control is not configured on this deployment (SUPABASE_SERVICE_ROLE_KEY /
> ADMIN_PASSWORD_DISPLAY_KEY missing).

That is the API's `detail` reaching the page verbatim. It is the right sentence for a log line and
the wrong one for the person trying to give a warehouse operator a password: they cannot act on it,
and — worse — they cannot tell a *missing variable* from a *stale deployment*, so it points at the
wrong fix. It also breaks the operator-language rule the rest of the portal holds to.

`passwordOpErrorMessage()` now maps `NOT_CONFIGURED` to operator wording that names the actual next
step ("the server needs its API redeployed… ask for a deploy"), and deliberately says nothing about
which secret — from the page the two causes are indistinguishable and the remedy is the same either
way. Every other reason code keeps the server's own text, because for `REJECTED_BY_AUTH` that text
*is* the answer ("Password is known to be weak and easy to guess") and replacing it would lose
information.

Kept in `_lib/password-rules.ts` next to the validation mirror: both are "what this page knows about
passwords without asking the server", and both are pure and tested.

## 4. Scope

Portal (this repo):
- `src/app/(admin)/admin/users/page.tsx` — `PasswordCell` extracted; `Type one` editor; toolbar with
  bulk set / show all / hide all; progress + summary banner.
- `src/app/(admin)/admin/users/_lib/password-rules.ts` (+ `.test.ts`) — the client-side mirror of the
  API schema, extracted so the rule that must not drift from the backend is a tested pure function
  rather than a closure inside a page component; plus `passwordOpErrorMessage()` (§3b).

API (`gt-factory-os`, same branch, separate PR):
- `api/src/users/password_crypto.ts` — derived-key fallback + `getPasswordDisplayKeySource()`.
- `api/src/users/schemas.ts` — `AdminSetPasswordSchema`; `REJECTED_BY_AUTH` reason code.
- `api/src/users/password_handler.ts` — optional chosen password; 4xx from Supabase → 422, not 502.
- `api/src/users/supabase_auth_admin.ts` — carry the upstream status on the thrown error.
- `api/src/users/route.ts` — parse the body.
- `.env.example` — `ADMIN_PASSWORD_DISPLAY_KEY` documented as optional.

No schema change. Migration 0300 is already applied in production.

## 5. Checklist

- [x] tsc 0 (portal)
- [x] eslint 0 (portal, changed dir)
- [x] API unit tests — `password_crypto` 13/13, `supabase_auth_admin` 6/6
- [x] API route tests — `admin_user_password_set` 11/11, and 39/39 with `admin_user_update`,
      `password_crypto`, `supabase_auth_admin`, `shared_change_log`. Run against a **throwaway local
      Postgres 16** stood up in the session (migration chain applied, CD-test fixture users seeded),
      not production — the suite refuses production by design and the override was not used.
      **The suite was red on the original 0300 commit** (5 of 6, confirmed at `HEAD~1`): every call
      sent `content-type: application/json` with no body, which Fastify rejects at the content-type
      parser before any handler runs. Fixed in the API PR. It stayed invisible because
      `phase10-node-tests.yml` is `workflow_dispatch`-only and names three cogs files — **this suite
      is in no automatic gate**, which is also how a feature that was dead on the deployment shipped
      green. The API repo's only automatic PR check, `typecheck.yml`, runs the *root* tsconfig, whose
      `include` is `scripts/**/*.ts` — it does not compile `api/` at all.
- [x] portal vitest 1148/1148 (was 1137/1137; the 11 new cover `password-rules` —
      validation mirror and error wording)
- [ ] verified on the deployment after the API PR merges and Railway redeploys

## 6. Known, out of scope

`api/src/purchase-session/handler.actions.ts:183` fails `tsc` on this branch *before* any change in
this tranche (verified by stashing). Pre-existing, different lane, untouched here.
