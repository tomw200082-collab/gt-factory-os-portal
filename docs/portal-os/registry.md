# Portal OS Registry

Index of every operating artifact. Entries use repo-root-relative paths so the PR guard's registry presence check (`grep -Fq` on path) passes on every new artifact.

## Commands
- `.claude/commands/portal-audit.md` — deep admin audit, dispatches three auditors in parallel
- `.claude/commands/portal-readiness.md` — consolidated headline: scorecard + audits + tranches + drift
- `.claude/commands/portal-regression-guard.md` — dispatch regression-sentinel; fail on baseline drift
- `.claude/commands/portal-scorecard.md` — recompute 10-category readiness JSON + markdown mirror
- `.claude/commands/portal-tranche-fix.md` — execute tranche NNN as ONE bounded commit set with verification
- `.claude/commands/portal-tranche-plan.md` — propose next tranche from top scorecard gap

## Subagents
- `.claude/agents/portal-admin-surface-auditor.md` — admin-as-superuser depth audit
- `.claude/agents/portal-flow-continuity-auditor.md` — end-to-end journey walkability
- `.claude/agents/portal-regression-sentinel.md` — baseline + quarantine drift detector
- `.claude/agents/portal-route-auditor.md` — structural route + nav surface audit
- `.claude/agents/portal-tranche-verifier.md` — post-fix verification gate

## Hooks
- `.claude/hooks/pre_tool_use.sh` — tranche manifest + quarantine + secrets structural backstop
- `.claude/hooks/session_start.sh` — scorecard + active tranche + drift opening context
- `.claude/hooks/stop.sh` — no-dead-air: requires a Next action: line
- `.claude/hooks/subagent_stop.sh` — PASS/complete claims require an Evidence: path

## Workflows
- `.github/workflows/claude.yml` — @claude mention handler (mobile-primary entry)
- `.github/workflows/portal-drift-weekly.yml` — weekly drift + readiness; opens issue on regression
- `.github/workflows/portal-pr-guard.yml` — typecheck + registry presence on every PR

## Canonical artifacts
- `docs/portal-os/baseline.json` — frozen repo-truth snapshot; regression-sentinel compares against it
- `docs/portal-os/quarantine.json` — dead/fake/quarantined path list + forbidden_strings
- `docs/portal-os/route-manifest.json` — canonical list of live routes, roles, status
- `docs/portal-os/scorecard.json` — 10-category readiness score (machine-readable)
- `docs/portal-os/scorecard.md` — human-readable mirror of scorecard.json

## Migration docs
- `docs/portal-os/MIGRATION-HISTORY.md` — history of OS merges onto main (what was imported, what was kept, rationale)

## Background packages
- `docs/portal-os/backend-package-admin-superuser-depth.md` — 5-deliverable backend package to move admin_superuser_depth to 10/10

## Audit reports & plans
- `docs/portal-os/audit-reports/2026-06-11-full-system.md` — 10-investigation full-system audit (routes, admin, flows, design, interactions, taxonomy, prices, planning paths, production reporting, PO creation)
- `docs/portal-os/improvement-plan-2026-06.md` — proposed 7-phase master improvement plan derived from the 2026-06-11 audit; pending Tom decisions T1–T6

## Tranches (history + state)
- `docs/portal-os/tranches/000-template.md` — tranche template (do not set status=proposed on this file)
- `docs/portal-os/tranches/_active.txt` — contains the currently active tranche number, or empty
- `docs/portal-os/tranches/001-bootstrap-truthfulness.md` — (PR #3 branch history) truthfulness of OS files vs code
- `docs/portal-os/tranches/002-fake-auth-identifier-rename.md` — (PR #3 branch history) FakeSession → DevShimSession rename
- `docs/portal-os/tranches/003-role-gate-manifest-alignment.md` — (PR #3 branch history) manifest pinned to layouts
- `docs/portal-os/tranches/004-physical-count-cancel-wire.md` — (PR #3 branch history) stop leaking server snapshots
- `docs/portal-os/tranches/005-planning-ux-polish.md` — (PR #3 branch history) cache + link hygiene
- `docs/portal-os/tranches/006-ops-banner-deep-links.md` — (PR #3 branch history) pending approvals clickable
- `docs/portal-os/tranches/007-stale-e2e-cleanup.md` — (PR #3 branch history) delete obsolete goods-receipt spec
- `docs/portal-os/tranches/008-mobile-parity.md` — mobile/tablet experience (MobileNav + TopBar + AppShellChrome)
- `docs/portal-os/tranches/009-error-boundaries.md` — error.tsx + global-error.tsx + obs/report.ts
- `docs/portal-os/tranches/010-dashboard-live-kpis.md` — KpiTiles component (three live counts above the fold)
- `docs/portal-os/tranches/011-security-hardening.md` — env.ts header + env validation
- `docs/portal-os/tranches/012-po-detail-page.md` — (superseded by main's Tranche D; plan preserved as history)
- `docs/portal-os/tranches/013-receipt-po-linkage.md` — (PR #3 branch history) close PO chain break
- `docs/portal-os/tranches/014-inbox-federation.md` — (superseded by main's Tranche B 4-stream federation)
- `docs/portal-os/tranches/015-role-boundary-e2e.md` — role-boundaries.spec.ts 12-test matrix
- `docs/portal-os/tranches/016-middleware-role-gates-and-manifest-completeness.md` — middleware scaffold for layer 3 role gating
- `docs/portal-os/tranches/017-deploy-unblock-dashboard-dynamic.md` — (superseded by main's Tranche C making dashboard "use client")
- `docs/portal-os/tranches/018-public-landing-preview-resilience.md` — public landing at / resilient to auth failures
- `docs/portal-os/tranches/019-bulletproof-root.md` — hardened root page (static, middleware-bypass)
- `docs/portal-os/tranches/020-economics-page-ux-polish.md` — Economics page filters + cost-gaps drawer + publish affordance + UX sweep
- `docs/portal-os/tranches/021-receipt-smart-picker.md` — Smart Picker + PO Ledger + per-line progress pills for /stock/receipts
- `docs/portal-os/tranches/022-format-qty-sweep.md` — fmtNumStr() applied portal-wide to strip 8-dp noise from qty displays
- `docs/portal-os/tranches/023-ux-pro-polish.md` — replace emoji decorations with Lucide icons across receipts surface
- `docs/portal-os/tranches/024-operator-forms-design-pass.md` — operator forms: hero numerics, typography, primary CTA, step-indicator
- `docs/portal-os/tranches/025-physical-count-pro-redesign.md` — physical-count: pro-grade redesign, unified banner, cancel polish
- `docs/portal-os/tranches/026-economics-pl-coverage.md` — Economics Overview: P&L Coverage frame (dual-axis revenue+SKU), demand-weighted sort, chip taxonomy split, honest inventory totals
- `docs/portal-os/tranches/027-procurement-shared-line-editor.md` — extract mode-aware PoLineEditor + useOrderables from /new (pure refactor); foundation for the procurement-merge epic (028–030: unified action-list page, focus mode + inline create, ad-hoc in session)
- `docs/portal-os/tranches/028-procurement-unified-action-list.md` — new /planning/procurement merged page; default view = action list grouped by decision (must-today / can-wait / handled) with a derived "why now"; nav swaps Purchase Session + Calendar for one Procurement entry; entry point for focus mode (029)
- `docs/portal-os/tranches/029-procurement-focus-mode.md` — full-screen one-order-at-a-time focus overlay (approve→place→next, auto-advance, keyboard, order document) reusing the session mutations; launched from the 028 action list
- `docs/portal-os/tranches/030-procurement-adhoc-in-session.md` — ad-hoc add-a-line inside focus mode via the shared useOrderables picker + add_lines; one-off new-supplier order routes to the manual PO form; closes the procurement-merge epic
- `docs/portal-os/tranches/031-procurement-focus-hardening.md` — post-merge hardening of the focus mode: mobile table scroll, dialog focus-trap + initial focus, mobile footer, remaining-aware completion screen (+ remainingCount helper/test)
- `docs/portal-os/tranches/032-procurement-test-coverage.md` — direct ActionList + FocusMode integration tests (controller/grouping), Hebrew day-grammar in "why now", progressbar a11y; triage of the 35 pre-existing unrelated failures
- `docs/portal-os/tranches/033-procurement-calendar-view.md` — folds the calendar timeline into /planning/procurement as a secondary view (toggle: action list / calendar), derived from session.pos with a pure tested grid engine; day chips open focus mode
- `docs/portal-os/tranches/034-recipe-health-test-repair.md` — repairs 7 stale recipe-health-card assertions (label-in-two-places idiom + `{row}` clone envelope); flags 1 genuine draft-exists-modal discrepancy as FIXME; full suite 35→28 fails (phase 1 toward green + CI-gated vitest)
- `docs/portal-os/tranches/035-test-suite-green-sweep.md` — drives the whole unit suite red→green (35 fails → 0; 30 stale-assertion fixes + 5 documented obsolete-doctrine skips) and wires `vitest` into portal-pr-guard so the suite can't silently rot again
- `docs/portal-os/tranches/036-focus-e2e-doctrine-ci.md` — route-mocked focus-mode e2e (approve→place→done), re-anchors the items-bom doctrine to the products surface (0 skips), and gates the `@mocked` e2e in CI (chromium + dev-shim, no backend)
- `docs/portal-os/tranches/037-weekly-meeting-ux-a11y.md` — accessibility + interaction pass over the `/planning/meeting` cockpit (cadence-rail step semantics, live-region announcements, aria-busy, labelled day groups, disabled-reason, confirm-focus); +9 meeting-a11y unit tests; suite 395→404
- `docs/portal-os/tranches/038-login-split-panel-design.md` — `/login` brought to the Design System "Operational Precision" split-panel layout (dark brand-hero left + existing sign-in card right, hero `hidden lg:flex`); presentation-only re-wrap, zero auth-logic change, all 16 login data-testids preserved
- `docs/portal-os/tranches/039-reconcile-badge-lucide-icon.md` — ReconcileBadge's leading `⚠` unicode glyph swapped for the Lucide `<AlertTriangle>` (design-system "Lucide-only icons, never emoji/unicode" rule); presentation-only, zero logic change, full suite 416/416 green
- `docs/portal-os/tranches/039-dashboard-data-viz.md` — `/dashboard` time-series band: Production activity (SVG area+line) + Stock movement flow (grouped bars) + indicative RM+PKG Inventory value (reconstructed, coverage-aware) with interactive crosshair/tooltip + shared 7/14/30-day range selector; honest UOM-agnostic counts, no new backend; pure tested `_lib/trends.ts` + `_lib/value-trend.ts` helpers
- `docs/portal-os/tranches/047-procurement-po-interaction-pack.md` — Procurement/PO interaction pack (Phase 6 portal-only): D1 supplier comparison strip on PO lines (radio chips: name · ₪cost-per-order-UOM via std_cost × pack_conversion · lead days · MOQ; primary pre-selected; chip pins `supplier_item_id`, sent only when it matches the header supplier) + per-line "no mapping — submitting will fail" warning + MOQ hint under qty + catalog price placeholder, new `useSupplierItemsByOrderable` hook (cached per orderable via `/api/supplier-items`), D2 expected-date default = today + max line lead time (falls back to supplier `default_lead_time_days`, then 7; "based on X-day lead time" helper; user-touched dates never overridden), INTER-006 PO-list skeleton KPI tiles + INTER-008 500-row truncation banner, INTER-007 inventory-flow "Clear all" filter reset, INTER-013 PublishConfirmModal `isSubmitting` (both buttons disabled + spinner, wired to publish `isPending`), 045 follow-ups: dashboard urgent-procurement links → `/planning/procurement` + procurement empty-session calendar-link loop removed; 13 new tests, suite green
- `docs/portal-os/tranches/048-production-board-pack.md` — Production board & reporting pack (Phase 6 portal-only tier): C6 one-tap "Confirm: produced N exactly as planned" fast path on `/stock/production-actual` (from_plan_id + untouched qty), C7 Tier 1 "Re-plan remainder for tomorrow" on under-plan success (POSTs a linked plan row via the existing create endpoint) + commit-time `committedPlan` capture fixing the previously-unreachable success variance row, INTER-004 ManualAddModal UoM select (contract UOMS + row uoms) + inline 422 field errors, INTER-011 60s refetch + manual Refresh + "Updated HH:MM", INTER-012 disabled-reason titles, INTER-005 filled btn-danger cancel confirm, INTER-010 32px touch targets, D13 Tier 1 Today strip (planned/reported/unreported + tomorrow preview + "Move to tomorrow"); pure tested `_lib/board-summary.ts`; 465/465 green (451 + 14 new)
- `docs/portal-os/tranches/046-os-truthfulness-role-gates.md` — OS truthfulness + role-gate reconciliation (Phase 5): route-manifest regenerated to cover every `src/app/**/page.tsx` (41 → 77 rows; roles derived from actual layout gates + lattice; T6: users/jobs/integrations → live; redirect stubs marked), baseline.json anchors populated (routes/nav_items/role_gates) + invariants corrected, quarantine.json seeded with the forecast-spec pending-cleanup vestige, middleware ROLE_GATES reconciled with layouts (movement-log + economics carve-outs, planner in /stock, all-roles `/planning` + `/purchase-orders` + `/exceptions`), integrations cards say "derived from exception activity — not sync telemetry", jobs staleness marked "(estimated from job name)", BOM editor "Discard changes" → "Close editor" truth copy; 451/451 green
- `docs/portal-os/tranches/045-planning-consolidation.md` — Planning consolidation (one declared workflow): "Run History" removed from primary nav + planning sub-nav (pages kept; diagnostic-only banners on `/planning/runs` + `[run_id]`), purchase-session/purchase-calendar → redirect stubs to `/planning/procurement`, weekly-outlook → redirect to `/planning/inventory-flow` (`_lib` dirs kept), meeting PROCURE tiles re-pointed to Procurement, hub cadence block "How planning works here" (Thursday/Sunday/Daily), route-manifest rows → status `redirect`; 451/451 green
- `docs/portal-os/tranches/044-groups-v1-portal.md` — Groups v1 portal: shared taxonomy module (`src/lib/taxonomy/groups.ts`) + `GroupFilterBar`, 4 groups proxies, /inventory regex-taxonomy → real `product_group_key`/`material_group_key` with honest "ללא קבוצה" bucket + RM/PKG "לפי קו מוצר" row, FG-flow `?product_group=` chips, supply-flow `?material_group=`/`?used_by_product_group=` chips, /admin/items group filter + inline assign, new `/admin/groups` management page + nav entry; 451/451 green (435 + 16 new)
- `docs/portal-os/tranches/043-po-price-entry-cost-drafts.md` — Price Truth portal close: optional per-line unit price on `/purchase-orders/new` + focus-mode place (`line_prices` + `confirm_price_update`, default-checked, shown only when a price was entered), 3 cost-drafts proxies, `/admin/cost-drafts` "Price updates" review queue (delta-% badges at the 25% threshold, PO source links, approve/reject with stock-value + economics invalidation), admin nav entry; 435/435 green
- `docs/portal-os/tranches/051-mobile-shell-pack.md` — Mobile Tranche B: MobileBottomNav 5-tab bar (<md, manifest-derived roles), PO list mobile cards, reusable ScrollFade scroll affordance (quick actions / group chips / inbox chips), inbox 32px touch targets, hero chip fmtILSCompact; 515 passed +12 new
- `docs/portal-os/tranches/052-recipe-override-ui.md` — "Improvised liquid recipe" UI (backend 0237): RecipeOverridePanel per-plan liquid editor (diff-vs-standard chips, availability tiers, remove/restore/add-RM, load-last-improvisation, reset-to-standard, identical-set saves as clear), ManualAdd "Review recipe" step + quiet plain-add path, ProductionJobCard "Custom recipe" chip (lazy flag cache) + Adjust-recipe action, production-actual from_plan_id open + custom-recipe banner, 2 new recipe proxies, pure tested `_lib/recipe-helpers.ts`; +26 tests
- `docs/portal-os/tranches/053-mobile-planning-pack.md` — Mobile Tranche C (planning surfaces): forecast MonthlyGrid <768px collapsible per-item list (44px inputs, same auto-save pipeline), window.confirm → removal bottom-sheet + inline two-step discard, `.fc-bottom-bar` safe-area inset, procurement calendar <md grouped-by-week list (tierChip/tierDot reuse), PlanningSubNav active-tab scrollIntoView + ScrollFade, meeting week-selector min-w-0 + Generate own row + CadenceRail one-row 390px (corner Today dot); 567/567 green (+25 new)
- `docs/portal-os/tranches/049-design-system-sweep.md` — Phase 7 sweep: Lucide-only, btn unification, table-base, WorkflowHeader size prop, SectionHeading, shared feedback states, stat-card consolidation
- `docs/portal-os/tranches/048-production-board-pack.md` — Phase 6: one-tap as-planned, re-plan remainder, UoM select, board refresh, Today strip, danger cancel
- `docs/portal-os/tranches/047-procurement-po-interaction-pack.md` — Phase 6: supplier comparison strip, lead-time dates, truncation banner, Clear-all, publish isSubmitting
- `docs/portal-os/tranches/046-os-truthfulness-role-gates.md` — Phase 5: manifest regeneration 41->77, baseline anchors, middleware reconciliation, honesty labels
- `docs/portal-os/tranches/045-planning-consolidation.md` — Phase 4: runs demoted, superseded pages -> redirects, cadence block
- `docs/portal-os/tranches/044-groups-v1-portal.md` — Phase 3: shared taxonomy, group filters, /admin/groups
- `docs/portal-os/tranches/043-po-price-entry-cost-drafts.md` — Phase 2: PO price entry, catalog write-back confirm, cost-drafts queue
- `docs/portal-os/tranches/042-refresh-invalidation-design-p0.md` — Phase 2/7 hotfixes: /inventory 60s live refresh, cache-invalidation sweep (economics/approvals/receipts/PO place), dashboard source labels + value-trend honesty, kpi-tile dedupe, italic removal
- `docs/portal-os/tranches/041-journey-404-deadend-ledger-safety.md` — Phase 1 hotfixes: journey 404s (`/ops` prefix, `/stock/ledger`), receipts locked-PO dead-end, `/admin` index + 4 broken admin links, loss-waste confirm gate, scrap-consumption copy truth (T1), dropped deep-link params, focus-mode PO link, inventory drill-down repair
- `docs/portal-os/tranches/040-procurement-rtl.md` — `/planning/procurement` (a fully-Hebrew surface) gets `dir="rtl"` on its page root so the body reads right-to-left while the app shell stays LTR; single-attribute presentation change, copy stays Hebrew, all testids preserved, 416/416 green
