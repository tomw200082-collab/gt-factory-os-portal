# SKU Management Pages — UX Redesign log

**Owner:** Tom asked for 20 polished iterations across the SKU Aliases and SKU Map pages.
**Goal:** Professional, practical admin surfaces for managing external SKU → canonical item mappings.

---

## SKU Aliases page (`/admin/sku-aliases`) — iterations 1-12

| # | Status | Outcome |
|---|---|---|
| 1 | done | Audit: channel tabs (LionWheel/Shopify), unmapped exceptions list, item picker (raw `<select>`), batch approve button, audit list. Gaps: tab counts missing, item picker shows IDs not names, no search, no relative timestamps, empty state was plain text. |
| 2 | done | Channel tabs redesigned: each tab now shows a count badge ("LionWheel (3)"). Badge uses warning-softer/warning-fg tone when `pendingForChannel > 0`, neutral otherwise. Per-channel exception count fetched from `/api/exceptions?limit=1` for low overhead. |
| 3 | done | Unmapped summary card above the table. Shows "X aliases need approval" with tone based on count: warning for <10, danger for ≥10. `selected.size` counter visible on the right when rows are checked. |
| 4 | done | Exception row improvements: external_sku rendered as a monospace pill chip (bordered `bg-bg-subtle`). Source channel shown as `<ChannelBadge>` (LionWheel=neutral, Shopify=info). "First seen" column now shows relative time ("3d ago") with absolute timestamp on hover. |
| 5 | done | Item picker replaced with `<SearchableSelect>` from `src/components/fields/SearchableSelect.tsx`. Options built with `label = item_name`, `meta = item_id` (renders item_id as monospace secondary line). Keyboard-navigable with substring search. |
| 6 | done | Batch approve button now shows selected count: "Approve 3 selected". When `canApprove` is true, adds `ring-2 ring-accent/30` highlight. Falls back to "Approve selected" when 0 selected. |
| 7 | done | Per-row "Approve" button (btn-primary, small) in the Actions column. Fires the same `approveMutation` with a single-row payload. Disabled + titled "Assign an item first" when no item assigned. |
| 8 | done | Audit list: "Item" column now shows item_name (linked to `/admin/masters/items/{item_id}`) with item_id below in monospace. "Status" column uses `<ApprovalBadge>` (APPROVED=success, PENDING=warning, REJECTED=danger). "Approved" column shows relative time. |
| 9 | done | Client-side search added to both the unmapped list and the audit list. Unmapped search filters on `external_sku` + assigned item name. Audit search filters on `external_sku`, `item_name`, and `item_id`. Both show a clear (✕) button when non-empty. |
| 10 | done | Empty state when no unmapped SKUs: green success card "All clear — no unmapped {channel} SKUs pending approval." Explains the channel will show new entries as soon as the poller encounters an unknown SKU. |
| 11 | done | Channel-specific context note rendered as an info banner below the tab strip. LionWheel note explains order line items + planning demand. Shopify note explains product handle/SKU field + on-hand reconciliation. |
| 12 | done | Page header KPI row: four `<MetricChip>` components (Total aliases / Approved / Pending / Rejected). Pending chip uses warning tone when >0, neutral otherwise. Rejected chip uses danger tone when >0. An additional "Unmapped (open)" warning chip appears when there are open exceptions. |

---

## SKU Map page (`/admin/sku-map`) — iterations 13-20

| # | Status | Outcome |
|---|---|---|
| 13 | done | Audit: original columns were Channel (plain text), External SKU (mono), Platform Item (raw item_id), Status (badge), Created, Action (approve button). Page was dual-purpose (read+approve). Redesign target: pure read-only audit. |
| 14 | done | Audit table redesigned: alias_id shown as `{uuid.slice(0,8)}…` in `font-mono text-3xs text-fg-muted`. source_channel rendered as `<ChannelBadge>` (LionWheel=neutral, Shopify=info, Green Invoice=neutral). external_sku rendered as monospace chip. |
| 15 | done | item_id column replaced with item_name + item_id pair. item_name is a `<Link>` to `/admin/masters/items/{item_id}`. item_id shown below in `font-mono text-3xs text-fg-muted`. Name resolved from a separate `/api/items?limit=1000` query joined client-side; falls back to raw item_id if items query errors. |
| 16 | done | ApprovalBadge: APPROVED=success dotted, PENDING=warning dotted, REJECTED=danger dotted. Same badge component as SKU Aliases audit list. |
| 17 | done | Notes column: value is `block truncate max-w-[180px]` with `title={row.notes}` so the full text appears on hover. Empty notes show "—" in `text-fg-faint`. |
| 18 | done | Filter controls replaced with pill toggle groups. Channel: All channels / LionWheel / Shopify / Green Invoice. Status: All / Approved / Pending / Rejected. Active pill uses `bg-accent text-accent-fg` solid fill. Both default to "All" (empty string). |
| 19 | done | Summary header in `WorkflowHeader.meta`: "X approved mappings across Y items" derived from filtered rows. "Last updated Xd ago" freshness chip (green dot + border) shows relative time of the most recent `created_at`. Header only shown when no filter is active (to avoid misleading subset stats). "Manage aliases" action button links to `/admin/sku-aliases`. |
| 20 | done | TypeScript clean (exit 0, 0 lines). This doc written at `docs/ux/sku-management-redesign.md`. Approve action and legacy mutation code removed from SKU Map — page is fully read-only as intended. |

---

## Canonical files touched

- `src/app/(admin)/admin/sku-aliases/page.tsx` — iters 1-12
- `src/app/(admin)/admin/sku-map/page.tsx` — iters 13-20
- `docs/ux/sku-management-redesign.md` — this file (iter 20)

## Design tokens used

All tokens are from the existing portal token set. No new tokens introduced.

- Monospace chip: `rounded-sm border border-border/60 bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg`
- Channel badges: `Badge` component from `src/components/badges/StatusBadge.tsx`
- Approval badge: same `Badge` component, tone-matched (success/warning/danger)
- MetricChip: inline component using `border-{tone}/40 bg-{tone}-softer text-{tone}-fg`
- Pill toggles: `rounded-full border px-3 py-1 text-xs` with active state `bg-accent text-accent-fg`
- Relative time: `new Date(isoStr)` math with `title` showing absolute ISO string
