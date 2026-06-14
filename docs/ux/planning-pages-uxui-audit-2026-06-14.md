# Planning Pages — Deep UX/UI Audit (Consolidated)

**Date:** 2026-06-14
**Scope:** All 19 pages under `src/app/(planning)/planning/**` (hub, blockers, boms, forecast +/new +/[version_id], inventory-flow +/[itemId] +/supply, meeting, procurement, production-plan, production-simulation, purchase-calendar, purchase-session, runs +/[run_id] +/recommendations/[rec_id], weekly-outlook), the shared `(planning)/layout.tsx`, `PlanningSubNav`, and their `_components`/`_lib`.
**Method:** Read-only. Six specialist auditors in parallel: visual system, interaction/state, accessibility (WCAG AA), microcopy/content-state, end-to-end flow, and flow-continuity (cache/invalidation).
**Language note:** `/planning/procurement` and its components are intentionally Hebrew/RTL (Tom-approved locked exception) and were NOT flagged for that. The audit DID flag Hebrew that leaked onto a non-approved surface (`/planning/inventory-flow/supply`).
**Write policy:** Read-only audit artifact. No portal source modified. The shared `ConfirmDialog`/`QueryCountChip` primitives shipped for admin are reused by several proposed fixes.

---

## 1. Headline

The planning surface is **richer and more decision-critical than admin**, and the audit is correspondingly heavier. The good news: the route topology is clean (the three "redirect tombstones" — purchase-session, purchase-calendar, weekly-outlook — are correct redirects, no dead-ends), the heavy flows (forecast publish via PublishGate, firm-week, procurement supersede) have **exemplary** confirmation patterns, and error/empty/loading states largely exist.

The serious problems cluster in five places:
1. **`/planning/boms` renders hardcoded mock data as if it were live factory metrics** — flagged independently by *two* auditors (flow + visual). This is a data-integrity issue at the decision layer.
2. **Irreversible actions fire with no confirmation** — dismissing a recommendation (unrecoverable) and converting a recommendation to a real PO (financial) both fire on a single click.
3. **Cross-surface cache invalidation gaps** make the same operation show different truth depending on which screen you started from, and leave the inbox showing phantom pending approvals.
4. **A genuinely broken button in production today**: `procurement` uses `btn btn-accent`, but `.btn-accent` is not defined, so it renders with no accent fill.
5. **Operator copy leaks infrastructure** — "Railway logs", "stack trace", "SQL pass", "Endpoint missing", raw HTTP codes, raw enums and BOM IDs.

Two findings need **your decision before they can be fixed** (see §6).

---

## 2. Cross-cutting themes (highest leverage)

### THEME P-A — `window.confirm()` + missing confirmations on irreversible actions *(decision-grade; reuses the admin `useConfirm`)*
- `production-plan` "Move to tomorrow" still uses `window.confirm()` (the last one in planning) with a raw ISO date.
- **Recommendation "Dismiss"** fires immediately — and a dismissed rec cannot be recovered without a new planning run.
- **"Convert to PO" / "Create purchase order"** fires immediately — it creates a real, undeletable financial record. This is the single highest-risk write in the corridor, and it has no gate on either the run-detail table *or* the rec-detail page.
**Fix:** route all through the shared `useConfirm()` (danger tone, names the item). → INTER-001/002/003, FLOW-006, COPY-027.

### THEME P-B — count chips lie during load *(flow-completion; reuses `QueryCountChip`)*
Forecast filter tabs ("All/Active/Drafts/…") compute counts from `data ?? []`, showing "0" for every tab while loading. → INTER-005.

### THEME P-C — cross-surface cache-invalidation gaps *(decision-grade)*
The same operation produces different truth depending on entry point, and downstream surfaces go stale:
- **Run-detail "Convert to PO" invalidates only `recs`**, while the rec-detail page (same action) also invalidates the PO list, the goods-receipt open-PO dropdown, and receipts. Convert from the table → the new PO is invisible in the PO list until it independently refetches. (F1)
- **No planning rec mutation invalidates the inbox** → approve/dismiss/convert leaves a phantom "pending approval" in the inbox for up to 30s. (F2)
- **Creating a production plan from a recommendation** doesn't invalidate the run/rec queries → the consumed rec stays "actionable", risking double-consumption. (F3)
**Fix:** factor a shared invalidation set for convert-to-PO; add `invalidateQueries(["inbox"])` to all six rec mutations; invalidate run/rec on plan-create.

### THEME P-D — `/planning/boms` mock data as live data *(DECISION-GRADE / STOP CONDITION — flagged by 2 auditors)*
KPI tiles and analytics (yield %, costs, counts, depth, complexity, charts) are hardcoded fallback constants and named `mock*` arrays. The backing endpoints (`/api/boms/yield-history`, `/cost-trend`, `/usage-stats`, `/version-history`, `/validate`, `/api/components/alternatives`, …) use `throwOnError:false`, so silent failures surface the mocks with no "not real" indicator. The 15+ chips in the WorkflowHeader also invert hierarchy (analytics louder than the action). → FLOW-007, VISUAL-014, VISUAL-012, COPY-041.
**Fix:** strip mock/fallback values to labeled empty states (portal-side, safe); the real-data sections (At-risk shortcuts, BOM picker, simulator) stay. Whether the backing APIs exist is a backend question (see §6).

### THEME P-E — runs banner contradicts its own buttons *(DECISION-GRADE — needs your call)*
`/planning/runs/[run_id]` shows a persistent banner "Planning runs are diagnostic only — not for ordering," yet every row has working Approve / Dismiss / **Convert to PO** buttons. The banner says no real action; the buttons take real action. → FLOW-002. **Needs your decision** (see §6).

### THEME P-F — operator copy leaks internals *(P0/P1 content; ~48 findings)*
- **Infrastructure jargon in operator error states**: "Railway logs", "stack trace", "SQL pass", "Endpoint missing", "ping the backend deploy", "cold-start", "warm cache", "API service" (inventory-flow + supply-flow).
- **Raw values shown**: HTTP status code in a production-plan banner; raw enums (`MANUFACTURED`/`BOUGHT_FINISHED`, `planning_run_status`, PO/order status, DB `UPDATE`/`DELETE`); raw BOM head IDs in simulation messages; `holidays_il` table name; `item_id` UUID fallbacks.
- **Hebrew on a non-approved surface**: `/planning/inventory-flow/supply` filter labels are Hebrew, but only `/planning/procurement` is in the locked exception → English-first violation. (COPY-005)
- Abbreviations (`recs`, `FG`, `subs`, `eod`) and non-standard status terms (Superseded→Replaced, Discarded→Archived, Done→Completed, "not firmed"→"Not yet confirmed").

### THEME P-G — accessibility *(P1/P2)*
- `role="tablist"` widgets have no arrow-key navigation/roving tabindex (forecast, runs, runs-detail). (A11Y-009)
- `MonthlyGrid` has orphaned grid-cell roles with no parent `role="grid"`. (A11Y-015)
- `ManualAddModal` (custom dialog) has no Escape handler and no `aria-labelledby`. (A11Y-007/016)
- Forecast publish outcome + run-detail error toasts aren't assertively announced (`role="status"` used for errors instead of `role="alert"`; publish result not in a live region). (A11Y-019/026)
- Inventory-flow item tabs are plain buttons (color-only active, no tab semantics). (A11Y-021)
- Planning tables miss `scope="col"`; no skip-to-content link; touch targets at 32px; tiny `text-[9px]` PublishGate label. (cross-cutting)

### THEME P-H — visual / design-system *(decision-grade + polish)*
- **`btn-accent` is undefined → broken button in production** on `procurement`. (VISUAL-006) — fixable now by switching to `btn-primary`.
- Modal backdrop hardcoded (`bg-black/40` vs `/30`) and `shadow-2xl` instead of `shadow-pop`; three competing filter-toggle patterns; raw tables vs `.table-base`; bespoke chips vs the `.chip` system; `text-[Npx]` arbitrary brackets; hub card panels use `bg-bg` instead of `bg-bg-raised`. (VISUAL-001…019)
- **Some fixes want new tokens** (`--overlay-backdrop`, `.btn-accent`, `.chip-toggle`) which live in `globals.css`/`tailwind.config.ts` — authority files I will not touch without your approval (see §6).

---

## 3. Severity-ranked highlights

### P0 / decision-grade
| # | Issue | Source |
|---|---|---|
| 1 | `boms` mock data rendered as live factory metrics | FLOW-007, VISUAL-014 |
| 2 | "Convert to PO" / "Dismiss" fire with no confirmation (irreversible/financial) | INTER-002/003 |
| 3 | Run-detail convert-to-PO leaves PO list / open-PO dropdown / inbox stale (divergent from rec-detail) | F1 |
| 4 | `btn-accent` undefined → broken button on procurement (in prod now) | VISUAL-006 |
| 5 | runs "diagnostic only" banner contradicts working order buttons | FLOW-002 *(needs your call)* |
| 6 | Infrastructure jargon + raw HTTP/enum/ID in operator copy | COPY-002/003/004/023/024 |
| 7 | `window.confirm()` on production-plan "Move to tomorrow" | INTER-001 |
| 8 | Planning rec mutations never invalidate the inbox (phantom approvals) | F2 |
| 9 | Hebrew on non-approved `inventory-flow/supply` surface | COPY-005 |

### P1 / flow-completion (representative)
Forecast filter count chips show 0 during load · per-row global mutation lock locks the whole table · non-standard inline toasts (3500ms, no close) · EditModal UoM free-text + no qty guard · tablist arrow-keys · MonthlyGrid `role=grid` · ManualAddModal Escape + labelledby · publish/run outcome aria-live · forecast post-publish buries the runs link · production-simulation dead-end (no next-step CTA) · inventory-flow PO rows don't link to the PO · blockers due-dates are localStorage-only but shown as team state · meeting "Order calendar" → wrong URL · production rec → production-actual loses planning chrome · `recs`/`FG`/abbreviations + status-term cleanup · `.table-base` migration.

### P2 / polish
Modal backdrop/shadow tokens · three toggle patterns → `.segmented` · `.chip` system adoption · `text-[Npx]` brackets · emoji in FocusMode/empty states · `scope="col"` · skip-link · touch targets · auto-poll indicator · forecast horizon "2 months" vs 8 weeks label · BOM page nav orphan.

---

## 4. What's already good (verified)

- **Route topology is clean** — purchase-session/purchase-calendar/weekly-outlook are correct redirects; no competing live routes; run-detail ↔ rec-detail is bidirectional.
- **Exemplary confirmations**: forecast Publish (PublishGate 2-stage), Firm week (inline 2-step), procurement supersede (alertdialog). These are the patterns the weaker surfaces should copy.
- Error+retry+empty states exist on the data-fetching surfaces; meeting and procurement loading/announcement handling is largely correct.
- The admin work already paid off here: `useConfirm` and `QueryCountChip` exist and are the drop-in fix for the biggest interaction gaps.

---

## 5. Recommended tranche sequencing

1. **Tranche — confirmations + count chips (portal-only, safe):** route Dismiss / Convert-to-PO / Move-to-tomorrow through `useConfirm`; forecast count chips → `QueryCountChip`. Highest safety/value; no decisions needed.
2. **Tranche — invalidation correctness:** shared convert-to-PO invalidation set (F1), inbox invalidation on all rec mutations (F2), run/rec invalidation on plan-create (F3).
3. **Tranche — operator copy scrub:** strip infrastructure jargon + raw HTTP/enum/ID; fix the `inventory-flow/supply` Hebrew leak; abbreviations/status terms. (Mirrors admin tranche 069/070.)
4. **Tranche — a11y pack:** tablist arrow-keys, MonthlyGrid grid role, ManualAddModal Escape+labelledby, publish/toast live regions, inventory-flow tab semantics, `scope="col"`, skip-link.
5. **`btn-accent` quick fix** can ride in tranche 1 (switch to `btn-primary` — no token change).
6. **Held for your decision (see §6):** runs banner (P-E), boms mock data direction (P-D), new design tokens (P-H), blockers due-date persistence.

---

## 6. Decisions only you can make

1. **Planning runs — diagnostic or real?** (FLOW-002) The runs page banner says "not for ordering" but has working Convert-to-PO buttons. If runs are truly diagnostic, the order buttons should be removed; if they're real, the banner must change. These are opposite fixes — I won't guess.
2. **`/planning/boms` mock data** (FLOW-007/VISUAL-014): I can strip the mock/fallback values to labeled empty states portal-side right now (safe). But whether the backing `/api/boms/*` analytics endpoints exist/are planned is a **backend** question — confirm before I decide remove-vs-keep per metric.
3. **New design tokens** (`--overlay-backdrop`, `.btn-accent`, `.chip-toggle`): these require editing `globals.css`/`tailwind.config.ts`, which are design-authority files. I'll propose exact definitions but won't edit them without your go. (The `btn-accent` *broken button* I can fix immediately by switching to the existing `btn-primary` — no token needed.)
4. **Blockers due-dates** (FLOW-009): currently localStorage-only but presented as team-wide accountability. Interim portal fix = a "saved on this device only" label; the real fix needs a backend annotations table.

---

## 7. Per-lens appendix

Each auditor produced a full numbered findings list with `file:line`, acceptance criteria, and a YAML handoff packet. Identifiers used above:
- `VISUAL-001…019` — visual system (tokens, toggles, tables, chips, the boms hierarchy inversion, `btn-accent`).
- `INTER-001…012` — interaction (confirmations, count chips, per-row locks, toasts, forms).
- `A11Y-001…029` — accessibility (tablists, grid roles, dialogs, live regions, color-only, touch, contrast).
- `COPY-001…048` — microcopy (infra jargon, raw enums/HTTP/IDs, the supply Hebrew leak, abbreviations, terminology table).
- `FLOW-001…016` — end-to-end flow (runs banner, boms mock data, simulation dead-end, nav orphans, context loss).
- `F1…F7` — flow-continuity (the cross-surface invalidation chains).

> The strongest signal in this audit: **two independent auditors (flow + visual) flagged the same `/planning/boms` mock-data problem**, and **three independent auditors (flow-continuity, interaction, flow) converged on the convert-to-PO / dismiss risk.** Those are the two things to fix first.

---

**Next action:** Decide Tranche 1 (confirmations + count chips + the `btn-accent` quick fix) as the first bounded, portal-only fix set, and answer the two product questions in §6 (runs-diagnostic-or-real, and boms backend-API status) so Tranches for THEME P-D/P-E can be planned.
