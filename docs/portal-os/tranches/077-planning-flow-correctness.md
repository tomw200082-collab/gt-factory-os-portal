# Tranche 077 — planning flow correctness (F3 invalidation + sim dead-end)

status: in progress (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: planning UX/UI audit (2026-06-14) THEME P-C (F3) + flow dead-end +
residual COPY-004. The highest-impact remaining functional items: a real
data-integrity gap (a consumed recommendation keeps showing as actionable) and
a terminal screen with no onward step. Portal-only; no backend/authority files.

## Changes
- **F3 (data integrity)** — `useCreatePlan` (`production-plan/_lib/usePlans.ts`)
  previously invalidated only `["production-plan"]` on success. Creating a plan
  from a recommendation left the runs / recommendations / overview surfaces and
  the inbox showing the consumed rec as still-actionable (double-consumption
  risk). Now also invalidates `["planning"]` (prefix → runs, run-detail, recs,
  overview) and `["inbox"]`. Prefix invalidation, harmless on manual creates.
- **Simulation dead-end** — `SimulationResults` already bridges to procurement
  when stock is short/partial (tranche 065), but the **all-covered** result had
  no onward step. Adds a "Stock covers this run — schedule it" CTA to the
  production board for the fully-covered case, so the what-if never terminates.
- **COPY-004 residual** — the requirements footer still read "PACK recipe" /
  "BASE recipe" (raw), inconsistent with tranche 073's "Packaging recipe" /
  "Liquid recipe" mapping applied in `ProductionSimulatorShell`. Aligned.

## Verified (read-only) and left as-is
- F1/F2 (convert-to-PO + inbox invalidation) already closed by tranche 072's
  `RecommendationsToConvert`. Confirmed; no change.
- Meeting "Order calendar" link → `/planning/procurement` matches its
  "Calendar view inside Procurement" description; not a wrong URL — no change.
- Inventory-flow rows carry no PO id reference to link to — nothing to wire.

## File manifest
- `docs/portal-os/tranches/077-planning-flow-correctness.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — 077 while active; cleared at close.
- `docs/portal-os/registry.md` — register this tranche.
- `src/app/(planning)/planning/production-plan/_lib/usePlans.ts` — F3 invalidation.
- `src/app/(planning)/planning/production-simulation/_components/SimulationResults.tsx` — covered CTA + footer copy.

## Verification
tsc --noEmit clean · vitest 677/677 (84/84 files) · next build OK · eslint 0
errors. Two files; the F3 change is additive prefix-invalidation (no behavior
removed); the sim CTA covers the previously-empty fully-covered branch.
