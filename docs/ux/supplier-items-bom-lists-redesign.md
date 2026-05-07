# UX Redesign — Supplier Items + BOM Lists

**Session date:** 2026-05-07  
**Files changed:**  
- `src/app/(admin)/admin/supplier-items/page.tsx`  
- `src/app/(admin)/admin/boms/page.tsx`  
- `src/app/(admin)/admin/masters/boms/page.tsx`

---

## Supplier Items (`/admin/supplier-items`) — Iterations 1–9

### Iter 1 — Structural Cleanup
Removed duplicate query keys and dead variable references. Consolidated `supplier_id` filter into `useEffect` to avoid stale closures. Normalised `itemsById` / `componentsById` map construction into `useMemo`.

### Iter 2 — Prominent Supplier Selection Card
Replaced the minimal `SectionCard title="Choose supplier"` with a full-bleed selection prompt: centered layout, `Building2` icon, dashed border, descriptive subtext, `autoFocus` on the `<select>` dropdown. The empty-supplier state is now a first-class call to action rather than a hidden filter row.

### Iter 3 — Supplier Context Bar
When a supplier is selected, a slim context bar replaces the full prompt card. Shows supplier name as a link to `/admin/masters/suppliers/<id>`, approval-status badge, and item count. A compact switcher `<select>` sits at the right for quick context switching without leaving the page.

### Iter 4 — Column Density Rebalance
Reordered columns: **Component**, **SKU / Supplier ref**, **Pack size**, **Cost**, **Lead time**, **Approval**, **Primary**, **Updated**, *(actions)*. Tightened horizontal padding on narrow columns. Mono font enforced on numeric cells with `tabular-nums`.

### Iter 5 — `LeadTimeChip` Component
Colour-coded chip rendered inline below the editable lead-time field:

| Range | Tone |
|-------|------|
| ≤ 7 d | `bg-success-softer text-success-fg` |
| 8–14 d | `bg-warning-softer text-warning-fg` |
| > 14 d | `bg-danger-softer text-danger-fg` |

Admin users see "Set lead time" italic prompt when `lead_time_days` is null. Non-admins see `—`.

### Iter 6 — `ApprovalBadge` Component
Maps `approval_status` string to `Badge` tones: `APPROVED` → success, `*PENDING*` → warning, `REJECTED` → danger, anything else → neutral. Replaces ad hoc text rendering.

### Iter 7 — "Set as Primary" Clarity
Renamed mutation button from "Promote" to **"Set as primary"**. Primary rows receive a `bg-success-softer/20` row highlight. Non-primary rows show the button only on hover (`opacity-0 group-hover:opacity-100`). The primary row shows a `Badge tone="success"` chip instead of the button.

### Iter 8 — Cost Cell with Timestamp
Cost cell shows formatted price via `formatPrice`. Below the price, a relative-time string (`relativeTime(updated_at)`) is rendered in `text-3xs text-fg-faint` with a `title` tooltip showing the full ISO date. Keeps temporal context without adding a column.

### Iter 9 — Supplier-Specific Empty State
When a supplier is selected but has zero items, renders: "No supplier items for this supplier yet." with a subdued "+ Add supplier item" CTA anchor. Differentiates from the global "no supplier selected" state. CTA links to `/admin/masters/supplier-items/new?supplier_id=<id>`.

---

## Legacy BOMs (`/admin/boms`) — Iterations 10–19

### Iter 10 — Import Cleanup
Removed `ReadinessPill` and `Breadcrumbs` imports (replaced by inline chip). Added `fmtSupplyMethod` for supply-method badge labels. Removed `formatQty` (not needed for line count display). Cleaned dead `recipeLabel` helper.

### Iter 11 — `relativeTime` Helper
Shared helper formats ISO timestamps as "just now / Xm / Xh / Xd ago". Used in the "last updated" column.

### Iter 12 — Supply Method Badge Tones
`MANUFACTURED` → `tone="info"` (blue). `REPACK` → `tone="warning"` (amber). Replaces the flat `tone="info"` applied to all rows regardless of kind.

### Iter 13 — Version Label in Active Version Cell
Per-row `versionsQuery` now fetches `/api/boms/versions?bom_head_id=<id>`. Active version column shows the human-readable `version_label` (e.g. `v3`) linked to the version detail page. Falls back to `"Active"` text if label is null. Eliminates truncated UUID exposure.

### Iter 14 — `BomReadinessState` + `BomReadinessChip`
Derived readiness state per row:

| State | Condition | Chip style |
|-------|-----------|-----------|
| `ready` | Has active version + ≥ 1 line | `bg-success-softer text-success-fg` |
| `draft` | Has draft version but no active | `bg-warning-softer text-warning-fg` |
| `empty` | No versions or 0 lines | `bg-danger-softer text-danger-fg` |

Replaces the `ReadinessPill` component which had inconsistent `is_ready` semantics.

### Iter 15 — Lines Count Chip
Active version line count shown as a mono chip beside the version label. Derived from `linesQuery` (already fired per active version). Chip reads `n lines` in `text-fg-muted` when loaded; shows `…` skeleton while loading.

### Iter 16 — Last Updated Column
`updated_at` from the most-recent version row rendered as `relativeTime` string with `title` tooltip. Column header: **Updated**. Falls back to `—` when no versions loaded.

### Iter 17 — Global "No BOMs" Empty State
When no BOMs exist at all (zero heads returned from API), shows: "No BOMs yet. BOMs are created from the item editor — open an item and configure its recipe." with a link to `/admin/masters/items`. Prevents blank-table confusion on fresh installs.

### Iter 18 — View-Only Info Banner
Persistent info banner below `WorkflowHeader`: "View only. To edit a BOM, open the item and use the recipe editor." Uses `bg-info-softer text-info-fg border-info/30` design tokens. Prevents users from expecting edit affordances in the list.

### Iter 19 — Status Filter Chips
Replaced the `<select>` status filter with four inline chip buttons:

| Chip | Filter |
|------|--------|
| All | Show all heads |
| Active | Has active version |
| Draft | Has draft, no active |
| Empty | No versions / no lines |

Uses `bg-accent text-bg` for selected chip; `bg-bg-subtle text-fg-muted hover:bg-bg-subtle/60` for unselected. No `<select>` elements needed.

---

## Canonical Masters BOMs (`/admin/masters/boms`) — Iterations 10–19 (parity)

All iterations 10–19 applied in parallel to the canonical route. Additional differences from the legacy route:

- **Output column** — `final_bom_output_qty` + `final_bom_output_uom` rendered right-aligned mono in a dedicated column. Absent in the legacy `/admin/boms` route.
- **Item external link** — `ArrowUpRight` icon beside item name links to `/admin/masters/items/<item_id>`. Click propagation stopped so it does not trigger row navigation.
- **Row click navigation** — `useRouter.push` on `<tr>` navigates to `/admin/masters/boms/<bom_head_id>`.
- `BomHeadListRow` component (instead of `BomRow`) for clarity; same per-row query pattern.
- `bom_head_id` shown as secondary mono label beneath item name (tertiary: `display_family`).

---

## Iteration 20 — TypeCheck

`npx tsc --noEmit` passes with zero errors in all three target files. Pre-existing errors in `admin/masters/health/page.ts` and `jobs/page.tsx` are unrelated to this work.

---

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `bg-success-softer / text-success-fg / border-success/30` | Ready state, primary row highlight, lead time ≤ 7d |
| `bg-warning-softer / text-warning-fg / border-warning/30` | Draft state, lead time 8–14d, REPACK badge |
| `bg-danger-softer / text-danger-fg / border-danger/30` | Empty state, lead time > 14d, REJECTED badge |
| `bg-info-softer / text-info-fg / border-info/30` | View-only banner, MANUFACTURED badge |
| `text-fg-faint / text-fg-subtle / text-fg-muted` | Secondary, tertiary, quaternary text hierarchy |
| `bg-bg-subtle` | Table header background, skeleton pulses |
| `text-3xs / tracking-sops` | Column headers, secondary meta text |
| `font-mono / tabular-nums` | All quantity, price, ID, date cells |
