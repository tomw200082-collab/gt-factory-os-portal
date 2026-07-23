# Tranche 136: today-board (DRAFT)

status: DRAFT — proposed, NOT active. No registry entry yet; `_active.txt` untouched. Number 136 is provisional (tranche 135 informally deferred a follow-up batch "to 136"; renumber at approval per the tranche-121 renumbering precedent).
created: 2026-07-22
scorecard_target_category: operator_daily_fit
expected_delta: +1 (new daily-cadence surface inside an existing route)
sizing: M (6–8 files)

## Why this tranche

Mapping v3 decision **Q6 (Tom, 22.7)**: the 9:30 morning briefing "sits on a screen in the system" — one **"Today" board with three tabs — אתמול / היום / מחר** — one read-model, three outfits (06:30 guardian email = snapshot of the board; 13:45 pre-meeting report = the "tomorrow" tab; the briefing = the screen itself). Explicitly: **built inside the existing `/home`, not a new page** (lean principle: "לשפר את הקיים, לא להוסיף דפים"). Decision **Q5** adds the aggregate-READY flag vocabulary the "tomorrow" tab must speak; **Q12** names the plan-vs-actual + "no report entered" flag that leads the "yesterday" tab.

## Scope

Read-only v1. A `TodayBoard` section renders at the top of `/home` for the roles that attend the briefing (operator, planner, admin; viewer/bookkeeper cockpit unchanged in v1 — open question OQ-2). Existing cockpit tile grid stays below it. Three tabs:

- **Yesterday** — plan-vs-actual per plan row (planned qty vs reported output), a first-position red flag when a planned day has **no production report**, picking gaps → credits summary. Every flag names an owner (Q6: "כל דגל נושא בעלים").
- **Today** — the locked plan for today (drafts visibly marked, reusing production-plan status vocabulary), supplier arrivals expected today (open POs by `expected_receive_date`, links to `/stock/receipts?po_id=`), route/departure placeholder (gap G3).
- **Tomorrow** — next-business-day READY/SHORT per item with shortage source, aggregate-READY flags where computable (gap G4), mirroring what the 13:45 report will print.

## Data sources per tab (verified endpoints)

| Tab | Feed | Endpoint (portal proxy → upstream) | Status |
|---|---|---|---|
| Yesterday | plan rows | `GET /api/production-plan?from=&to=` → `/api/v1/queries/production-plan` | **exists** |
| Yesterday | actual output | `GET /api/production-actuals/history` → `/api/v1/queries/production-actuals` | **exists**; plan↔actual join is client-side v1 (submission `from_plan_id` linkage) — canonical joined read model = **gap G1** |
| Yesterday | "no report" flag | derived: plan row with no linked submission | derivable v1; canonical backend flag = part of **G1** (same read model daily-ops-guardian Stage 0.5 wants) |
| Yesterday | picking gaps → credits | `GET /api/credit-tracking` (`credit_tasks`) | **exists**; verify date filtering params |
| Yesterday | delivery exceptions | — | **gap G2**: no LionWheel-mirror exceptions read model; omit v1, show nothing (never fabricate) |
| Today | locked plan | `GET /api/production-plan?from=today&to=today` | **exists** (lock semantics via meeting firm/lock — `/api/planning/firmed-week-demand`) |
| Today | supplier arrivals | `GET /api/purchase-orders?status=OPEN&status=PARTIAL` filtered by `expected_receive_date` | **exists** (same query `/stock/receipts` landing picker uses) |
| Today | route + departure | — | **gap G3**: route lives in LionWheel + skill config (`route_calendar.json`, drivers); no portal read model. v1: omit or static weekday-zone label; real feed = W1 mirror endpoint |
| Tomorrow | projected balance / shortage tier per item | `GET /api/inventory/flow` (FlowResponse, daily window, tiers) | **exists** |
| Tomorrow | demand coverage | `GET /api/planning/demand-coverage` | **exists** |
| Tomorrow | open-orders-per-item + aggregate-READY flag (Q5: stock covers ALL open demand for the item) | — | **gap G4**: LionWheel mirror exposes only `GET /api/orders/outbound-summary` (`{open_orders, due_today}` counts) + `GET /api/orders/by-item-and-period` (sold aggregates). Per-order/per-item open-demand read model needed (W4 contract → W1) before a truthful READY-מצרפי flag |

Named gaps G1–G4 are backend-lane work (W1/W4), NOT this tranche. v1 renders what exists and labels the rest honestly (empty-state, not fabricated).

## Manifest (files that may be touched)

manifest:
  - src/app/(shared)/home/page.tsx
  - src/app/(shared)/home/_components/TodayBoard.tsx          # new
  - src/app/(shared)/home/_components/TodayBoardTabs.tsx      # new (or folded into TodayBoard)
  - src/app/(shared)/home/_lib/today-board.ts                 # new — pure tab-builders (plan-vs-actual join, no-report flag, arrivals bucket)
  - src/app/(shared)/home/_lib/today-board.test.ts            # new
  - src/features/home/cockpit.ts                              # only if the board needs a per-role visibility switch
  - tests/e2e/home.spec.ts                                    # extend @mocked
  - docs/portal-os/tranches/136-today-board.md, docs/portal-os/registry.md, docs/portal-os/scorecard.json, docs/portal-os/scorecard.md, docs/portal-os/tranches/_active.txt   # at execution time only

## Out-of-scope

- Any write/mutation; the board is read-only v1.
- New routes (Q6 locks it inside `/home`) and any change to `/dashboard`.
- Backend read models (G1–G4) — separate W4 contract + W1 packages; this tranche must not guess API shapes.
- The 06:30 email / 13:45 report outfits — they live in the daily-ops-guardian skill, not the portal; v1 only aligns vocabulary.
- Hebrew UI on the operator/admin `/home` views (see OQ-1); viewer cockpit redesign.

## Tests / verification (evidence plan)

- `npx tsc --noEmit` clean; eslint clean on touched files.
- vitest: `today-board.test.ts` — plan-vs-actual join incl. no-report flag, unmatched-submission handling, arrivals bucketing, tomorrow tier mapping; full suite N/N green (baseline 935).
- playwright `@mocked` chromium, dev-shim: three-tab walk, per-role render (operator/planner/admin see board; viewer unchanged), degraded-API honesty states; screenshots of all three tabs (desktop + iPhone-14 viewport) attached to PR.
- regression-sentinel: no baseline drift (no nav change in this tranche).

## Dependencies

- **Backend read models**: G1 (plan-vs-actual + no-report), G4 (open-demand per item / aggregate READY) — W4 contract → W1 build → RUNTIME_READY signal → portal follow-up tranche swaps the client-side join for the canonical model. G2 (delivery exceptions), G3 (route/departure) likewise.
- `docs/portal-os/runtime_ready.snapshot.json` refresh if any new signal lands before execution.
- **UX handoff packet required** (frontend-design pass) — the board sits on the highest-traffic screen; needs the design treatment before build, per portal process.
- Tranche 138 (lean-nav) is independent but should land in the same season so the board isn't buried under nav noise.

## Open questions

- **OQ-1 (language)**: Q6 names the tabs אתמול/היום/מחר, but `/home` operator/admin views are English-first and the CLAUDE.md Hebrew whitelist does not cover them. Default per policy: English labels ("Yesterday / Today / Tomorrow"); Hebrew requires Tom's written whitelist extension. Decide before build.
- **OQ-2**: does the viewer (bookkeeper) cockpit get the board too (her 15:00-meeting view is the 13:45 report)? v1 default: no.
- **OQ-3**: flag-owner rendering — owner initials per flag (Q6 "כל דגל נושא בעלים") needs a person↔flag mapping; hardcode v1 (Dennis/Maxim/Dorin/Tom) or wait for user provisioning (audit D4)?
- **OQ-4**: `credit-tracking` API date-filter support — verify before relying on it for the Yesterday tab; otherwise filter client-side.

## Rollback

Revert the PR; `/home` returns to tile-grid-only. No data-layer or nav changes, revert is clean.

## Operator approval

- [x] Tom approves this plan. Recorded directly by the orchestrating session, which asked Tom this exact question via a tool-verified `AskUserQuestion` call in chat, 2026-07-23: "tranche 136's manifest requires two formal decisions I hadn't actually gotten — the unchecked 'Tom approves' box, and a UX handoff packet before build. How to proceed?" Tom selected: "מאשר את שניהם עכשיו" (approve both now) — build without a separate UX design-agent pass, inline UX direction in the build prompt is sufficient (same approach tranche 137 used, which shipped and was independently verified PASS). This commit is the durable record of that approval — not a claim made inside a build agent's prompt. Number 136 kept (not renumbered — 135/137 already landed under their own numbers, 136 was never actually taken).
