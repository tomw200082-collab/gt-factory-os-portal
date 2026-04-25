# Recipe-Readiness Corridor — Design Spec

**Date:** 2026-04-25
**Owner:** Tom (approval), Claude/W2 (authoring)
**Scope window:** Window 2 (portal/UI) only — no backend invariant changes.

---

## 1. Goal

Give an admin a single product-first surface where recipe edits and supplier/price readiness are handled together in the right order. The admin opens a product, sees one health picture, and is guided through `Recipe edit → BOM readiness → Supplier/price readiness → Publish` without leaving the product context.

## 2. Non-goals (explicitly out of scope)

- ❌ A separate broad supplier-edit module / generic supplier CRUD UI
- ❌ Backend-side new invariants for supplier/price readiness (publish remains permitted with supplier/price warnings — UI readiness state alone reflects this)
- ❌ Recipe editing entered from the BOM detail page outside the product context
- ❌ Inventing freshness thresholds beyond policy/config exposure described in §7
- ❌ Customer pricing, cost rollup, or finance write-back work
- ❌ Mass-edit / bulk-recipe import

## 3. Architectural anchors (confirmed, not invented)

These are facts about the system that the design relies on. None of them changes as part of this corridor.

| Anchor | Detail |
|---|---|
| MANUFACTURED item shape | `items.primary_bom_head_id` (pack BOM) + `items.base_bom_head_id` (base formula). Two parallel BOMs per product. |
| BOM versioning | `bom_head` → `bom_version (DRAFT/ACTIVE/SUPERSEDED)` → `bom_lines`. Edits permitted only on DRAFT versions (backend returns 409 `VERSION_NOT_DRAFT` otherwise). |
| Clone-and-edit | `POST /api/boms/versions { head_id, clone_from_version_id?, idempotency_key }` already creates DRAFT from an existing version's lines. |
| Line CRUD | `POST/PATCH/DELETE /api/boms/versions/:id/lines[/:line_id]` exist; admin-gated; DRAFT-only. |
| Publish preflight | `GET /api/boms/versions/:id/publish-preview` returns `{ blocking_issues, warnings, can_publish_clean, can_publish_with_override }`. |
| Backend hard-blockers on publish | `EMPTY_VERSION`, `PLANNING_RUN_IN_FLIGHT`, `VERSION_NOT_DRAFT`, `STALE_ROW`. **Supplier/price gaps are NOT backend invariants.** |
| Backend warning on publish | `UNPOSTED_PRODUCTION_ACTUALS` (override-able). |
| Supplier-item shape | `supplier_items.is_primary` flag, `std_cost_per_inv_uom`, `lead_time_days`, `moq`. PATCH endpoint exists. |
| Price age signal | `supplier_items.updated_at` is the proxy for "active price age" until/unless `price_history` integration is wired in. |

## 4. Entry point and information architecture

**Single entry point:** `/admin/masters/items/[item_id]` for MANUFACTURED items. The Recipe-Health card replaces the current generic MasterSummaryCard for those items only. BOUGHT_FINISHED / REPACK items keep the existing summary card (no recipe to publish).

**Sub-routes added under existing tree:**
- `/admin/masters/boms/[bom_head_id]/[version_id]/edit` — DRAFT line editor (admin-only)
- All other surfaces re-use existing routes.

## 5. Health states (canonical — UI-only signal)

The Recipe-Health card top-line state is computed client-side. It is the only surface where this color shows up; backend publish endpoints are unchanged.

| State | Conditions (ALL must hold for green) |
|---|---|
| 🟢 מוכן לייצור | (1) base BOM has an active version with ≥1 line; (2) pack BOM has an active version with ≥1 line; (3) all line quantities valid (>0) and components ACTIVE; (4) every referenced raw/pack item has a primary supplier; (5) every referenced raw/pack item has **an active price record** AND that price's age ≤ `PRICE_AGE_WARN_DAYS` |
| 🟡 מוכן עם אזהרות / Production-ready with warnings | base + pack BOMs both have active versions with ≥1 line AND all quantities valid AND components active, but at least one supplier/price warning present (missing primary, stale price, missing active price). Publish IS permitted. Readiness color stays yellow. |
| 🔴 לא ניתן לפרסם / Cannot publish | Any of: missing BOM head, BOM with no active version, active version with 0 lines, invalid quantity, INACTIVE component referenced, hard-blocker from backend preflight |

A version that has been published successfully but still has supplier/price warnings shows in §1 as "מתכון פורסם עם אזהרות רכש/מחיר" — yellow badge, not green. The user explicitly approved this distinction.

## 6. Screen flow

### 6.1 Recipe-Health card (top of product page)

Two tracks side-by-side on desktop (≥640px), stacked on mobile:

```
┌─ מתכון ייצור · {item_name} ───────────────────────────────────┐
│                                                                 │
│  בסיס המוצר (Base formula)        אריזת המוצר (Pack BOM)      │
│  ──────────────────────────       ───────────────────────────   │
│  Active: v3 · 12 lines            Active: v2 · 4 lines          │
│  ✅ structure complete            ✅ structure complete         │
│  ⚠ 2 components missing supplier  ✅ supplier coverage 100%    │
│  ⚠ 1 stale price (>120d)          ✅ prices fresh               │
│                                                                 │
│  [Edit recipe →]                  [Edit recipe →]               │
│                                                                 │
│  🟡 מוכן לייצור עם אזהרות — 3 אזהרות פתוחות                  │
│  [View readiness panel ↓]                                       │
└─────────────────────────────────────────────────────────────────┘
```

Each track summarizes its BOM head: active version label, lines count, structural status, supplier/price counts. The unified readiness state (§5) is shown at the bottom with a jump-to-panel button.

### 6.2 Draft edit flow (entry from `[Edit recipe →]`)

| Pre-state | Action |
|---|---|
| Active version exists, no DRAFT for this head | Spinner "Creating draft v{N+1} from v{active}…" → `POST /api/boms/versions { head_id, clone_from_version_id }` → navigate to `/admin/masters/boms/{head_id}/{new_version_id}/edit` |
| DRAFT already exists | Confirm modal: "יש כבר טיוטה v{N+1} מ-{date} ע"י {user}. להמשיך לערוך?" → navigate to that draft (no new version created) |
| No active version exists | Confirm modal: "אין מתכון פעיל. ליצור מתכון ראשון?" → `POST /api/boms/versions` without `clone_from_version_id` → empty draft |
| User lacks admin role | Buttons not rendered (existing `isAdmin` gate) |

Returning to product page after publish or cancel restores scroll/focus.

### 6.3 BOM line editor (`[bom_head_id]/[version_id]/edit`)

Sticky header bar:
- Title: "Editing v{N+1} DRAFT for {item_name} — base formula" (or "pack BOM")
- Status pill: DRAFT
- Actions: `[Cancel]` `[Save & Continue]` `[Publish →]`

Lines table (one row per BOM line):
- Component name — read-only, EntityPicker only when adding a new line
- Quantity — InlineEditCell, type=number, inputMode=decimal, validates >0
- UOM — read-only mirror of `components.bom_uom`
- Per-line readiness pip + tooltip. Color rules:
  - 🔴 = INACTIVE component referenced, OR quantity ≤ 0 (these are the only line-level hard-blocks; both prevent publish)
  - 🟡 = missing primary supplier OR no active price record OR price age > `PRICE_AGE_WARN_DAYS`
  - 🟢 = no warnings or blocks for this line
  Pip is the operator's primary affordance for which lines to click [Fix] on.
- Quick-fix button per line when 🟡/🔴 (opens drawer in §6.5)
- 🗑 delete row → `DELETE /api/boms/versions/:id/lines/:line_id`

Add line: `[+ Add component]` → drawer with EntityPicker (search by name/code; filterable by `component_class`). Save → `POST /api/boms/versions/:id/lines`.

Live diff vs active: collapsible section "Changes from v{active}" showing added (green), removed (red), qty changed (yellow with old → new). Read from `/api/boms/lines` for both versions client-side.

### 6.4 Supplier/Price Readiness panel

Layout: sticky right-side panel on desktop (lg+), collapsible bottom drawer on mobile (accessed via sticky bottom button "⚠ N warnings").

Data: client-side merge of (a) all components referenced in current draft lines, (b) `supplier_items` for each component, (c) primary supplier identification + active price age.

Row example:
```
RM_LEMON_002    ✅ ACME Citrus    ⚠ 142d old    [Fix]
PKG_BOTTLE_500  ⚠ none set        n/a            [Fix]
```

Severity rules (UI-only — backend doesn't enforce on publish):
- **🔴 hard-block:** none in this panel. Per Tom's instruction, supplier/price never blocks publish.
- **🟡 warn:** missing primary supplier; no active price record; price age > `WARN_THRESHOLD` days; price age > `STRONG_WARN_THRESHOLD` days escalates to stronger warning text but still not a block.

### 6.5 Quick-fix drawer (per line, from `[Fix]`)

Opens a focused drawer over the editor — not a navigation. Three guided actions, exposed conditionally:

**Action A — Set existing supplier as primary** (shown when component has ≥1 supplier_item but none flagged primary, or admin wants to switch among existing links):
- Lists all `supplier_items` for this component as radio rows (supplier name, lead time, MOQ, std cost)
- Save → PATCH `supplier_items/:id { is_primary: true }`. Atomicity behavior: if the backend demotes the previous primary atomically, one PATCH suffices. If not, the UI runs a sequential PATCH to demote the old primary (see "atomicity contract" below — applies to both Actions A and C).
- After save: re-query readiness panel, drawer closes

**Action B — Add new sourcing link** (shown when component has 0 supplier_items, OR as second option when admin wants a brand-new supplier on top of existing links):
- Embeds existing `QuickCreateSupplierItem` form (component pre-filled)
- Optional checkbox "Set as primary" (default checked when no other primary exists)
- Save → reuses existing mutation flow

**Action C — Swap primary supplier (guided)** [NEW per Q2 approval]:
- Step 1: select-or-add a target supplier_item (reuses A's list and B's form, depending on whether the new supplier already has a sourcing link to this component)
- Step 2: confirmation panel shows side-by-side:
  - **Current primary:** {supplier_name} · cost {x} · lead {y}d · MOQ {z}
  - **New primary:** {supplier_name} · cost {x} · lead {y}d · MOQ {z}
  - One required confirm checkbox: "אני מאשר להחליף את הספק הראשי ולהוריד את הקודם"
- Save: see "atomicity contract" below.
- After save: readiness panel re-queries

**Atomicity contract (binds Actions A and C):**

The implementation plan will determine, by reading the upstream Fastify mutation, whether `PATCH /api/supplier-items/:id { is_primary: true }` already demotes the previous primary in the same transaction. Either way, the UI is bound to these guarantees:

1. The user-visible end state must always be "exactly one primary supplier_item per component" — never zero, never two.
2. If sequential PATCHes are required, the order is: **promote new** first, **then demote old**. This way a partial failure (network drop after step 1) leaves two primaries — recoverable, surfaced as 🟡 warning, no data lost. The reverse order could leave zero primaries, which would silently downgrade green readiness with no replacement queued — explicitly disallowed.
3. Partial failure surfacing: if step 2 fails after step 1 succeeds, the drawer must NOT close. It shows an inline error: "הספק החדש הוגדר כראשי, אבל הקודם עדיין מסומן כראשי. נסה שוב או דווח." with a `[Retry demote]` button. The readiness panel reflects the dual-primary state until resolved.
4. The 409 STALE_ROW path (concurrent edit) returns the user to the drawer's first step with a refresh-and-retry message; no partial save is allowed to persist.

**Active price update (any of the above flows):** if the primary supplier_item has missing/stale `std_cost_per_inv_uom`, an inline edit cell on the primary row in the drawer lets the admin update it. PATCH `supplier_items/:id { std_cost_per_inv_uom }` reuses the existing mutation. `updated_at` becomes the new "price age" anchor.

After any drawer save, the readiness panel re-queries; the line editor itself does not navigate.

### 6.6 Publish confirmation

Triggered by `[Publish →]`. Calls `GET /api/boms/versions/:id/publish-preview` first, then renders one of three modals:

**A. Clean** (`can_publish_clean: true`, no UI warnings):
- Single-button modal "פרסם v{N+1}? הגרסה הקודמת תועבר ל-SUPERSEDED. ייצורים היסטוריים נשמרים על הגרסה הישנה."
- `[Cancel]` `[Publish]`

**B. Backend or UI warnings present, override-able:**
- Lists backend `warnings` (e.g. UNPOSTED_PRODUCTION_ACTUALS) + UI warning summary table (supplier/price gaps)
- Required checkbox: "אני מאשר את האזהרות הללו"
- `[Cancel]` `[Publish anyway]`
- After publish: readiness card top-line shows "מתכון פורסם עם אזהרות רכש/מחיר" (yellow), per §5

**C. Backend hard-blocker** (`can_publish_with_override: false`):
- Lists `blocking_issues` translated to plain Hebrew (EMPTY_VERSION → "מתכון ריק", PLANNING_RUN_IN_FLIGHT → "ריצת תכנון פעילה — להמתין לסיום"…)
- No publish button. CTA per error: "Resolve" (e.g., add lines, refresh)

After successful publish: toast "v{N+1} פורסמה. v{old} → SUPERSEDED.", redirect to `/admin/masters/items/[item_id]`, Health card refreshes.

### 6.7 Version history

Below the Health card on the product page, collapsed by default:
- `▶ היסטוריית גרסאות (Base: v3, Pack: v2)`
- When expanded: existing `/api/boms/versions` list per head, columns version_label · status · published_at · published_by_display_name · lines_count
- Click → existing read-only version detail page (with line diff vs active)
- DRAFT entries get `[Resume editing →]` button for admins (navigates to the editor)

No new endpoint. Re-presentation only.

### 6.8 Mobile behavior (375px)

- Health card: tracks stack vertically, full-width
- Edit page: lines table → cards (one card per line); readiness panel → drawer accessible from sticky bottom button "⚠ N warnings"
- Publish modal: full-screen sheet
- Quick-fix drawer: full-screen sheet
- All InlineEditCell instances stay (already mobile-friendly)
- Sticky header bar collapses to icon-only buttons under 375px

## 7. Policy / config exposure (per Q1 approval)

Two policy values, exposed as named labels in code, not as hard-coded numerics inline:

```ts
// src/lib/policy/recipe-readiness.ts
export const RECIPE_READINESS_POLICY = {
  // Active price is considered "stale, warning" once age exceeds this many days.
  PRICE_AGE_WARN_DAYS: 90,
  // Active price age beyond this triggers a strong warning (still not a publish blocker).
  PRICE_AGE_STRONG_WARN_DAYS: 180,
} as const;
```

All readiness checks and tooltip strings reference these constants by name. Future change = single-file edit; no rebuild of the corridor logic.

These ARE the policy values for v1 (Tom-approved 2026-04-25). Exposing them as named constants is the mechanism for future revision; it is not a hedge that the values are tentative. The corridor uses `PRICE_AGE_WARN_DAYS = 90` and `PRICE_AGE_STRONG_WARN_DAYS = 180` as the v1 thresholds.

When/if a policy table appears in the database, this constant module becomes a `useRecipeReadinessPolicy()` hook that reads from a server source. Today: client-side constants.

## 8. Data flow summary

```
Product page (item_id)
  ├─ GET /api/items/:item_id                    (item + bom head ids)
  ├─ GET /api/boms/heads?bom_head_id=<base>     (head info)
  ├─ GET /api/boms/heads?bom_head_id=<pack>     (head info)
  ├─ GET /api/boms/versions?bom_head_id=<base>  (version list, find ACTIVE/DRAFT)
  ├─ GET /api/boms/versions?bom_head_id=<pack>
  ├─ GET /api/boms/lines?bom_version_id=<base_active>
  ├─ GET /api/boms/lines?bom_version_id=<pack_active>
  └─ For each unique component_id in lines:
       └─ GET /api/supplier-items?component_id=<id>   (already used elsewhere)

Edit page (version_id)
  ├─ GET /api/boms/lines?bom_version_id=<draft>
  ├─ GET /api/boms/lines?bom_version_id=<active>     (for diff)
  ├─ GET /api/supplier-items?component_id=<id>       (per line, deduplicated)
  ├─ PATCH /api/boms/versions/:id/lines/:line_id     (qty edits)
  ├─ POST  /api/boms/versions/:id/lines              (add)
  ├─ DELETE /api/boms/versions/:id/lines/:line_id    (remove)
  ├─ PATCH /api/supplier-items/:id                   (set is_primary, update std_cost)
  ├─ POST  /api/supplier-items                       (new sourcing link)
  └─ Publish:
       ├─ GET  /api/boms/versions/:id/publish-preview
       └─ POST /api/boms/versions/:id/publish
```

All endpoints already exist. **No backend work in this corridor.**

**Round-trip note:** the per-component `GET /api/supplier-items?component_id=<id>` is N round-trips for a recipe with N unique components. Implementation will use TanStack Query `useQueries` with parallelization + deduplication; no batched endpoint exists today. If a recipe has >25 unique components and this becomes a perceptible delay, the implementation plan will add a `?component_ids=…` batched query as a follow-up — out of scope for v1.

## 9. Hard-block vs warning canonical table

| Condition | Where enforced | UI behavior |
|---|---|---|
| Empty version | Backend `EMPTY_VERSION` | 🔴 Publish disabled, modal C |
| Planning run in flight | Backend `PLANNING_RUN_IN_FLIGHT` | 🔴 Publish disabled, modal C lists running runs |
| Stale row / version not DRAFT | Backend | 🔴 Modal C "Refresh page", auto-reload |
| Component INACTIVE referenced | UI-only client check | 🔴 Publish disabled (would also fail downstream backend joins), inline error on line |
| Quantity ≤ 0 | UI-only client check | 🔴 Inline error on row, Save blocked |
| Component missing primary supplier | UI-only client check | 🟡 Warn, allow publish, [Fix] in panel |
| Component has no active price | UI-only client check | 🟡 Warn, allow publish, [Fix] in panel |
| Active price age > `PRICE_AGE_WARN_DAYS` | UI-only client check | 🟡 Warn, allow publish |
| Active price age > `PRICE_AGE_STRONG_WARN_DAYS` | UI-only client check | 🟡 Stronger warn copy, allow publish |
| Unposted production_actuals | Backend warning | 🟡 Override checkbox in modal B |

## 10. Components to build / extend

| Component | Status | Purpose |
|---|---|---|
| `RecipeHealthCard` | new | Top-of-product card, two-track summary, top-line state |
| `RecipeTrackSummary` | new | Single-track sub-component used twice in the card |
| `BomDraftEditorPage` | new (page) | DRAFT line editor at `/edit` route |
| `BomLineRow` | new | One row in the lines table (display + edit) |
| `BomLineAddDrawer` | new | Component picker → POST line |
| `ReadinessPanel` | new | Right-side / bottom-drawer supplier/price status |
| `QuickFixDrawer` | new | Three actions A/B/C from §6.5 |
| `SwapPrimaryConfirm` | new | Step 2 of action C — side-by-side confirm panel |
| `PublishConfirmModal` | new | Three variants A/B/C from §6.6 |
| `VersionHistorySection` | new | Re-skin of existing list under product |
| `RECIPE_READINESS_POLICY` constant | new | Single-source thresholds (§7) |
| `MasterSummaryCard` | extended | For MANUFACTURED items: render `RecipeHealthCard` instead of the generic summary. **BOUGHT_FINISHED and REPACK paths are untouched** — they keep the existing summary card unchanged. |
| `InlineEditCell` | unchanged | Already used on lines table cells |
| `EntityPickerPlus` | unchanged | Reused in Add-line drawer |
| `QuickCreateSupplierItem` | unchanged | Reused inside QuickFixDrawer action B |

## 11. Risks and open implementation questions

These are NOT decision points for the spec — they are flagged for the implementation plan to resolve.

1. **`is_primary` swap atomicity** — does `PATCH /api/supplier-items/:id { is_primary: true }` automatically demote the previous primary, or does the UI need two PATCHes? Implementation plan will confirm by reading the upstream Fastify mutation; spec's swap flow handles either case (sequential UI fallback documented in §6.5C).

2. **DRAFT-already-exists fallback message** — §6.2 commits to a UX guard ("if DRAFT exists, navigate to it") so the UI never attempts to create a duplicate DRAFT. This risk note is narrower: confirm what error code/shape the backend returns if our guard misses (concurrent click, race), so the page renders a sensible "already exists, opening it" fallback instead of a generic error.

3. **Price freshness data source** — design uses `supplier_items.updated_at` as the proxy for "price age". If a real `price_history.last_seen_at` is or becomes available, the freshness-check function should switch to that without other code changing.

4. **DRAFT line edit stale-row collision** — two admins editing the same DRAFT. Existing `if_match_updated_at` mechanism on PATCH handles this; UI surfaces 409 STALE_ROW with a refresh button.

5. **Component INACTIVE check — backend coverage** — UI behavior is locked (§9: 🔴 publish disabled regardless). This note is informational only: the implementation plan should record whether the backend also rejects publishing a version with INACTIVE component lines, since that affects whether the UI block is the sole guard or defense-in-depth. UI behavior does not change either way.

6. **Stale / abandoned DRAFT cleanup — out of scope for v1.** §6.7 surfaces DRAFT entries with `[Resume editing →]`. There is no automatic expiry and no `[Discard draft]` UI in this corridor. If DRAFTs accumulate (e.g., abandoned multi-month-old drafts cluttering the version list), a later corridor can add a discard action. Flagged here so the question doesn't get lost.

7. **Hebrew label decision needs project-contract acknowledgement.** The durable contract (`CLAUDE.md`) states "English-first UI with plain, accessible English labels. Hebrew appears only in data values." This spec uses Hebrew labels for the Recipe-Health card and key user-facing modal copy ("מתכון ייצור", "מוכן לייצור עם אזהרות", "אני מאשר את האזהרות הללו" …) because Tom wrote the UX target in Hebrew on 2026-04-25. The two are reconcilable — these are operator-facing affordances on an admin master surface — but the deviation is intentional and should be acknowledged in `CLAUDE.md` or in a project memo when implementation lands. This corridor's spec uses Tom's Hebrew labels verbatim.

## 12. Acceptance criteria

A reasonable QA pass on the corridor must demonstrate:

1. From a clean product page, admin can clone an active base BOM into a DRAFT, change one quantity, and publish — readiness goes 🟢 (assuming prerequisites met).
2. With a component that has no primary supplier, the readiness panel shows the gap, [Fix] opens the drawer, action A or B sets the primary, panel re-queries, gap clears.
3. Swap-primary flow: admin selects a different existing supplier_item, confirmation step shows old vs new, save commits both changes, panel reflects new primary.
4. Publish modal correctly distinguishes A (clean), B (warnings + override checkbox), C (hard-block), based on `publish-preview` response.
5. After publishing with supplier warnings present, Health card top-line is **yellow** ("מתכון פורסם עם אזהרות רכש/מחיר"), not green. (Critical.)
6. After publishing with all readiness checks satisfied (every condition in §5 green), Health card top-line is **green**. (Critical — counterpart to #5.)
7. Mobile (375px): all flows complete without horizontal scroll, drawers are full-screen sheets, sticky controls remain reachable.
8. Existing read-only BOM detail pages and view tabs are unaffected.
9. Non-admin roles see the Recipe-Health card (read-only) but no edit/publish buttons.

## 13. References

- Editability matrix: `docs/admin/master-editability-matrix.md`
- Contract Gap #1 (used-in-recipes endpoint): `docs/admin/contract-gap-1-used-in-recipes.md`
- Project durable contract: `CLAUDE.md` (root) — versioned BOM, no expiry, planning consumes pinned BOM version
- Backend slice references in code comments: AMMC v1 Slice 6 (publish + line CRUD), Slice 2 (version create), backend commit `ac75ed1`
