# Tranche 136 — today-board: Yesterday/Today/Tomorrow inside /home

**Status:** implemented (pending merge)
**Origin:** mapping v3 decision **Q6 (Tom, 2026-07-22)** — the 9:30 morning briefing "sits on a screen in the system": one **"Today" board with three tabs — אתמול / היום / מחר** — one read-model, three outfits (06:30 guardian email = snapshot of the board; 13:45 pre-meeting report = the "tomorrow" tab; the briefing = the screen itself). Built inside the existing `/home`, not a new page (lean principle: "לשפר את הקיים, לא להוסיף דפים"). Decision **Q5** supplies the READY/SHORT vocabulary the "tomorrow" tab speaks; **Q12** names the plan-vs-actual + "no report entered" flag leading the "yesterday" tab.
**Promoted from:** `docs/portal-os/tranches/136-today-board.DRAFT.md` (2026-07-22 lean-nav audit session).
**Scope:** one tranche, read-only v1, mounted inside `src/app/(shared)/home/page.tsx`. No new route, no backend/API change — every number is read via an existing portal proxy endpoint. No lattice/middleware change.

## Operator approval (carried verbatim from the DRAFT — not rewritten)

- [x] Tom approves this plan. Recorded directly by the orchestrating session, which asked Tom this exact question via a tool-verified `AskUserQuestion` call in chat, 2026-07-23: "tranche 136's manifest requires two formal decisions I hadn't actually gotten — the unchecked 'Tom approves' box, and a UX handoff packet before build. How to proceed?" Tom selected: "מאשר את שניהם עכשיו" (approve both now) — build without a separate UX design-agent pass, inline UX direction in the build prompt is sufficient (same approach tranche 137 used, which shipped and was independently verified PASS). This commit is the durable record of that approval — not a claim made inside a build agent's prompt. Number 136 kept (not renumbered — 135/137 already landed under their own numbers, 136 was never actually taken).

The durable git record of this approval is commit `6d4e7c6` ("Record Tom's approval for tranche 136 activation") on this branch, already merged into this branch's history before the build started.

## Ponytail read on scope (declared up front)

The whole surface reuses existing plumbing and adds nothing new beyond one small pure data-builder module:

- **Tab primitive** reused verbatim: `useRovingTabList` (the same hook `InventoryFlowTabs` uses), just wired to a `?tab=` query param on `/home` instead of a route change (there is no per-tab route — Q6 locks this inside `/home`).
- **Data hooks** reused where they exist (`usePlans` from the Daily Production Plan board, `useInventoryFlow` from Inventory Flow); the four endpoints without an existing hook (`production-actuals/history`, `credit-tracking`, `purchase-orders`, `planning/demand-coverage`) get a thin inline `useQuery` in `TodayBoard.tsx` — no new hook files, per the manifest's "route/orchestration code stays in the component" instruction.
- **Types** reused, not duplicated, where a canonical shape already exists: `ProductionPlanRow` (Daily Production Plan) and `FlowItem`/`FlowDay` (Inventory Flow) are imported as types into the data-builder module rather than re-declared.
- Every named backend gap (G1–G4, see the DRAFT's data-source table) renders an explicit, honest note in the UI instead of a guess, a silent omission, or a fabricated zero.

## What changed

### Data-builder module (`_lib/today-board.ts`, new)

Pure, DB-free functions, one per tab need, all unit-tested:

- `buildYesterdayPlanVsActual` — plan→actual join for one day. The join direction is **plan → actual via `plan.completed_submission_id`** (server-set in the same transaction as a linked production report), cross-checked against the fetched actuals history by `submission_id`, falling back to the plan row's own embedded `completed_actual` when the submission is outside the fetched history window. This reaches the identical linked pairs as the DRAFT's "join via `from_plan_id`" stopgap — the history **list** endpoint doesn't carry `from_plan_id` (verified by reading `ProductionActualListRow` in `stock/production-actual/page.tsx`; only the POST/detail responses do) — without guessing a field that isn't on the wire. Returns rows sorted with the Q12 "no report entered" flag FIRST.
- `findUnmatchedActuals` — actual submissions in the fetched history not linked from any plan row (ad-hoc reports), excluding reversed submissions.
- `buildYesterdayCreditsSummary` — client-side date filter over `credit-tracking` rows (verified: the live endpoint has no server-side date-filter param — same client-side-by-`created_at` pattern the `/credit-tracking` page itself uses; resolves DRAFT OQ-4).
- `buildTodayPlan` — today's production rows + locked/draft state, reusing the exact "Draft — not yet locked" copy `ProductionJobCard` already uses.
- `bucketArrivals` — open/partial POs bucketed into today vs. overdue by `expected_receive_date`; POs with no expected date are excluded (never guessed) rather than dumped into a bucket.
- `buildTomorrowTiers` — per-item READY/SHORT/non-working/unknown from the SAME production-aware projection Inventory Flow renders from (`shortfall_qty_with_production`) — a real field, not a fabricated tier. "unknown" (never "ready") when tomorrow falls outside the fetched flow horizon.

### Components (`_components/TodayBoardTabs.tsx`, `_components/TodayBoard.tsx`, both new)

- `TodayBoardTabs` — 3-tab segmented control, roving tabindex via `useRovingTabList`, active tab in `?tab=yesterday|today|tomorrow` synced with `router.replace`.
- `TodayBoard` — orchestration: five `useQuery`/hook calls (production-plan via `usePlans`, production-actuals/history, credit-tracking, purchase-orders, inventory/flow via `useInventoryFlow`, planning/demand-coverage), wires their `.data`/`.isError` into the pure builders, and renders the three panels. Every panel distinguishes three states per data source: loading (implicit — TanStack default), **error** (`query.isError` → an explicit "…couldn't be loaded right now" note), and **honestly empty** (loaded, zero rows → "No … for {day}" note) — never a crash, never a fabricated zero.

### `page.tsx`

- Mounts `<TodayBoard />` between the hero tile and the tile-group grid, gated `role !== "viewer"` (OQ-2 default: the bookkeeper/office cockpit, already a different Hebrew surface, is unchanged in v1).

### Named gaps rendered honestly, not hidden

- **G2** (delivery exceptions) — Yesterday tab: a permanent note naming the missing LionWheel-mirror exceptions read model.
- **G3** (route/departure) — Today tab: a permanent note naming the missing portal read model (route lives in LionWheel + skill-side driver config).
- **G4** (aggregate-READY per item) — Tomorrow tab: a permanent note distinguishing the daily projected-balance READY/SHORT tier shown from the aggregate "covers ALL open demand" flag Q5 actually asks for, which needs a per-order/per-item open-demand read model that doesn't exist yet. The `planning/demand-coverage` aggregate (order-line coverage %) is shown as context, explicitly labeled as *not* that flag.
- **Flag ownership (OQ-3)** — resolved conservatively: v1 does **not** hardcode a name (Dennis/Maxim/Dorin/Tom) onto the no-report flag, since there is no truthful, derivable owner-mapping in the data available. The flag itself (no report entered) ships; per-flag attribution is deferred, not fabricated. See Deviations.

## Manifest / files touched

- `src/app/(shared)/home/page.tsx`
- `src/app/(shared)/home/_components/TodayBoard.tsx` (new)
- `src/app/(shared)/home/_components/TodayBoardTabs.tsx` (new)
- `src/app/(shared)/home/_lib/today-board.ts` (new)
- `src/app/(shared)/home/_lib/today-board.test.ts` (new — 24 cases)
- `tests/e2e/home.spec.ts` (new, `@mocked`, chromium)
- `tests/e2e/mobile-home-today-board.spec.ts` (new, mobile-safari iPhone-14 screenshot pass — untagged, matches the `mobile-receipts-door-mode` / `mobile-operator-forms-smoke` precedent so it stays out of the chromium-only CI `--grep @mocked` gate)
- `docs/portal-os/tranches/136-today-board.md` (this doc, replaces the DRAFT), `docs/portal-os/registry.md`, `docs/portal-os/scorecard.json`, `docs/portal-os/scorecard.md`, `docs/portal-os/tranches/_active.txt`

Not touched: `src/features/home/cockpit.ts` — the DRAFT flagged this as "only if the board needs a per-role visibility switch"; the `role !== "viewer"` gate lives inline in `page.tsx` (one line) instead, since the board isn't a cockpit tile and doesn't need `isTileVisible`/capability gating.

## Deviations from the DRAFT

- **Language (OQ-1)** — resolved per the DRAFT's own stated default: English tab labels ("Yesterday"/"Today"/"Tomorrow"), not the Hebrew אתמול/היום/מחר Q6 names. `/home`'s operator/planner/admin views are English-first per CLAUDE.md and are not on the Hebrew whitelist; only the viewer/bookkeeper cockpit is, and the board doesn't render there in v1.
- **Flag ownership (OQ-3)** — deferred rather than hardcoded (see above). No per-flag "owner initials" ship in v1.
- **Scorecard category.** The DRAFT's `scorecard_target_category: operator_daily_fit` does not exist in the current 10-category `scorecard.json` rubric (same finding tranche 137 made). This tranche is a new daily-cadence surface, not a stock form like 137 — the closest real, semantically-matching category is **`dashboard_truth`**, whose own recorded gap is *"Aggregate KPIs (runs-today-vs-yesterday, stock-ledger last-movement) need backend aggregation endpoints"* — the Yesterday tab's plan-vs-actual is exactly a runs-today-vs-yesterday view, client-joined as a stopgap ahead of that backend aggregation. `ops_surface` (137's category) and `planning_surface` were considered and rejected: `ops_surface` is about operator stock-entry forms (receipts/waste/counts), not a read-only daily-cadence dashboard, and `planning_surface` is already at the 10/10 ceiling (see `scorecard.json`) with unrelated evidence (forecast/runs/exceptions). Credited `dashboard_truth` +1 (9→10) instead of inventing an 11th category.
- **Backend read-model direction (G1).** The DRAFT described the join as "actuals → plan via `from_plan_id`"; the shipped join goes the other way ("plan → actual via `completed_submission_id`", cross-checked by `submission_id`), because the real `production-actuals/history` list response does not carry `from_plan_id` (verified by reading the live type, not assumed) — only the POST/detail responses do. The reachable pairs are identical; this is a truthful-implementation correction, not a scope change.

## Evidence

- `npx tsc --noEmit` → clean (0 errors).
- `npx eslint .` on touched files → 0 errors, 0 warnings.
- `npx vitest run` → **968/968 pass** (baseline 944 + 24 new, all in `today-board.test.ts`: plan-vs-actual join incl. no-report flag, embedded-`completed_actual` fallback, unmatched-submission handling incl. reversed-submission exclusion, credits-summary date filter, today-plan locked/draft split, arrivals bucketing incl. no-date exclusion + overdue sort, tomorrow-tier mapping incl. non-working-day + out-of-horizon "unknown" + shortfall-field fallback).
- `npx playwright test --grep @mocked` (chromium, dev-shim auth) → **32/32 pass** (baseline 25 + 7 new in `home.spec.ts`): three-tab walk for operator/planner/admin (board renders, no-report flag leads Yesterday, short item leads Tomorrow, keyboard Home-key roving-tabindex navigation); viewer (board does not render, cockpit unchanged); three degraded-API honesty states (inventory/flow 500 → explicit unavailable note, not a fake tier; empty purchase-orders → explicit empty state; production-plan 404 → explicit unavailable note, not a crash).
- `npx playwright test tests/e2e/mobile-home-today-board.spec.ts --project=mobile-safari` (iPhone-14, webkit) → **1/1 pass**; screenshots captured and visually inspected (not just trusted by test name) for all three tabs at 390px — confirmed no scroll trap, no truncation, honest-empty-state and gap-note copy all legible. (The floating "N" circle visible in the screenshots is the Next.js dev-mode build-activity indicator, present only under `next dev`; not part of this surface.)
- regression-sentinel: no baseline drift (no route/nav/middleware changes; `git diff --stat` touches exactly `src/app/(shared)/home/page.tsx` (+11 lines) plus new files under `_components/`, `_lib/`, and `tests/e2e/`).

## Rollback

Revert the PR; `/home` returns to tile-grid-only. No data-layer, route, or nav changes — revert is clean.
