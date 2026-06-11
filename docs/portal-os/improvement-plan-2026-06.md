# GT Factory OS — Master Improvement Plan (2026-06)

> Derived from the full-system audit `docs/portal-os/audit-reports/2026-06-11-full-system.md`
> (10 parallel investigations: routes, admin, flows, design, interactions, taxonomy, prices,
> planning paths, production reporting, PO creation). Status: **PROPOSED — awaiting Tom approval.**
> Nothing here executes until each phase is approved; portal work runs through bounded tranches,
> backend/schema work runs through the W1/W4 lanes per EXECUTION_POLICY.

## Operating principles
1. Trust before scope: ledger truth, price truth, and journey integrity come before any visual work.
2. Parallel lanes: portal tranches (this repo) and backend packages (gt-factory-os) run
   concurrently; each phase lists its lane.
3. Every phase is independently shippable and verified (typecheck + vitest + @mocked e2e + scorecard delta).
4. Nothing destructive without Tom's written approval; deletions are demote-first.

---

## Decisions Tom must make (blocking inputs, ~30 minutes total)

| # | Decision | Blocks |
|---|---|---|
| T1 | **Scrap doctrine:** does production consume RM for output+scrap (current backend) or output only (current copy + GAP-011)? | Phase 1 (B1) |
| T2 | **Planning runs:** demote-now agreed; within the quarter — fund the math fix or fold checks into session/projection and retire? (Recommendation: demote now, decide after Groups v1 ships.) | Phase 4 |
| T3 | **Price write-back threshold:** auto-approve catalog price updates from PO/receipt when delta ≤ X% (suggested 25%); larger deltas stay pending in admin inbox. | Phase 2 (D3/D5) |
| T4 | **Supplier-create role gate:** allow planner (not only admin) to create suppliers/supplier-items inline from the PO form? | Phase 6 (D4) |
| T5 | **Group vocabularies:** approve the seeded product-group list (the existing 10) and the proposed ~12 material groups before the cleanup migration. | Phase 3 |
| T6 | **Quarantine resolution:** /admin/users, /admin/jobs, /admin/integrations are live — accept as live (manifest ritual) or re-quarantine? (Recommendation: accept as live.) | Phase 5 |

---

## Phase 1 — Truth & Safety Hotfixes (portal lane, 1–2 tranches, ~days)
Smallest changes, largest daily-pain reduction. All portal-only except B2/B3 one-liners.

1. Journey 404s: strip `/ops` prefix in rec actions; `/stock/ledger` → `/stock/movement-log?item_id=` (+param read).
2. Receipts URL-locked dead-end: re-seed `poId`, reset `prefillApplied`.
3. `/admin` index page (redirect to /admin/items) + 4 broken admin cross-links (masters/items,
   planning/policy ×2, parity-check PO links).
4. Confirmation gate on loss-direction waste (mirror the positive-direction panel, INTER-001) +
   keep panel visible during submit (INTER-003).
5. Production B1 copy/backend arbitration per T1; B2 dead `?submission_id=` link → read-only
   submission detail (needs 1 backend read endpoint); B3 planner-403 (one-line gate or hide CTA).
6. Dropped deep-link params: `/inventory?item_id=`, `/exceptions?id=`, physical-count `?item_id=`,
   supplier-items + sku-aliases `?item_id=`.
7. Success-panel snapshot bug (committedSnapshot), focus-mode placed-PO link, UUIDs in
   INSUFFICIENT_STOCK error (portal fallback now; backend `component_name` follows in Phase 2).
8. Inventory row drill-down: role-aware links; RM/PKG rows → components route.

**Exit:** zero 404s on primary journeys; both daily ledger writers gated; all deep-links honored.

## Phase 2 — Price Truth (backend lane + portal, the critical package)
Implements audit §7 + §10. One pipeline for all price changes.

1. Build the missing `supplier_cost_drafts` approval handler (0188): approve atomically writes
   `supplier_items.std_cost_per_inv_uom` + `price_history` + `change_log`.
2. PO price entry (D3): optional `unit_price_net` + `supplier_item_id` per line in create schema +
   `fn_create_manual_po`; place-time "update catalog price" checkbox per T3; same in focus mode.
   Fix `fn_create_manual_po` approval_status filter inconsistency while touching it.
3. Receipt actual-cost capture (D5): optional `actual_unit_price_net` per GR line → same draft funnel.
4. Economics editor fix: write/warn about the **effective** primary supplier cost, not the shadowed fallback.
5. Activate the COGS nightly job (replace the disabled `select 1` placeholder) + auto-snapshot after cost edits.
6. Freshness honesty: replace `as_of=now()` with real "prices last updated" age; surface cost age per row.
7. Refetch + invalidation sweep: /inventory refetch cadence; invalidate `["stock","value"]` +
   rm-costs on cost mutations; receipts/approvals/session-place invalidations (flow audit list).
8. Dashboard value-trend honesty: server-side windowed ledger fetch (kill the 300-row cap),
   raise coverage threshold, label "at current prices" explicitly.

**Exit:** a price entered on a PO or receipt updates the catalog through an audited pipeline;
inventory/dashboard values refresh continuously and state their age.

## Phase 3 — Groups v1 (multi-lane epic: schema → API → portal)
The filter/classification overhaul (audit §6). Step 0: live-DB population check on
`product_group`/`component_group` (the portal claims they're blank; fixtures are ~94% populated).

1. Schema: `product_groups` + `material_groups` master tables (name_en, name_he, display_order,
   color_token, active); FK columns on items/components; cleanup migration mapping the 34 dirty
   component_group strings → ~12 controlled groups and 10 product groups (+nulls assigned) per T5.
2. Derived RM-by-product-group view over `fn_explode_bom_to_components` (ACTIVE BOMs):
   product_group → components; each component gains `used_by_product_groups[]`.
3. API: classification fields on `/queries/stock`; group filter params on inventory flow,
   supply flow, movement-log, economics views.
4. Portal: one shared taxonomy module (chips, Hebrew labels, colors — replaces the SKU regexes,
   the `family.ts` color map, and the economics chip divergence); uniform URL-backed
   `GroupFilterBar` (counts + Clear-all) on /inventory (both tabs), inventory-flow, supply,
   movement-log, /admin/items, /admin/economics.
5. `/admin/groups` management surface (CRUD, ordering, bulk assign, derived-RM panel).
6. Surface `production_track` (tea_tank/matcha_repack/alcohol) as a filter on production-plan +
   inventory-flow.

**Exit:** "show me raw materials for the tea line" is a one-click filter on every stock surface,
driven by master data that updates itself through BOMs.

## Phase 4 — Planning Consolidation (portal + governance; engine decision per T2)
Implements audit §8. One declared workflow, fewer surfaces.

1. Declare the canonical cadence in-product (planning hub copy + meeting cockpit): Thursday
   forecast→meeting→firm; Sunday procurement focus-mode to zero; daily production board +
   inventory-flow at-risk; weekly blockers sweep.
2. Demote `/planning/runs` from primary nav; banner run quantities "not for ordering";
   keep exceptions feeding blockers/critical-today.
3. Delete `/planning/purchase-session`, `/planning/purchase-calendar`, `/planning/weekly-outlook`
   pages after one clean Sunday close; re-point `/planning/meeting` links to procurement;
   archive `fn_propose_weekly_production_plan` after orphan confirmation.
4. Close the firm→procurement seam: session consumes `v_firmed_production_fg_demand` (0221);
   plan-overrides-forecast inside the firmed window (backend).
5. One canonical demand model (GREATEST semantics) shared by session + projection (+ runs if kept).
6. Session auditability: persist per-session input snapshot; per-line coverage-trace "why this
   qty/date" UI (trace JSON already exists); surface `po_missing_expected_delivery` as session warning.
7. Quarter checkpoint (T2): fix run math (planned-receipt reset, incremental netting w/
   roll-forward, firmed inflows) or retire engine into session/projection checks.

**Exit:** one obvious way to plan; every Sunday PO line explains itself; no contradictory answers
between surfaces.

## Phase 5 — OS Truthfulness & Role Gates (portal lane, governance-heavy)
1. Quarantine resolution ritual for /admin/users|jobs|integrations per T6.
2. Route-manifest regeneration (34 orphans) + baseline.json anchors + stale invariants 15-17;
   seed quarantine entries; decide API-manifest policy (break-glass, users PATCH).
3. Three-layer role-gate reconciliation (middleware ↔ layouts ↔ nav ↔ manifest): /admin/economics
   planner carve-out, /stock planner+viewer reads, /planning audience decision, operator↔PO loop.
4. Admin truth fixes: integrations real sync telemetry (last-sync timestamps from jobs) + sync-now;
   jobs expected-interval from registry (not name sniffing) + run-now/history; sku-aliases
   structured field instead of title regex; kill IDB/API mixed-truth panels; BOM list count fix;
   "Discard changes" relabel/implement; audit-trail GET + History tab (backend package);
   pagination strategy for the 79 `limit=1000` call sites + PO list 500-cap indicator.

**Exit:** the OS files describe reality; role projection can ship without lockouts; admin pages
control what they claim to control.

## Phase 6 — Procurement & Production Pro Polish (portal + small backend)
1. PO smart flow (audit §10): D1 supplier comparison strip + mapping pre-check + delta chip +
   MOQ hints; D2 lead-time-aware dates; D4 inline new-supplier per T4.
2. Production reporting (audit §9 NEXT tier): B4 draft/firmed/base-batch board states + board
   "Firm this week"; B5 production reversal endpoint + UI; C6 one-tap "as planned"; C7 partial →
   re-plan remainder (Tier 1); C10 availability columns in preview; C8 variance reason codes;
   C12 history → reconciliation log; D13 day-close ritual + tomorrow preview.
3. LATER backlog (explicitly deferred): C9 liquid-vs-pack loss split, D14 run timing +
   in_production, D15 yield trend read model, D16 actual-vs-standard run cost, lot capture.

## Phase 7 — Design-System Enforcement & Interaction Sweep (portal lane, parallel-anytime)
1. P0s: delete duplicate `.kpi-tile` block; remove DB view names from dashboard footers; remove the only italic.
2. Consumption sweep: `.table-base` on all list tables; `.btn` unification (kill 3 CTA shapes);
   Lucide-only (waste form); EntityPickerPlus migration; Badge for LeadTimeChip/TitleCount;
   shared SectionHeading + feedback states; `space-y` → `gap`.
3. Shared-primitive changes needing Tom design sign-off: WorkflowHeader `size="section"`,
   `.stat-card` consolidation (4 KPI-card patterns → 1), sub-scale font tokens.
4. Interaction P1/P2 remainder: PublishConfirmModal isSubmitting; UoM picker; PO-list truncation;
   inventory-flow Clear-all; KPI-tile skeletons; btn-danger on cancel-plan; 32px touch targets;
   plan-board refetch + last-updated; disabled-row reasons; JSON.stringify error leak.

---

## Sequencing & parallelism

```
Week 1-2:  Phase 1 (portal)            ║  Phase 2 items 1-2 (backend)      ← after T1, T3
Week 2-4:  Phase 7 items 1-2 (portal)  ║  Phase 2 items 3-8 (backend+portal)
Week 3-6:  Phase 3 (schema→API→portal) ← after T5 + step-0 DB check
Week 5-7:  Phase 4 (after one clean Sunday on procurement)                 ← T2 checkpoint set
Week 6-9:  Phase 5 (governance)        ║  Phase 6 (feature polish)         ← T4, T6
Ongoing:   Phase 7 items 3-4 fill spare tranche capacity
```

Verification per phase: `/portal-tranche-fix` discipline, vitest + @mocked e2e green,
`/portal-regression-guard`, `/portal-scorecard` recompute, evidence paths in every PASS.

---
status: proposed · author: full-system audit 2026-06-11 · owner approval: pending (T1–T6)
