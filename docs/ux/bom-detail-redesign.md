# BOM Detail Pages — UX/UI Redesign Log

**Targets:**
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/page.tsx` — BOM head detail
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/page.tsx` — BOM version detail

**Reference pattern:** `docs/ux/product-360-redesign.md`

---

## Iteration roadmap

| # | Target | Status | Outcome |
|---|---|---|---|
| 1 | BOM head | done | Audit: mapped all fields (bom_head_id, bom_kind, display_family, parent_ref_id, active_version_id, final_bom_output_qty/uom, status), tabs (overview/versions/exceptions), linkage groups, header meta badges. |
| 2 | BOM head | done | Hero upgrade: MasterSummaryCard with BOM kind badge (PACK/BASE/REPACK toned), item linkage subtitle, status badge, active version chip. KPI strip: version count, active version label+hint, last updated relative time. |
| 3 | BOM head | done | Versions tab redesign: status column with tones (active=success, draft=info, archived=neutral). Active version row highlighted bg-success-softer/20. Each version row links to version detail. Empty state: "No versions yet — create a draft version to start building this recipe." |
| 4 | BOM head | done | Exceptions tab: sort critical first, "All clear" green empty state with dot icon, "Triage →" per exception link, "View all in Inbox →" header action with ChevronRight. Critical rows bg-danger-softer/20. |
| 5 | BOM head | done | Tab badge tones: versions tab badgeTone="info", exceptions tab badgeTone="danger" for critical / "warning" for any / "neutral" for none. |
| 6 | BOM head | done | Technical details collapsible: bom_head_id, parent_ref_type/id links, bom_kind lock explanation. Chevron open/close indicator. bg-bg-subtle/60 on open state. |
| 7 | BOM head | done | Reveal-on-mount hero wrapper div. Tab-switch animation already handled by DetailPage key={active.key} tabpanel pattern. |
| 8 | BOM version | done | Audit: mapped all tabs (overview/lines/compare), fields (version_id, bom_head_id, version_label, status, created_at, activated_at, updated_at, base_batch_output), BOM lines table (line_no, component name+id, qty, uom), compare diff display. |
| 9 | BOM version | done | Hero: MasterSummaryCard at top — version_label in name, status badge, activated_at date, "This is the active version" chip when active. KPI strip: line count, readiness status (active/draft/archived), last updated. |
| 10 | BOM version | done | Lines tab redesign: component/item name links (not raw IDs), qty displayed with UOM, ID shown as secondary mono line. Table in overflow-x-auto. Empty state: "No lines yet — add components to build this recipe." SectionCard description shows batch size. |
| 11 | BOM version | done | Compare tab: rich empty state when no target selected ("Select a version above to see the diff."). Picker shows v{label} (not raw IDs). Diff display has tone-coded summary counts row (added/removed/changed badges) before detail sections. Component names as primary in diff rows. SectionCard tone reflects diff size. |
| 12 | BOM version | done | Exceptions tab: "All clear" green empty state, "View all in Inbox →" link. (Version-level exceptions not in current data model; tab is informational placeholder.) |
| 13 | BOM version | done | Draft status card: if version is DRAFT, prominent warning card with "This is a draft — not yet in production" message, link to BOM head to manage versions. role="status" aria-live="polite". |
| 14 | BOM version | done | Archived status card: if ARCHIVED/SUPERSEDED, subdued info card "This version is archived and cannot be used in production runs". |
| 15 | BOM version | done | Breadcrumb eyebrow: "Admin · Masters · BOMs · {item name or bom_head_id} · v{version_label}" built from resolved item name. |
| 16 | Both pages | done | Mobile responsive: overflow-x-auto on all tables (lines table, versions table, diff section tables). Grid layouts in MasterSummaryCard and DetailPage already responsive. |
| 17 | Both pages | done | Cross-variant check: ACTIVE version → success badges + "This is the active version" chip + bg-success-softer/20 row. DRAFT → info badge + DraftStatusCard warning. ARCHIVED → neutral badge + ArchivedStatusCard. BOM head with 0 versions → empty state copy. BOM head with many versions → version count KPI. |
| 18 | Both pages | done | aria-live on DraftStatusCard and ArchivedStatusCard (role="status" aria-live="polite" aria-atomic). Tab strip already has full ARIA tablist from DetailPage. |
| 19 | Docs | done | This file — iteration roadmap. |
| 20 | Both pages | done | TypeCheck: tsc --noEmit returns 0 errors. |

---

## Canonical files touched

- `src/app/(admin)/admin/masters/boms/[bom_head_id]/page.tsx` — BOM head detail page
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/page.tsx` — BOM version detail page
- `docs/ux/bom-detail-redesign.md` — this file

## Design tokens used

- `bg-success-softer/20` — active version row highlight
- `bg-danger-softer/20` — critical exception row highlight
- `bg-warning-softer` — draft status card background
- `text-success-fg`, `text-warning-fg`, `text-danger-fg` — semantic text tones
- `border-warning/40`, `border-danger/40` — status card borders
- `text-fg-faint`, `text-fg-muted`, `text-fg-subtle` — information hierarchy
- `reveal-on-mount` — first-paint polish class (already defined in portal globals)

## Patterns reused from product-360-redesign

- `MasterSummaryCard` with KPI strip for both hero surfaces
- `DetailPage` tabpanel `key={active.key}` for remount animation (iter 18 product-360)
- Tab `badgeTone` for semantic badge colors (iter 6 product-360)
- Technical details collapsible pattern (iter 7 product-360)
- Exceptions tab: critical-first sort, "Triage →" CTA, "View all in Inbox →" link (iter 12 product-360)
- `overflow-x-auto` on all tables (iter 17 product-360)
- `role="status" aria-live="polite"` on mutation feedback (iter 16 product-360)
