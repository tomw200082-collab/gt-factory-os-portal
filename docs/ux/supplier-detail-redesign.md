# Supplier Detail (admin/masters/suppliers/[supplier_id]) — UX redesign log

**Owner:** Tom asked for 20 polished iterations of the supplier detail page.
**Goal:** Beautiful, practical supplier detail; key fields use dropdowns; every section has clear purpose; consistent with the Product 360 redesign patterns.

---

## Tom's pinned requirements

1. **Key fields should be dropdowns** where consistency matters — supplier_type, currency, payment_terms.
2. **The page must be more beautiful and more practical** — structured sections, hero KPI strip, clear tab intent.

---

## Server-enforced enums vs. soft dropdowns

| Field | Server-enforced? | Strategy |
|---|---|---|
| `supplier_id` | yes (PK, immutable) | Locked — "Technical details" collapsible only with explanation. |
| `supplier_type` | no | Soft dropdown over distinct values currently in use; admin `+ Add new` escape hatch. |
| `currency` | no | Soft dropdown over distinct values currently in use; admin `+ Add new` escape hatch. |
| `payment_terms` | no | Soft dropdown over distinct values currently in use; admin `+ Add new` escape hatch. |
| `supplier_name_official` | no | Free-text inline edit. |
| `supplier_name_short` | no | Free-text inline edit. |
| `primary_contact_name` | no | Free-text inline edit. |
| `primary_contact_phone` | no | Free-text inline edit. |
| `default_lead_time_days` | no (integer) | Free-text numeric inline edit. |
| `default_moq` | no | Free-text inline edit. |
| `status` | yes | Drawer toggle, not a dropdown. |

---

## Iteration roadmap

| # | Status | Outcome |
|---|---|---|
| 1 | done | Field audit: supplier_type, currency, payment_terms → dropdowns; name/contact fields → free-text; supplier_id → locked. |
| 2 | done | Built `src/lib/admin/supplier-field-options.ts` with `useSupplierFieldOptions(rows)` — distinct values for supplier_type, currency, payment_terms as soft dropdowns. |
| 3 | done | Wired `InlineEditSelectCell` for supplier_type, currency, payment_terms in Overview tab (Commercial terms section). |
| 4 | done | Hero upgrade: `MasterSummaryCard` with completeness checklist — Name set, Short name set (warn), Supplier type set (warn), ≥1 active item (warn). KPI strip: items supplied count (success/warning), open exceptions (tone by severity), last update (muted). |
| 5 | done | Tab badge tones: supplier-items `"success"` when active items / `"warning"` when none; exceptions `"danger"` / `"warning"` / `"neutral"`; po-history `"info"` when has POs. |
| 6 | done | Supplier-items tab: primary item hero card above table; LeadTimeChip (green ≤7d / amber ≤14d / red >14d); ApprovalBadge tones; overflow-x-auto; component/item links. |
| 7 | done | PO history tab: rich empty state with CTA; group by status (OPEN/PARTIAL/RECEIVED/CANCELLED); last 10; links to `/purchase-orders/{po_id}`. |
| 8 | done | Exceptions tab: sort critical first; green "All clear" card; "Triage →" per row with border styling; "View all in Inbox →" header link. |
| 9 | done | Overview restructure: three SectionCards — "Identity" (names, supplier_id, type), "Commercial terms" (currency, payment_terms, lead_time, moq), "Contact" (name, phone). |
| 10 | done | EditableField helper with (?) help popovers explaining downstream effect: supplier_type → planning/filtering, currency → cost calculations/GI, payment_terms → PO approvals/cash-flow, lead_time → purchase recommendation timing, MOQ → planning fallback. |
| 11 | done | Technical details collapsible: lock explanation paragraph naming supplier_id as stable PK referenced by POs/supplier-items/GI. |
| 12 | done | Completeness deep-links route to correct tab (?tab=overview, ?tab=supplier-items). Fix-action buttons call e.stopPropagation() to prevent row nav from firing simultaneously. |
| 13 | done | Mutation feedback: all save states wrapped in `role="status" aria-live="polite" aria-atomic`. CostEditCell shows "Saving…" while pending (was just "…"). |
| 14 | done | Hero subtitle: `{supplier_type} · {currency}` — null parts omitted. |
| 15 | done | `reveal-on-mount` class on hero card wrapper for first-paint polish. |
| 16 | done | Mobile: `overflow-x-auto` on all tables (supplier-items + PO history). Grids already responsive (sm:grid-cols-2). |
| 17 | done | Cross-variant: ACTIVE/INACTIVE/PENDING status tones correct via SupplierStatusBadge. Supplier with/without items handled (empty state SectionCard tone="warning"). Supplier with/without POs handled (rich empty state). |
| 18 | done | Header: eyebrow "Admin · Suppliers", title = supplier_name_official, description = `Supplier {supplier_id}`. |
| 19 | done | This file: iteration roadmap. |
| 20 | done | TypeScript clean (exit 0, 0 lines). All 20 iterations committed and pushed to main. |

---

## Canonical files touched

- `src/app/(admin)/admin/masters/suppliers/[supplier_id]/page.tsx` — page itself
- `src/lib/admin/supplier-field-options.ts` — `useSupplierFieldOptions` hook
- `docs/ux/supplier-detail-redesign.md` — this file
