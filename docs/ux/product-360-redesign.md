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
| 18 | partial | Hero MasterSummaryCard wrapped in `reveal-on-mount` for first-paint polish. Remaining: motion across tab switching, dark/light parity sweep. |
| 9 | pending | Supplier items tab — primary supplier badge, lead time, last cost, drift indicators. |
| 10 | pending | Anchors tab — timeline of count anchors, current anchor highlight, rebuild parity badge. |
| 11 | pending | Policy tab — planning policy form with explanations, uncertainty bands, freshness. |
| 12 | pending | Exceptions tab — typed-card style aligned with Inbox redesign. |
| 13 | pending | Inline-edit pattern — popover variant with validation + audit reason. |
| 14 | pending | Empty/loading/error states — every tab and card. |
| 15 | pending | Activity drawer — recent ledger events, recent submissions, recent edits. |
| 16 | pending | Accessibility pass — focus order, aria, contrast, keyboard, Hebrew/RTL safety. |
| 17 | pending | Mobile / narrow viewport responsive layout. |
| 19 | pending | Cross-product generalization — verify every supply_method × status combination. |
| 20 | pending | Acceptance pass — typecheck, build, screenshots, before/after, regression list, handoff note. |

---

## Resume protocol

1. Read this file.
2. Pick the next pending iteration row.
3. Read `git log --oneline -- "src/app/(admin)/admin/masters/items/[item_id]/page.tsx"` to see what is in tree.
4. Implement the iteration as one focused commit on `main`.
5. Run `npx --no-install tsc --noEmit > /tmp/tsc-out.log 2>&1; echo $?` from the sandbox root — must be 0 lines, exit 0.
6. Update this file: flip the iteration row from `pending` to `done` and append the actual outcome.
7. Commit. Push autonomously per Tom's pinned permission.

---

## Canonical files touched so far

- `src/app/(admin)/admin/masters/items/[item_id]/page.tsx` — page itself
- `src/components/tables/InlineEditSelectCell.tsx` — new dropdown inline-edit component
- `src/lib/admin/item-field-options.ts` — `useItemFieldOptions` hook + UOM grouping
- `src/components/admin/MasterSummaryCard.tsx` — added KPI strip, subtitle, deep-linkable checklist rows, completion-% pill, dot icons
