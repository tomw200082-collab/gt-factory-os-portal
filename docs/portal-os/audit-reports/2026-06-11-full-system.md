# Portal Audit — 2026-06-11 — scope: full-system

> Deep full-system audit requested by Tom: every page, button, action; UX/UI quality, design,
> inventory FG/RM filters and classifications, stock-flow pages, product-group taxonomy proposal,
> price/valuation freshness, and a planning-paths consolidation verdict.
>
> Produced by 8 parallel auditors: portal-route-auditor, portal-admin-surface-auditor,
> portal-flow-continuity-auditor, visual-system-designer, interaction-design-specialist,
> taxonomy/filter analyst, price-chain investigator, planning-paths investigator.
> All read-only. Portal tip at audit time: `4b5e139`.

## Scorecard delta context

Previous score: **88 / 100** (scorecard.json, generated 2026-05-30).
Categories flagged by this audit: `nav_integrity` (quarantine drift + 34 manifest orphans),
`admin_superuser_depth` (no /admin hub, no audit trail, missing group filters),
`flow_continuity` (two 404s on primary journeys, dropped deep-link params, stale-cache gaps),
`state_hygiene` (price staleness, no in-place refetch on /inventory),
`data_truthfulness` (April-2026 price snapshot, integrations "Active" without telemetry,
planning-run math double counting).

The 88 score predates most of the surfaces this audit examined (inventory, movement-log,
production-plan, procurement, masters, economics were added after the manifest was last
regenerated); a `/portal-scorecard` recompute after the manifest regeneration tranche is expected
to land materially lower and more honest.

---

## 1. Route / nav findings (portal-route-auditor)

Coverage: 197 routes scanned (74 pages + 123 API routes), 11 layouts, middleware, 63 nav items.
Verdict: **FAIL** (3 critical, 5 high).

### Critical
1. **`/admin/users`, `/admin/jobs`, `/admin/integrations` — quarantine drift.** Manifest says
   `quarantined` / renders `QuarantinedPage`; in code all three are live, nav-linked surfaces
   (`src/lib/nav/manifest.ts:336,343,350`; users mutates roles via `/api/users` PATCH).
   `QuarantinedPage.tsx` is now imported nowhere — the quarantine mechanism is dismantled.
   Fix: reclassify via the quarantine-update/manifest-update ritual (they are real surfaces now).

### High
2. **34 routes exist in code but are missing from route-manifest.json** (manifest last touched
   tranche 028). 17 are nav-reachable, including `/inventory`, `/stock/movement-log`,
   `/planning/production-plan`, `/planning/inventory-flow`, `/admin/economics`,
   `/admin/masters/*`, `/admin/sku-health`. Fix: manifest regeneration tranche.
3. **Broken links:** `parity-check/page.tsx:218,288` → `/admin/purchase-orders/[po_id]` (no such
   route; detail lives at `/purchase-orders/[po_id]`).
4. **Three-layer role-gate conflicts (latent lockouts once `app_metadata.role` is projected):**
   - `middleware.ts:39` gates `/admin/*` to admin, but `/admin/economics` layout+nav admit planner.
   - `middleware.ts:41` gates `/stock/*` to operator+admin, but the capability lattice grants
     planner `stock:execute`, and `/stock/movement-log` is nav'd at viewer.
   - `middleware.ts:40` gates `/planning/*` to planner+admin while `(planning)/layout.tsx` admits
     all four roles.
   Fix: reconcile middleware ↔ layouts ↔ nav ↔ manifest in one alignment tranche.

### Medium / low (summary)
- `quarantine.json` entries[] still empty; `baseline.json` anchors empty + invariants 15-17 stale.
- `/planning/meeting` re-links superseded `/planning/purchase-session` + `/purchase-calendar`
  (page.tsx:738,751) instead of `/planning/procurement`.
- `/exceptions` unreachable from nav (KPI-tile-only); legacy `/admin/boms|items|components|suppliers`
  list pages coexist with `/admin/masters/*` detail pages (dual-surface drift).
- 123 API routes unmanifested (incl. `/api/system/break-glass`, `/api/users/[user_id]` PATCH).
- Forbidden-string vestige (comment only) at `tests/e2e/forecast-planner-real.spec.ts:198`.

---

## 2. Admin surface findings (portal-admin-surface-auditor)

Coverage: 31 admin pages across 14 domains. Verdict: **FAIL**.
CRUD plumbing is largely real and role gating is correct; the surface fails the superuser bar on:

### Critical / high
1. **`/admin` has no page and no redirect** — every admin breadcrumb (7+ pages) 404s.
2. **Broken cross-links (404):** `/admin/masters/items` (linked from two empty-state CTAs),
   `/admin/planning/policy` (real page is `/admin/planning-policy`, linked from Product 360 and
   masters item detail), `/admin/purchase-orders/[po_id]` (parity-check rows).
3. **No product-group filter on `/admin/items`** — `product_group` is in the row payload
   (`items/page.tsx:61`) but the only filters are Status + Supply method; search doesn't cover
   group/type. `/admin/components` already has a working group filter (`components/page.tsx:664-678`)
   — the pattern exists and must be replicated.
4. **No audit-trail visibility anywhere.** Product 360 History tab is a hard-coded placeholder
   ("will appear once the audit-trail endpoint is live"); role changes on /admin/users have zero
   visible history.
5. **`/admin/integrations` health is fabricated from exception rows** — an integration that never
   ran shows "Active"; only Shopify has a real sync-status endpoint. "Last event" actually shows
   newest exception time. No sync-now/retry controls.
6. **BOM editor "Discard changes" doesn't discard** — edits were already PATCHed server-side; the
   button only navigates away after a scary confirm (`versions/[version_id]/page.tsx:776-792`).
7. **sku-aliases recovers unmapped SKUs by regex-parsing exception titles**
   (`/Unknown SKU (.+)$/`) — any title drift silently drops rows from the mapping queue.

### Cross-cutting
- **Mixed truth:** "Used in" / "Components supplied" panels read IndexedDB repos while the table
  beside them reads the live API (`components/page.tsx:363-430`, `suppliers/page.tsx:306-332`).
- **`limit=1000` hard cap in 79 places across 20 admin files, zero pagination UIs.**
- Product 360: BOUGHT_FINISHED "Primary supplier" completeness is hard-coded to `warn`
  regardless of actual data (`products/[item_id]/page.tsx:671-680`); per-row N+1 queries.
- `/admin/jobs` guesses expected intervals from job-name substrings; staleness badges can be wrong
  both ways; no run-now/retry/history.
- Deep-link params ignored: supplier-items ignores `?item_id=`, sku-aliases ignores `?item_id=`.
- planning-policy values edited as free text with no per-key numeric validation.

---

## 3. Flow continuity findings (portal-flow-continuity-auditor)

Coverage: 5 operator journeys + 3 planner journeys + the stock-visibility surfaces.
Verdict: **FAIL** (2 confirmed 404s on primary journeys, 1 operator dead-end, primary inventory
drill-down blocked for non-admins).

### High
1. **404:** run recommendation actions navigate to `/ops/stock/production-actual?...`
   (route group leaked into URL) — "Approve and open production form" strands an approved rec
   (`recommendations/[rec_id]/page.tsx:246,388`).
2. **404:** StockTruthDrawer "View full ledger for this item →" links `/stock/ledger`, which has
   no web route (`StockTruthDrawer.tsx:172`). Should be `/stock/movement-log?item_id=` (+ param read).
3. **Dead-end:** receipts URL-locked flow — "Post another receipt" clears `poId`/`supplierId` but
   the supplier combobox stays disabled and prefill never re-arms → un-submittable form
   (`receipts/page.tsx:1304-1316`).
4. **Inventory row drill-down blocked:** every row links `/admin/masters/items/[item_id]`
   (admin-only) — blocked for operator/planner/viewer; RM/PKG rows send a component_id to the
   items route → not-found even for admins (`inventory/page.tsx:618,1832`).

### Medium
- Operators are linked to planner-only approval pages from waste/physical-count pending banners
  and `/me/activity` drawer.
- **Cache invalidation gaps:** waste/physical-count approval pages don't invalidate inbox keys
  (stale "pending" up to 30s); goods-receipt post doesn't invalidate PO-lines/open-POs (stale
  Ordered/Received/Left pills); purchase-session place doesn't invalidate `["purchase-orders"]`.
- **Dropped deep-link params:** dashboard → `/inventory?item_id=` (inventory never reads
  searchParams); dashboard → `/exceptions?id=` (redirect drops the id); StockTruthDrawer →
  `/stock/physical-count?item_id=` (page reads no params).
- Focus-mode placed PO renders as truncated unlinked mono text (`FocusCard.tsx:413-415`).
- RM/PKG has **no per-SKU drill-down** in supply flow (FG has one); movement-log item filter is a
  raw id text field with no URL prefill.
- `/inventory` low-stock thresholds are hardcoded (10/0) and disagree with the inventory-flow
  risk model — the two surfaces can disagree on "low".

---

## 4. Visual design findings (visual-system-designer)

Verdict: the "Operational Precision" token system (tailwind.config.ts + globals.css) is
well-constructed; **the problem is consumption** — pages re-implement primitives locally with
small differences that accumulate into the inconsistent feel Tom senses.

P0–P1 (biggest premium-feel payoff):
- **VISUAL-005:** `.kpi-tile` CSS declared twice in globals.css (3108 + 3456) — dead code +
  cascade risk; delete the first block.
- **VISUAL-007:** raw DB view names (`api_read.v_critical_today`) shown in dashboard footers —
  forbidden identifiers; replace with plain-English source labels.
- **VISUAL-001:** waste-adjustments defines six inline SVG icons duplicating Lucide
  (page.tsx:186-234) — only form that looks different.
- **VISUAL-002:** three different primary-CTA shapes (procurement `rounded-full` pill, PO list
  `rounded-md`, `.btn` `rounded`) — standardize on `.btn btn-primary`; pills for chips only.
- **VISUAL-003:** waste-adjustments hand-rolls a 135-line combobox instead of `EntityPickerPlus`.
- **VISUAL-008:** the only italic in the product (`.forecast-disclosure-toggle`) — remove.

P2–P3 (system rules):
- **VISUAL-004:** PO/runs/BOMs lists each hand-roll tables instead of `.table-base` — row
  heights/hover differ per page.
- **VISUAL-006:** four parallel "micro KPI card" CSS patterns → consolidate to one `.stat-card`.
- **VISUAL-010:** WorkflowHeader hardcodes `text-3xl sm:text-4xl` everywhere — add
  `size="section"` for list/form pages (36px titles on a form feel heavy; jarring on RTL procurement).
- **VISUAL-013/014:** dashboard defines 5 local feedback components (ErrorAlert, AllClearRibbon,
  skeletons, TitleCount) duplicating `feedback/states.tsx`; extract `SectionHeading`.
- **VISUAL-012:** ~40 raw pixel font-sizes in globals.css outside the token scale.

---

## 5. Interaction findings (interaction-design-specialist)

13 findings, classified decision-grade / flow-completion / polish.

### Decision-grade (P0)
- **INTER-001: loss-direction waste adjustment posts to the append-only ledger with NO
  confirmation** (`waste-adjustments/page.tsx:574-580`) while the positive direction requires one.
  A mistyped loss quantity becomes a permanent ledger event. Gate loss behind the same confirm panel.
- **INTER-002: INSUFFICIENT_STOCK 409 on production-actual shows raw component UUIDs to
  operators** (`production-actual/page.tsx:1006-1011`). Portal: fall back to body.message.
  Backend (ARCH_REQUIRED): add `component_name`/`sku` to `shortfalls[]`.

### Flow-completion (P1)
- INTER-003: positive-waste confirm panel vanishes before the API resolves (no loading anchor).
- INTER-004: production-plan ManualAdd UoM is free text (no picker, toast-only errors).
- INTER-005: cancel-plan confirm uses text-danger ghost, not filled `btn-danger`; tiny targets.
- INTER-006: PO list KPI tiles blank (not skeleton) while counts load.
- INTER-007: inventory-flow FilterBar has no "Clear all".
- INTER-008: PO list hard-capped at 500 rows, no truncation indicator; search false-negatives.
- INTER-013: BOM PublishConfirmModal has no `isSubmitting` — double-submit window on publish.

### Polish (P2)
- INTER-009: receipts unexpected-error path renders `JSON.stringify(body)` to the operator.
- INTER-010: plan-card icon buttons below 32px touch target, hover-only identification.
- INTER-011: production-plan board never auto-refetches (multi-user staleness); no last-updated.
- INTER-012: disabled "Add from recommendations" rows give no block reason.

---

## 6. Inventory taxonomy & filters — facts + PROPOSAL (Tom's product-groups requirement)

### Facts (taxonomy analyst)
- **The grouping columns already exist and are ~94% populated in fixtures:**
  `items.product_group` (10 values: GT Extracts 1L/500ml, ELITA, ADDITIONAL, MUZA GT,
  MUZA COCKTAILS, GT MATCHA, GT COCKTAILS, GT 3.85L COCKTAILS, NONO MIMI; 4 nulls),
  plus `items.family` (23), `items.sub_type` (6), `items.supply_method`.
  `components.component_group` exists but is **dirty**: 34 distinct values with case/synonym
  variants (`LABEL`/`Label`, `CAP`/`Cap`/`CAPS`, `HERBS_SPICES`/`Herbs & Spices`) + 4 nulls.
  Neither has a master table, FK, index, Hebrew label, or display order (free text).
- **The portal ignores all of it.** `/inventory` "categories" are hardcoded client-side SKU
  regexes (`inventory/page.tsx:277-336`) — new items silently fall to "Other".
  `/planning/inventory-flow` uses a *third* taxonomy (family chips + hardcoded color map in
  `_lib/family.ts`). Supply flow's "family" is actually the 4-value `component_class` —
  4 buckets for 145 components; you cannot ask "show me raw materials for the tea line".
- **`/api/v1/queries/stock` exposes zero classification fields** (`stock/handler.ts:32-89`) —
  the inventory page literally cannot filter on real master data.
- **The FG→RM derivation mechanism already exists:** `fn_explode_bom_to_components(p_item_id, qty)`
  (`0191_fn_explode_bom_per_item.sql:84-88`) walks PACK+BASE BOMs to leaf components. Nothing
  aggregates it into a taxonomy.
- **Precedent for admin-blessed grouping exists:** `bom_head.production_track`
  (tea_tank / matcha_repack / alcohol, migration 0213, Tom-classified 2026-05-29) — invisible in
  the portal today.
- Data conflict to resolve first: `inventory/page.tsx:267-272` claims `product_group` /
  `component_group` are "blank across the live dataset" while the import script upserts both —
  needs a live-DB check before building.

### Proposal — "Groups v1" (the filter/classification overhaul Tom asked for)
1. **Two master tables (backend, W1 lane):** `product_groups` and `material_groups` —
   `(group_id, name_en, name_he, display_order, color_token, active)`. FK columns
   `items.product_group_id`, `components.material_group_id`. One-time cleanup migration maps the
   34 dirty `component_group` strings → ~12 controlled material groups (Herbs & Spices, Tea,
   Fruit Purees, Syrups & Additives, Alcohol, Bases, Sugar & Preservatives, Bottles, Caps & Lids,
   Labels, Cartons & Bags, Process Supplies) and the 10 `product_group` strings + 4 nulls →
   seeded product groups (keep Tom's 10; garnish items assigned).
2. **Derived RM-by-product-group (the "groups of raw materials that derive from the products"):**
   a view/materialized table `v_material_demand_by_product_group` built on
   `fn_explode_bom_to_components` over ACTIVE BOMs: product_group → distinct components (+ qty
   share). Each component gains a derived `used_by_product_groups[]`. This powers "RM for the tea
   line" filters and procurement/flow slicing, and stays automatically correct as BOMs change.
3. **Expose classification through the APIs:** add `family, product_group(_id), sub_type` to
   `/queries/stock` FG rows and `component_class, material_group(_id), used_by_product_groups`
   to RM/PKG rows; add `product_group` / `material_group` / `used_by_product_group` filter params
   to `/api/inventory/flow`, `/api/inventory/supply-flow`, movement-log, and economics views.
4. **One shared taxonomy module in the portal:** single source for group chips, Hebrew labels,
   and colors (replacing the SKU regexes in `/inventory`, the hardcoded `family.ts` color map,
   and the economics chip taxonomy divergence). Identical `GroupFilterBar` (URL-backed, with
   counts + Clear-all) on: `/inventory` (both tabs), `/planning/inventory-flow`, `/supply`,
   `/stock/movement-log`, `/admin/items`, `/admin/economics`.
5. **Admin management surface:** `/admin/groups` — CRUD groups, drag display order, assign items
   (bulk), and a read-only "derived raw materials" panel per product group.
6. **Surface `production_track`** as a first-class filter on production-plan + inventory-flow
   (it is the already-locked production-line grouping).

Sequencing: (1)+(2) backend lane → (3) API → (4)-(6) portal. Step 0 is the live-DB check on
current `product_group`/`component_group` population.

---

## 7. Price / valuation freshness (Tom's report: "prices wrong on dashboard; inventory not updating")

Diagnosis confirmed; ranked causes (all evidence-backed):
1. **Prices are a one-time April-2026 workbook snapshot with no automatic update path.**
   `price_history` frozen at seed (`0086`, event_at 2026-04-06); goods receipts capture **no**
   cost field; Green Invoice job is evidence-only and forbidden from price mutation
   (`factory_os_jobs/index.ts:1800-1827`); `supplier_cost_drafts` (0188) has **no approval
   handler** in api/src. Every valuation = live qty × ~2-month-old cost.
2. **Economics cost edits can silently do nothing:** the editor PATCHes the *fallback*
   `components.std_cost_per_inv_uom`, but the seeded primary `supplier_items` cost wins the
   effective-cost precedence everywhere (`value-handler.ts:72-76`; `0212:68`). Tom fixes a price,
   the screen doesn't change.
3. **`/inventory` never refreshes in place:** value query `staleTime: 5min`, no `refetchInterval`,
   global `refetchOnWindowFocus: false` (`query-provider.tsx:13`).
4. **FG values stale until manual Recalculate:** the COGS nightly cron is a disabled `select 1`
   placeholder (`0190:69-83`).
5. **Dashboard value trend applies today's price retroactively** (`value-trend.ts:8-14`) and the
   ledger feed is capped at the **300 most recent rows** — older days silently lose movements;
   line drawn down to 50% coverage.
6. **Cache gaps:** cost saves invalidate only `["admin","economics","component-costs"]` — not
   `["stock","value"]` or dashboard rm-costs.
7. Per-item value rows capped at 500 (`value-handler.ts:128`) — rows past the cap show "—".
8. **Freshness badges measure HTTP fetch time, not data age** (`as_of = now()` at request time,
   `value-handler.ts:249`) — 2-month-old prices show "fresh".

Fix directions: build the cost-update loop (receipt cost capture and/or implement the
cost-draft approval handler feeding `supplier_items` + `price_history`); make the economics
editor write/warn about the effective primary cost; add refetch cadence on /inventory; activate
the COGS job; window-bound the ledger fetch server-side; invalidate value keys on cost mutations;
replace `as_of` with real "prices last updated" age.

---

## 8. Planning paths — verdict and consolidation (Tom's question: keep or delete planning runs?)

The system contains **three planning brains**: (A) the Planning-Run engine (weekly buckets,
migrations 0037–0126), (B) the daily projection engine (inventory-flow/weekly-outlook, 0200),
(C) the Purchase-Session engine (procurement, 0204–0206). Procurement does **not** depend on
planning runs — it is a parallel engine with different demand, netting, and grain.

### Planning-run math verdict: operationally disciplined, mathematically weak
- **Critical — cumulative-deficit double counting:** `projected_on_hand` is never reset by
  planned receipts; explosion and recs treat each bucket's *cumulative* deficit as *incremental*
  (`0108:254-287`, `0126:131-132`, `0044:280`, `0110:142-149`). 4-week shortage of 40 units →
  recommendations totaling ~100. Untested (fixtures only ever create one shortage bucket).
- **Critical — no supply roll-forward:** on-hand + the same open PO re-credited in every bucket
  (`0107:211-256`, acknowledged in-file).
- Demand double counting in week 1 (additive forecast+orders vs the corrected GREATEST semantics
  in 0193); no FG-level inflows (firmed production invisible → recommends producing what you
  already firmed); `order_by_date` can land in the past with no flag; dead policy keys;
  snapshots are references, not frozen data (reruns not reproducible).

### Recommendation (opinionated)
- **The single workflow:** Thursday — `/planning/forecast` → `/planning/meeting` → generate
  drafts → review → **Firm week**. Sunday — `/planning/procurement` → focus mode → approve/place
  to zero. Daily — `/planning/production-plan` + `/planning/inventory-flow` (at-risk filter);
  `/planning/blockers` weekly as data-hygiene sweep. **Do not order from run quantities today.**
- **Delete:** `/planning/purchase-session`, `/planning/purchase-calendar` (after one more clean
  Sunday close), `/planning/weekly-outlook` (subset of inventory-flow);
  confirm-orphaned-then-archive `fn_propose_weekly_production_plan` (0143).
- **Demote, don't delete yet: `/planning/runs`.** Blockers, `v_critical_today`, and the
  production-rec picker depend on its exceptions. Remove it from primary nav + ordering workflow,
  mark quantities "not for ordering", and decide within one quarter: fund the math fix
  (planned-receipt reset, incremental netting with roll-forward, GREATEST demand, firmed-plan
  inflows) or migrate its checks into the session/projection layers and retire the run tables.
- **Top improvements to the surviving path:** consume `v_firmed_production_fg_demand` (0221) in
  the purchase session (close the firm→procurement seam; plan-overrides-forecast inside the
  firmed window); one canonical demand model (GREATEST) for all engines; surface
  `po_missing_expected_delivery` as a session warning; make inventory-flow risk tiers the single
  off-cycle trigger; persist per-session input snapshots + per-line coverage-trace UI
  (restores the reproducible-and-auditable doctrine on the path that survives).

---

## Top 10 production-critical gaps (prioritized)

1. **Price truth is frozen at April 2026 + economics edits shadowed by primary supplier cost** —
   critical — backend tranche (cost-update loop + effective-cost editor fix).
2. **Planning-run multi-week math double-counts shortages and re-counts supply** — critical —
   demote runs from ordering now; decide fix-or-retire within a quarter.
3. **Loss-direction waste posts to the append-only ledger with no confirmation** (INTER-001) —
   critical — single-page tranche.
4. **Two 404s on primary journeys** (`/ops/stock/production-actual` from rec actions;
   `/stock/ledger` from StockTruthDrawer) + receipts locked-supplier dead-end — high — one-line
   href/state fixes, highest journey impact.
5. **No /admin hub + 4 broken admin cross-links** — high — small tranche, big "precision" payoff.
6. **Groups v1 taxonomy** (master tables, dirty-data cleanup, API exposure, shared GroupFilterBar,
   /admin/groups, derived RM-by-product-group) — high — the filter/classification overhaul.
7. **Quarantine drift on /admin/users|jobs|integrations + 34-route manifest regeneration +
   three-layer role-gate reconciliation** — high — truthfulness of the OS itself.
8. **/inventory refresh cadence + cache-invalidation sweep** (receipts, approvals, session place,
   cost edits) + real "prices last updated" freshness signal — high.
9. **Inventory drill-down repair** (role-aware row links, component→components route,
   movement-log `?item_id=`, RM per-SKU drill-down, honor dropped deep-link params) — medium-high.
10. **Design-system consumption sweep** (table-base, btn unification, Lucide-only,
    EntityPickerPlus, kpi-tile dedupe, DB-view-name removal) + interaction P1s (publish modal
    isSubmitting, UoM picker, PO-list truncation, Clear-all) — medium.

## Suggested next tranche focus

1. `041-journey-404-and-deadend-fixes` — items #3, #4, #5 (one bounded commit set: confirm gate on
   loss waste, two href fixes, receipts re-seed fix, /admin index + 4 admin links, dropped-param
   reads). Smallest tranche, largest daily-pain reduction.
2. `042-groups-v1` (multi-lane epic) — item #6, sequenced backend→API→portal per §6, beginning
   with the live-DB population check on `product_group`/`component_group`.
   In parallel, a backend-lane price-truth package for item #1 and the runs decision for item #2.

## Evidence

- `docs/portal-os/route-manifest.json`, `docs/portal-os/quarantine.json`, `docs/portal-os/baseline.json`, `docs/portal-os/scorecard.json`
- `src/middleware.ts:36-46`; `src/lib/nav/manifest.ts:159-412`; `src/lib/auth/authorize.ts:44-65`
- `src/app/(admin)/admin/{users,jobs,integrations}/page.tsx`; `src/app/(admin)/admin/items/page.tsx:61,254-269,271`
- `src/app/(admin)/admin/components/page.tsx:363-430,664-678`; `src/app/(admin)/admin/purchase-orders/parity-check/page.tsx:218,288`
- `src/app/(admin)/admin/products/[item_id]/page.tsx:671-680,1583,1683-1733`
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/...:776-792` (discard); `src/app/(admin)/admin/sku-aliases/page.tsx:119-136`
- `src/app/(ops)/stock/receipts/page.tsx:832-902,1304-1316`; `src/app/(ops)/stock/waste-adjustments/page.tsx:186-376,514-517,574-580,1062-1066`
- `src/app/(ops)/stock/physical-count/page.tsx:533-536`; `src/app/(ops)/stock/production-actual/page.tsx:943-951,1006-1011`
- `src/app/(planning)/planning/runs/[run_id]/recommendations/[rec_id]/page.tsx:246,388`
- `src/app/(planning)/planning/procurement/_components/FocusCard.tsx:413-415`; `_lib/decision.ts:111-139`
- `src/app/(planning)/planning/inventory-flow/_components/FilterBar.tsx`; `_lib/family.ts:15-31`; `supply/page.tsx:10-11`
- `src/app/(shared)/inventory/page.tsx:160-161,266-359,618,865-882,1832`; `src/app/(shared)/stock/movement-log/page.tsx:777,1119-1120`
- `src/app/(shared)/dashboard/page.tsx:454,466,1567,1662,1975-2272`; `src/app/(shared)/dashboard/_lib/value-trend.ts:8-99`
- `src/components/stock/StockTruthDrawer.tsx:172,190,199`; `src/components/bom-edit/PublishConfirmModal.tsx`
- `src/app/globals.css:828,1326,1491,1953,3108-3164,3433-3617`; `src/components/workflow/WorkflowHeader.tsx:57`
- `src/lib/query/query-provider.tsx:13`
- gt-factory-os: `db/migrations/0002_masters.sql:59-151`; `0003_bom_three_table.sql`; `0034`, `0044:192-605`, `0086`, `0103:28-397`, `0104:23-325`, `0107:49-276`, `0108:79-292`, `0110:131-242`, `0126:57-224`, `0143`, `0145:160-161`, `0147:288-289`, `0188`, `0190:69-83`, `0191:84-88`, `0193`, `0200:333-347`, `0204-0206`, `0212:42-68`, `0213:22-42`, `0216-0218`, `0221`
- gt-factory-os: `api/src/stock/handler.ts:32-89`; `api/src/stock/value-handler.ts:24-249`; `api/src/economics/mutations_route.ts:13-131`; `api/src/goods-receipts/{handler,schemas}.ts`; `supabase/functions/factory_os_jobs/index.ts:1800-1827`
- gt-factory-os: `docs/contracts/gate5_input_contract.md`; `docs/contracts/weekly_cadence_firm_to_procurement_contract.md:19-123`
- gt-factory-os: `fixtures/masters/items.json` (68 rows), `fixtures/masters/components.json` (145 rows)

---
generated: 2026-06-11 · auditors: 8 · status: FAIL (see top-10) · supersedes: 2026-04-22-all-reaudit.md as latest audit
