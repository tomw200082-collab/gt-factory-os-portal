# Tranche 028: procurement-unified-action-list

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: flow_continuity
expected_delta: +1 on flow_continuity
sizing: M  (5-8 files)

## Why this tranche
The Sunday procurement close is scattered across Purchase Session, Purchase
Calendar, and the recommendations list — the planner has to hold "what must go
out today vs what can wait" in their head. This tranche stands up the **merged
procurement page** with the agreed default view: a **single action list grouped
by decision** (🔴 must-send-today / 🟡 can-wait / ✅ handled), each row carrying a
plain-language "why now" driver derived from `order_by_date` / `earliest_need_date`.
It becomes the new front door for procurement and the entry point for the focus
mode that lands in 029. Full per-PO actions stay on the classic session screen
for now (reachable via an interim link) so nothing is a dead-end.

## Scope
- New route `/planning/procurement` — the unified procurement page. Default and
  only view this tranche: the decision-grouped action list. Reuses the existing
  purchase-session data layer (`useCurrentSession`, `useStartSession`) via
  relative import — no new backend dependency.
- Pure decision engine `_lib/decision.ts`:
  - `classifyPo(po, todayISO)` → bucket `must_today | can_wait | handled`,
    `isOverdue`, `daysUntilOrderBy`, and a Hebrew `whyNow` string.
    Rules: handled = status placed/skipped; must_today = `order_by_date <= today`
    OR `tier === "urgent"`; else can_wait.
  - `groupByDecision(pos, todayISO)` → the three sorted buckets (must_today by
    order_by_date asc / most-overdue first; can_wait by order_by_date asc).
  - Decoupled from app types via a structural `DecisionInput` interface + generic,
    so it is unit-testable in isolation.
- `_components/ActionList.tsx` — renders the three decision sections with a
  count + summed cost per section, one row per proposed/approved PO (supplier,
  line count, total, tier + status chips, the `whyNow` driver, overdue flag),
  and a read-only inline line expansion. Each actionable row shows a primary
  "פתח במיקוד" affordance (wired to focus mode in 029) and an interim
  "במסך המושב הקלאסי →" link to `/planning/purchase-session` for full actions
  today. Empty/loading/error states honest (no fabrication).
- Nav: in `src/lib/nav/manifest.ts` replace the separate "Purchase Session" +
  "Purchase Calendar" entries with one "Procurement" → `/planning/procurement`.
  The old routes stay live and URL-reachable (de-linked, not deleted) until the
  focus mode supersedes them in 029.
- `docs/portal-os/route-manifest.json` — add `/planning/procurement` (live);
  note the two old routes as superseded-but-live.

Hebrew operator labels are used here, consistent with the existing
purchase-session surface (which is already Hebrew, e.g. `TIER_LABEL` /
`STATUS_LABEL` and Hebrew API error copy) and Tom's UX target for the
procurement corridor. This is a continuation of that scoped surface, not a
general English-first reversal.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/procurement/page.tsx
  - src/app/(planning)/planning/procurement/_components/ActionList.tsx
  - src/app/(planning)/planning/procurement/_lib/decision.ts
  - src/app/(planning)/planning/procurement/_lib/decision.test.ts
  - src/lib/nav/manifest.ts
  - src/components/layout/PlanningSubNav.tsx
  - docs/portal-os/route-manifest.json
  - tests/e2e/procurement.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Focus mode + inline PO creation with the shared PoLineEditor (Tranche 029).
- Per-PO mutations (approve/place/skip/edit) on the new page — they remain on
  the classic session screen this tranche.
- Ad-hoc "add an order" inside the session (Tranche 030).
- Deleting or redirecting `/planning/purchase-session` and
  `/planning/purchase-calendar` (they stay live; retirement is 029/030).
- Folding the calendar timeline into the unified page as a secondary view.
- Any backend/endpoint/schema change.

## Tests / verification
- typecheck clean.
- vitest: `src/app/(planning)/planning/procurement/_lib/decision.test.ts`
  (bucket classification, overdue detection, sorting, whyNow copy).
- playwright: `tests/e2e/procurement.spec.ts` (planner sees the page + the three
  decision sections; operator blocked by the planning gate).
- regression-sentinel: no baseline regressions; the de-linked old routes remain
  live (not quarantined), so no quarantine re-entry.

## Exit evidence
- screenshot/trace of the decision-grouped action list.
- vitest pass count for decision.test.ts.
- scorecard delta ≥ expected.
- PR link.

## Rollback
Revert the PR. The new route is additive and the nav change is a one-line swap;
the old session/calendar pages are untouched, so reverting restores the prior
nav and removes the new page with no data-layer impact.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 028` on the PR)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 on branch `claude/procurement-forecast-review-Bv31m`.

**Files delivered (exactly the manifest):**
- `src/app/(planning)/planning/procurement/_lib/decision.ts` (new) — pure
  decision engine: `classifyPo` / `groupByDecision` / `todayISO` / `fmtDateHe`,
  decoupled via a structural `DecisionInput` + generic.
- `src/app/(planning)/planning/procurement/_lib/decision.test.ts` (new) — 8
  vitest cases (buckets, overdue, sorting, whyNow copy, unparseable date).
- `src/app/(planning)/planning/procurement/_components/ActionList.tsx` (new) —
  three decision sections (🔴/🟡/✅), per-section count + summed cost, rows with
  supplier / tier+status chips / whyNow / overdue flag / read-only line
  expansion; `onOpen` prop reserved for focus mode (029), links to the classic
  session until then.
- `src/app/(planning)/planning/procurement/page.tsx` (new) — unified page;
  reuses `useCurrentSession` / `useStartSession` (relative import, no new
  backend); loading / error / no-session / empty states; gated by the existing
  (planning) layout RoleGate (planning:read).
- `src/lib/nav/manifest.ts` (edit) — replaced "Purchase Session" + "Purchase
  Calendar" sidebar entries with one "Procurement" → /planning/procurement.
- `src/components/layout/PlanningSubNav.tsx` (edit) — added a "Procurement" tab.
- `docs/portal-os/route-manifest.json` (edit) — added /planning/procurement
  (live); marked the two old routes superseded-but-live.
- `tests/e2e/procurement.spec.ts` (new) — page shell + sub-nav tab + RoleGate.

**Verification:**
- typecheck: `npm run typecheck` → exit 0 (clean).
- vitest (this tranche): `decision.test.ts` → 8 passed / 8.
- full vitest: 300 passed (292 prior + 8 new); 35 failures are the SAME
  pre-existing unrelated suites as Tranche 027 (verified unchanged count) — no
  procurement test among them, none newly introduced.
- CI gate (`portal-pr-guard`): typecheck ✅; registry-presence ✅ (028 doc is
  registered; the gate only checks new `docs/portal-os/` files).
- nav URL guard (`check-no-persona-in-urls`): the only failures are 4
  PRE-EXISTING `@/app/(planning)/...` import leaks in
  `src/app/(shared)/dashboard/page.tsx` (confirmed failing on a clean stash
  baseline). This tranche's imports are relative and add no new leaks; the guard
  is not part of the blocking CI gate.
- e2e `procurement.spec.ts`: deterministic structural assertions; runs under CI
  (needs dev server + browsers, not run in this sandbox).
- regression-sentinel: old session/calendar routes stay live (not quarantined),
  so no quarantine re-entry; new route is additive.

**Scorecard delta:** +1 on flow_continuity (the scattered Sunday procurement
close now has a single decision-ordered front door).
