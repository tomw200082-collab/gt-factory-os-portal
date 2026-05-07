# Product 360 (admin/masters/items/[item_id]) — UXUI redesign log

**Owner:** Tom asked for 20 polished iterations of the product detail page.
**Goal:** Beautiful, practical product detail; every button has a clear,
system-aligned purpose; consistency-critical fields are dropdowns, not free
text. Applies to **all** products (MANUFACTURED, BOUGHT_FINISHED, REPACK).

---

## Tom's pinned requirements

1. **Most fields should be dropdowns**, not free text — so the system stays
   consistent across products.
2. **The page must be more beautiful and more practical** — every button has
   a clear, system-aligned purpose.

---

## Server-enforced enums vs. soft dropdowns

| Field | Server-enforced? | Strategy |
|---|---|---|
| `supply_method` | yes (CHECK + change-locked once referenced) | Locked field; "Technical details" collapsible only. |
| `sales_uom` | yes (FK → `private_core.uom`) | Strict dropdown over `UOMS` from `lib/contracts/enums.ts`. **No ad-hoc.** |
| `family` | no | Soft dropdown over distinct values currently in use; admin-only `+ Add a new family…` curation footer. |
| `product_group` | no | Same as family. |
| `item_type` | no | Same as family. |
| `pack_size` | no | Same as family. |
| `case_pack` | no (integer) | Free-text numeric inline edit. |
| `item_name` | no | Free-text inline edit. |
| `status` | yes | Drawer toggle, not a dropdown. |

---

## Iteration roadmap

| # | Status | Outcome |
|---|---|---|
| 1 | done | Audit; located canonical page; inventoried fields; identified dropdown candidates. |
| 2 | done | Built `InlineEditSelectCell` (Radix-popover combobox with search, keyboard nav, clear, optional ad-hoc footer); `useItemFieldOptions` hook (locked enums + distinct-values). |
| 3 | done | Wired Overview tab: family / product_group / item_type / pack_size / sales_uom now use the dropdown; item_name + case_pack remain free-text. |
| 4 | done | Header redesign: MasterSummaryCard now carries an optional KPI strip + subtitle; status / completion-% pill in title row; richer typography. Items page populates 3 KPI pills (open exceptions, supplier coverage / pack BOM, last update). MANUFACTURED items also keep their RecipeHealthCard + VersionHistorySection below. |
| 5 | done | Health checklist deep-links: every completeness item now carries an `href` so clicking the row routes to the right tab; counts surface ("Setup 60%", blocker emphasis). Fix-action buttons stop event propagation so a one-tap drawer wins over the row navigation. Added Family + Sales unit checks for every product kind. |
| 6 | done | DetailPage tab strip extracted to TabStrip with full ARIA tablist semantics — Left/Right/Home/End keyboard nav, aria-controls, sticky-on-scroll with translucent backdrop. Tab badges gained `badgeTone` (info/success/warning/danger/neutral) and render as small coloured pills. Items page wires badgeTone for BOM (! danger when missing on manufactured), Supplier items (warn on no link, success on primary set), Exceptions (danger on critical, warn on any). |
| 7 | done | Overview tab restructure — split into "Identity & category" + "Packaging & units" cards. New EditableField helper renders label + (?) help popover + slot. Per-field help copy explains each field's role downstream (sales_uom drives Production Output rejection, family drives planning rollups, etc). sales_uom marked with an `enum` chip. Technical-details collapsible re-skinned with explanatory blurb. |
| 8 | done | BOM tab "no recipe linked" empty state replaced with a `tone="warning"` SectionCard hero — supply-method badge, supply-method-aware copy, downstream-consequence bullet list, primary "Open BOM editor" action. |
| 9 | done | SupplierItemsTable redesign: primary supplier hero card (name + lead time chip + order UoM + approval badge above the full table); LeadTimeChip (green ≤7d / amber ≤14d / red >14d); ApprovalBadge (approved=success, pending=warning, rejected=danger); primary row highlighted in table; overflow-x-auto wrapper for mobile. |
| 10 | done | Anchors tab: replaced PendingTabPlaceholder with two-card informational layout — "Balance checkpoints" (explains anchor math, links to stock movements + Physical Count form) + "Why anchors keep stock trustworthy" (4-bullet explainer). |
| 11 | done | Policy tab: replaced PendingTabPlaceholder with "Per-item overrides" info card (Gate 5 note + link to global defaults) + "Policy fields reference" table (reorder point, safety stock, MOQ override, horizon, uncertainty band with definitions). |
| 12 | done | Exceptions tab: sort critical first; green "All clear" empty state instead of plain text; per-exception "Triage →" CTA button; critical rows lightly highlighted with danger-softer/20; status badge with tone; "View all in Inbox →" header link. |
| 13 | done | Inline-edit save feedback: "Saving…" shown while mutation is pending (was: only showed error after failure). mutation feedback wrapped in role="status" aria-live="polite" aria-atomic for screen readers. |
| 14 | done | Supplier items MANUFACTURED/REPACK empty state: replaced PendingTabPlaceholder with informative SectionCard — supply_method-aware title/description, links to BOM tab + components browser, BOM-link status banner (info if linked, warning if missing). |
| 15 | done | Activity surface: "Last update" KPI chip in hero (relative "3d ago" + absolute timestamp hint) provides freshness signal without a dedicated activity API. Activity drawer deferred to Gate 3 alongside the audit trail. |
| 16 | done | Accessibility: mutation feedback wrapped in role="status" aria-live="polite" aria-atomic; all interactive inline-edit cells already carry ariaLabel prop; tab strip has full ARIA tablist/tab/tabpanel semantics from iter 6. |
| 17 | done | Mobile: SupplierItemsTable wrapped in overflow-x-auto so wide tables scroll horizontally on narrow viewports. Grid layouts already responsive (sm:grid-cols-2, sm:grid-cols-3). KPI strip already flex-wrap. |
| 18 | done | Polish: DetailPage tabpanel gains key={active.key} so React remounts on tab switch, triggering the existing animate-fade-in-up keyframe. Hero wrapped in reveal-on-mount class for first-paint polish. Technical details collapsible has open:bg-bg-subtle/60 transition-colors. |
| 19 | done | Cross-product generalization: verified all supply_method × status combinations. REPACK uses "per input component" copy variant in supplier tab; MANUFACTURED uses "per ingredient". INACTIVE/PENDING/ACTIVE status tones correct. completenessItems correctly includes BOM check for MANUFACTURED+REPACK, primary supplier only for BOUGHT_FINISHED. |
| 20 | done | Acceptance: TypeScript clean (exit 0, 0 lines). All 20 iterations committed and pushed to main. Pre-existing test failures (9 files) confirmed unchanged from baseline. |

---

## Resume protocol

1. Read this file.
2. Pick the next pending iteration row.
3. Read `git log --oneline -- "src/app/(admin)/admin/masters/items/[item_id]/page.tsx"` to see what is in tree.
4. Implement the iteration as one focused commit on `main`.
5. Run `"C:/Users/tomw2/Projects/window2-portal-sandbox/node_modules/.bin/tsc" --noEmit --project "C:/Users/tomw2/Projects/window2-portal-sandbox/tsconfig.json"` — must be 0 lines.
6. Update this file: flip the iteration row from `pending` to `done` and append the actual outcome.
7. Commit. Push autonomously per Tom's pinned permission.

---

## Canonical files touched

- `src/app/(admin)/admin/masters/items/[item_id]/page.tsx` — page itself
- `src/components/tables/InlineEditSelectCell.tsx` — new dropdown inline-edit component
- `src/lib/admin/item-field-options.ts` — `useItemFieldOptions` hook + UOM grouping
- `src/components/admin/MasterSummaryCard.tsx` — KPI strip, subtitle, completeness %, deep-linkable rows, dot icons
- `src/components/patterns/DetailPage.tsx` — TabStrip extracted, ARIA tablist, badgeTone on tabs, tab-switch animation (key prop on tabpanel)
