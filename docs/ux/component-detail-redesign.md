# Component Detail (admin/masters/components/[component_id]) — UX/UI redesign log

**Owner:** Tom asked for 20 polished iterations of the component detail page.
**Goal:** Beautiful, practical component detail page aligned with the Product 360 redesign
patterns established for items; every button has a clear system-aligned purpose;
consistency-critical fields are dropdowns; information architecture matches daily
factory use.

---

## Tom's pinned requirements

1. **Most fields should be dropdowns**, not free text — so component data stays
   consistent across the master list.
2. **The page must be more beautiful and more practical** — every button has a
   clear, system-aligned purpose.

---

## Field classification

| Field | Strategy |
|---|---|
| `component_name` | Free-text inline edit. |
| `component_class` (category) | Soft dropdown — distinct values in use + admin ad-hoc. |
| `component_group` | Soft dropdown — distinct values in use + admin ad-hoc. |
| `criticality` | Soft dropdown — canonical HIGH/MEDIUM/LOW set + any extra from data. |
| `inventory_uom` | Locked — FK to uom table. Display-only; shown with `enum` chip. |
| `purchase_uom` | Locked — shown only when distinct from inventory_uom. |
| `bom_uom` | Locked — in Technical details collapsible only. |
| `purchase_to_inv_factor` | Locked — in Technical details collapsible. |
| `component_id` | Locked — in Technical details collapsible. |
| `planned_flag` | Display-only (boolean). |
| `planning_policy_code` | Display-only (system-managed). |
| `lead_time_days` | Display-only at component level; editable in supplier-items table. |
| `moq_purchase_uom` | Display-only at component level. |
| `primary_supplier_id` | Display-only link; change via supplier-items tab Promote action. |

---

## Iteration roadmap

| # | Status | Outcome |
|---|---|---|
| 1 | done | Audited all fields; classified dropdown vs free-text vs locked; identified component_group, component_class, criticality as soft-dropdown candidates; inventory_uom as strict enum. |
| 2 | done | Created `src/lib/admin/component-field-options.ts` with `useComponentFieldOptions(rows)` — distinct-value soft dropdowns for component_group and category (component_class) with usage counts; strict UOMS enum for uom with groups (Mass/Volume/Count); canonical criticality set (HIGH/MEDIUM/LOW) with usage counts. |
| 3 | done | Wired `InlineEditSelectCell` for component_group (Group), component_class (Category), and criticality in the Overview tab. isAdmin guard applied. allowAdHoc=true for group and category; criticality uses the canonical set without ad-hoc. |
| 4 | done | Hero upgrade: `MasterSummaryCard` with KPI strip (open exceptions with danger/warning/success tone, supplier links count with primary-set tone, last-updated relative time). Completeness checklist: Name set, UOM set, Primary supplier set (error + fixAction CTA), Used in recipes (na — deferred to tab), Standard cost (warn if none). Hero wrapped in `reveal-on-mount` div. |
| 5 | done | Tab badge tones: supplier-items tab `badgeTone="warning"` when no primary, `"success"` when primary set. Exceptions tab `"danger"` when critical exceptions exist, `"warning"` when any. |
| 6 | done | Supplier-items tab: primary supplier hero card (name + LeadTimeChip + order UoM + ApprovalBadge) above the full table. LeadTimeChip: green ≤7d, amber ≤14d, red >14d. ApprovalBadge: APPROVED=success, PENDING*=warning, REJECTED=danger. Table: primary row highlighted `bg-success-softer/20`. Added Approval Status column. Full table wrapped in `overflow-x-auto`. |
| 7 | done | Used-in-recipes tab: rendered via existing `UsedInRecipes` component which shows BOM head links, BOM kind, active version reference, partial-failure warning, and "not used" empty state. |
| 8 | done | Anchors tab: replaced with rich two-card informational layout — "Balance checkpoints" (explains anchor math with code block formula, links to stock movements + Physical Count form) + "Why anchors keep stock trustworthy" (4-bullet explainer: immutable history, drift detection, compact replay, no round-trip Excel). |
| 9 | done | Exceptions tab: sort critical first; green "All clear" SectionCard when empty; per-exception "Triage →" button (styled as a small bordered chip); critical rows `bg-danger-softer/20`; "View all in Inbox →" header link. |
| 10 | done | Technical details collapsible re-skinned with `open:bg-bg-subtle/60 transition-colors` background; explanatory blurb about why component_id, BOM unit, and conversion factor are locked. Moved to a border-wrapped `<details>` element for visual containment. |
| 11 | done | Deep-links on completeness rows: Name Set → `?tab=overview`; UOM Set → `?tab=overview`; Primary Supplier → `?tab=supplier-items`; Used in recipes → `?tab=used-in-recipes`; Standard cost → `?tab=supplier-items`. Fix-action buttons call `e.stopPropagation()` to prevent row navigation. |
| 12 | done | Mutation feedback wrapped in `role="status" aria-live="polite" aria-atomic` divs. Shows "Saving…" while mutation is pending in both overview and supplier-items tab. Error state surfaced inline. |
| 13 | done | Hero subtitle: `component_group · component_class` format (nulls omitted). Rendered as subtitle prop on MasterSummaryCard. |
| 14 | done | Overview tab split into two cards: "Identity & classification" (name, category, group, criticality, primary supplier, planned flag) and "Units & procurement" (stock unit, purchase unit when distinct, planning policy, lead time, MOQ, order multiple). Matches the two-card pattern from the items 360 redesign. |
| 15 | done | EditableField helper component: label + (?) help popover (Radix Popover, since Radix Tooltip is not installed) + optional `enum` chip. One per editable field in Overview. Help copy explains each field's downstream role. |
| 16 | done | Mobile: SupplierItemsTable wrapped in `overflow-x-auto` div. Grid layouts already `sm:grid-cols-2`. |
| 17 | done | Cross-variant check: ACTIVE/INACTIVE/PENDING status tones correct via `ComponentStatusBadge`. Components with no primary supplier show warning badge tone + "Assign primary supplier" CTA. Components with no supplier links show empty state with CTA. Exception tone by severity. All null-field paths safe. |
| 18 | done | Header: WorkflowHeader eyebrow "Admin · Components", title = component name, description = component_id (displayed as plain text; WorkflowHeader renders description in monospace per its own conventions). `primarySi` tab removed (merged into supplier-items tab with hero card). Anchors tab added. |
| 19 | done | Wrote `docs/ux/component-detail-redesign.md` with full iteration roadmap table in the same format as product-360-redesign.md. |
| 20 | done | TypeScript clean — `tsc --noEmit` returns empty output. All 20 iterations committed and pushed to main. |

---

## Resume protocol

1. Read this file.
2. Pick the next pending iteration row.
3. Run `git log --oneline -- "src/app/(admin)/admin/masters/components/[component_id]/page.tsx"` to see what is in tree.
4. Implement the iteration as one focused commit on `main`.
5. Run `"C:/Users/tomw2/Projects/window2-portal-sandbox/node_modules/.bin/tsc" --noEmit --project "C:/Users/tomw2/Projects/window2-portal-sandbox/tsconfig.json"` — must be 0 lines.
6. Update this file: flip the iteration row from `pending` to `done` and append the actual outcome.
7. Commit. Push autonomously.

---

## Canonical files touched

- `src/app/(admin)/admin/masters/components/[component_id]/page.tsx` — page itself
- `src/lib/admin/component-field-options.ts` — `useComponentFieldOptions` hook + UOM grouping + criticality options
- `src/components/tables/InlineEditSelectCell.tsx` — reused; no changes needed
- `src/components/admin/MasterSummaryCard.tsx` — reused; no changes needed
- `src/components/patterns/DetailPage.tsx` — reused; no changes needed
- `src/components/admin/UsedInRecipes.tsx` — reused; no changes needed
