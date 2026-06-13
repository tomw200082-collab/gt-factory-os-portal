# Admin Pages — Deep UX/UI Audit (Consolidated)

**Date:** 2026-06-13
**Scope:** All 34 pages under `src/app/(admin)/admin/**` plus `src/app/(economics)/admin/economics/page.tsx`, the shared `(admin)/layout.tsx`, and the shared components they use.
**Method:** Read-only. Six specialist auditors run in parallel, one lens each:
visual system, interaction/state, accessibility (WCAG AA), microcopy/content-state, admin-surface control, end-to-end flow.
**Write policy:** This report is a read-only audit artifact. No portal source was modified. Fixes require a tranche plan + Tom approval.

---

## 1. Headline

The admin surface is **structurally healthy at the data layer and weak at the experience layer.** The control surface is genuine — almost every domain has real CRUD wired to real endpoints with optimistic concurrency, idempotency keys, soft-delete, and role gating. There is **no fake data, no dead "coming soon" stubs in primary nav, and no fake buttons.** What drags the surface below production-grade is a small set of **systemic UX defects repeated across many pages** — the same five or six issues account for the large majority of findings.

The single most important structural problem is **route duplication**: two parallel route trees (`/admin/<entity>` legacy vs `/admin/masters/<entity>` canonical) cover the same entities, and for BOMs and Items both trees are fully live with no cross-links. This is the only finding that needs an architecture decision before fixing.

---

## 2. The cross-cutting themes (fix these first — they collapse ~60% of all findings)

These recurred across **multiple independent audits**. Fixing each one is a single shared change that clears findings on many pages at once.

### THEME A — `window.confirm()` everywhere *(flagged by 4 of 6 auditors; highest-frequency defect)*
Native browser confirm dialogs guard every destructive action across **10+ call sites**: items/suppliers/components status toggles, product archive/restore/alias-reject/alias-revoke, cost-draft reject, supplier-items set-primary, BOM line delete, users role change, economics clear-price.
Problems: unstyled / off-brand, **inaccessible** (no ARIA, no focus management, blocks the event loop), names records by raw ID/UUID not human name, no loading state, and creates confirmation fatigue (identical "Are you sure?" everywhere).
**Worst instance (P0/a11y):** `users/page.tsx:437` fires `window.confirm` inside a `<select>` `onChange` — the screen reader announces the new value, gets blocked by a native dialog, then the value rolls back. Deeply disorienting for AT users.
**Fix:** one shared accessible `<ConfirmDialog>` (Radix AlertDialog — already in the dep tree), naming the entity by human name, with a loading state on confirm. Replace all `window.confirm()`.
→ References: VISUAL-004, INTER-001, A11Y-011, FLOW-016/019, COPY-001/007/014.

### THEME B — Count chips show "0 items" during load *(flagged by 3 auditors; UX-Standard §3 violation)*
`{query.data?.count ?? 0}` renders "0 items / 0 suppliers / 0 components" while the query is still loading — false-empty signal. On items, suppliers, components, users, and both BOM lists.
**Fix:** gate every count chip on `!isLoading && data !== undefined`; show a skeleton or nothing while loading. Best done as a shared `<QueryCountChip>` to prevent regression.
→ INTER-020, A11Y-028, FLOW-017/018.

### THEME C — Route duplication / two parallel trees *(P0 structural — needs an architecture decision)*
- **BOMs:** `/admin/boms/**` is fully live (list + head + version editor, ~1589-line duplicate editor) and **not** a redirect, parallel to canonical `/admin/masters/boms/**`. A BOM can be published from either tree.
- **Items:** two full, different detail surfaces for the same item — `/admin/masters/items/[id]` (Overview/BOM/Supplier/Anchors/Policy/Exceptions) and `/admin/products/[id]` "Product 360" (Overview/Aliases/BOM/Components/Suppliers/Planning/History), **with no link between them.** Neither shows the full picture.
- **Suppliers/Components:** legacy routes correctly redirect, but inline-panel cross-links still point at legacy/list URLs.
- `/admin/items/[id]` redirects to `products/[id]`, but the items **list** links rows to `masters/items/[id]` — same URL family, two destinations.
**Fix (decision required):** pick the canonical tree, convert legacy routes to redirects, and either merge the two item-detail surfaces or add a one-click cross-link. Removing the duplicate BOM editor is a follow-up once redirects land.
→ VISUAL-012, FLOW-006/007/008/011/012/020, surface-audit doc-drift note.

### THEME D — Missing `aria-live` / dialog semantics / focus management *(P0/P1 a11y)*
- Mutation feedback banners on items/suppliers/components have **no `role`/`aria-live`** (holidays, cost-drafts, users do it right — copy that pattern).
- `ClassWEditDrawer` (archive/restore) has **no `role="dialog"`, no focus trap, no Escape, no focus return** — keyboard users navigate behind it unaware. **(P0)**
- Holiday `ModalShell`: correct ARIA but **no focus management**, and four modal variants share a duplicate `id="modal-title"`. **(P0)**
- `PublishConfirmModal` missing `aria-modal="true"`.
- Wizard `ValidationSummary` and publish-error not announced (`role="alert"` absent).
**Fix:** route all modals/drawers through the Radix-based `<Drawer>`/`<Dialog>` primitives that already carry correct semantics; add `aria-live` to the three banners.
→ A11Y-007/008/009/020/023/027.

### THEME E — Developer jargon & raw enums/IDs in operator copy *(P0 content — ~40 instances)*
Raw values leak into user-visible text site-wide: `item_id`/`supplier_id`/UUIDs in banners and confirms; raw enums `ACTIVE`/`BOUGHT_FINISHED`/`MANUFACTURED` as labels and option text; HTTP status codes in error banners (`${err.status}${err.code}: …` on 10+ surfaces); snake_case form labels (`item_id`, `supply_method`, `sales_uom`) in the new-product and SKU-alias forms; and **internal sprint/ticket references** in the holidays banner (`W1 cycle 8`, `GAP-AHC-1`, `soft-deleting`, `upsert`, `archived_at`, `live DB`, `Edge Functions`).
**Fix:** map enums → display labels; render `err.message` only (never status codes); plain-English field labels; strip all internal references from operator copy. Propose three new §3 rules to `portal_ux_standard.md`.
→ COPY-001…093 (full list in the content audit).

### THEME F — Design-system drift *(P1 visual; token + component consistency)*
- **`bg-bg-card` is an undeclared token** used in 4 files (incl. `MasterSummaryCard`, `DetailPage`, `ClassWEditDrawer`, JobCard) → resolves to **transparent**; card/drawer surfaces render see-through, worst in dark mode. **Replace with `bg-bg-raised`.** *(highest-priority visual)*
- `WorkflowHeader` defaults to `size="page"` (H1 30–36px) on 31/34 tool pages → titles compete with data. Add `size="section"`.
- 21 tables use raw `w-full border-collapse text-sm` instead of `.table-base` → token propagation broken.
- `.btn-primary` used without `.btn` base, duplicating layout classes at 27 sites.
- `SectionCard` eyebrow always `text-accent` → dilutes the accent signal everywhere.
→ VISUAL-001/002/003/005/010.

---

## 3. Severity-ranked master list

### P0 — Decision-grade (fix before "production-grade")
| # | Issue | Pages | Source |
|---|---|---|---|
| 1 | Route duplication: live legacy `/admin/boms/**` + dual item-detail surfaces, no cross-links | BOMs, Items, Products | FLOW-006/011/020, VISUAL-012 |
| 2 | `window.confirm()` for all destructive actions (worst: users select `onChange`) | 10+ surfaces | INTER-001, A11Y-011 |
| 3 | `ClassWEditDrawer` + holiday modals: no dialog focus management | masters/items, holidays | A11Y-007/008 |
| 4 | Cost-draft **Approve** fires with no confirmation (most consequential financial action; Reject *does* confirm — inverted) | cost-drafts | INTER-010 |
| 5 | Users role/status change fires immediately on `onChange`, no confirm, self-demote only blocked server-side | users | INTER-013, A11Y-011 |
| 6 | masters/archive **restore** mutations have no `onError` → silent failures on a correction action | masters/archive | INTER-015 |
| 7 | Holidays BulkImport **Commit** is dimmed but not `disabled` when rows have errors → can submit invalid data | holidays | INTER-012 |
| 8 | Product-360 "Primary supplier" completeness check is **hardcoded to `warn`** → always false-incomplete | products/[id] | FLOW-009 |
| 9 | Economics fallback-cost edit on a supplier-primary row **saves silently with no effect** → operator thinks cost changed | economics | FLOW-028 |
| 10 | Raw internal references in operator copy (`GAP-AHC-1`, `W1 cycle 8`, `soft-delete`, `upsert`, `archived_at`) | holidays, jobs, sku-* | COPY-040/042/043/055 |
| 11 | `bg-bg-card` undeclared token → transparent card/drawer surfaces | 4 shared files | VISUAL-001 |
| 12 | BOM list N+1 query waterfall (~100 calls) — needs backend summary field | both BOM lists | INTER-021 (ARCH_REQUIRED) |

### P1 — Flow-completion (fix next)
Count chips show 0 during load (THEME B) · missing `aria-live` on 3 banners · search inputs unlabeled · `prefers-reduced-motion` missing on `reveal`/`page-enter`/`pulse-soft` · wizard labels = raw identifiers · wizard has no unsaved-changes guard + Step 5 persists supplier-items on abandon with no warning · wizard success doesn't remind to publish the draft BOM or link to sourcing setup · silent success after product archive/revoke/restore · per-row loading shown as global (cost-drafts, sku-aliases) · supplier-items approval-status fires on `onChange` · `WorkflowHeader size="section"` on tool pages · 21 tables → `.table-base` · canonical BOM head page has no "New draft" CTA · "Used in" links to `/admin/boms?head=` (param silently ignored) · inline panels link to list not detail · users cannot be invited from portal · approved SKU aliases can't be reversed in-UI · holiday Hebrew-name required even for non-Jewish closures · `FieldHelp` uses `role="tooltip"` with an interactive child · status badges rendered lowercase · `COGS`/`MOQ`/`UOM`/`FG`/`RM` abbreviations unexpanded.

### P2 — Polish
Banner dismiss/auto-dismiss inconsistency · inline-edit save has no visual ack · jobs loading skeleton doesn't match card · `<th>` missing `scope="col"` · `rounded-lg` vs `rounded-md` rhythm · arrows in link text · "Quick create"/"supplier-item"/"BOM"/"master" terminology · dark-mode toggle has no `aria-pressed` · touch targets <44px (mobile nav, user menu, row icon buttons) · economics blank area during load (no skeleton) · BOM editor per-line readiness N+1.

---

## 4. No-fault confirmations (things that are *right*)

So the report is balanced — these were checked and pass:
- **No fake data / no mock arrays posing as live rows / no dead stubs in nav. Zero `any` in exported `(admin)` interfaces.**
- Integrations and Jobs honesty labeling ("status derived from exceptions, not telemetry"; "interval estimated from job name") is **transparency-correct**, not a defect.
- Holidays archive (reason-capturing modal), supplier-items archive (`ClassWEditDrawer` with reason), BOM publish preflight + override acknowledgement, and `masters/archive` `InlineRestoreConfirm` are the **good patterns** the rest of the surface should copy.
- Error+retry states exist on all data-fetching surfaces. Badge tone uses dot+label (color is not the sole signal).
- Recipe-Readiness Hebrew corridor labels are intentional and were **not** flagged.

---

## 5. Recommended tranche sequencing

1. **Tranche — Shared primitives** (clears the most findings per change): `<ConfirmDialog>` (THEME A) + `<QueryCountChip>` (THEME B) + `aria-live` on the three banners + `bg-bg-card`→`bg-bg-raised` (THEME D/F). Highest leverage, all portal-only.
2. **Tranche — Route consolidation** (needs Tom's architecture decision first): canonicalize BOM + Item trees, redirects, cross-links (THEME C).
3. **Tranche — Dialog/focus a11y**: route `ClassWEditDrawer` + holiday modals through Radix primitives (THEME D).
4. **Tranche — Copy pass**: enum/ID/jargon scrub + 3 new `portal_ux_standard.md` §3 rules (THEME E).
5. **Tranche — Decision-grade one-offs**: cost-draft Approve confirm, users `onChange` guard, archive `onError`, BulkImport `disabled`, Product-360 completeness check, economics no-op edit.
6. **Backend (ARCH_REQUIRED, route to backend-db-executor):** BOM list/editor N+1 — add version/line summary + batch readiness to the heads/lines endpoints.

---

## 6. Per-lens appendix

Each auditor produced a full numbered findings list with `file:line` references, acceptance criteria, and a YAML handoff packet. Identifiers used above:
- `VISUAL-001…013` — visual system (tokens, hierarchy, tables, buttons).
- `INTER-001…022` — interaction (buttons, confirms, loading/empty/error, forms).
- `A11Y-001…028` — accessibility (WCAG AA; touch, focus, ARIA, live regions, motion).
- `COPY-001…094` — microcopy (enums, IDs, jargon, error templates, terminology table).
- `FLOW-001…030` — end-to-end flow (route families, dead-ends, cross-links, post-action visibility).
- Admin-surface control — coverage matrix (view/create/edit/delete/audit per domain); key gap: **no UI field-level audit trail** anywhere except BOM version history.

> The single most valuable *new* investment surfaced by the control audit: **per-record change history ("who changed this, when, prior value")** is absent across all master domains, though the backend already captures the data (`if_match_updated_at` + idempotency).

---

**Next action:** Decide Tranche 1 (shared primitives — `ConfirmDialog`, `QueryCountChip`, banner `aria-live`, `bg-bg-card` fix) as the first bounded fix set, and give the route-consolidation architecture decision (THEME C) so Tranche 2 can be planned.
