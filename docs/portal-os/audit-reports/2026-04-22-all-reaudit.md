# Portal Audit — 2026-04-22 — scope: all (re-audit, post-Tranche-011)

> Re-audit ordered by operator after T001-T011 landed. Operator's framing: "the last 11 tranches were UX polish, not production control completeness." Three subagents (route, admin, flow) ran in parallel against current state.
>
> **Verdict: operator is substantially right.** The flow auditor scored ~73% of T001-T011 as polish/hygiene. Real production-control gaps remain — and are concentrated in the **PO chain** (which is genuinely a dead-end object), **role-boundary tests** (entirely missing), **inbox federation** (achievable with existing endpoints), and a cluster of **backend-blocked items** (audit trail, approval queue, real users/jobs/integrations, recent-submissions read-back).

## Scorecard delta context
- **Previous score:** 75/100 (post-Tranche-011, 2026-04-22).
- **This audit's purpose:** identify what's left for FULL PRODUCTION, focused on operational control completeness rather than polish.
- **Key correction:** the prior admin audit overcalled "no master-data EDIT". The admin auditor this round verified `<InlineEditCell>` + `patchEntity` + 6 PATCH proxies are wired and live for items/components/suppliers/supplier-items/planning-policy/BOMs. The real gaps are **observability** (audit-trail) and **gating** (approval queue), not the edit verb itself.

## Categories flagged by this audit
- `flow_continuity` — PO chain has 3 break points (no detail page, no PO selector in receipts, no portal-side state advance).
- `regression_resistance` — zero E2E tests verify role boundaries via direct API hits; middleware is auth-only; RoleGate is purely client-side.
- `admin_superuser_depth` — audit-trail visibility absent; approval-queue flow absent; 3 admin shells still QuarantinedPage.
- `ops_surface` — operator forms work but cannot reference POs (po_id hardcoded null); no "my recent submissions" surface.
- `nav_integrity` — `/inbox/page.tsx` is a one-link stub; could federate `/api/exceptions` rows today (no new backend needed).

---

## Route / nav findings (from portal-route-auditor)

**Verdict: FAIL (6 critical, 6 high, 4 medium, 3 low).**

### Critical (in priority order)
1. **PO chain dead-end**: `src/app/(planning)/planning/runs/[run_id]/page.tsx:468` deep-links to `/purchase-orders/{po_id}` after Convert-to-PO. **No detail page exists on disk** (no `src/app/(po)/purchase-orders/[po_id]/page.tsx`). Operator clicks success toast → 404.
2. **PO list is read-only**: `src/app/(po)/purchase-orders/page.tsx:18,138` self-documents "v1 strictly read-only". No row click-through, supplier rendered as raw `supplier_id` (line 268).
3. **`/admin/users` is QuarantinedPage** (`page.tsx:3-5`). No way to onboard/offboard staff or change roles. Backend-blocked.
4. **`/admin/jobs` is QuarantinedPage**. Background-job state invisible. Backend-blocked.
5. **`/admin/integrations` is QuarantinedPage**. Boundary-system health invisible. Backend-blocked.
6. **Operator submits write-into-void for receipts + production-actual**. `/stock/submissions` doesn't exist; no GET endpoints for the four stock submit routes (POST-only).

### High
- Inbox is one-link stub (`src/app/(inbox)/inbox/page.tsx:14-21`); no listing of pending approvals.
- Master-data PATCH commits immediately; no approval-queue intermediate state.
- Per-item planning policy not modeled (`products/[item_id]/page.tsx:1351` — site-wide KV mutates for every SKU).
- Audit-trail tab is placeholder (`products/[item_id]/page.tsx:1408-1419`).
- Zero live role-gate tests — only static layout `RoleGate` + nav-visibility tests.
- Suppliers list inline-edit absent — must enter detail page (polish, not blocker).

---

## Admin surface findings (from portal-admin-surface-auditor)

**Verdict: PASS-with-correction; previous "no edit" claim REFUTED IN SCOPE.**

### Per-domain EDIT capability matrix

| Domain | EDIT capability | Mechanism | What's missing |
|---|---|---|---|
| items | **FULL** | `<InlineEditCell>` on 6 fields in `products/[item_id]:670-758` | audit trail, approval queue |
| components | **FULL** | InlineEditCell on 9 fields | same |
| suppliers | **FULL** | InlineEditCell on contact, terms, lead time, MOQ | same |
| supplier-items | **FULL** | InlineEditCell **on the list** for lead/MOQ/pack | price (intentional — `price_history` table); same gaps |
| sku-aliases | Approval flow exists for inbound mappings | `sku-aliases/page.tsx:17-26` | edit existing aliases |
| planning-policy | **FULL within scope** | Inline-edit on KV value | per-item overlays not modeled |
| BOMs | **FULL** (Slice 6 landed) | Head/version editor at `/admin/boms/[head_id]/versions/[version_id]` | reverse "where used" |

### Real gaps (not polish)
- **Audit-trail invisibility (HIGH)**: `change_log` table persists upstream but no GET endpoint; no UI surface anywhere shows "changed by/at" for any master-data record. Single most defensible "lack of control" claim.
- **No master-data approval queue (HIGH)**: every PATCH commits immediately. Sensitive fields (`pack_size`, `case_pack`, `moq`, `lead_time_days`) can be changed by any admin without four-eyes review, retroactively breaking in-flight planning runs.
- **`/admin/products/new` is real and works** — 7-step wizard at `products/new/page.tsx`; manifest does not declare it. Polish.
- **`/admin/signals` is a planning ghost** — referenced in nav-manifest comments only; no backend endpoint exists.

---

## Flow continuity findings (from portal-flow-continuity-auditor)

**Verdict: FAIL — production-control object graph incomplete.**

### Per-flow walk

| # | Flow | Verdict | Break point |
|---|---|---|---|
| 1 | Master-data lifecycle (edit → save → list re-fetches) | PASS | History tab placeholder; no approval queue. |
| 2 | PO chain (rec → PO → receive → close) | **FAIL** | 3 breaks: (a) `/purchase-orders/[po_id]` 404; (b) Goods Receipt has `po_id: null` hardcoded at `src/app/(ops)/stock/receipts/page.tsx:265,274`; (c) PO line statuses cannot be advanced from portal. |
| 3 | Planner smoke (run → approve → convert → PO open → operator receives) | **FAIL** | Steps 1-4 work; FAILS at hand-off (same root cause as #2). |
| 4 | Operator write-side smoke | WARN | Forms post correctly; no recent-submissions surface for any of the 4 forms. POST-only proxies; backend-blocked. |
| 5 | Live role-gate verification | **FAIL** | Only `tests/e2e/role-switch.spec.ts:11-45` exists — tests nav-link visibility per role. No tests verify viewer-cannot-approve via direct API, operator-cannot-trigger-run, planner-cannot-PATCH-items. Middleware is auth-only; entire defense rests on upstream JWT scoping (unverified by any portal test). |

### Honest assessment of T001-T011
Of 11 tranches, 3 were genuine production-control or substrate (T004 cancel proxy, T009 error boundaries, T011 security headers + env validation). The other 8 were nav-manifest reconciliation, identifier renames, deletion, viewport polish, KPI tiles, toast deep-links, banner deep-links — none of them advanced the operational object graph. **Zero tranches added a PO detail page, a PO link on a receipt, a recent-submissions list, an audit-trail surface, a unified inbox listing, or any role-boundary backend test.**

### Bonus reverification
T004's physical-count cancel is real and end-to-end (`api/physical-count/[id]/cancel/route.ts:1-13` + call at `physical-count/page.tsx:317`). Solid.

---

## Top 10 production-critical gaps (prioritized)

| # | Gap | Severity | Lane | Tranche slug |
|---|---|---|---|---|
| 1 | `/purchase-orders/[po_id]` detail page (header + lines + receipts) | CRITICAL | **portal-native** (transport-only proxy to upstream `/api/v1/queries/purchase-orders/{id}`) | `tranche-012-po-detail-page` |
| 2 | `po_id` + `po_line_id` selector in Goods Receipt form | CRITICAL | **portal-native** | `tranche-013-receipt-po-linkage` |
| 3 | `/inbox` federation: surface `/api/exceptions` rows + approval deep-links | CRITICAL | **portal-native** (existing endpoint) | `tranche-014-inbox-federation` |
| 4 | Live role-boundary E2E pack (viewer→approve, operator→execute, planner→PATCH-items) — assert 403 from API not hidden nav | CRITICAL | **portal-native** (test-only) | `tranche-015-role-boundary-e2e` |
| 5 | "My recent submissions" panel on each operator form | CRITICAL | backend-blocked (need GET /goods-receipts etc.) | TBD-after-W1 |
| 6 | Audit-trail History tab on Product 360 + 5 other detail pages | HIGH | backend-blocked (need GET /api/audit-log) | TBD-after-W1 |
| 7 | Master-data approval queue (propose → admin approves → posts) | HIGH | backend-blocked + L portal | TBD-after-W1 |
| 8 | Real `/admin/users` (invite, role change, deactivate) | HIGH | backend-blocked + M portal | TBD-after-W1 |
| 9 | Real `/admin/jobs` (list, last-error, run-now) | HIGH | backend-blocked + S portal | TBD-after-W1 |
| 10 | Real `/admin/integrations` (LionWheel/Shopify/Green Invoice health) | HIGH | backend-blocked + S portal | TBD-after-W1 |

**Critical insight:** Items 1-4 are **portal-native and ready to execute today**. Items 5-10 are backend-blocked but the portal-native portion of each is small (M-or-smaller). The previous round of 11 tranches missed all four of items 1-4.

---

## Suggested next tranche focus

**Sprint 1 (this run, 4 portal-native tranches):**
- **Tranche 012** `po-detail-page` — `(po)/purchase-orders/[po_id]/page.tsx` + `api/purchase-orders/[po_id]/route.ts` + row click on list + manifest row.
- **Tranche 013** `receipt-po-linkage` — fetch open POs in receipts form; line-level PO selector; pass `po_id` + `po_line_id` instead of null.
- **Tranche 014** `inbox-federation` — rewrite `/inbox/page.tsx` to query `/api/exceptions?status=open,acknowledged` and render typed rows with the T005 deep-link map.
- **Tranche 015** `role-boundary-e2e` — `tests/e2e/role-boundaries.spec.ts` covering 6+ direct-API role × mutation pairs asserting 403/redirect.

**Sprint 2 (after W1 ships GET endpoints):**
- Recent-submissions surface (Tranche 016)
- Audit-trail History tabs (Tranche 017)
- Approval queue (Tranche 018)
- Real /admin/users + /admin/jobs + /admin/integrations (Tranches 019-021)

**Note for the Improvement OS:** going forward, the tranche planner should weight tranches by "advances the operational object graph" vs "polishes existing surface". The last round was 73% polish — that ratio is unhealthy for a portal still 25 points from full production.

---

## Evidence

### Portal-native blockers
- `src/app/(planning)/planning/runs/[run_id]/page.tsx:232-249,459-480,468`
- `src/app/(po)/purchase-orders/page.tsx:18,138,267-269`
- `src/app/(ops)/stock/receipts/page.tsx:265,274,298,333-350`
- `src/app/(inbox)/inbox/page.tsx:14-21`
- `src/middleware.ts:23-30`
- `tests/e2e/role-switch.spec.ts:11-45`
- (no file) `src/app/(po)/purchase-orders/[po_id]/page.tsx` — does not exist
- (no file) `src/app/api/purchase-orders/[po_id]/route.ts` — does not exist

### Master-data EDIT mechanism (refutes "no edit" claim)
- `src/lib/admin/mutations.ts:46-62,86-102` (patchEntity + error envelope)
- `src/components/tables/InlineEditCell.tsx:29-60`
- `src/app/(admin)/admin/products/[item_id]/page.tsx:670-758,313-338,340-361,1408-1419`
- `src/app/(admin)/admin/components/[component_id]/page.tsx:14-17,195-280`
- `src/app/(admin)/admin/suppliers/[supplier_id]/page.tsx:15-17`
- `src/app/(admin)/admin/supplier-items/page.tsx:9-13,20-23`
- `src/app/(admin)/admin/planning-policy/page.tsx:13,62-72`

### Backend-blocked surfaces
- `src/app/(admin)/admin/users/page.tsx:1-5` (QuarantinedPage)
- `src/app/(admin)/admin/jobs/page.tsx:1-5` (QuarantinedPage)
- `src/app/(admin)/admin/integrations/page.tsx:1-10` (QuarantinedPage)
- `src/app/api/{goods-receipts,waste-adjustments,physical-count,production-actuals}/route.ts` (POST-only)

### Tranches landed
- `docs/portal-os/tranches/{001..011}-*.md`

---

Next action: execute `tranche-012-po-detail-page` immediately as the highest-leverage portal-native fix; chain into 013, 014, 015 in this same loop.
