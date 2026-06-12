# Tranche 055 — Final deletion of superseded planning pages (PROPOSED — Sunday-gated)

status: proposed — EXECUTE ONLY AFTER one clean Sunday procurement close on /planning/procurement
phase: improvement-plan-2026-06 Phase 4 close (T2)
approved_by: Tom (2026-06-12 — "ראשון אחד נקי על Procurement → מחיקת הדפים הישנים סופית")

## Gate (real-world, time-bound)
The next Sunday weekly procurement session must be generated, worked in focus mode, and closed
to zero on /planning/procurement with no fallback to the old surfaces. Evidence: the session row
(demand_model_version='v2') reaches a terminal state with all POs placed/skipped. Once that
happens, execute this tranche.

## File manifest (deletion set)
- src/app/(planning)/planning/purchase-session/page.tsx — DELETE (redirect stub; _lib/_components stay — procurement imports them)
- src/app/(planning)/planning/purchase-calendar/page.tsx — DELETE (redirect stub)
- src/app/(planning)/planning/weekly-outlook/page.tsx — DELETE (redirect stub)
- docs/portal-os/route-manifest.json — three rows → status "dead" with tranche-055 note
- docs/portal-os/registry.md — tranche row

## Out of scope
purchase-session/_lib and _components (live dependencies of /planning/procurement and dashboard).
Planning-runs retirement (separate quarter checkpoint per T2).

## Verification gates
tsc clean; vitest green; `grep -rn "planning/purchase-session\|planning/purchase-calendar\|planning/weekly-outlook" src/ --include=*.tsx` returns only _lib/_components internals; 404s on the three URLs are acceptable post-deletion (manifest says dead).

## Checklist
- [ ] Sunday gate evidence recorded here
- [ ] Deletions executed  - [ ] Gates green  - [ ] Pushed
