# Tranche 045 — Planning consolidation: one declared workflow (Phase 4 portal)

status: active
phase: improvement-plan-2026-06 Phase 4 (portal side; T2 resolved: demote runs → retire later)
approved_by: Tom (2026-06-11; full-run authorization "run the plan to the end")

## Goal
One obvious way to plan. Runs demoted from ordering; superseded surfaces become redirects;
the canonical cadence is declared in-product.

## File manifest
- src/lib/nav/manifest.ts — remove Planning runs entry from primary nav (keep page); verify no purchase-session/calendar/weekly-outlook entries
- src/components/planning/PlanningSubNav.tsx (locate actual path) — remove runs/weekly-outlook tabs; ensure procurement present
- src/features/dashboard/quick-actions.ts — repoint any purchase-session/calendar/weekly-outlook tiles to /planning/procurement
- src/app/(planning)/planning/runs/page.tsx + runs/[run_id]/page.tsx — top banner: runs are diagnostic-only; order via Procurement (link)
- src/app/(planning)/planning/purchase-session/page.tsx — redirect stub → /planning/procurement (KEEP _lib/_components — focus mode imports them)
- src/app/(planning)/planning/purchase-calendar/page.tsx — redirect stub → /planning/procurement (calendar view param if exists)
- src/app/(planning)/planning/weekly-outlook/page.tsx — redirect stub → /planning/inventory-flow
- src/app/(planning)/planning/meeting/page.tsx — re-point purchase-session/purchase-calendar links → /planning/procurement
- src/app/(planning)/planning/page.tsx (hub) — canonical cadence block: Thursday plan→firm, Sunday procurement, daily board+flow; links
- docs/portal-os/route-manifest.json — statuses: purchase-session/purchase-calendar → redirect; weekly-outlook → redirect; runs note diagnostic-only
- docs/portal-os/tranches/045-planning-consolidation.md, _active.txt, registry.md

## Verification gates
- tsc clean; vitest green (451 baseline); no nav/quick-action href to purchase-session|purchase-calendar|weekly-outlook remains; redirects compile

## Checklist
- [x] Implemented (2026-06-11)
- [x] Typecheck clean (`npx tsc --noEmit` — no output)
- [x] Vitest green (451/451, 59 files — matches baseline; no test changes needed)
- [ ] Pushed
