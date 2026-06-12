# Dashboard Target Design v2 — "The Factory Flow Instrument"

status: design constitution (Tom approved phases + flow concept 2026-06-12, and delegated the
open decisions — "אני סומך עליך"; this v2 resolves them and specifies every element)
source audit: [audit-reports/2026-06-12-dashboard-ui-audit.md](audit-reports/2026-06-12-dashboard-ui-audit.md)
owner: Tom (taste veto) · portal lane (execution)

---

## 0. The brief, restated as design law

Tom's mandate: *"ימקד אותי בכל יום מחדש · יהיה יפה מאוד · כל אות וכפתור עם מטרה
ברורה ועוצמתית"*. Translated into three laws every element must pass:

- **LAW 1 — Daily focus.** The page must answer "what is today about?" before
  anything else, and the answer must change as the factory's day changes.
- **LAW 2 — Earned beauty.** Beauty comes from hierarchy, rhythm, and one
  signature visual — never from decoration. **Motion is only allowed when it
  encodes a real event.**
- **LAW 3 — No passenger pixels.** Every label, number, chip, and button must
  name its job (verb + object). If an element's job is already done by another
  element, it is deleted.

## 1. Design thesis

A factory dashboard is not a collection of KPIs. It is a **flow instrument**.
GT Everyday is one physical pipeline:

```
SUPPLIERS → INBOUND (POs / receipts) → MATERIALS (RM+PKG) → PRODUCTION → FINISHED GOODS → OUTBOUND (orders / shipments)
```

Every number the dashboard can show is a property of one stage of this pipe.
The best summary of supply-chain + inventory + production + operations is the
pipe itself, rendered left-to-right, each stage answering exactly two things:
**state** (one semantic color) and **the number that proves it** (max two).
Factory health = nothing stuck in the pipe; a strained stage is visible *in
context* (late PO → tomorrow's material gap → next slipped plan).

**The MRP grammar.** Underneath, this is classical MRP made visible:
`projected = on-hand + scheduled receipts − demand`, urgency expressed in
**time-to-impact (days of cover)**, and every alert resolvable by exactly one
**transaction** (order, receive, post actual, count, adjust). The UI speaks
that grammar everywhere: every shortage line shows its net math; every action
button *is* the resolving transaction; every quantity carries its UOM; money
is context, time is urgency.

## 2. The five questions (measurable "best summary")

A 30-second morning scan answers, in order: **Q1** anything stopping
production today? **Q2** what must I do now, in what order? **Q3** will
materials/FG run out inside the horizon? **Q4** are we on plan this week
(production + procurement)? **Q5** can I trust these numbers?
Acceptance rule for any change: strengthens one of Q1–Q5 without weakening
another, and every red state is ≤1 click from its transaction.

## 3. The daily ritual — three acts

The page is choreographed as a ritual, not a report:

1. **ARRIVE (0–10s)** — Band 0: verdict + today's-focus sentence + what changed
   since you last looked. LAW 1 lives here.
2. **ACT (10s–5min)** — Band 2: one ranked action queue; each row ends in the
   transaction button that resolves it.
3. **AWARENESS (whenever)** — Bands 1/3/4/5: the flow ribbon, the money, the
   trends, the activity feed. Context, never alarm.

## 4. Band structure (final)

```
┌ Band 0 — VERDICT & FOCUS (sticky-collapsing) ────────────────────┐
├ Band 1 — FACTORY FLOW RIBBON (signature visual) ─────────────────┤
├ Band 2 — TODAY'S WORK (unified action queue) ────────────────────┤
├ Band 3 — THE NUMBERS (neutral value/exceptions/planning tiles) ──┤
├ Band 4 — TRENDS (3 charts + range, y-axis upgraded) ─────────────┤
├ Band 5 — ACTIVITY (one merged feed) ─────────────────────────────┤
└──────────────────────────────────────────────────────────────────┘
```

Band order is fixed for **all roles** — including admin. Rationale (resolves
open decision #4): Tom's explicit brief is *daily focus*; focus is action, money
is context. Role differences are *content* differences only: operator sees no
Band 3 (cost gating already exists), planner gets procurement rows boosted in
Band 2, viewer gets Bands 0/1/4 only.

### Band 0 — Verdict & Focus

| Element | Job (LAW 3) | Spec |
|---|---|---|
| Greeting line | daily ritual anchor | `Good morning, Tom — Sunday, procurement day.` One line, 20–24px. The day-type suffix comes from the Focus Engine. |
| **Focus sentence** | LAW 1 — "what is today about" | One sentence, always **verb + named object**, chosen by the Focus Engine (below). Examples: `Lime juice stops production tomorrow — order it first.` / `3 runs planned today · first: Mojito 330ml.` / `All clear — next order-by is Thursday (Tempo).` |
| State pill | Q1 verdict | `Floor is clear` / `2 critical · 1 slipped`. Only pulsing element on the page when danger. |
| Freshness stamp | Q5 trust | `Data as of 07:42` (data-age once backend lands; fetch-age until then, labeled honestly). Replaces the "Auto-refreshing" chip. |
| Date | orientation | appears **once**, inside the greeting. The date-plate and the "Here is the state…" sentence are deleted. |
| "Since you last looked" chips | makes each arrival fresh | up to 3 delta chips vs. last visit (localStorage timestamp): `+2 receipts` `1 new exception` `RM −₪4.2K`. Click = deep link. Hidden on first-ever visit. |

**Focus Engine** — deterministic, explainable, testable rule cascade (no
magic): ① critical-today rows → name the worst one. ② Sunday + no purchase
session → `Procurement day — start the weekly session.` + CTA. ③ overdue/
due-today supplier orders → name supplier + count. ④ slipped plans → name
count + `post actuals or reschedule`. ⑤ today's plan exists → progress +
next run. ⑥ late POs → chase line. ⑦ else all-clear + **next commitment**
(next order-by date / tomorrow's first run). Pure function
`resolveFocus(inputs) → {sentence, tone, href}` with unit tests per rule.

**Sticky collapse:** after ~200px scroll, Band 0 collapses to a 40px slim bar
(state dot + focus sentence + `↑ queue` link), `position: sticky`. Q1 is
answered at every scroll depth.

### Band 1 — Factory Flow Ribbon (the signature)

Five nodes joined by directional connectors. Node anatomy (top→bottom):
stage label (3xs uppercase, tracking-sops) + state dot · **display number**
(28–32px tabular) · sub-line (xs, muted) · micro-footer `as of 07:42`.

| Node | Display number | Sub-line | State logic | Click → | Popover (hover/tap) |
|---|---|---|---|---|---|
| INBOUND | open POs | `2 late · ₪86K open` | danger: late>0 · warn: due-today>0 | /purchase-orders | top-3 POs by due date + `Receive` links |
| MATERIALS | **min days-of-cover** (e.g. `2.1d`) | `3 critical · 142 SKUs` | danger: critical>0 · warn: watch>0 | /planning/inventory-flow | top-3 shortage items with d-o-c bars |
| PRODUCTION | `2/5` today done/planned | `1 slipped · next: Mojito 330ml` | danger: blocked-today · warn: slipped>0 | /planning/production-plan | today's runs list + `Post actual` |
| FINISHED GOODS | FG SKUs at risk | `₪1.2M value · 58 SKUs` | warn: supply-flow risk>0 | /inventory | top at-risk FG vs demand (supply-flow) |
| OUTBOUND *(quiet node)* | `—` | `Shopify sync 12m ago` | neutral until LionWheel-mirror API lands | — | `Shipments activate with the LionWheel mirror` |

Resolved decision #3: OUTBOUND ships as a visibly de-emphasized "quiet node"
(reduced opacity, no connector animation) — the pipe stays anatomically
complete without faking data.

**Connector = motion with meaning (LAW 2).** Each 24px arrow connector carries
the color of its downstream constraint, and runs a slow dash-flow animation
**only if a real movement crossed that edge today** (GR posted → INBOUND→
MATERIALS animates; actual posted → PRODUCTION→FG animates; consumption →
MATERIALS→PRODUCTION). A still connector *is information*: nothing moved here
today. Reduced-motion: static arrows, state color kept.

MATERIALS' display number is deliberately **time, not money** — days-of-cover
is the MRP urgency currency; money lives in Band 3.

Resolved decision #1 (mobile): horizontal **scroll-snap strip** with the
existing ScrollFade edge affordance + snap dots — preserves the left-to-right
pipe metaphor; a vertical stepper would break it. Nodes ≥148px wide, touch
targets ≥44px.

### Band 2 — Today's Work (unified action queue)

Replaces Critical Today + Urgent Procurement + Slipped Plans as separate
blocks (their data sources and links are reused 1:1).

Row anatomy: `[severity dot + age] · [verb-object title] · [why-now line] ·
[one primary transaction button]`.

- **Title is verb + object**: `Order lime juice from Tempo` · `Post actual:
  Mojito 330ml (Tue plan)` · `Resolve: planning fail-hard`.
- **Why-now line speaks MRP** (pegging-lite, from existing inventory-flow
  data): `On hand 40L · incoming 120L Thu · demand 200L → short Wednesday.`
- **One button per row** = the resolving transaction: `Order now` / `Receive`
  / `Post actual` / `Open exception`. No secondary buttons; the row itself
  links to the detail surface.
- **Ranking**: severity (critical→warning) → category weight (stops-production
  → procurement-overdue → slipped → exception) → age DESC.
- Resolved decision #2: **cap 8 rows** + `12 more in inbox →`. Warning-grade
  items enter only if actionable **today** (due-today rule); otherwise they
  stay in the inbox.
- **Empty state = forward focus**: one all-clear ribbon + a `Tomorrow` strip
  (next order-by date, tomorrow's first planned run) — an empty queue points
  the eye forward, never just "nothing to do".

### Band 3 — The Numbers

RM value · FG value · Open-PO value · Exceptions breakdown · last planning
run. All tiles **neutral/accent tone** (tone=state law: a value is not a
warning). Exceptions headline = critical count. CountUp on first paint only;
changes tween previous→new. Compact-₪ + full value tooltip (keep).

### Band 4 — Trends

The existing three charts + shared 7/14/30 selector, upgraded: y-max gridline
+ label, last-value dot label, measured aspect ratio (drop
`preserveAspectRatio="none"`), 44px selector targets. Counts-per-day framing
stays (honest, UOM-agnostic) — re-point to aggregate endpoint when it lands.

### Band 5 — Activity

One merged feed (production actuals + ledger movements), Lucide direction
icons (replace ↓↶✕ glyphs), 6 rows, **one** `View movement log` link.

## 5. Visual constitution

1. **Color budget:** the page is ≥95% neutral surface. Semantic color appears
   only in: state pill, node dots/borders/connectors, queue severity, donut
   arcs, late/critical inline counts. Value tiles neutral. No tone cycling by
   index. Decorative gradients: canvas wash (one, faded) + hero hairline only;
   dot-grid deleted or ≤0.2 opacity; `backdrop-filter` ≤ blur(8px).
2. **Motion budget (total):** ① connector dash-flow (only-when-true), ② count-up
   first paint, ③ chart draw-in, ④ danger pulse on the state pill. Everything
   else static. Hero "breathe" deleted. All gated by reduced-motion.
3. **Type hierarchy:** display numbers (28–40px tabular) exist only in Bands
   1+3, one per card. Labels 3xs uppercase tracking-sops. Body ≤14px
   (density doctrine). One typeface pair (Public Sans / Plex Mono) — unchanged.
4. **Microcopy law:** verbs first, object always named, every quantity carries
   UOM, money carries ₪, "—" never appears without a reason in its tooltip,
   zero developer vocabulary (no sync/fetch/cache/API on screen).
5. **Provenance:** every band footer carries source + as-of. English-first UI
   (locked decision); ₪ in he-IL formatting.

## 6. Performance & accessibility budget

- **LCP < 2s on a mid-range tablet.** Bands 4–5 queries mount lazily
  (IntersectionObserver) — above-the-fold goes from 13 queries to ~6;
  re-point to the backend aggregate endpoint when it lands.
- Ribbon is an ordered list (`<ol>`) semantically — "stage 2 of 5: Materials,
  status strained". Popovers are focus-trapped, Esc-closable.
- One polite live region announces **verdict changes only** (not list bodies).
- Touch targets ≥44px everywhere (queue buttons, range selector, snap dots).

## 7. Convergence map (approved phases → this target)

| Phase (tranche) | Delivers |
|---|---|
| 1 — dashboard-truth (059, planned) | trust floor: live clock, honest count-up, headline=critical, currency guard, local-time days, working deep links |
| 2 — dashboard-hierarchy (060) | Bands 0–2 v1: Focus Engine + verdict band + sticky collapse + **Flow Ribbon** (4 live nodes + quiet OUTBOUND) + unified queue + role content rules + reveal/grid fixes |
| 3 — dashboard-calm (061) | constitution §5–6: color/motion budgets, Band 3 neutralization, chart axes, merged activity feed, lazy mounting, microcopy sweep |
| 4 — dashboard-structure (062) | band components <500 lines, Playwright visual snapshots (light/dark × mobile/desktop), this doc enforced as reference |
| backend lane (parallel, filed) | aggregate KPI endpoint · data-age freshness · **LionWheel-mirror read API (activates OUTBOUND)** · price-update path |

## 8. Decisions resolved in v2 (were "open" in v1)

1. Mobile ribbon → horizontal scroll-snap strip (pipe metaphor preserved).
2. Queue cap → 8 + inbox link; warnings enter only when actionable today.
3. OUTBOUND → quiet node now, activates with the mirror API.
4. Band order → identical for all roles, queue before money (focus is action);
   role differences are content-only.

Tom retains taste veto via the Phase 2 screenshot round (before/after pair per
band).
