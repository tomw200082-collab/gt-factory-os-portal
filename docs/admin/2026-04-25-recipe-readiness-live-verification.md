# Recipe-Readiness Corridor — Live Verification Package

**Status going in:** Implementation passed (18 commits across Chunks 2–6, 127 corridor tests passing, typecheck clean). Live verification is the only gate remaining before the corridor can be claimed complete. Per Tom's standing rule: no "corridor progress" claim until the full admin flow is verified end-to-end against real backend data.

**This document is the runbook for that verification. It does not introduce new features or rewrite anything.**

---

## 1. Environment variables required

The portal proxies every `/api/...` call to a Fastify upstream via `src/lib/api-proxy.ts`. The proxy short-circuits with a 502 if the upstream env var is unset (this is exactly what blocked the in-sandbox walkthrough).

### Minimum required (server-side — Vercel "Environment Variables" → Production)

| Variable | Purpose | Notes |
|---|---|---|
| `API_BASE` | Fastify upstream root, e.g. `https://api.gt-factory.example/...` | Server-side only. Proxy reads this first. **Must be reachable from Vercel's egress.** |
| `NEXT_PUBLIC_API_BASE` | Optional fallback also read by the proxy | Use only if `API_BASE` is unavailable for the target environment. |
| `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` | Toggles the fake-session yellow pill / role switcher | **Production: must be unset or `false`.** Real Supabase auth must own identity. |

### Real-auth path (production target)

If `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` is unset/false, the portal goes through real Supabase Auth → `/api/me` → `private_core.app_users.role`. The verifying user **must have `role = 'admin'`** in `app_users`. If they don't, the Edit / Publish buttons render disabled and live verification is meaningless (same trap as last week).

To check role before starting:

```sql
-- Run against the prod/staging Postgres
SELECT email, role
FROM private_core.app_users
WHERE email = 'tom@gteveryday.com';
-- Expect: role = 'admin'
```

If `role <> 'admin'`, fix it via the appropriate admin user-management surface BEFORE running the walkthrough.

### For local-dev verification (alternative path)

If preferring localhost rather than Vercel:

```bash
# .env.local at project root (DO NOT commit):
API_BASE=https://api.staging.gt-factory.example/...
NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true   # local only
```

With dev-shim on, switch the role pill to `admin` in the top bar before walking the flow.

---

## 2. `TEST_RECIPE_ITEM_ID` requirements

The Playwright spec at `tests/e2e/admin-recipe-readiness-real.spec.ts` self-skips unless `TEST_RECIPE_ITEM_ID` is set. The chosen item must satisfy ALL of:

| Requirement | Why |
|---|---|
| `items.supply_method = 'MANUFACTURED'` | The Recipe-Health card only renders for MANUFACTURED items; BOUGHT_FINISHED / REPACK keep the legacy `MasterSummaryCard` |
| `items.base_bom_head_id IS NOT NULL` | Base track must exist, otherwise the card renders red ("לא ניתן לפרסם") and the publish path can't be exercised |
| `items.primary_bom_head_id IS NOT NULL` | Same for pack track |
| Both BOM heads have at least one ACTIVE version with ≥1 line | Empty version is a backend hard-block (`EMPTY_VERSION`); we want a real clone-and-edit path, not a from-scratch path |
| Both BOM heads' active versions reference only `components` rows with `status = 'ACTIVE'` | INACTIVE component is a UI hard-block; would block publish before we can prove the publish modal A/B/C variants |
| At least ONE component has supplier/price warnings (no primary supplier OR active price age > 90 days) | Required to validate the YELLOW-after-publish CRITICAL acceptance criterion |
| At least ONE component has CLEAN supplier+price | Required to validate the GREEN-after-publish CRITICAL criterion (ideally on a second item — see §4) |
| No `planning_runs.status = 'running'` row referencing the head at the moment of publish | Backend `PLANNING_RUN_IN_FLIGHT` would hard-block; surface that error mid-flow only if specifically validating Variant C |

---

## 3. How to identify a valid item

Run this against the Fastify upstream OR the proxied portal API, with admin credentials:

```bash
# Option A — directly against Fastify upstream
curl -sH "Authorization: Bearer <admin_supabase_jwt>" \
  "${API_BASE}/api/v1/queries/items?supply_method=MANUFACTURED&limit=200" \
  | jq '[.rows[] | select(.base_bom_head_id != null and .primary_bom_head_id != null) | { item_id, item_name, base: .base_bom_head_id, pack: .primary_bom_head_id }]'
```

```bash
# Option B — against the deployed Vercel proxy (already authenticated in the
# browser session; copy the cookie from devtools or use a logged-in fetch)
fetch("/api/items?supply_method=MANUFACTURED&limit=200")
  .then(r => r.json())
  .then(b => console.table(b.rows.filter(r => r.base_bom_head_id && r.primary_bom_head_id)))
```

From the candidate list, pick one item where you can confirm the supplier/price warning state. Use the Master Data Health page at `/admin/masters/health` (already shipped) to spot items with completeness gaps:

```
/admin/masters/health  →  filter by supply_method = MANUFACTURED  →
  pick a row with one or two missing supplier OR stale-price gaps
  AND a sibling clean item for the green-path test
```

Two candidate item IDs ideally:
- **`<ITEM_YELLOW>`** — known to have at least one missing-primary or stale-price component
- **`<ITEM_GREEN>`** — known to be fully sourced + priced

Set them in env:

```bash
export TEST_RECIPE_ITEM_ID=<ITEM_YELLOW>
export TEST_RECIPE_ITEM_ID_GREEN=<ITEM_GREEN>   # optional second pass
```

---

## 4. Exact command sequence

### Path A — Live walkthrough on Vercel (recommended; fastest)

1. **Pre-flight env check** in Vercel Project Settings → Environment Variables → Production:
   - `API_BASE` is set and reachable
   - `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH` is unset or `false`
2. **Confirm latest deploy** — `git log -1 --oneline` on `main`. Should be the post-corridor HEAD. Vercel deploy preview URL ready.
3. **Open browser as admin** (real Supabase magic-link auth). Verify the user's `app_users.role = 'admin'` per §1.
4. **Walk the full flow** — checklist in §5.
5. **Capture screenshots at each step** (browser DevTools → Capture full-size screenshot, or `Win+Shift+S`).

### Path B — Playwright spec against staging (more rigorous; produces trace HTML)

```bash
# In the repo root, against a reachable backend:
cd "C:\Users\tomw2\Projects\window2-portal-sandbox"

# Single-pass — yellow-then-publish path
TEST_RECIPE_ITEM_ID=<ITEM_YELLOW> \
API_BASE=<staging-api> \
NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true \
npm run test:e2e -- admin-recipe-readiness-real

# Trace will be saved to test-results/ on failure
# On pass, run again with --trace=on to keep the trace for evidence:
TEST_RECIPE_ITEM_ID=<ITEM_YELLOW> npx playwright test admin-recipe-readiness-real --trace=on
```

The spec uses Playwright's `baseURL = http://127.0.0.1:3737` and starts a local `next dev -p 3737` automatically (per `playwright.config.ts:23-30`). For staging-backed verification you need a reachable `API_BASE` for the local proxy — local dev proxies to whatever upstream the env var names.

---

## 5. Expected pass/fail evidence (the 10-step golden path)

Walk each step. Capture a screenshot or note at each. Pass = every row PASS; any FAIL = corridor not complete.

| # | Step | Pass evidence | Fail evidence |
|---|---|---|---|
| 1 | Open `/admin/masters/items/<ITEM_YELLOW>` as admin | Recipe-Health card renders with eyebrow "Admin · Masters", title = item name, and **two tracks side-by-side on desktop** ("בסיס המוצר" + "אריזת המוצר"). Top-line shows yellow "מוכן לייצור עם אזהרות" badge with N warnings count | Page 502s, blank card, or top-line green when warnings exist (false-green = CRITICAL fail) |
| 2 | Resize browser to 375px width | Tracks stack vertically full-width; no horizontal scroll; readiness summary still readable | Horizontal scroll appears; tracks shrink-overlap; text clipped |
| 3 | Click `[Edit recipe →]` on the **base** track | Spinner "Creating draft v{N+1} from v{active}…" briefly; then navigation to `/admin/masters/boms/<base_head>/<new_version_id>/edit`; URL changes; sticky DRAFT pill visible in editor header | 404 on edit route; navigation but no DRAFT pill; backend returns 409 VERSION_NOT_DRAFT |
| 4 | Edit the first line's qty (e.g. change `100` → `99`) | Inline input opens, typing works, blur/Enter triggers PATCH; line refreshes with new value; pip color recomputes | PATCH returns 422 "missing field" → critical contract mismatch (see §6 rollback) |
| 5 | Open ReadinessPanel (mobile: bottom-drawer button "⚠ N warnings"; desktop: right-side panel) | Panel lists every component referenced in the draft, one row each; row for the "yellow" component shows 🟡 + "אין ספק ראשי" (or "מחיר ישן (Nd)") + `[Fix]` button | Panel doesn't render; component list missing rows; no Fix button on yellow rows |
| 6 | Click `[Fix]` on a missing-primary-supplier row → drawer opens with Action A list | Drawer shows existing supplier_items as radio rows (supplier name, lead, MOQ, std cost). Selecting one + Save → single PATCH with `is_primary: true` (confirm in DevTools Network tab) | Multiple PATCHes (would mean we accidentally implemented client-side demote-then-promote — spec §6.5 forbids); 422 on PATCH; drawer doesn't close on success |
| 7 | After save, the drawer closes and the panel re-queries | Yellow pip flips to green for that component; warnings count in track summary decrements | Panel still shows old data (cache invalidation broken); component now shows "no primary" still (server didn't atomically demote-then-promote — defensive 409 should surface) |
| 8 | Click `Publish` (Variant B path — UI warnings remaining from other components) | Modal opens with required confirm checkbox "אני מאשר את האזהרות הללו"; button disabled until checked; on Publish → POST with `confirm_override: true`; redirect back to product page | Modal opens but Publish button enabled without checkbox; POST sent with `confirm_override: false` (means Variant B path is broken); redirect doesn't fire |
| 9 | Back on product page, Recipe-Health card refreshes | Top-line **YELLOW** "מתכון פורסם עם אזהרות רכש/מחיר" (CRITICAL — must NOT be green when supplier/price gaps remain) | Top-line GREEN despite open warnings = **CRITICAL fail** per spec §5 |
| 10 | Repeat 3-9 with `<ITEM_GREEN>` (no warnings) | Variant A modal (no checkbox); Publish without override; on return, top-line **GREEN** "מוכן לייצור" | Top-line YELLOW despite all readiness clean = false-yellow (less critical but still a fail) |

**Bonus:** open `/admin/masters/items/<ITEM_YELLOW>` again, scroll past the card, click `▶ היסטוריית גרסאות` — the new published version should appear with its label, status ACTIVE, and timestamps. Old version should be SUPERSEDED. If still a DRAFT for either head exists, an admin sees `[Resume editing →]`.

---

## 6. Rollback note — if live verification exposes a contract mismatch

The cross-chunk audit fixed every backend-shape mismatch we knew about. If live verification still surfaces one (e.g. backend rejects `final_component_qty` because the actual field is `quantity`), the response is structured:

1. **Stop** — do not work around it in the UI by inventing client-side massaging. The spec forbids UI inventing backend truth.
2. **Capture the evidence:** request URL, request body, response status, response body. Paste into the report.
3. **Decide path:**
   - **A. Plan-side fix:** if the field-name is wrong on our side, the plan + corridor commits need a typed correction. Range to revise: the affected mutation in Chunks 3 / 5 / 6. Single follow-up commit; corridor still claimable after.
   - **B. Backend-side fix:** if the backend has an actual bug (wrong field rejected, missing idempotency-key validation, etc.), open a backend ticket. **Corridor stays "implemented + tested, blocked on backend"** until W1 ships the fix. Do NOT relax the UI gate.
4. **Revert option (worst case):** if a contract mismatch is so severe it would mislead operators (e.g. a successful HTTP 200 actually means a no-op server-side), revert all 18 corridor commits with `git revert d911b01..HEAD` (range from first Chunk-3 wire-up onwards), keep Chunk 1 foundation in place. Document the root cause and re-plan.

The corridor's hard-stop conditions from your last instruction are ALL still in force during live verification. Adding new ones isn't permitted; loosening them isn't either.

---

## 7. Post-verification report template (use this verbatim)

When you've walked the flow, fill this in and post it back:

```
Live verification — Recipe-Readiness Corridor
Verified by: <name>
Verified at: <ISO timestamp>
Backend target: <API_BASE host>
Vercel deploy URL: <url>
TEST_RECIPE_ITEM_ID: <id>
TEST_RECIPE_ITEM_ID_GREEN: <id or "n/a">

Steps 1-10 (per §5):
 1. <PASS|FAIL — short note>
 2. <PASS|FAIL — short note>
 ...
10. <PASS|FAIL — short note>

Bonus version-history check: <PASS|FAIL>

Screenshots / Playwright trace: <links or paths>

Verdict:
[ ] All 10 PASS — corridor COMPLETE
[ ] At least one FAIL — corridor NOT complete; details below

Failures detail (if any):
 - Step <N>: <what happened, including HTTP body if mismatch>
 - Recommended path per §6 rollback note: A / B / revert
```

---

## 8. Follow-up tickets (DO NOT execute now — backlog only)

These are the deferrals captured during the corridor execution. They are real but bounded; flag and queue.

### FUP-1: EntityPickerPlus replacement for component picker in BomLineAddDrawer

**Where:** `src/components/bom-edit/BomLineAddDrawer.tsx` currently uses a plain `<input name="component_id">` for the Add-line drawer. Spec §6.3 calls for `EntityPickerPlus` with searchable component picker filtered by `component_class`.

**Why deferred:** `EntityPickerPlus` requires the caller to pass an `options: EntityOption[]` array fetched separately. Wiring a self-fetching variant would have ballooned Task 3.6 scope.

**Effort estimate:** small (1–2 tasks). Add a `useQuery(['/api/components'])` inside the drawer, map to `EntityOption`, swap `<input>` for `<EntityPickerPlus options={...} />`. Submitted body shape is unchanged; existing test still validates the contract.

**Acceptance:** add-line flow still passes existing tests + a new one that asserts the picker filters by typed prefix.

### FUP-2: `items-bom-display-only.test.ts` baseline cleanup

**Where:** `tests/unit/admin/items-bom-display-only.test.ts` (5 failing cases on Chunk 1 HEAD `2077089`, predates this corridor).

**Why deferred:** Out of corridor scope; failures are not caused by anything the corridor changed (verified by checkout-and-rerun on the pre-corridor commit).

**Effort estimate:** unknown until investigated. Could be a stale fixture, a moved API field, or a real regression that was overlooked.

**Acceptance:** all 5 cases pass OR the test file is updated to reflect the actual current contract with a clear commit message explaining what changed.

### FUP-3: Stronger E2E once a seed item exists

**Where:** `tests/e2e/admin-recipe-readiness-real.spec.ts` is currently a single happy-path (clone → edit qty → publish-clean). Three additional flows worth pinning once a stable seed item is configured:

- Variant B (publish-with-warnings) — confirm checkbox required, `confirm_override: true` in POST body
- Variant C (hard-block) — empty-version case; assert no Publish button rendered
- Swap-primary flow — Action C side-by-side confirm pane, single PATCH per swap

**Why deferred:** the existing single-path spec is already self-skip-protected; adding more paths requires additional seed-item state guarantees.

**Effort estimate:** medium (3 additional Playwright cases + a small seed-data helper or fixture script).

**Acceptance:** the four Playwright cases all pass against staging; seed-data setup is documented in this file's §3.

---

## 9. Standing constraints (still in force; do not relax)

- No backend changes during live verification. If a contract mismatch surfaces, follow §6 — never massage the UI to hide the mismatch.
- No corridor-complete claim until §5 steps 1–10 all pass live. Implementation passing + tests green is "implemented + tested," not "delivered."
- The yellow-after-publish-with-warnings rule (Step 9) is the single most likely place for silent regression. Verify it explicitly even if every other step passes.
