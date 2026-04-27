# Manual PO Creation — W2 Mode A handoff prep (2026-04-26)

> **Authority layer:** Mode A handoff-prep document.
> **Scope:** discovery + audit only. Zero canonical authoring. Zero src/ writes.
> **Cycle:** 2026-04-26. Produced by `executor-w2`.
> **Consumer:** the next-cycle Mode B-PurchaseOrders-manual dispatch.
>
> **Authority context (read-only inputs to this doc):**
> - `CLAUDE.md` §"PO workflow" — amended 2026-04-26 to permit planner/admin-gated manual PO creation alongside the existing recommendation-bridge path.
> - `CLAUDE.md` §"UI language" — locks: "English-first UI with plain accessible English labels; Hebrew appears only in data values."
> - `.claude/state/runtime_ready.json` — `RUNTIME_READY(PurchaseOrders)` emitted 2026-04-19T08:00:00Z by executor-w1, evidence at `Projects/gt-factory-os/docs/gate5_phase9_po_bridge_checkpoint.md`. (Note: this signal authorized the recommendation→PO bridge; manual creation is a NEW surface and will require a fresh dispatch citing CLAUDE.md amendment + this doc.)
> - `.claude/state/active_mode.json` — W2 currently Mode A. Most recent Mode B-PurchaseOrders exit: `PurchaseOrders-po-list-action` at 2026-04-25T08:00 (commit `48720d1`).

---

## 0. Sandbox-state header

- Canonical sandbox: `C:/Users/tomw2/Projects/window2-portal-sandbox/`
- Branch: `main`
- Most recent PO-relevant commit: `48720d1` (2026-04-25 — "portal: PO list — add New PO (from recommendation) action")
- Sole owner of canonical Window-2 portal authoring: `executor-w2`

---

## 1. Current state of `/purchase-orders` list page

**File:** `C:/Users/tomw2/Projects/window2-portal-sandbox/src/app/(po)/purchase-orders/page.tsx` (476 lines).

### 1.1 "New PO (from recommendation)" button — confirmed present

| Attribute | Observed value | Source |
|---|---|---|
| Component | `next/link` `<Link>` | line 226 |
| `href` | `"/planning/runs"` | line 227 |
| `data-testid` | `"po-list-new-from-recommendation"` | line 229 |
| Visible label | `New PO (from recommendation)` | line 231 |
| Placement | Inside `WorkflowHeader.meta` (NOT `WorkflowHeader.actions`) | lines 215-234 |
| Tailwind classes | `inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft/80 transition-colors` | line 228 |

Comment block at lines 222-225 documents the v1 intent verbatim:

```
v1 PO workflow: recommendations-first — no standalone creation form.
This link routes planners to the surface where approved recs
are converted to POs. CLAUDE.md §"PO workflow" locked.
```

This comment will need to be **revised** in the next Mode B cycle to reflect the 2026-04-26 amendment. (The `/planning/runs` link should remain as a secondary action — it does not become wrong; it becomes one of two paths.)

### 1.2 Empty-state copy when 0 POs

Visible at lines 352-366. Two branches inside an `EmptyState` component:

| Branch | Title | Description |
|---|---|---|
| `rows.length === 0` (true zero POs in catalog) | `"No purchase orders yet."` | `"POs are created by clicking Convert to PO on an approved recommendation."` |
| `rows.length > 0 && filtered.length === 0` (filtered out) | `"No POs match the current filter."` | `"Clear the filter or widen the search."` |

The first description is **stale** under the 2026-04-26 amendment. Mode B must rewrite to surface BOTH paths (recommendation-conversion AND manual creation) without dropping the existing copy entirely.

### 1.3 WorkflowHeader description

**On disk (line 214):**

> `"Live read of private_core.purchase_orders. POs are created from the Convert-to-PO action on an approved planning recommendation."`

This **matches** the screenshot text Tom referenced. It is also stale post-amendment and must be rewritten by Mode B to admit two creation paths.

### 1.4 Role-gate currently applied

**Page-level (layout):** `C:/Users/tomw2/Projects/window2-portal-sandbox/src/app/(po)/layout.tsx` lines 14-22:

```tsx
<AppShellChrome>
  <RoleGate minimum="viewer:read">
    <SeedGate>
      <AppPageShell>{children}</AppPageShell>
    </SeedGate>
  </RoleGate>
</AppShellChrome>
```

Page is **viewer-readable** (any authenticated role). This is correct for the list, since read is universal. The layout comment (line 7-8) explicitly notes: *"Create and transition actions are gated server-side on planning:execute."*

**Button-level on the existing "New PO (from recommendation)" Link:** **NONE.** The Link renders unconditionally for every authenticated role. (It deep-links into `/planning/runs`, which has its own role-gate, so the operator-clicking-it case lands on a 403-equivalent screen rather than seeing PO creation. This is acceptable for the existing recommendation path but is **insufficient** for a manual-creation primary action — a manual-creation form needs a planner/admin-gated visibility check before render so operators don't see a button that 403s on click.)

---

## 2. Manual-creation route discovery

### 2.1 Glob results (Mode A read-only)

```
src/app/(admin)/admin/purchase-orders/parity-check/page.tsx
src/app/(po)/purchase-orders/[po_id]/page.tsx
src/app/(po)/purchase-orders/page.tsx
```

Globs ran:
- `src/app/**/purchase-orders/**/page.tsx` — 3 hits, **none under `new/` or `create/`**.
- `src/app/**/new/page.tsx` — 2 unrelated hits (`(planning)/planning/forecast/new/page.tsx`, `(admin)/admin/products/new/page.tsx`).
- `src/app/**/create/page.tsx` — 0 hits.

### 2.2 Findings

- ✅ **No** `/purchase-orders/new` route exists.
- ✅ **No** `/purchase-orders/create` route exists.
- ✅ **No** standalone manual-creation form component exists anywhere in `src/components/` related to purchase orders. (The only PO form-like surfaces in `src/app/(po)/purchase-orders/[po_id]/page.tsx` are inline edit/cancel mutations on existing POs.)

### 2.3 Implication for Mode B

The next Mode B cycle owns greenfield authorship of the manual-creation route. There is no existing scaffolding to extend, refactor, or copy from. The sandbox-to-canonical promotion rule (forbidden per `EXECUTION_POLICY.md` §4.3) is moot here because no sandbox version exists either.

---

## 3. PO detail page state

**File:** `C:/Users/tomw2/Projects/window2-portal-sandbox/src/app/(po)/purchase-orders/[po_id]/page.tsx` (1333 lines).

### 3.1 Tab structure (current)

The page composes `<DetailPage tabs={tabs}>` with this `tabs` array (line 1227-1233):

| Order | Key | Label | Lines | Live signal type |
|---|---|---|---|---|
| 1 | `lines` | "Lines" | 717-1012 | LIVE — `GET /api/purchase-order-lines?po_id=X` |
| 2 | `overview` | "Overview" | 1015-1127 | LIVE — `GET /api/purchase-orders/:po_id` |
| 3 | `source-recommendation` | "Source recommendation" | 1130-1165 | LIVE — deep-link to `/planning/runs/[run_id]` when `po.source_run_id` set |
| 4 | `attached-grs` | "Attached GRs" | 1168-1200 | LIVE — `GET /api/goods-receipts?po_id=X` |
| 5 | `history` | "History" | 1203-1225 | LIVE — `GET /api/purchase-orders/:po_id/history` |

(All five tabs are LIVE in the current build — the previously-PENDING placeholders documented in Tranche D have been wired since.)

### 3.2 source-recommendation tab — current behavior

Lines 1130-1165. Three states:

1. **Loading** — `<DetailTabLoading />` while `poQuery.isLoading`.
2. **PO not loaded** — `<DetailTabEmpty message="PO not loaded yet." />`.
3. **`po.source_run_id` is null** — `<DetailTabEmpty message="This PO was not produced from a planning recommendation." />`. **This is the path manual POs hit today.**
4. **`po.source_run_id` is non-null** — renders a 2-row `DetailFieldGrid` with deep-links to `/planning/runs/<run_id>`.

### 3.3 What the next Mode B cycle must update on this tab

When the backend exposes a `source_type` discriminator (W4's contract requirements doc this cycle should specify whether `source_type` is a new column or derived from `source_run_id IS NULL`), the tab must show, when `source_type='manual'`:

- A user-visible explanatory banner stating that the PO was **manually created** (English-first lock per CLAUDE.md §"UI language" — see §5 below for tension flag), with `created_by_snapshot` and a `manual_reason` field.
- The current "This PO was not produced from a planning recommendation." empty-state copy is correct as a *neutral* fallback but is insufficient as the *manual-creation* affirmative case — the manual case carries audit metadata (who, when, why) that the empty state hides.

**Field-availability dependency on W4:** the next Mode B cycle cannot author this banner until the contract pack names the field for `manual_reason` (free-text or enumerated?), confirms `source_type` enum literals, and confirms `created_by_snapshot` is populated on manual-PO INSERT (it is on recommendation→PO conversion per `purchase_orders_schema_contract.md`; needs explicit confirmation for manual path).

---

## 4. authorize.ts capability mapping

**File:** `C:/Users/tomw2/Projects/window2-portal-sandbox/src/lib/auth/authorize.ts` (138 lines).

### 4.1 Capability that gates planner/admin-only PO creation

The capability axis is `planning`. The lattice (lines 44-68):

| Role | `planning` axis grant |
|---|---|
| `viewer` | `"read"` |
| `operator` | `"read"` |
| `planner` | `"execute+override"` |
| `admin` | `"execute+override"` |

The **minimum required capability for manual PO creation** is `"planning:execute"`:
- `planner` and `admin` pass (both at `execute+override` ≥ `execute`).
- `operator` and `viewer` are blocked (both at `read` < `execute`).

This is the exact capability the existing Convert-to-PO programmatic enforcement at `fn_convert_recommendation_to_po` mirrors at the API layer (see `gate5_phase9_po_bridge_checkpoint.md`); using the same capability for manual creation keeps the lattice consistent and avoids inventing a new axis level.

### 4.2 Pattern for hiding action buttons via `authorizeCapability(...)`

The sidebar uses this pattern (`src/components/layout/SideNav.tsx` reads `manifest.required_capability` per item and skips the item if `authorizeCapability(role, capability)` is false). For inline action buttons, two patterns exist:

**Pattern A (PO detail page, lines 549-550):** direct role-array check via `useSession()`:

```tsx
const canCancelRole = session.role === "planner" || session.role === "admin";
const canCancelPo = (po?.status === "OPEN" || po?.status === "DRAFT") && canCancelRole;
```

**Pattern B (preferred per Tranche A authorize.ts contract):** capability-driven via `useCapability` hook (lines 87-90 of `role-gate.tsx`):

```tsx
import { useCapability } from "@/lib/auth/role-gate";
const canCreatePo = useCapability("planning:execute");
```

The next Mode B cycle should adopt **Pattern B** for the new manual-creation action — Pattern A is legacy from pre-lattice code and should not propagate into new surfaces.

### 4.3 Pattern for layout-level RoleGate enforcement on `/purchase-orders/*`

Current `(po)/layout.tsx` uses `<RoleGate minimum="viewer:read">` (universally permissive). For the `/purchase-orders/new` route, the canonical pattern is **per-page** `<RoleGate minimum="planning:execute">` rendered inside the page itself (NOT a separate `(po-write)` layout group), because:
- The `(po)` layout already renders shared chrome; nested `RoleGate` is composable.
- Creating a separate route group for one write surface adds URL-organization noise without benefit.

Reference precedent for per-page enforcement: `src/app/(planner)/exceptions/page.tsx` (now a redirect) and the existing planner-only forecast publish action both per-render `<RoleGate>` instead of relying on layout-level only.

---

## 5. ⚠️ ENGLISH-FIRST vs HEBREW-COPY TENSION (BIGGEST FLAG FOR GOVERNOR §3)

### 5.1 The lock

`CLAUDE.md` §"UI language" (durable contract, locked):

> - English-first UI with plain, accessible English labels
> - Hebrew appears only in data values (supplier names, contacts, payment terms, addresses)
> - No full RTL layout in v1

### 5.2 The conflict

The 2026-04-26 amendment text Tom shared for §5 lists Hebrew copy verbatim for the manual-creation surface. Specifically (per dispatch §5):

| Tom-listed Hebrew string | English-first lock conflict? |
|---|---|
| `"+ הזמנת רכש חדשה"` (button label, primary action on `/purchase-orders` list) | **YES** — this is a UI label, not a data value. |
| `"נוצר ידנית — לא מתוך המלצת רכש"` (banner on PO detail when `source_type='manual'`) | **YES** — this is UI banner text, not a data value. |
| Hebrew field labels on the manual-creation form | **YES** — field labels are explicitly English-first per the lock. |

The lock allows Hebrew **only** in data values: supplier names, addresses, payment terms (i.e. content that originates in Hebrew in the operator's existing world and flows through unchanged). Button labels, banner text, and form field labels are NOT data values; they are UI chrome and must be English-first per the lock.

### 5.3 Two routing options for governor §3 (do not pick — escalate)

**Option (a) — Honor Tom's Hebrew copy verbatim and amend `CLAUDE.md` §"UI language":**
- Adds an exception clause: e.g., *"Hebrew may also appear on the manual-PO creation flow per Tom's 2026-04-26 amendment, where the operator culture warrants Hebrew framing."*
- Pro: matches Tom's amendment text exactly; no translation friction; preserves Tom's intent that manual PO creation feels native to the Hebrew-speaking planner.
- Con: weakens the English-first lock; opens the door to ad-hoc Hebrew creep into other surfaces (CLAUDE.md §"What Claude must not do" warns against scope creep); creates a precedent for per-amendment language overrides.

**Option (b) — Translate Tom's Hebrew strings to English UI labels, preserving his intent:**
- `"+ הזמנת רכש חדשה"` → `"+ New purchase order"` (or `"+ Create PO manually"` to surface the amendment intent more sharply).
- `"נוצר ידנית — לא מתוך המלצת רכש"` → `"Created manually — not from a planning recommendation"`.
- Hebrew field labels → English equivalents.
- Pro: preserves the lock unchanged; consistent with rest of portal; no precedent risk.
- Con: requires Tom's approval that translation faithfully preserves his intent; the planner persona is Hebrew-native and may prefer Hebrew framing on a flow they use daily; risks Tom Tax (per `feedback_tom_lens_audit_calibration.md` — daily-use friction is the calibration target).

### 5.4 Why this is the single biggest open Tom-decision for the next cycle

- The next Mode B cycle **cannot start canonical authoring** until this is resolved. Authoring with the wrong choice means either (i) shipping Hebrew that violates the lock and being told to rewrite, or (ii) shipping English and being told to redo because Tom wanted Hebrew. Either way, a wasted Mode B cycle.
- W4's contract requirements doc this cycle is also affected — if reasons must be enumerated values (rather than free text), the enum literal language (English vs Hebrew) must be set by W4's contract before W2 wires the form. Hebrew enum values would require backend storage to be Hebrew text or a translation layer; English enum values are the simpler default.
- All other tensions in this dispatch (manifest update, mobile-viewport layout, validation gates) are downstream of this one decision.

**Recommended escalation phrasing for governor §3:**
> "Tom: do you want manual-PO surface labels in Hebrew (option a, requires CLAUDE.md amendment) or English (option b, preserves the lock)? Pick one before next Mode B dispatch."

---

## 6. Component primitives confirmation (next Mode B will compose)

| Primitive | Path | State on disk |
|---|---|---|
| `DetailPage` | `src/components/patterns/DetailPage.tsx` | ✅ PRESENT. Used by Tranche D PO detail (confirmed at `(po)/purchase-orders/[po_id]/page.tsx` line 23-32 import + line 1278 composition). |
| `FormPage` | `src/components/patterns/FormPage.tsx` | ⚠️ PRESENT BUT **EMPTY CONVENTION SHELL** (37 lines; lines 25-32 type contract; lines 34-36 stub `return <div>{children}</div>`). The convention is documented in the file header (lines 12-21) but not implemented. The next Mode B cycle has TWO choices: (i) implement `FormPage` properly as part of this dispatch (scope creep — not ideal), or (ii) skip `FormPage` and compose `WorkflowHeader` + `SectionCard` + `FieldGrid` + `FormActionsBar` directly. **Recommendation:** option (ii) — keep this Mode B cycle scoped tight; flag a separate later tranche to fill `FormPage` properly when at least 2 forms need it. |
| `RoleGate` | `src/lib/auth/role-gate.tsx` | ✅ PRESENT. Capability-aware (Tranche A). Use `<RoleGate minimum="planning:execute">` per §4.3. |
| `SearchFilterBar` | none under that exact name | ⚠️ NOT a named primitive. The PO list page hand-rolls its own filter bar at lines 292-341. The Inbox page (Tranche B) does the same. Manual-creation form does not need a filter bar — N/A for this dispatch. |
| `WorkflowHeader` | `src/components/workflow/WorkflowHeader.tsx` | ✅ PRESENT. 62 lines. Props: `eyebrow`, `title`, `description`, `meta`, `actions`, `children`. Used everywhere. |
| Modal/drawer primitive for guided choice (rec / manual fork) | `src/components/overlays/Drawer.tsx` | ✅ PRESENT. Built on Radix `@radix-ui/react-dialog` (line 32). Stack-aware (AMMC v1 Slice 3). Width prop maps `md=480px / lg=640px / xl=800px`. **Suitable** for hosting a guided-choice picker drawer that lets the planner pick "convert from recommendation" vs "create manually". Alternative: a simpler dropdown menu (no Radix dropdown primitive currently in the repo — would need to add `@radix-ui/react-dropdown-menu` if chosen, which is a new primitive and forbidden per Mode B scope rule "Do not author new primitives"). **Recommendation:** for the guided-choice fork, use `<Drawer>` (existing primitive) hosting two big-button choices, OR replace the single button with a `<details>`/`<menu>` pattern that doesn't need a new dependency. |
| `FieldGrid` | `src/components/workflow/FieldGrid.tsx` | ✅ PRESENT (per `ls` of `src/components/workflow/`). Will compose into the manual-form layout. |
| `FormActionsBar` | `src/components/workflow/FormActionsBar.tsx` | ✅ PRESENT. Standard submit/cancel bar. |
| `SectionCard` | `src/components/workflow/SectionCard.tsx` | ✅ PRESENT. Already used by PO list. |
| `ValidationSummary` | `src/components/workflow/ValidationSummary.tsx` | ✅ PRESENT. For 422-Zod-error display. |

**Net:** all primitives needed for the manual-creation form are present except a polished `FormPage` (which is OK to skip — see recommendation in row 2). The guided-choice fork on the list page should use the existing `Drawer` primitive rather than introducing a new dropdown-menu dependency.

---

## 7. Mobile-viewport state

### 7.1 Files audited

- `src/components/layout/MobileNav.tsx` (228 lines).
- `src/components/layout/AppShellChrome.tsx` (35 lines).
- `src/components/workflow/WorkflowHeader.tsx` (62 lines).

### 7.2 Findings

**AppShellChrome on mobile:**
- Sidebar (`SideNav`) is desktop-only via `hidden ... md:block` (line 18). Below `md` (768px) the sidebar collapses entirely.
- `MobileNav` provides the hamburger drawer (line 207 `<div className="md:hidden">`); confirmed working with focus trap, body-scroll lock, and Esc/backdrop close.
- Main content: `mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-4 md:gap-10 md:px-8 ...` (line 17). At 390px iPhone-13 viewport: `px-4` = 16px each side → ~358px content width. No horizontal scroll at this width; sidebar is hidden.

**WorkflowHeader on mobile (the load-bearing question for the primary action):**
- Top row (lines 28): `flex flex-wrap items-start justify-between gap-4 sm:gap-6`.
- Title block (lines 29-49): `min-w-0 flex-1` — takes available width.
- `meta` slot (line 47): `mt-4 flex flex-wrap items-center gap-2` — meta items wrap to next line on narrow viewports. **Meta is NOT collapsed under a kebab menu.** It wraps naturally.
- `actions` slot (lines 50-52): `flex shrink-0 items-center gap-2` — sits on the right at desktop, drops below meta on narrow viewports because the parent `flex-wrap` at line 28 wraps the right column.

**Implication for the existing "New PO (from recommendation)" button:**
- The button is in `meta`, NOT `actions`. On a 390×844 iPhone-13 viewport, the meta items wrap as flex children. Order of appearance: `[N POs badge]` `[live API badge]` `[New PO link]` — these wrap depending on width.
- At 390px viewport (minus 32px page padding = ~358px content), the `[N POs badge]` is ~80px, `[live API badge]` is ~70px, `[New PO link]` is ~190px (text "New PO (from recommendation)" plus padding and border). Total ~340px — **fits on one row at 390px**, possibly tight. On smaller viewports (320px iPhone-SE) it wraps.
- **No kebab menu currently.** No hidden menu. The button is plainly visible without horizontal scroll on iPhone-13 viewport per visual estimation. This claim should be **verified by Playwright screenshot** in the Mode B validation gate (see §8.6).

### 7.3 Implication for next Mode B cycle

For the manual-creation primary action (replacing or augmenting the existing button):
- If the action becomes a longer label like `"+ New purchase order"` (English option) — fits comfortably.
- If it becomes `"+ הזמנת רכש חדשה"` (Hebrew option, governor §5 pending) — also fits (~140px).
- If it becomes a guided-choice dropdown trigger like `"Create PO ▾"` opening a Drawer with two choices, that is even shorter (~110px) — definitely fits.
- **No mobile-specific kebab refactor needed.** Existing wrap behavior is sufficient.

---

## 8. Validation-gate forecast for next Mode B-PurchaseOrders-manual cycle

(These are the gates the next Mode B cycle must pass before exiting back to Mode A. Listed for dispatch-prep clarity, not authored here.)

| # | Gate | Pass criterion | Tooling |
|---|---|---|---|
| 1 | Typecheck | 0 errors | `npx tsc --noEmit` |
| 2 | Build | green; new dynamic route `/purchase-orders/new` registered; new portal proxy `POST /api/purchase-orders` registered | `npm run build` |
| 3 | URL-leak lint | exit 0 (no route-group leakage) | `npm run lint:urls` |
| 4 | Role matrix walkthrough | 4 personas × {/purchase-orders list, /purchase-orders/new form} = 8 cells; expected: viewer sees list (no manual button), operator sees list (no manual button), planner sees list + manual button + can submit, admin same as planner | static + Playwright |
| 5 | Playwright real-HTTP smoke | minimum 6 cases per dispatch:<br>(a) 401 unauthenticated → redirect to `/login`<br>(b) 403 operator GET `/purchase-orders/new`<br>(c) 200 planner GET form<br>(d) 200 planner POST happy with redirect to `/purchase-orders/[po_id]`<br>(e) 200 admin happy<br>(f) 422 missing `manual_reason` (or whatever required field W4 contract names)<br>(g) 200 idempotent replay returns same `po_id` | Playwright + local API:3333 + Supabase portal_universe seed |
| 6 | Mobile-viewport screenshot evidence | iPhone-13 viewport (390×844) screenshot of `/purchase-orders` list showing primary action visible without horizontal scroll | Playwright `page.screenshot()` |

**Known environment-state gap (not a defect, will recur):** Playwright real-HTTP gates require local API on `:3333` + Supabase portal_universe seed populated. Documented in prior Mode B exits (Forecast 2026-04-18, PlanningRun 2026-04-19, ProductionActual 2026-04-21, Tranche A 2026-04-21). Validation may need to fall back to static analysis + dev-shim auth path as it has previously; the dispatch should explicitly say which.

---

## 9. Files the next Mode B cycle WILL touch (concrete list)

| # | Path | Action | Why |
|---|---|---|---|
| 1 | `src/app/(po)/purchase-orders/page.tsx` | **MODIFY** | Replace single "New PO (from recommendation)" Link with a guided-choice action surface (see §6 row "Modal/drawer primitive" — recommend Drawer-hosted picker OR a `<details>` menu). Update WorkflowHeader description (line 214) to reflect dual-path workflow. Update empty-state description (line 362) to mention both paths. Update the in-file comment block (lines 14-19) to drop the "no standalone PO-creation route in v1" assertion. |
| 2 | `src/app/(po)/purchase-orders/new/page.tsx` | **CREATE NEW** | Manual creation form. Composes `WorkflowHeader` + `SectionCard` + `FieldGrid` + `FormActionsBar` + `RoleGate minimum="planning:execute"`. Fields per W4 contract (this cycle's parallel deliverable): supplier picker, line items array, expected_receive_date, notes, `manual_reason` (mandatory). Mints idempotency key. POSTs to `/api/purchase-orders` (portal proxy). On success, redirects to `/purchase-orders/[po_id]`. |
| 3 | `src/app/(po)/purchase-orders/[po_id]/page.tsx` | **MODIFY** | Add `source_type='manual'` banner to the source-recommendation tab (lines 1130-1165). When `source_type='manual'` (per W4 contract — exact field name TBD): render an explanatory banner with `created_by_snapshot` and `manual_reason`. The current `<DetailTabEmpty>` empty-state remains as fallback for the (theoretical) case where neither `source_run_id` nor `source_type='manual'` is set. |
| 4 | `src/app/api/purchase-orders/route.ts` | **MODIFY (add POST)** | Currently exports only `GET` (lines 12-18). Add `POST` mirror of upstream `POST /api/v1/mutations/purchase-orders` (per W4 contract). Standard `proxyRequest` pattern with `errorLabel: "purchase-orders create"`. |
| 5 | `src/lib/nav/manifest.ts` | **OPTIONAL MODIFY** | The Purchase Orders nav entry (line 226-236) is fine as-is. **No** change needed unless the dispatch wants a sub-item for "Create PO" — recommend NOT adding that, because the action lives on the list page already. |
| 6 | List page empty-state copy | **MODIFY** (this is part of #1 above; re-listed for emphasis) | Currently: *"POs are created by clicking Convert to PO on an approved recommendation."* Must surface manual path too. |

**Out-of-this-Mode-B-scope file edits** (W4 owns):
- Backend handler `POST /api/v1/mutations/purchase-orders` for manual creation.
- Backend contract pack additions (e.g. `manual_po_creation_contract.md`).
- Backend migration if `source_type` is a new column.

---

## 10. Out-of-scope for the next Mode B cycle

(Listed verbatim from dispatch §10 for governor reconciliation; binding.)

- ❌ No backend authorship (W1 owns).
- ❌ No contract changes (W4 owns).
- ❌ No recommendation-flow changes (already complete; Tranche D + commit `48720d1` shipped).
- ❌ No GR-flow changes — manual POs are automatically receivable via the existing GR path because GR only requires `po_id` to attach (`gr_to_po_linkage_contract.md`); whether the PO came from a recommendation or manual creation is irrelevant downstream.
- ❌ No new primitives. Compose existing ones only.
- ❌ No file-copy from sandbox-to-canonical (forbidden per `EXECUTION_POLICY.md` §4.3; also moot — there is no sandbox version of this surface).
- ❌ No `active_mode.json` modification this cycle (Mode A).
- ❌ No `runtime_ready.json` modification this cycle (W1 owns).

---

## 11. Single biggest open Tom-decision (one-line summary for governor §3)

**English-first vs Hebrew-copy on manual-PO surfaces — option (a) honor Hebrew + amend CLAUDE.md, or option (b) translate to English + preserve the lock. The next Mode B cycle cannot start authoring until Tom picks one. See §5 above for the full tension write-up.**

---

## 12. Summary

- Mode A discovery complete. ZERO writes under `src/`. Single new file authored at the dispatch-named path.
- Existing `/purchase-orders` list page surface inventory captured down to file:line precision.
- Existing PO detail page tab structure + source-recommendation tab current behavior captured.
- No `/purchase-orders/new` or `/purchase-orders/create` route exists today (greenfield for next Mode B).
- `authorize.ts` capability lattice is the gating mechanism; `planning:execute` is the right minimum for manual creation.
- All required primitives present except `FormPage` (empty shell — recommend skipping for this cycle).
- Mobile viewport state confirmed: WorkflowHeader meta wraps; no kebab needed.
- Validation gate forecast lists 6 Playwright cases the next cycle must pass.
- 6 concrete files identified for next-cycle MODIFY/CREATE.
- Single biggest open decision flagged for governor: English-first vs Hebrew-copy lock tension (CLAUDE.md §"UI language" vs Tom's 2026-04-26 amendment text).

End of handoff doc.
