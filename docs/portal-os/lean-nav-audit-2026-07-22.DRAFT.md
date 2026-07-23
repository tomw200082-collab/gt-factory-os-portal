# Lean-Nav Audit — 2026-07-22 (DRAFT)

status: DRAFT — read-only audit + planning artifact. No source change, no registry entry, no `_active.txt` change.
author: portal audit session, Tom directive 2026-07-22 ("the portal is cumbersome; leaner, clearer navigation; improve existing surfaces, don't add pages").
inputs:
- `gt-factory-os-production-brain/docs/factory-mapping/2026-07-22-mapping-v3-followup-questions.md` (decisions Q5/Q6/Q10 + lean principle in header)
- `src/lib/nav/manifest.ts` (NAV_MANIFEST — single truth for sidebar)
- `src/components/layout/SideNav.tsx`, `TopBar.tsx` (rendering rules)
- `src/features/home/cockpit.ts` (ROLE_COCKPIT / HOME_TILES)
- `src/lib/auth/authorize.ts` (role×capability lattice), `src/lib/auth/role-gate.tsx`, `src/middleware.ts` (ROLE_GATES)
- `docs/portal-os/route-manifest.json`, `quarantine.json`, `registry.md` (tranches 121–135)

---

## 1. How navigation is gated today (verified)

Four layers, one truth source:

1. **`NAV_MANIFEST`** (`src/lib/nav/manifest.ts`) — 7 groups: Overview (2, `placement:"top"` → TopBar), Inbox (Inbox top + Credit Tracking side), Stock (6), Planning (10), Purchase Orders (2), Admin (17), Me (1). Stock/Planning/PO/Admin are collapsible + default-collapsed (tranche 090 progressive disclosure).
2. **Per-item gates**: `min_role` (coarse floor: viewer<operator<planner<admin) hides the row entirely; `required_capability` checked via `authorizeCapability()` renders the row **subdued with a padlock** (deliberate "truthfulness rule": show why, don't pretend it doesn't exist).
3. **Layouts** (`RoleGate minimum="…"`) + **`middleware.ts` ROLE_GATES** enforce the same lattice at the route level — nav pruning never removes access, only visibility.
4. **`/home` cockpit** (`src/features/home/cockpit.ts`) — role-tailored: primary hero tile + ordered groups per role; same two checks (`meetsMinRole` + `authorizeCapability`); viewer cockpit is the Hebrew/RTL bookkeeper view (CLAUDE.md exception 2026-06-26).

Capability lattice (authorize.ts): viewer = read/read/read; operator = stock:execute, planning:read; planner = stock:execute, planning:execute+override; admin = everything.

## 2. Persona → role mapping (and the mismatch)

| Person | Job (mapping v3) | Portal role today | Cockpit they actually get |
|---|---|---|---|
| Dennis | production operator (6:00 production, gr_entry per Q10, flagged RM counts) | **no account yet** → would be `operator` | operator: primary `/stock/production-actual`, English |
| Maxim | FG warehouse + picking + Thursday FG count | **no account confirmed** → `operator` | operator (same cockpit as Dennis — no differentiation) |
| Dorin | bookkeeper/office (placement queue, credits, payments) | **`planner`** (FLOW-8 closed by Tom, tranche 131: "Doreen = planner, already true live in DB") | planner: primary `/planning/procurement`, **English** — the Hebrew `viewer` cockpit built for her can never render for her |
| Tom | owner/planner/admin | `admin` | admin: everything, primary `/dashboard` |

**Finding A (structural):** the four generic roles don't map 1:1 to the four real people. Dorin-as-planner inherits Tom's planning surfaces (Procurement, Meeting, Simulation, Economics, Decision Board — ~20 sidebar rows); the Hebrew viewer cockpit is currently orphaned (no real user is `viewer`). Dennis and Maxim share one `operator` cockpit with different jobs.

**Finding B (noise):** the subdued-padlock rule means a `viewer` sees 4 permanently locked Stock form rows + a locked "My activity" — rows that can never become useful to that role. Truthful, but anti-lean.

## 3. Per-role minimal destination map (per the approved operating model)

### Dennis — production operator (`operator`)
Needs (3–5):
1. `/home` — the Today board (Q6: the 9:30 briefing IS this screen; "no report yesterday" flag concerns him first).
2. `/stock/production-actual` — report production (iron rule: no leaving without a report).
3. `/stock/receipts` — goods receipt at the door against open POs (Q10 decision; needs his account).
4. `/planning/production-plan` — read today's locked plan (produce from the draft/locked plan).
5. `/stock/physical-count` (+ `/stock/waste-adjustments` occasionally) — flagged RM counts Thursday (Q8), scrap ≤200₪.
Never needs (currently visible to operator): Forecast, Planning Overview, Blockers, Inventory Flow, Credit Tracking, Purchase Orders list, Movement Log, Production Simulation (hidden already — planner-min), Dashboard (arguable — Today board supersedes for him).

### Maxim — FG warehouse / picking (`operator`)
Needs (3–4):
1. `/home` — Today board: today's route/departure + wave-1/wave-2 picking with the aggregate-READY flag (Q5), tomorrow's READY/SHORT.
2. `/stock/physical-count` + `/inventory/bulk-count` — Thursday-morning FG count, entered by 9:30 (Q8).
3. `/inventory` — FG on-hand while picking.
4. `/me/activity` — his own submissions.
Never needs: the entire Planning group, Purchase Orders, Credit Tracking (his picking gaps FEED it; Dorin works it), `/stock/receipts` (mapping: "לא נוגע במחסן חומרי הגלם"), `/stock/production-actual`, Waste/Adjustment (RM-side).

### Dorin — bookkeeper/office (`planner` in DB)
Needs (4–5):
1. `/home` — should be her Hebrew cockpit (today: English planner cockpit — Finding A).
2. `/purchase-orders/placement-queue` — Thursday 14:30–15:45 "הרשומה היא ההנחיה" execution (Q7).
3. `/credit-tracking` — picking-gap credits, reviewed in the daily 14:00–15:00 meeting.
4. `/purchase-orders` — status of placed orders / receipts follow-up.
5. `/inbox` — exceptions routed to her.
Never needs (currently visible because role=planner): Procurement (Tom's weekly buying decision — she executes FROM the queue, not the session), Weekly Meeting, Forecast, Production Simulation, Economics, Decision Board, Planning Overview, Blockers, Inventory Flow, all Stock forms (subdued-free for her since planner has stock:execute — actively dangerous noise), Movement Log.

### Tom — owner/planner (`admin`)
Daily: `/home`, `/dashboard`, `/inbox`, `/planning/production-plan`; weekly cadence: `/planning/meeting` (Thursday lock), `/planning/procurement` (buying session), `/planning/forecast` (monthly); everything else on demand. Tom is the only user for whom the full ~37-row tree is legitimate — and it's already collapsed by default. Lean for Tom = fewer rows in the *expanded* Planning group, not fewer capabilities.

## 4. Fold / retire candidates (nav pruning + role scoping ONLY — no route deletion, all URLs stay live per route-manifest)

Ranked; each is a `manifest.ts`/`cockpit.ts` change only. Precedent: tranche 045 demoted `/planning/runs` from primary nav while keeping the page live.

| # | Candidate | Action | Rationale |
|---|---|---|---|
| 1 | `/planning/production-simulation` | remove from primary nav (⌘K + deep link only) | carries a permanent containment banner ("preview only, not source of truth"), IDB-backed, in no corridor; planner-min today so it clutters Dorin's and Tom's Planning group |
| 2 | `/planning` (Planning Overview, retitled "Engine diagnostic" in tranche 125) | `min_role: viewer → planner` (and consider nav removal — dashboard + cadence links cover it) | self-declared diagnostic, not a corridor surface; operators/viewers have no action on it |
| 3 | `/planning/blockers` | remove from primary nav (reachable from Planning Overview / dashboard critical-today) | depends on diagnostic runs; `dashboard/critical-today` already surfaces the actionable subset |
| 4 | `/planning/forecast` | `min_role: viewer → planner` | monthly Tom cadence; operator/viewer writes are server-blocked anyway; pure noise for Dennis/Maxim/Dorin |
| 5 | `/credit-tracking` | scope out of the operator sidebar (needs a per-item allow-list — `min_role` is a floor and can't exclude a middle role; see 138 draft) | it's Dorin's queue; Dennis/Maxim never work it |
| 6 | Stock-group subdued rows for `viewer` | subdued → hidden for permanently-locked rows | Finding B; requires Tom to consciously relax the truthfulness rule for the "can never gain this capability" case |
| 7 | `/stock/movement-log` for `operator` | demote from operator sidebar (keep viewer/planner/admin) | ledger read-model for verification/debug — Tom + office usage, not floor usage |
| 8 | `/me/activity` for `viewer` | hide (subdued today) | viewer can never have stock:execute submissions |

Also verified as **already-folded** (no action): purchase-session / purchase-calendar / weekly-outlook / exceptions / dashboard/v2 / stock/submissions / admin/items/[item_id] are redirect stubs, de-linked (tranches 045/046); `/planning/runs` demoted (045); Admin group collapsed and admin-only.

## 5. Quarantine cross-check

`quarantine.json` contains **no quarantined routes** — only two `pending-cleanup` e2e comment vestiges (`tests/e2e/forecast-planner-real.spec.ts`, `tests/e2e/ux-shot.spec.ts` forbidden-string doc comments). Nothing in the fold list above is a quarantined/dead/fake surface being revived, and folding removes rather than adds nav entries, so Invariant 3 ("dead/quarantined surfaces never re-enter primary nav") is untouched. The regression-sentinel `baseline.json` anchors `nav_items` — the lean-nav tranche must ship a `kind=baseline-update` re-anchor (ritual precedent: tranche 090) or every later audit will flag false drift.

## 6. Decisions needed from Tom (feed tranche 138)

- **D1** — approve the fold list (each row above individually accept/reject).
- **D2** — subdued→hidden doctrine change for permanently-locked rows (reverses a deliberate truthfulness rule; scoped to "role can never gain the capability").
- **D3** — Dorin persona: keep role=planner (locked by FLOW-8) but add a lightweight per-user cockpit/nav profile so she gets the office view without Tom's planning surfaces? Or accept planner-wide pruning is impossible and only prune what BOTH Tom and Dorin don't need?
- **D4** — Dennis + Maxim accounts: provision two `operator` users (prereq for tranche 137's Dennis flow; today the operator cockpit has zero real users).

---
Next action: Tom reviews D1–D4; on approval, execute tranches 136–138 (drafts in `docs/portal-os/tranches/`).
