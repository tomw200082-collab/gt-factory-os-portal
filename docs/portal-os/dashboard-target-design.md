# Dashboard Target Design — "The Factory Flow Instrument"

status: proposed north-star (Tom approved the 4-phase audit plan 2026-06-12; this doc is the design target the phases converge on)
source audit: [audit-reports/2026-06-12-dashboard-ui-audit.md](audit-reports/2026-06-12-dashboard-ui-audit.md)
owner: Tom (taste decisions) · portal lane (execution)

---

## 1. Design thesis

A factory dashboard is not a collection of KPIs. It is a **flow instrument**.

GT Everyday's operation is one physical pipeline:

```
SUPPLIERS → INBOUND (POs/receipts) → MATERIALS (RM+PKG stock) → PRODUCTION → FINISHED GOODS → OUTBOUND (orders/shipments)
```

Everything the current dashboard shows — PO tiles, stock value, donut, shortage
risk, production week, slipped plans, movements — is a property of **one stage
of that pipeline**. The best possible summary of supply-chain + inventory +
production + operations is therefore *the pipeline itself*, rendered
left-to-right, with each stage answering exactly two things:

1. **State** — is this stage healthy, strained, or blocking? (one semantic color)
2. **The number that proves it** — one or two figures, not six.

Health of the whole factory = nothing stuck in the pipe. A strained stage is
visible *in context*: late POs are not an isolated tile — they are the upstream
explanation of tomorrow's material shortage, which is the upstream explanation
of a slipped plan.

## 2. The five questions (measurable definition of "best summary")

A 30-second morning scan must answer, in this order:

| # | Question | Today's answer lives in | Target |
|---|---|---|---|
| Q1 | Is anything stopping production **today**? | hero pill + Critical Today (duplicated) | Verdict line (Band 0) |
| Q2 | What must **I** do now, in what order? | 3 separate live blocks + exceptions tile | Action Queue (Band 2) |
| Q3 | Will materials/FG run out inside the horizon? | donut + shortage risk (overlapping) | MATERIALS + FG flow nodes (Band 1) |
| Q4 | Are we on plan this week (production + procurement)? | production week + procurement block | PRODUCTION + INBOUND nodes (Band 1) |
| Q5 | Can I trust these numbers? | "auto-refreshing" chip (fetch-time, not data-age) | freshness stamps per band (Phase 1 + backend data-age) |

Acceptance rule for any future dashboard change: **it must strengthen one of
Q1–Q5 without weakening another, and every red state must be ≤1 click from its
action.**

## 3. Target band structure (the answer-pyramid)

```
┌─ Band 0 — VERDICT ──────────────────────────────────────────────┐
│ One line: "Floor is clear" / "2 critical · 1 slipped" + date     │
│ + freshness stamp. ~120px. No greeting paragraph, date once.     │
├─ Band 1 — FACTORY FLOW RIBBON (signature visual) ───────────────┤
│ INBOUND → MATERIALS → PRODUCTION → FINISHED GOODS → OUTBOUND     │
│ 5 nodes, each: stage name · state color · 1-2 numbers · link     │
├─ Band 2 — ACTION QUEUE ─────────────────────────────────────────┤
│ ONE ranked list replacing Critical Today + Urgent Procurement +  │
│ Slipped Plans + late POs + critical exceptions. Each row:        │
│ severity · what · why-now · one verb ("Order", "Post actual",    │
│ "Open exception"). Empty = one all-clear ribbon, not three.      │
├─ Band 3 — THE NUMBERS (role-aware) ─────────────────────────────┤
│ Value tiles (neutral tone), exceptions breakdown, planning run.  │
├─ Band 4 — TRENDS ───────────────────────────────────────────────┤
│ Existing 3 charts + shared range selector, with y-axis upgrades. │
├─ Band 5 — ACTIVITY ─────────────────────────────────────────────┤
│ One merged "Latest activity" feed (production actuals + ledger   │
│ movements, type chips), one movement-log link.                   │
└──────────────────────────────────────────────────────────────────┘
```

### Band 1 — Factory Flow Ribbon: node spec

| Node | Numbers (max 2) | State logic | Deep link | Data source |
|---|---|---|---|---|
| INBOUND | open POs · late count | danger if late>0; warn if due-today>0 | /purchase-orders | /api/purchase-orders (today) → aggregate endpoint (later) |
| MATERIALS | items critical/stockout · min days-of-cover | danger if critical>0; warn if watch>0 | /planning/inventory-flow | useInventoryFlow (exists) |
| PRODUCTION | today done/planned · slipped count | danger if blocked-today; warn if slipped>0 | /planning/production-plan | /api/production-plan + slipped-plans (exist) |
| FINISHED GOODS | FG value · FG SKUs at risk | warn if supply-flow shows risk | /inventory | /api/stock/value + /api/inventory/supply-flow |
| OUTBOUND | **backend-blocked** — open orders / picked today need a LionWheel-mirror read API | (until then: Shopify sync freshness from /api/shopify/sync-status) | — | **contract request to W1/W4 lane** |

Node visual: compact card, stage label (3xs uppercase), state dot + 1 big
number + 1 sub number, connected by a thin directional connector line that
carries the stage color. On mobile the ribbon becomes a horizontal
scroll-snap strip (same ScrollFade affordance as quick actions) or a vertical
stepper — decide in Phase 2 with a screenshot round.

### Band 2 — Action Queue: ranking

severity DESC (critical → warning) · then category weight (stops-production →
procurement-overdue → slipped → exception) · then age DESC. Max ~8 rows +
"N more in inbox" link. Every row's verb is the *same* deep link the source
block uses today (no new semantics, just unification).

## 4. Role-tuned band order (same components, different order)

| Role | Order | Rationale |
|---|---|---|
| operator | 0 · 1 · 2 · 5 · 4 (no 3) | floor state, do-now, what happened; no finance |
| planner | 0 · 1 · 2(procurement rows boosted) · 3 · 4 · 5 | Sunday-session cadence first |
| admin (Tom/COO) | 0 · 1 · 3 · 2 · 4 · 5 | verdict + flow + money first |
| viewer | 0 · 1 · 4 | read-only digest |

## 5. Visual constitution (Phase 3 enforces)

1. **Tone = state, never decoration.** Value tiles are neutral/accent.
   Amber/red appear only when the data says strain/blocker. No tone cycling
   by array index.
2. **Motion budget: 3 signature effects** — live dot (Band 0), first-paint
   count-up (Band 3), chart draw-in (Band 4). Cut: hero breathe, dot-grid (or
   fade ≤0.2), corner-halo hover scale. `backdrop-filter` ≤ blur(8px).
3. **Density doctrine wins.** Date once. Greeting one line. No sentence that
   restates a number already visible.
4. **Every number carries provenance** — a freshness stamp or source footer,
   compact form + full value in tooltip (keep current pattern).
5. **Charts get a y-reference** — max gridline + last-value label; measured
   aspect ratio (no `preserveAspectRatio="none"`).
6. **English-first UI** per locked decision; ₪ values in he-IL formatting
   (current pattern, keep).

## 6. Convergence map (approved phases → this target)

| Phase (tranche) | Delivers toward target |
|---|---|
| 1 — dashboard-truth (059) | Q5 trust floor: live clock, honest count-up, headline=critical, currency guard, local-time days, working deep links |
| 2 — dashboard-hierarchy (060) | Bands 0–2: verdict line, **Flow Ribbon v1** (4 nodes + outbound placeholder), Action Queue, role order, reveal fix, lg grid |
| 3 — dashboard-calm (061) | Visual constitution §5: tone policy, motion budget, donut→critical center, chart axes, Lucide glyphs |
| 4 — dashboard-structure (062) | Band components <500 lines, Playwright visual snapshots (light/dark × mobile/desktop), this doc becomes enforced reference |
| backend lane (parallel) | aggregate KPI endpoint · data-age freshness · **LionWheel-mirror read API for OUTBOUND node** · price-update path |

## 7. Open decisions for Tom

1. Flow Ribbon on mobile: horizontal scroll-snap vs vertical stepper (screenshot round in Phase 2).
2. Action Queue cap (proposed 8) and whether `warning` exceptions enter the queue or stay inbox-only.
3. OUTBOUND node: ship Phase 2 with Shopify-freshness placeholder, or hide the node until the mirror API lands.
4. Whether admin sees Band 3 (money) above or below the Action Queue (proposed: above, per the existing "COO numbers first" intent).
