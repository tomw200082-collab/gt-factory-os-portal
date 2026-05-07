# Misc pages UX redesign log

**Owner:** Tom  
**Scope:** Four admin pages polished across 20 iterations.

---

## Pages covered

1. `admin/masters/health` — Master Data Health (iters 1-5)
2. `admin/masters/archive` — Archive (iters 6-9)
3. `admin/products/new` — New Product Wizard (iters 10-14)
4. `admin/boms/[head_id]/versions/[version_id]` — BOM Editor (iters 15-20)

---

## Iteration log

| # | Page | Status | Outcome |
|---|---|---|---|
| 1 | Health | done | SummaryCard: at-a-glance panel with total issue count + checked-at timestamp. |
| 2 | Health | done | SummaryCard: ShieldCheck (all-clear) + AlertTriangle (issues found) icons. |
| 3 | Health | done | HealthSection tone prop — danger for checks 1+2 (missing supplier, missing BOM); warning for check 3 (PENDING records). |
| 4 | Health | done | CtaLink helper with ArrowUpRight icon replaces raw AlertTriangle link fragments. Consistent CTA style across all 3 checks. |
| 5 | Health | done | Per-section "No issues in this category." empty state replaces generic "All clear". |
| 6 | Archive | done | Restore button per row (admin-only). `patchStatus` helper calls PATCH with `status: "ACTIVE"` and `if_match_updated_at`. Three restore mutations (items, components, suppliers). |
| 7 | Archive | done | Row layout: entity name prominent as primary text, ID as `font-mono text-3xs text-fg-subtle` secondary line below. |
| 8 | Archive | done | InlineRestoreConfirm widget: "Restore this [entity]? It will become ACTIVE again." with confirm/cancel inline. `confirmId` state tracks which row is expanded. |
| 9 | Archive | done | ArchiveSection empty state redesigned with `Archive` icon + descriptive message + detail line. `headers` prop removed in favour of contextual column labels. |
| 10 | Wizard | done | Import `InlineEditSelectCell` and `useItemFieldOptions + FieldDerivationItem`. |
| 11 | Wizard | done | `ItemRow` extends `FieldDerivationItem` so hook receives typed data. |
| 12 | Wizard | done | Step 1: `family` and `sales_uom` fields replaced with `InlineEditSelectCell` dropdowns fed by `useItemFieldOptions`. Patch on selection. |
| 13 | Wizard | done | `Field` helper gains `tone?: "default" | "warning"` prop. Step 7 Review highlights unset required fields (item_id, item_name, supply_method, sales_uom) with warning tone. |
| 14 | Wizard | done | Step 1 validation banner: shown when user has started filling fields but required ones are still missing. Lists missing field names. |
| 15 | BOM editor | done | (Combined with 16) component detail link updated to `/admin/masters/components/[id]`. |
| 16 | BOM editor | done | `BomLineEditorRow` component column: name linked to `/admin/masters/components/[id]`, ID shown as `font-mono text-3xs text-fg-subtle` secondary line. |
| 17 | BOM editor | done | `ReadinessCard` blockers include `fixAction` derived by matching blocker code/detail against lines' `final_component_id`. Opens component detail page. |
| 18 | BOM editor | done | `PublishButton`: loading state shows "Checking preflight…"; confirmation message "This will become the active version." / "Override required — see dialog for details."; button label changes to "Publish (blocked)" / "Publish with override…" / "Publish". Override section in dialog gains `border-2 border-warning/60`, "Override" badge chip, risk warning paragraph. |
| 19 | BOM editor | done | Sticky draft banner: `sticky top-0 z-20` with `AlertTriangle`, "You are editing a draft — changes are not in production until published." and ghost "Discard changes" button that confirms with `window.confirm` then navigates to head page. |
| 20 | All | done | TypeScript clean (0 errors). Docs file written. All changes committed. |

---

## Canonical files touched

- `src/app/(admin)/admin/masters/health/page.tsx`
- `src/app/(admin)/admin/masters/archive/page.tsx`
- `src/app/(admin)/admin/products/new/page.tsx`
- `src/app/(admin)/admin/boms/[head_id]/versions/[version_id]/page.tsx`
