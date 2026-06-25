# Production-plan — backend data requirements (UX handoff → W1/W4)

date: 2026-06-25
authored_by: /ux-release-gate (render-grade audit)
surface: /planning/production-plan
status: requirements only — the portal does NOT author the contract; this names
        the data the screen needs so backend-db / integration lane can shape it.
tranche: 087 (portal-side fixes landed separately)

These two findings cannot be fixed portal-side because the data does not exist
yet. They are blocked on backend, not on UI work.

## F3 — Daily capacity anchor (DECISION_GRADE / P1)

**Problem:** the board shows today's planned total (e.g. "250 UNIT") with no
reference to how much the factory can actually make in a day. The planner cannot
tell if today's plan is within capacity.

**Data needed:**
- A daily (or per-shift) production-capacity figure the board can compare against.
- Shape suggestion (not a contract): `GET /api/production-plan/capacity?date=` →
  `{ date, capacity_units, capacity_basis: "shift"|"day", committed_units }`.
- If capacity is per-line/per-family rather than a single number, the UI needs the
  breakdown keyed by the same item grouping the board already uses.

**Acceptance for the UI:** the board can render "X / capacity Y" with an
over-capacity warning state when committed > capacity.

## F4 — Recommendation rationale (FLOW / P1)

**Problem:** rec-sourced plans show a "Recommended" chip but not *why* the run
recommended them, so the planner cannot judge whether to trust the recommendation
inline.

**Data needed:**
- On the recommendation payload (`/api/production-plan/recommendation-candidates`
  and the `source_recommendation_id` linkage), expose the driver:
  `{ reason_code: "coverage_gap"|"forecast_demand"|"safety_stock"|...,
     reason_detail: "FG cover 1.4d < 5d target", source_run_id }`.

**Acceptance for the UI:** the card's "Recommended" chip can show a one-line
rationale (tooltip or inline) sourced from `reason_detail`.

## Not blocked on backend (portal-side, staged in tranche 087)
- F1 day-level feasibility roll-up — the per-card BOM-impact data already exists;
  a board-scope aggregation can be client-side once impact is fetched at board scope.
- F2 count consolidation — design decision, portal-only.
- F6 mobile single-day board — portal-only layout.

## Routing
Hand to `backend-db-executor` (capacity table/endpoint, rec rationale passthrough)
and `integration-boundary-executor` if rationale derives from a planning-run
artifact. Portal consumes once `RUNTIME_READY(production-plan-capacity)` and the
rationale field land.
