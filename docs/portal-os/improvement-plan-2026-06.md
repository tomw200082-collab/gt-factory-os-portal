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

## Decisions (resolved 2026-06-11; T5 group list pending Tom's confirmation)

| # | Decision | Resolution |
|---|---|---|
| T1 | Scrap doctrine | **RESOLVED: output + scrap (keep backend, fix copy).** Materials are physically consumed for scrapped units too; the ledger behavior is correct. Fix the three copy locations to state it numerically ("Consumed for 120 processed = 100 good + 20 scrap"). |
| T2 | Planning runs | **RESOLVED: demote now → retire, don't fund the math fix.** Remove from nav + "not for ordering" banner immediately; migrate the valuable preflight/exception checks (rebuild-drift, missing-BOM, missing-supplier, po_missing_expected_delivery) into the session/projection layer during Phase 4; retire the run tables after the checks land. Rationale: the session engine is sound and already powers the real workflow; maintaining two ordering engines violates the simplicity doctrine. Final checkpoint after Groups v1 ships. |
| T3 | Price write-back threshold | **RESOLVED: 25%.** Delta ≤25% → "update catalog price" checkbox pre-checked at place (still writes draft→approved + price_history evidence rows); >25% → unchecked + warning, stays pending in admin inbox. Threshold stored as a policy key so Tom can tune it. |
| T4 | Supplier-create role gate | **APPROVED by Tom: planner may create a supplier inline, minimal-burden.** Only ONE required field: supplier name. Optional (collapsed "add details" section): contact name, phone, payment terms, lead time. Everything else defaults; supplier_items created as pending; admin inbox surfaces new suppliers for enrichment later. |
| T5 | Group vocabularies | **APPROVED by Tom (2026-06-11): the 7 product groups + 13 material groups below are confirmed.** Cleanup migration may proceed in Phase 3 (after the step-0 live-DB population check). |
| T6 | Quarantine resolution | **APPROVED by Tom: /admin/users, /admin/jobs, /admin/integrations are LIVE.** Manifest ritual reclassifies them; Phase 5 upgrades them to real control surfaces (sync telemetry + sync-now, job run-now/history, role-change audit trail) — full professional admin control. |

---

## Groups v1 — proposed vocabularies (T5, for Tom's approval)

### Product groups (תוצרת מוגמרת) — 7 groups
Built from Tom's list (tea 500ml, tea 1L, matcha/powders, accessories, sangrias & alcohol) +
the 68 live items, completed to full coverage. Hebrew label is the operator-facing name.

| # | Hebrew | English (key) | Contents today | Count |
|---|---|---|---|---|
| 1 | תה — 1 ליטר | `tea_1l` | All 1L tea-extract SKUs (CALM, ENERGY, DETOX, FRESH, NAMASTEA, REVIVE, CONSCIOUSNESS, DESERTEA, AMERICAN…) incl. NO SUGAR variants | 13 |
| 2 | תה — 500 מ"ל | `tea_500ml` | All 500ml tea-extract SKUs | 13 |
| 3 | מאצ'ה ואבקות | `matcha_powders` | MATCHA 18g/30g/100g/500g (repack) | 4 |
| 4 | אלכוהול וקוקטיילים | `alcohol_cocktails` | MARGARITA, SANGRIA (pink/red/white), 3.85L cocktails, ELITA (arak passion fruit, cosmo lychee), MUZA cocktails, NONOMIMI | 20 |
| 5 | מיקסרים | `mixers` | MUZA mixers ×7, TAPIOCA ×4 (bought) | 11 |
| 6 | סמוזי | `smoothies` | ODK mango/peach/strawberry (bought) | 3 |
| 7 | אביזרים נלווים | `accessories` | Garnish items ×4 (bought; today product_group NULL) | 4 |

Design notes: (a) brand (MUZA/ELITA/NONO MIMI) and flavor stay on `family` — group answers
"what line is this", family answers "which product"; filters can combine both. (b) 3.85L
cocktails fold into group 4 via the existing `pack_size` attribute — no separate group for one
pack size. (c) Groups 1+2 deliberately split by pack size per Tom — that's how the factory
thinks about tea; the BOM-derived RM sets will still unify on the shared tea bases.
(d) `production_track` (tea_tank / matcha_repack / alcohol) remains the production-line axis —
already Tom-locked, surfaced as its own filter, not duplicated into groups.

### Material groups (חומרי גלם ואריזות) — 13 groups
Cleanup migration maps the 34 dirty `component_group` strings (case/synonym variants + 4 nulls):

| # | Hebrew | English (key) | Class | Today's dirty values absorbed |
|---|---|---|---|---|
| 1 | עלי תה | `tea_leaves` | INGREDIENT | TEA |
| 2 | עשבי תיבול ותבלינים | `herbs_spices` | INGREDIENT | HERBS_SPICES, Herbs & Spices, Herbs |
| 3 | מחיות ופירות | `fruit_purees` | INGREDIENT | FRUIT_PUREES |
| 4 | סירופים | `syrups` | INGREDIENT | ADDITIVES_SYRUPS |
| 5 | סוכר, חומצות ומשמרים | `sugar_preservatives` | INGREDIENT | ADDITIVES (sugar, lemon acid, preservative) |
| 6 | אלכוהול | `alcohol_rm` | INGREDIENT | ALCOHOL (arak, rum, vodka, amaretto…) |
| 7 | בסיסים ומים | `bases` | INGREDIENT | BASES |
| 8 | בקבוקים | `bottles` | PACKAGING | BOTTLE |
| 9 | פקקים ומכסים | `caps_lids` | PACKAGING | CAP, Cap, CAPS, LID |
| 10 | תוויות | `labels` | PACKAGING | LABEL, Label (50 components — largest group) |
| 11 | קרטונים | `cartons` | PACKAGING | CARTON |
| 12 | שקיות ואריזות גמישות | `bags_flexibles` | PACKAGING | BAG (+ matcha bags) |
| 13 | חומרי תהליך | `process_supplies` | PROCESS_SUPPLY | FILTER, PROCESS_SUPPLY |

### The derived layer (automatic, no manual upkeep)
`v_material_demand_by_product_group` (BOM explosion over ACTIVE BOMs) gives every component a
`used_by_product_groups[]`. So the supply/inventory surfaces can answer, in one click:
"חומרי גלם של קו התה" (all components feeding groups 1+2), "אריזות של המאצ'ה", "מה האלכוהול
שמשרת את הקוקטיילים" — and it stays correct automatically as recipes change. Unassigned/new
items surface in a "ללא קבוצה" chip + an admin health check, never silently hidden.

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
status: decisions T1-T4, T6 resolved 2026-06-11 · T5 group vocabulary awaiting Tom confirmation · author: full-system audit 2026-06-11
