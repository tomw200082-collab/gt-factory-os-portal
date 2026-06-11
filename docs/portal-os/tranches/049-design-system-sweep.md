# Tranche 049 — Design-system consumption sweep (Phase 7)

status: active
phase: improvement-plan-2026-06 Phase 7 items 2-3 (Tom authorized shared-primitive decisions)
approved_by: Tom (2026-06-11 full-run authorization; "decide everything")

## File manifest
- src/app/(ops)/stock/waste-adjustments/page.tsx — VISUAL-001 (Lucide-only) + VISUAL-003 (shared picker)
- src/app/(planning)/planning/procurement/page.tsx — VISUAL-002 (btn-primary CTA) + VISUAL-009 (space-y→gap)
- src/app/(po)/purchase-orders/page.tsx — VISUAL-002 (NewPoDropdown btn-outline) + VISUAL-004 (table-base)
- src/app/(planning)/planning/runs/page.tsx — VISUAL-004 (table-base)
- src/app/(admin)/admin/masters/boms/page.tsx — VISUAL-004 (table-base)
- src/app/(admin)/admin/masters/items/[item_id]/page.tsx — VISUAL-011 (LeadTimeChip→Badge) + remove dead PendingTabPlaceholder import
- src/components/feedback/states.tsx — VISUAL-014 (AllClearRibbon + SkeletonRow exported here)
- src/components/workflow/SectionHeading.tsx — NEW (VISUAL-013)
- src/components/workflow/WorkflowHeader.tsx — VISUAL-010 size prop (page|section)
- src/app/(shared)/dashboard/page.tsx — consume SectionHeading + shared feedback components; TitleCount→Badge
- src/app/globals.css — VISUAL-006 stat-card consolidation (minimal-risk aliasing allowed)
- list/form pages adopting WorkflowHeader size="section" (bounded list in agent report)
- unit tests for new/changed shared components
- docs/portal-os/tranches/049-design-system-sweep.md, _active.txt, registry.md

## Gates
tsc clean; vitest green (478 baseline + new); no inline <svg> in waste-adjustments;
single CTA shape rule (no rounded-full primary buttons); existing testids preserved

## Checklist
- [ ] Implemented  - [ ] Typecheck  - [ ] Vitest  - [ ] Pushed
