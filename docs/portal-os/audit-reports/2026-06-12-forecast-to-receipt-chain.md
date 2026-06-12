# Audit — Forecast → Production Planning → Procurement → PO → Goods Receipt (full chain)

**Date:** 2026-06-12
**Scope:** the complete operational chain: sales forecast → planning run / weekly cadence → production recommendations & daily plan → purchase recommendations / purchase session → PO creation & lifecycle → goods receipt.
**Method:** 5 parallel read-only audit agents — (1) backend forecast→production, (2) backend procurement→receipt, (3) portal flow continuity, (4) per-route flow depth (`/ux-flow-audit` style), (5) known-gap cross-reference against `gap_registry.md`, `CURRENT_STATE.md`, the 2026-06-11 full-system audit, tranches 041–062, and open contract GAPs. No file in any repo was modified by the audit itself; no DB was touched.
**Code state audited:** `gt-factory-os` @ `e94c015` (includes 0239 monthly spread, 0238 projection freeze, firmed seam 0235, price-truth pipeline); `gt-factory-os-portal` @ `76af983` (includes tranches 041–062 merged). This means the 2026-06-11 improvement wave **is included** — findings below are post-wave residuals, not re-reports.

---

## Executive summary

The chain's core architecture is in good shape: monthly→working-day forecast spread is unified (0239), the purchase session consumes firmed demand with real auditability (`firmed_window`, `demand_model_version`, `coverage_trace`), time-aware open-PO netting works, price capture at PO-place and at receipt works, and the PO detail / receipt surfaces are among the strongest in the portal.

The biggest remaining risks are **loop-closure gaps**: things the system can open but never close. Three new P0s — (1) a PO line short-delivered by a supplier can never be closed, (2) overdue open POs are counted as arriving "today" forever and silently suppress re-ordering, and (3) tea base-batch plans (the factory's main production track) have **no completion path at all**. Each one quietly corrupts the demand picture the rest of the chain depends on.

Below the P0s, the dominant themes are: (a) **two demand generations still live side-by-side** (legacy runs engine vs v2 GREATEST cadence) producing contradictory quantities and a competing PO-creation corridor; (b) **the firmed seam traded forward visibility for auditability** — long-lead components now structurally surface late; (c) **receipt-side validation gaps** (supplier/item mismatch unchecked, DB guards surfacing as raw 500s); and (d) a cluster of **portal cache-invalidation defects** that make the system look like it lost data right after the user's most important actions.

**Verdict: the chain works end-to-end, but it does not yet *self-correct*.** The next work package should be loop-closure (P0s + overdue/slippage surfacing), then the corridor consolidation decision (T2), then the polish tier.

---

## Chain map (canonical surface per stage → continuity to next stage)

| # | Stage | Canonical surface | Backend substrate | Link to next stage |
|---|---|---|---|---|
| 1 | Sales forecast | `/planning/forecast` (+ `/new`, `/[version_id]`) | `forecast_versions/lines`, `fn_forecast_daily_demand` (0239) | **PARTIAL** — post-publish CTA points at demoted `/planning/runs`, not `/planning/meeting` (A4) |
| 2 | Firm production week | `/planning/meeting` | `fn_plan_tea_production` (0216), `fn_plan_matcha_repack` (0217), `fn_firm_production_week` (0218) | **PARTIAL** — firm-success banner names the Sunday session but has no link (A5) |
| 3 | Daily production board | `/planning/production-plan` | `production_plan`, production-actuals `from_plan` | **YES** to execution; **NO** link to procurement |
| 4 | Procurement planning | `/planning/procurement` (purchase-session redirects here) | `fn_generate_purchase_session` v2 (0235) | **YES** per-PO; **NO** session-level "view created POs" (A12) |
| 5 | PO execution | `/purchase-orders`, `/[po_id]`, `/new` | `fn_create_manual_po` (0229), lifecycle triggers 0049–0057/0082 | **YES** — "Receive against this PO" |
| 6 | Goods receipt | `/stock/receipts` | GR handler + linkage triggers 0053/0055/0082, receipt cost capture 0230 | **YES** links back — but lands on stale cache (A1) |
| — | Legacy / overlapping | `/planning/runs` (+ rec detail convert-to-PO), `/planning/production-simulation`, `/planning/boms` | `fn_execute_planning_run_v2` (0104/0108) — **demoted but fully wired** | competing corridor (A3 / F-4) |

---

## P0 — blocks or corrupts daily work (all NEW, not in any registry)

### CHAIN-P0-1 — No way to close a PO line short; PARTIAL lines are stuck forever
`api/src/purchase-orders/line_cancel_handler.ts:91-100` rejects cancel on PARTIAL lines and suggests "post a compensating receipt" — which would corrupt stock truth (violates the ledger non-negotiable). No close-short verb exists anywhere. Real suppliers short-deliver routinely; the leftover `open_qty` permanently suppresses future purchase recommendations (compounds with P0-2).
**Fix:** `POST /mutations/purchase-order-lines/:id/close-short` (planner/admin) — sets `line_status=CLOSED` with `received_qty < ordered_qty`, audit reason, change_log row; rolls header to RECEIVED when last open line closes.

### CHAIN-P0-2 — "Zombie POs": overdue open POs count as arriving *today*, forever
`0206:335` / `0235:424` — `greatest(expected_date, v_today)`: a line months overdue is treated as arriving today in every session run, indefinitely. The v2 hygiene warning fires only for NULL dates, not past-due ones. An abandoned/undelivered PO keeps "covering" demand → the engine never re-orders → stockout with zero warning.
**Fix:** `po_overdue_receipt` session warning past a policy threshold + optional policy to exclude receipts overdue by N days; pair with the P0-1 close-short verb as the resolution action.

### CHAIN-P0-3 — Tea base-batch plans have no completion path (main production track never closes)
Tea batches are inserted with `item_id NULL` + multi-SKU `pack_manifest` (0216:260-267), but `production-actuals/handler.ts:1016-1022` requires `plan.item_id === request.item_id` for `from_plan`, and `completed_submission_id` is 1:1 UNIQUE (0115). No endpoint can ever complete a tea batch: every firmed batch stays `'planned'` forever, variance capture never applies to tea, operators re-enter pack quantities as unlinked actuals, and ghost rows accumulate in `v_firmed_production_fg_demand` (0221, no date filter).
**Fix:** allow N actuals → 1 base-batch plan when the reported item is in its `pack_manifest` (complete when manifest covered or operator closes), or an explicit close-batch mutation with variance note. Requires a `production_plan_contract.md` amendment (it predates the base-batch shape).

---

## P1 — daily friction / trust erosion

### Forecast stage
| ID | Finding | Evidence | Fix direction |
|---|---|---|---|
| CHAIN-F6 | **Current month is always frozen for planners.** Week-denominated freeze (`bucket_key <= now()+7d`) applied to first-of-month keys means from day 1 the in-flight month needs admin break-glass for every mid-month correction — the most common operational need. FP-2 was ratified for weekly cadence, never re-derived for monthly. | `forecasts/handler.ts:362,429-445` | Re-derive freeze rule for monthly cadence; ratify as FP-2 amendment. **Tom decision.** |
| CHAIN-F7 | **Monthly cadence bolted onto week-shaped machinery.** Horizon window rejects the 2nd month on cold start (`+2*7-1 days`); seed-cells emits weekly-stepped "monthly" keys; legacy Monday-shaped keys make 0239 double-spread in planning views (per-line) while projections dedup — surfaces diverge exactly there. | `handler.ts:115,361,407-419`; `handler.seed_cells.ts:235-238`; 0239:128-157 | One tightening pass: convert legacy keys to first-of-month, enable strict bucket validation, month-stepped seed-cells, cadence-aware horizon. |
| CHAIN-F8 | **No forecast version recorded anywhere in the new chain.** Tea/matcha drafts, firm submission, and purchase session carry no forecast reference — "which forecast produced this plan" is unanswerable; forecast republished between Thursday firm and Sunday session goes undetected. (Legacy runs *did* snapshot this.) | 0216/0217 INSERTs; 0218; 0235:271-279 | Stamp active `forecast_version_id` into proposal meta, firm payload, and `purchase_session.firmed_window`; warn in session when forecast postdates the firm. |
| FLOW-F01 | **No staleness signal on the forecast list** — planner can run planning on a 2-month-old forecast without noticing; contract defines `forecast_stale` thresholds, portal doesn't surface them. (Portal-side twin of F8.) | `forecast/page.tsx` WorkflowHeader/MiniStats | Three-state banner (none / active-covers-week / stale) from already-loaded metadata. |

Verified false alarm: `/planning/forecast/new/page.tsx` **exists** — the "New forecast" CTA is not a 404.

### Production planning stage
| ID | Finding | Evidence | Fix direction |
|---|---|---|---|
| CHAIN-F4 + FLOW-A3 | **Two contradictory demand models + two PO corridors live simultaneously.** Legacy runs use additive v1 demand; session uses v2 GREATEST. Runs are banner-declared "diagnostic only" yet the PO-list "From recommendation" dropdown, rec-detail "Approve and create PO", and a dashboard quick-action all funnel into the runs corridor (which also skips cache invalidation and price-truth handling). No Procurement quick-action tile exists at all. *(Extends known T2 retire-vs-fix decision — this is the evidence to decide now.)* | 0108 vs 0234/0235; `purchase-orders/page.tsx:326`; `rec_id/page.tsx:206-228`; `quick-actions.ts:106` | Recommend: repoint all PO-creation entries at `/planning/procurement`, add Procurement quick-action, gate/deprecate convert-to-PO; retire (don't rebase) the legacy engine per T2. **Tom decision.** |
| CHAIN-F5 | **Firmed seam removed all forward component demand beyond the firmed week.** 0235 explodes only planned/in_production + BF items; MANUFACTURED forecast demand outside firmed coverage produces zero component demand → long-lead components structurally surface as `urgent` only when already late. Contract Decision 1 wording is only true for BF items. | 0235:340-403,687-689 vs 0206 v1 | Add a clearly-labelled **advisory tier** to the session for un-firmed horizon weeks (never auto-firmed into POs). Contract amendment — **Tom decision.** |
| CHAIN-F3 | **Matcha planner double-proposes.** Unlike tea (credits planned rows as receipts), `fn_plan_matcha_repack` never subtracts existing planned repacks — regenerate after firming creates a second full-size draft; firming both double-produces and double-buys. | 0217:64-89 vs 0216:163-174 | Subtract planned/in_production matcha rows from need before sizing (mirror `_tea_receipts`). |
| CHAIN-F2 | **Production simulation silently excludes all tea base batches.** `material_requirements.ts:444-446` skips `item_id NULL` rows ("not linked to an item") — the date-range "what to buy" answer omits the main track's ingredient demand with a misleading reason. | `material_requirements.ts:344-364,444-446` | Explode base-batch rows via `pack_manifest` (same shape as 0235 Part A.2 / 0146). |
| CHAIN-F9 | **Drafts are unexplainable; new-engine blockers not queryable.** Tea drafts carry no rationale (cover/ADU/trigger); capacity saturation is `RAISE NOTICE` and discarded; `/queries/planning/blockers` reads only legacy `planning_run_exceptions`. | 0216:260-295; `planning/handler.reads.ts:1223-1303` | Persist `proposal_meta` rationale jsonb; return saturation as structured warnings; point blockers at the live engine. |
| CHAIN-F10 | **No slippage handling in the new chain.** Past-dated `'planned'` rows silently drop out of session demand, tea receipts, and material requirements — but the production may still happen; nothing flags "yesterday's batch never reported". Compounds with P0-3. | grep across api/src + 0190-0239 | "Overdue plans" read on production-plan list + meeting cockpit with reschedule / cancel / report actions. |

### Procurement planning + PO execution stage
| ID | Finding | Evidence | Fix direction |
|---|---|---|---|
| CHAIN-P3 | **Session "place PO" not concurrency-safe.** No idempotency key; status read outside the transaction; no `FOR UPDATE` re-check — a double-tap (exactly how a phone is used) creates two real POs, orphaning one which then double-counts as scheduled receipt. Manual-create and convert paths *do* carry idempotency envelopes. | `purchase-session/handler.actions.ts:335-453`; `schemas.ts:87-98` | `FOR UPDATE` + status re-check in-transaction; add idempotency_key to PlacePoRequest. |
| CHAIN-P7 | **In-session qty edits unaudited** — no actor, no old→new trail; header actions are fully attributed but line edits aren't. *(Sharpens known gap "session auditability".)* | `handler.actions.ts:203-261`; 0205 | `edited_by/edited_at` or change_log rows via the existing audit-GUC pattern. |
| CHAIN-P8 | Restarting a session silently supersedes the open one — half-approved session becomes unreachable (`SESSION_NOT_OPEN`) on a double-click / second tab. | 0206/0235 supersede; no confirm flag | 409 `OPEN_SESSION_EXISTS` unless `supersede:true`. Portal twin: FLOW-PC02 (`window.confirm`, below). |
| CHAIN-P12 | **Readiness checks the wrong lead-time column.** Engine reads `components.lead_time_days` with silent 14-day default; readiness view checks `supplier_items.lead_time_days` — "ready" component can run on a silent default → wrong order-by date & urgency. | 0206:497,538 vs 0069:132 | Pick one authority with fallback; emit `lead_time_defaulted` into `coverage_trace`. |
| CHAIN-P6 | **Green Invoice supplier-price evidence is contract-only.** `source_invoice_*` columns (0188) have zero writers; the price-truth loop closes without invoice evidence. | grep api/src; `green_invoice_supplier_price_contract.md` | Build the specified GI expense-pull job **or** formally descope and drop the dead columns from the cost-draft DTO. **Tom decision.** |
| FLOW-A2 | Manual PO creation performs **zero** cache invalidation — new PO invisible in PO list and receipt picker for 30–60s. | `purchase-orders/new/page.tsx` (no invalidateQueries) | Invalidate `["planner","purchase-orders"]`, `["purchase-orders"]`, `["ops","receipts","open-pos"]` on success. |
| FLOW-A6 | Rec convert-to-PO same defect (invalidates only rec keys). | `rec_id/page.tsx:208-213` | Copy `usePlacePo`'s invalidation set. |
| FLOW-PC01/PC02 | **`/planning/procurement` is full Hebrew + RTL incl. a destructive Hebrew `window.confirm`** — violates the locked English-first standard. May be a deliberate Tom UX target (like the Recipe-Health exception) — but it is unrecorded. Either way `window.confirm` must become the standard inline confirmation. | `procurement/page.tsx:60-64,75+` | **Tom decision:** approve a scoped Hebrew register entry for this surface, or normalize to English. Replace `window.confirm` regardless. |

### Goods receipt stage
| ID | Finding | Evidence | Fix direction |
|---|---|---|---|
| CHAIN-P4 | **GR handler implements none of the contract-promised PO-linkage validations.** `SUPPLIER_MISMATCH` / `PO_NOT_ACCEPTING_RECEIPTS` exist nowhere; parent/UOM mismatches ARE enforced by DB triggers but surface as raw 500s with no reason_code; §6.3 response fields (`po_line_received_qty_after` etc.) absent. *(Confirms + worsens known GAP-POGR-H.)* | `gr_to_po_linkage_contract.md` §6.1/§6.3/§10 vs `goods-receipts/schemas.ts:54-58`; triggers 0053:131, 0055:97 | Implement §6.1 pre-post validation block + map trigger SQLSTATEs to 409s + add §6.3 fields. |
| CHAIN-P5 | **No item-identity check GR-line ↔ PO-line.** Receiving item A against item B's PO line (same UOM) increments and can CLOSE B's line while the ledger credits A. | 0055:86-101 (UOM only) | `PO_LINE_ITEM_MISMATCH` 409 in the same validation block. |
| FLOW-A1 | **GR post leaves PO surfaces stale** — "Back to PO" within 60s shows the PO still OPEN with old quantities; defeats the verify-the-flip loop the page itself advertises. | `receipts/page.tsx:883` (only `["ops","receipts"]`); PO keys staleTime 60s | Invalidate PO detail/lines/GR-by-po/PO-list/inventory-flow keys on GR success. |
| FLOW-R01 | **Over-receipt posts to ledger with no acknowledgment step** — chip is shown but submit isn't gated; one fat-finger creates an irreversible ledger row + exception. | `receipts/page.tsx:951-972,2019-2034` | Two-step inline confirm when `overReceiptCount > 0` (mirror cancel-PO pattern). |
| (known) | GR reversal still has no portal surface (GAP-POGR-I, open) and `?po_id=` GR query shape never inspected (GAP-POGR-G). | po_to_gr_readiness_requirements.md §9 | Unchanged from registry; reversal surface becomes more urgent once FLOW-R01 lands (ack relies on reversal as the escape hatch). |

---

## P2 — polish / hygiene (abbreviated)

- **Bridges:** forecast-publish CTA → `/planning/meeting` not `/planning/runs` (A4); firm-success banner → "Open Sunday procurement →" (A5); procurement `DoneSummary` → "View created POs" (A12); production-plan board → procurement link.
- **Simulators:** `production-simulation` is a dead-end (no CTA to procurement, no URL state — A10); overlaps `/planning/boms` claiming the same job (A11) — pick one canonical simulator.
- **Session engine dating:** order-by dates ignore the holidays/working-day machinery (snap back to previous working day — P-9); per-line need dates flattened to one header date at place time (P-10); legacy convert path duplicates session path semantics (P-11, same as A3/F-4).
- **PO surfaces:** silent save on PO edit (FLOW-PO01); raw `source_run_id`/`supplier_id` labels in UI (FLOW-PO02/03); success state shows UUID fragment instead of PO number — needs `po_number` in POST response, small additive backend change (FLOW-N02); pre-submit summary card on manual PO (FLOW-N01); manual-receipt success has no forward nav (FLOW-R03).
- **Cache-key hygiene:** `forecast` vs `forecasts` root mismatch (A8); planning-hub overview keys invalidated by nothing (A7); firm-week misses `firmed-week-demand` (A9); PO-list search/late-only not URL-synced (A13); purchase-calendar redirect drops calendar intent — support `?view=calendar` (A14).
- **Dead/misleading code:** `fn_propose_weekly_production_plan_v3` (0143) has no caller; `forecasts/diff` endpoint has no consumer; `in_production` status is purchase-demand-relevant but unreachable via API; stale 2-value-status comments cause misleading `PLAN_CANCELLED` errors when reporting against a draft (F-13). Four parallel BOM-explosion implementations with diverging `bom_lines.status` filters (F-12).
- **Docs drift:** `gap_registry.md` stale (GAP-006 closed, GAP-013 decided 25% — both still shown open); `weekly_cadence_firm_to_procurement_contract.md` lists closed decisions as open; `production_plan_contract.md` predates base-batch + 5-status lifecycle; `scorecard.md` last_reviewed 2026-04-22 (F-14 + dedup-agent findings). One ops-docs-curator pass.

---

## Cross-reference with known registries

- **Confirmed still-open knowns touched by this audit:** T2 runs-engine retire-vs-fix (now evidence-complete via F-4/A3), GAP-POGR-G/H/I (P-4 confirms H is worse than recorded — handler-side codes entirely absent), session auditability (P-7 sharpens it), bundle demand GAP-019/GAP-003/GAP-020 (untouched, still Tom-pending), GAP-023 null costs, POE-4/8/9, audit_runs cron blind-spot.
- **Not re-reported (verified closed/landed at audited commits):** price-truth pipeline core (0229/0230 + cost-draft review live), D1 supplier comparison, D2 lead-time dates on manual PO, B4/B5 production status passthrough + reversal endpoint (Phase 6 landed in `cdc6403`), tranche 042 invalidation sweep (the A1/A2/A6 defects are *residuals it missed*), GR reversal → PO decrement trigger (0082 — `gap_registry` is wrong, CURRENT_STATE wins).
- **False alarm corrected:** `/planning/forecast/new` exists (FLOW-F02 withdrawn).

---

## Recommended execution order

1. **Loop-closure backend package (P0s):** close-short verb (P0-1) + overdue-PO warning/aging (P0-2) + tea base-batch completion (P0-3) + overdue-plans read (F-10). One migration + handler tranche each; P0-1/P0-2 pair naturally.
2. **Receipt-integrity package:** GR §6.1 validation block + §6.3 response fields + item-identity check (P-4/P-5) + over-receipt acknowledgment (FLOW-R01) + GR cache invalidation (FLOW-A1).
3. **Corridor consolidation (after Tom decides T2):** repoint all PO-creation entries at procurement, add quick-action tile, deprecate convert path (F-4/A3/P-11); then execute tranche 055 deletion.
4. **Demand-truth package:** matcha double-propose fix (F-3) + base-batch explosion in simulation (F-2) + forecast-version stamping (F-8) + staleness banner (FLOW-F01) + advisory tier decision (F-5).
5. **Monthly-cadence finishing pass:** freeze-rule re-derivation (F-6, Tom) + key/horizon/seed-cells tightening (F-7).
6. **Polish tranche(s):** bridges, cache keys, PO surface copy, simulator consolidation, docs-curator pass.

## Tom decision queue (blocking items only)

| # | Decision | Recommendation |
|---|---|---|
| 1 | T2 — retire or rebase the legacy runs engine (F-4/A3) | **Retire**: repoint corridors at procurement; migrate its preflight checks into session/projection as already planned |
| 2 | `/planning/procurement` language: scoped Hebrew register entry vs English normalization (FLOW-PC01) | If Hebrew is the intended operator experience (matches the Hebrew WhatsApp order docs), record it as a scoped exception like Recipe-Health; the `window.confirm` replacement is needed either way |
| 3 | F-5 advisory demand tier beyond the firmed week (contract amendment) | Approve — long-lead components are currently structurally late |
| 4 | F-6 monthly freeze-window re-derivation (FP-2 amendment) | Approve freeze-at-month-end-only variant |
| 5 | P-6 Green Invoice supplier-price ingest: build vs descope | Build — contract is fully specified and it's the last leg of price truth |
| 6 | Standing items resurfaced: GTSET bundle composition (GAP-019), GAP-023 null costs, POE-4/8/9 | Unchanged, still pending |

---

# Addendum — Execution round (2026-06-12, same session)

Tom authorized full decide-and-execute. Decisions locked and work executed on branch `claude/sales-forecast-procurement-audit-7rr3h1` in both repos.

## Decisions taken (on Tom's "decide for me" authorization)

| # | Decision | Outcome |
|---|---|---|
| 1 | T2 corridor | **Retire runs as an ordering corridor**: PO-list "From recommendation" repointed to `/planning/procurement`; Procurement quick-action tile added; runs tile relabelled "diagnostic — not for ordering". Runs pages themselves untouched (tranche 055 deletion still Sunday-gated). |
| 2 | Procurement language | **Hebrew kept** as the deliberate operator experience on `/planning/procurement` (scoped exception, consistent with the Hebrew WhatsApp order documents). `window.confirm` replaced with a styled inline confirmation regardless. |
| 3 | F-5 advisory tier | **Deferred deliberately** — deep contract change at the heart of the firmed seam; needs its own design + Tom review. Documented here as the top remaining backend item. |
| 4 | F-6 freeze rule | **Current + future months planner-editable; only past months frozen** (cadence-aware cutoff). Break-glass retained for past months. |
| 5 | P0-2 projection math | Warning-only (`po_overdue_receipt`, policy key default 7 days). Excluding zombie lines from the projection remains a follow-up Tom decision — warning ships first, stock-truth-safe. |
| 6 | P-6 Green Invoice ingest | **Still open** — flagged in gap_registry (GAP-013 updated); build-vs-descope needs Tom. |

## Backend landed (`gt-factory-os`, 7 commits, migrations 0240–0244)

- **0240 + close-short endpoint (CHAIN-P0-1):** `POST /mutations/purchase-order-lines/:id/close-short`; `CLOSED_SHORT` terminal line status with sticky terminal-state defense (a GR reversal after closure cannot resurrect the line); header rollup treats it as settled. 10/10 new tests.
- **0241 (CHAIN-P0-2):** session warning `po_overdue_receipt` + policy key `planning.purchase.po_overdue_warning_days` (7). Projection math verbatim-unchanged (verified by diff against 0235).
- **0242 (CHAIN-F3):** matcha planner credits existing planned/in_production repacks before proposing.
- **GR validation block (CHAIN-P4/P5):** all contract §6.1 409 reason codes incl. new `PO_LINE_ITEM_MISMATCH`; §6.3 response fields (`po_line_received_qty_after`, `line_status_after`, `po_status_after`, `over_receipt_exception_id`); trigger SQLSTATE backstop mapping (no more raw 500s). 15/15 new tests.
- **0243 + close-batch (CHAIN-P0-3):** multi-actual linkage to base-batch plans via pack_manifest membership (`PLAN_ITEM_NOT_IN_MANIFEST` guard); `POST /mutations/production-plan/:id/close-batch` with per-SKU coverage summary; misleading `PLAN_CANCELLED` on draft plans replaced by `PLAN_NOT_REPORTABLE`. 8/8 new tests.
- **0244 + session hardening (CHAIN-P3/P7/P8):** place-PO `FOR UPDATE` + status re-check (`PO_ALREADY_PLACED` 409) + idempotency key; `OPEN_SESSION_EXISTS` 409 unless `supersede:true`; line-edit attribution (`edited_by_user_id`/`edited_at`) in DTO; `po_number` in place + manual-create responses. 6/6 new tests.
- **Simulation + overdue (CHAIN-F2/F10):** material-requirements explodes base-batch plans via pack_manifest (tea demand no longer silently missing); `GET /queries/production-plan/overdue` read. 5/5 new tests.
- **Forecast monthly fixes (CHAIN-F6/F7):** cadence-aware freeze cutoff (only past months frozen); monthly horizon window (cold-start accepts the 2nd month); month-stepped seed-cells; strict first-of-month validation for new monthly writes (legacy Monday-key data untouched pending live inspection).

**Verification (local PG16, all 213 migrations + fixtures applied):** 96/98 test files run. **Zero new failures** — every failing file matches the pre-change baseline exactly (164 pre-existing environmental failures, mostly LionWheel/Telegram external-dependency suites). New tests 44/44 green. 4 files *improved* vs baseline (+33 passes). The 2 legacy runs-engine files (`planning_run_api`, `planning_run_reproducibility`) are pathologically slow locally (≥75 min/file, engine untouched by this diff — verified via `git diff` path inspection; baseline: 6 pass/2 fail + 1/0) and were time-boxed separately; their pre-existing failures are part of the engine slated for retirement (T2).

## Portal landed (`gt-factory-os-portal`, tranche 063, 8 commits)

All 27 checklist items across 6 groups (manifest: `docs/portal-os/tranches/063-chain-audit-fixes.md`): cache-invalidation unification (FLOW-A1/A2/A6/A7/A8/A9), chain bridges (A4/A5/A3/A12/A10/A14), procurement flow quality in Hebrew (PC02/PC03/PC04), forecast staleness banner + honest row actions (F01/F03), PO surface fixes (PO01/PO02/PO03, N01/N02/N03, A13), receipts over-receipt two-step confirm + forward links (R01/R03/R04-verified-clean). Review pass caught and fixed one agent bug: the staleness classifier used week math on monthly-cadence horizons (would mark a valid monthly forecast stale after 14 days) — now cadence-aware. Final: typecheck 0 errors, lint 0 errors, vitest 640/640.

## Incidental findings — fresh-rebuild schema drift (NEW, for backend-db lane)

Rebuilding the schema from scratch (all 213 migrations on a clean PG16) **fails on the repo as-is** — the live DB carries schema with no repo DDL. Local shims were required at: 0193 (`v_critical_today` dependency blocks a non-CASCADE view drop, and no later migration recreates it), 0197 (`planning_item_config` table and `bom_lines.final_item_id` referenced but created nowhere), 0223 (`price_history.component_id` missing from 0025 DDL), 0224 (`items.sku` missing). Also live-data-coupled guards (0058/0059/0132 expect specific auth users; 0209 expects SEMI components newer than the fixture snapshot). Recommendation: a "rebuild-from-zero" repair migration pass + adding the missing DDL to the repo, so disaster recovery and shadow-DB provisioning are actually possible. Until then, treat `db/migrations/` as NOT self-sufficient.

## Remaining top items (in recommended order)

1. F-5 advisory demand tier beyond the firmed week (design + Tom approval — biggest remaining planning gap).
2. F-8/F-9: forecast-version stamping through the new chain + proposal rationale (`proposal_meta`) + new-engine blocker surfacing.
3. P-6 Green Invoice ingest build-vs-descope (Tom).
4. Fresh-rebuild drift repair (above).
5. Portal consumption of the new backend reads: overdue-plans strip on `/planning/production-plan` + meeting cockpit; close-batch button on base-batch plan rows; session line-edit attribution display.
6. P2 polish backlog from the main report (P-9 working-day order dates, P-10 per-line expected dates, F-12 BOM-explosion convergence, F-13 dead code).

