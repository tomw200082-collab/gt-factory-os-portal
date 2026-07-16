# Tranche 132 — Procurement triage: decision-grade action list

**Status:** implemented (pending merge)
**Origin:** Tom-directed procurement-corridor audit + rebuild (2026-07-16 chat): "עיקר השיפור צריך להיות המיקוד של העבודה בדף הרשימה והשכלול שלו לקבלת החלטות נכונות של מה להעביר לביצוע, מה לדחות ומה לספור מחדש… ללא רעש". Third tranche of the corridor overhaul, stacked on 130–131. Pairs with backend migrations 0284/0285 (gt-factory-os) that add `input_integrity`, per-line `lt_source` / `last_count_age_days` / MOQ trace fields, exclude SYSTEM placeholder items, and stop offering in-house SEMI bases for purchase.
**Scope:** `/planning/procurement` triage stage only (classification, signal, freshness). Post-triage actions (approve/skip/cancel/place — 130/131) untouched. No portal-side backend authoring; the portal consumes new API fields additively and degrades gracefully without them.

## The problem this tranche closes

The audit showed the 3-bucket triage had collapsed: since May, ~97% of session POs landed in `urgent` (16/16 in the 2026-07-16 open session), because the SQL tier protects the SAFETY FLOOR by release date — chronically breached at lean stock levels — and one late line paints its whole supplier PO. The "₪ בסיכון" banner therefore summed the entire session; the planner had no signal for "what actually must go out today".

## Changes

1. **Decision engine v2** (`_lib/decision.ts`): classification now derives real
   exposure per line from `coverage_trace` — `zeroDate ≈ need + poh/adu`,
   `lastSafe = zeroDate − leadTime`, `shortageDays = (today+LT) − zeroDate` —
   so *must-today* means "ordering later than today creates/deepens a real
   stockout", and *can-wait* rows carry an explicit "אפשר להמתין עד DD/MM".
   Extrapolated figures are presented with "~". Rows without a usable trace
   (old sessions, user-added lines) fall back to the v1 date/tier logic.
   `whyNow` now names the driving line and quantifies the gap.
2. **"לספור מחדש" as a first-class signal**: lines whose on-hand was never
   physically counted or counted > 14 days ago (engine-reported
   `last_count_age_days`, trace_version 3+) get a quiet "לספור קודם" chip
   linking to `/stock/physical-count`, a bucket-filter option ("דורש ספירה"),
   and a slot in the session summary line. Pre-0284 traces show no noise.
3. **IntegrityStrip** (`_components/IntegrityStrip.tsx`): one compact line
   replacing the full-width warning-banner stack — stock-verification drift,
   count freshness over the buy list, forecast age + horizon-coverage gap,
   firmed-plan weeks, and the engine warnings as tooltip-carrying chips.
4. **Inline inbound-supply warnings** (`_lib/session-warnings.ts`): the
   machine-readable `warnings[].lines` payload (previously discarded) now
   marks the exact affected row — e.g. RAW-NANA showing "בדרך 5 ללא תאריך"
   while the engine recommends buying 8 more (the live double-buy trap).
5. **ActionList redesign**: search matches supplier OR item name; tier badge
   and "מוצע" status badge removed (noise); quantified "חוסר צפוי ~N ימים"
   badge; summary line reports must-today count/₪ + can-wait + recount from
   the FULL session under any filter; sort within buckets (urgency default);
   mobile-friendly wrap for filter bar and row action.
6. **Types**: `PurchaseSession` now carries `demand_model_version`,
   `firmed_window`, `input_integrity` (already returned by the API; the
   portal type had dropped them).

## Files

- `src/app/(planning)/planning/procurement/_lib/decision.ts` (+ test — rewritten)
- `src/app/(planning)/planning/procurement/_lib/coverage-trace.ts` (+ trace_version-3 fields)
- `src/app/(planning)/planning/procurement/_lib/integrity.ts` (+ test — new)
- `src/app/(planning)/planning/procurement/_lib/session-warnings.ts` (+ test — new)
- `src/app/(planning)/planning/procurement/_components/ActionList.tsx` (+ test — rebuilt)
- `src/app/(planning)/planning/procurement/_components/IntegrityStrip.tsx` (+ test — new)
- `src/app/(planning)/planning/procurement/page.tsx` (banner stack → strip; warnings → list)
- `src/app/(planning)/planning/purchase-session/_lib/types.ts` (additive fields)
- `docs/portal-os/tranches/132-procurement-triage-decision-grade.md` (this file)

## Evidence

- `npx tsc --noEmit` → clean.
- `npx vitest run` (full suite) → **914/914 pass** (procurement scope: 94, incl.
  17 new decision-v2 cases, 7 integrity, 4 session-warnings, 3 IntegrityStrip,
  11 rebuilt ActionList).
- `npx playwright test tests/e2e/procurement.spec.ts` (real dev server,
  dev-shim auth, sandbox Chromium) → 2/3 pass — the two specs covering the
  changed page shell and the FLOW-016 error path. The third (operator
  RoleGate) fails identically on the BASE commit in this sandbox (the gate
  needs API-side dev-shim; the sandbox points at the production API) —
  pre-existing environment artifact, not a regression.
- Backend fields verified against a live 0284 off_cycle session
  (15 POs / 33 lines): `lt_source`, `last_count_age_days`, `input_integrity`
  all present and correct; only diff vs the open weekly session is the
  removed SYSTEM placeholder row.

## Deliberately NOT in this tranche

- SQL `tier` semantics unchanged (documented as ADR in the procurement skill
  references; a revision is a separate Tom decision — the portal now
  classifies from trace math and no longer leans on the collapsed tier).
- Buffer tuning / per-component `cover_days` overrides (needs a plan-aware
  formula; the naive statistical one over-buffers 81/81 components).
- ₪-at-risk trend vs the previous session (needs a "previous session"
  definition — sessions supersede intra-day).
