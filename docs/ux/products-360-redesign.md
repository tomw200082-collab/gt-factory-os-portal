# Products 360 (admin/products/[item_id]) — UX redesign log

**Owner:** Tom requested 20 polished iterations of the Product 360 page.
**Goal:** Bring `/admin/products/[item_id]` to full parity with
`/admin/masters/items/[item_id]` which completed its own 20-iter polish.
Every button has a clear, system-aligned purpose. Consistency-critical fields
are dropdowns. Applies to MANUFACTURED, BOUGHT_FINISHED, and REPACK products.

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
| `sales_uom` | yes (FK → `private_core.uom`) | Strict dropdown over `UOMS` from `lib/contracts/enums.ts`. No ad-hoc. |
| `family` | no | Soft dropdown over distinct values in use; admin-only `+ Add` footer. |
| `product_group` | no | Same as family. |
| `item_type` | no | Same as family. |
| `pack_size` | no | Same as family. |
| `case_pack` | no (integer) | Free-text numeric inline edit. |
| `item_name` | no | Free-text inline edit. |
| `status` | yes | Confirm-dialog toggle, not a dropdown. |

---

## Iteration roadmap

| # | Status | Outcome |
|---|---|---|
| 1 | done | Audit; located canonical page; inventoried 7 tabs; identified dropdown candidates for family, product_group, item_type, pack_size, sales_uom. |
| 2 | done | Wired `useItemFieldOptions` + `InlineEditSelectCell` for all 5 soft-dropdown fields. `saveField` helper typed as `Promise<void>` to satisfy both cell components. |
| 3 | done | Overview tab wired: family / product_group / item_type / pack_size / sales_uom use dropdown; item_name + case_pack remain free-text. |
| 4 | done | `MasterSummaryCard` hero added: KPI strip (Aliases, BOM/Supplier, Last update), completeness checklist, status + entity-type pill, `reveal-on-mount` first-paint animation. |
| 5 | done | Completeness checklist deep-links: every row carries `href` routing to the right tab; family + sales_uom checks for all product kinds; BOM check for MANUFACTURED+REPACK; fix-action CTA removed (covered by href deep-link). |
| 6 | done | Replaced bespoke tab bar with `DetailPage` TabStrip — full ARIA tablist semantics, Left/Right/Home/End keyboard nav, `badgeTone` pills on all 7 tabs, `key={active.key}` on tabpanel for `animate-fade-in-up`. |
| 7 | done | Overview restructured into "Identity & category" + "Packaging & units" SectionCards. `EditableField` helper with `(?)` `FieldHelp` Radix popover. Per-field help copy explains downstream role. `strict` chip on sales_uom. Technical-details collapsible with open-state transition. |
| 8 | done | BOM tab: supply-method-aware hero warning card when no BOM linked — supply-method badge, MANUFACTURED vs REPACK copy variant, downstream consequence bullet list, "Open BOM editor" CTA. |
| 9 | done | Suppliers tab for MANUFACTURED/REPACK: `LeadTimeChip` (green ≤7d / amber ≤14d / red >14d); coverage table per BOM component; `SupplierCoverageRow` with per-component supplier-items query. |
| 10 | done | Aliases tab redesigned: `ChannelBadge` (Shopify=green, LionWheel=blue, GI=amber); `ApprovalBadge`; rich empty state with explainer text + Add alias link; overflow-x-auto wrapper. |
| 11 | done | Planning tab: "Per-item overrides" info card (Gate 5 note + link to global defaults) + "Policy fields reference" table (5 definitions) + site-wide policy viewer. |
| 12 | done | History tab: rich 2-card informational layout — "Change history" (pending endpoint note) + "Audit coverage" (4-bullet list of tracked event types). |
| 13 | done | Inline-edit save feedback: "Saving…" while pending, error message on failure; wrapped in `role="status" aria-live="polite" aria-atomic="true"` at bottom of overview tab. |
| 14 | done | Components tab: component links to `/admin/components/[id]`; `ComponentReadinessCell` per row with `ReadinessPill`; overflow-x-auto. |
| 15 | done | MANUFACTURED/REPACK supplier empty state: supply-method-aware title/description; BOM-link status banner (info if linked, warning if missing); links to BOM editor and components browser. |
| 16 | done | Accessibility: all `InlineEditCell` + `InlineEditSelectCell` instances carry `ariaLabel`; mutation feedback in `role="status"` region; TabStrip retains full ARIA semantics from `DetailPage`. |
| 17 | done | Mobile: overflow-x-auto on all tables (aliases, BOM versions, components, suppliers, planning policy). Grids already responsive (sm:grid-cols-2, sm:grid-cols-3). KPI strip flex-wrap. |
| 18 | done | Polish: `key={active.key}` on tabpanel div (supplied by `DetailPage`) triggers `animate-fade-in-up` on tab switch. Hero wrapped in `reveal-on-mount`. Technical details collapsible has `open:bg-bg-subtle/60 transition-colors`. |
| 19 | done | Cross-product generalization: REPACK uses "per input component" copy variant in suppliers tab; MANUFACTURED uses "per ingredient". INACTIVE/PENDING/ACTIVE status tones correct. completenessItems correctly gates BOM check for MANUFACTURED+REPACK, supplier link reminder for BOUGHT_FINISHED. |
| 20 | done | TypeScript clean: only pre-existing errors in `admin/integrations/page.tsx` (2 lines, unchanged from baseline). Zero errors introduced by this file. |

---

## Resume protocol

1. Read this file.
2. Pick the next pending iteration row (all done — no pending rows).
3. Run `git log --oneline -- "src/app/(admin)/admin/products/[item_id]/page.tsx"`.
4. Implement iteration as one focused commit on `main`.
5. Run `"C:/Users/tomw2/Projects/window2-portal-sandbox/node_modules/.bin/tsc" --noEmit --project "C:/Users/tomw2/Projects/window2-portal-sandbox/tsconfig.json"` — must be 0 new lines.
6. Update this file: flip iteration row from `pending` to `done`.
7. Commit. Push autonomously per Tom's pinned permission.

---

## Canonical files touched

- `src/app/(admin)/admin/products/[item_id]/page.tsx` — page itself
- `src/components/tables/InlineEditSelectCell.tsx` — dropdown inline-edit (reused, not modified)
- `src/lib/admin/item-field-options.ts` — `useItemFieldOptions` hook (reused, not modified)
- `src/components/admin/MasterSummaryCard.tsx` — KPI strip hero (reused, not modified)
- `src/components/patterns/DetailPage.tsx` — TabStrip + ARIA tablist (reused, not modified)
- `src/components/readiness/ReadinessPill.tsx` — readiness indicator (reused, not modified)
