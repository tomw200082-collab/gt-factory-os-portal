# Dashboard UI / Visual Design Audit — 2026-06-12

**Scope:** `/dashboard` only — `src/app/(shared)/dashboard/page.tsx` (2,417 lines), `_components/` (DashboardHero, KpiTile, StockHealthCard, TrendChart, CountUp), `_lib/` (trends, value-trend), the dashboard CSS layer in `globals.css:3055-3749`, and the design tokens in `tailwind.config.ts`.
**Method:** full source read of every dashboard file + design-token layer; cross-referenced against `docs/portal-os/audit-reports/2026-06-11-full-system.md` and `scorecard.md` (dashboard_truth 9/10).
**Mode:** read-only audit. No code changed. Findings are graded **P0 (trust/accuracy)**, **P1 (hierarchy/IA)**, **P2 (visual system)**, **P3 (polish/code health)**.

---

## 1. What is already genuinely good (keep, do not regress)

- **Token-driven design system.** Every color flows through the "Operational Precision" tokens (petrol-teal accent, moss/amber/oxide semantics, warm-bone / warm-graphite themes). Zero inline hex. Light + dark parity is real.
- **State hygiene is complete.** Every panel has loading (shimmer skeleton), error (ErrorAlert + Retry), empty (icon + honest copy), and loaded states. The all-clear ribbon gives healthy states an intentional feel.
- **Honest data framing.** The inventory-value trend is labeled "Indicative", degrades below 75% cost coverage instead of drawing a misleading line, and unpriced SKU counts are surfaced on the value tiles.
- **Motion is reduced-motion-gated everywhere.** Charts are keyboard-navigable with sr-only live regions. Donut has a real aria-label.
- **Escalation logic.** Critical Today / Urgent Procurement / Slipped Plans are calm when clear and loud only when hot — the right instinct.
- **Compact ILS formatting** with full value preserved via tooltip — truthful compression.

The problem is not quality of craft. It is **accumulation**: ~10 polish iterations layered effect-on-effect, and a page that answers every question at once instead of one question per zone.

---

## 2. P0 — Trust & accuracy ("the numbers must be believed")

| ID | Finding | Evidence |
|---|---|---|
| DASH-T1 | **Frozen clock.** `now` is captured once at mount (`useMemo(() => new Date(), [])`, page.tsx:1897). Every relative label — "updated 5m ago", "Triggered 2h ago", greeting, urgent-procurement day math — is computed against mount time. With the tab open all morning (the stated use case) and a 60s auto-refresh promise in the header, the labels silently drift wrong. | page.tsx:1897, 373-385, 560-565, 1709 |
| DASH-T2 | **KPI numbers re-roll from 0 on every data change.** CountUp animates 0 → target whenever the target string changes (CountUp.tsx:124-160). With `refetchInterval: 60_000` on the value/PO/exceptions queries, any changed figure visibly crashes to zero and rolls back up mid-shift — reads as a data glitch, not delight. Should animate **previous → new**, and only count-up from 0 on first paint. | CountUp.tsx:139-158; page.tsx:1918-1972 |
| DASH-T3 | **Exceptions headline is inflated.** The big number is critical+warning+info (page.tsx:2313). `info` rows inflate the scariest-looking tile on the page. Headline should be critical (or critical+warning), with the full breakdown staying in the legend. | page.tsx:2311-2326 |
| DASH-T4 | **Open-PO value sums across currencies.** `poStats.openValue` adds `total_net` for all open POs regardless of `currency`, then renders with a ₪ prefix (page.tsx:2163-2172, 2294). One USD PO corrupts the figure. Sum ILS only and badge "+N foreign" — or convert explicitly. | page.tsx:2163-2172 |
| DASH-T5 | **UTC day boundaries.** `weekRange()` and the PO "late" comparison use `toISOString()` (UTC) — in Israel the Sun–Sat window and "late today" flip at 02:00/03:00 local, not midnight. The urgent-procurement block already does this correctly with `isoDateLocal`; the other two should match. | page.tsx:415-424, 2165 |
| DASH-T6 | **Dead deep-links from Critical Today.** `/inventory?item_id=` and `/exceptions?id=` are emitted (page.tsx:459-476) but the target pages ignore those params (confirmed in 2026-06-11 full-system audit). The most urgent CTA on the page drops the operator on a generic list. |  page.tsx:447-504; full-system audit §"Dropped deep-link params" |
| DASH-T7 | **13 queries on mount, three of them heavy lists, to derive counts client-side.** `purchase-orders?limit=500`, ledger `limit=300` (trend) + production history `limit=300` — all fetched so the browser can count rows. This is the real "dashboard feels slow" driver on factory tablets, and the 300-row cap silently undercounts busy fortnights at the old end of the trend window. Needs the backend **aggregate read-model endpoint** already listed as the scorecard's dashboard_truth gap (backend lane — out of portal scope, but the dashboard should be re-pointed the day it lands). | page.tsx:1916-2018, 163; scorecard.md dashboard_truth |
| DASH-T8 | **Freshness still measures fetch time, not data age** (known: full-system audit §7.8) — the FreshnessBadge in the hero inherits this. Re-flag here because the hero presents it as the page's trust signal. | full-system audit §7 |

---

## 3. P1 — Information architecture & hierarchy ("one question per zone")

| ID | Finding | Evidence |
|---|---|---|
| DASH-H1 | **14 stacked sections, with built-in duplication.** Hero status pill answers "is the floor clear" → Critical Today re-answers it one band later. Stock Health (donut) and Shortage Risk both express RM risk. Exceptions tile duplicates the inbox. Two adjacent panels in the same column both footer-link "View movement log". Each duplicate dilutes the page's authority. | page.tsx:2200-2415 |
| DASH-H2 | **One layout for three personas.** Only procurement + value-trend are role-gated. An operator scrolls past finance KPIs and planning cards to reach production state; the planner's act-now block (procurement) sits seventh. Same components, role-tuned **zone order** would fix this without forking the page. | page.tsx:1903-1908, 2252-2414 |
| DASH-H3 | **No declared answer-pyramid.** Money KPIs were deliberately promoted above the live blocks "for the COO" (comment at page.tsx:2248-2251), but the hero already carries the critical/slipped state. Decide and document one question per band: ① Am I safe? ② What must I do now? ③ The numbers. ④ Trends. ⑤ Detail/log. Today bands ①–③ interleave. | page.tsx:2248-2340 |
| DASH-H4 | **Hero density.** ~220px of premium first-paint space for a greeting + the date rendered **three times** (compact plate, long-date sentence, locale string) + chips. The doctrine is operational density for 8-hour shifts; the sentence "Here is the state of the factory on Monday…" restates the date plate above it. | DashboardHero.tsx:110-122 |
| DASH-H5 | **Reveal cascade collapses at the bottom.** Three different bands all use `reveal-delay-6` (page.tsx:2345, 2387, 2402), so the staged entrance ends with half the page popping at once. |  globals.css:683-693 |
| DASH-H6 | **Mobile is ~10 screens of scroll** with no jump-nav, sticky status, or collapsible bands. The quick-actions ScrollFade is the right pattern; the rest of the page has no mobile prioritization. | page.tsx:2200-2415 |

---

## 4. P2 — Visual design system ("color means something, motion has a budget")

| ID | Finding | Evidence |
|---|---|---|
| DASH-V1 | **Semantic tones used decoratively.** RM Inventory Value is permanently `tone="warning"` (amber = problem, on a tile that has no problem); ProductionWeek's `TONE_BG_CYCLE` deals accent/success/info/**warning/danger** to items by array index — a random product gets a red progress bar. In a control-tower, amber/red must be reserved for state. Value tiles should be neutral/accent; semantic tones only when the data says so. | page.tsx:2265, 883, 2093 |
| DASH-V2 | **Decoration stack exceeds a calm motion budget.** Concurrent on one screen: canvas radial gradients + full-height masked dot-grid + hero 6s "breathe" + hero hairline + per-tile gradient + corner halos + icon halos + live ping + hot pulse + shimmer + count-up + chart draw-ins + 6-step reveal cascade. Individually defensible; together they compete with the data, and `backdrop-filter: blur(16px) saturate(1.4)` + a full-page mask are GPU-expensive on cheap factory tablets. Adopt a rule: **one signature effect per band** (recommend keeping: live dot, first-paint count-up, chart draw-in; cutting: hero breathe, dot-grid or fade it hard, corner-halo hover scale). | globals.css:3240-3334, 3407-3439 |
| DASH-V3 | **KPI hero numbers are smallest on the most common screen.** The value font collapses to 24px exactly at lg 1024-1279 (globals.css:3488-3491) because the strip forces 4 columns at lg (~160px tiles). The "dramatic primary number" disappears on a standard laptop. Switch to 2×2 at lg, 4-col from xl — keeps ≥30px everywhere. | globals.css:3484-3499; page.tsx:2252 |
| DASH-V4 | **Donut centers on the wrong number.** Center shows total item count; the decision number is `critical`. Recommend center = critical count (toned), "of N items" as the label. | StockHealthCard.tsx:133-148 |
| DASH-V5 | **Charts have no y-reference.** Only first/last x-labels; no max-value tick, no gridline, no last-value annotation — the reader can't size a spike. `preserveAspectRatio="none"` also distorts geometry as width changes, and the tooltip clamp (7–93%) can sit over the active point at the edges. Add a single y-max label + a dotted max gridline + last-value dot label; render at measured aspect. | TrendChart.tsx:24-32, 126-148, 209 |
| DASH-V6 | **Typographic glyphs (↓ ↶ ✕ →) in the movement registry** clash with the Lucide icon language used everywhere else. | page.tsx:528-541 |
| DASH-V7 | **"Auto-refreshing" chip is developer-facing.** Operators care that the data is fresh (the FreshnessBadge's job), not that a timer exists. Merge into the freshness chip ("Live · updated 40s ago"). | page.tsx:2230-2237 |

---

## 5. P2 — Accessibility & interaction notes

- **DASH-A1:** `aria-live="polite"` wraps whole lists (critical/slipped/procurement/movements) — every refetch re-announces all rows. Announce the count delta instead. (page.tsx:1518, 1616, 1824, 1112)
- **DASH-A2:** RangeSelector's 7/14/30 buttons are ~22px tall (`py-1`, `text-2xs`) — below the 44px touch floor on the device class this page targets. (TrendChart.tsx:399-422)
- **DASH-A3:** Whole-card KPI links make the accessible name the entire card text; add a concise `aria-label` ("RM inventory value, ₪107.9M, open inventory").
- Chart keyboard support, sr-only live regions, donut labeling: **good — keep**.

## 6. P3 — Code health

- **DASH-C1:** `page.tsx` is a 2,417-line client component vs the repo's 500-line rule. The trend band, live blocks, and KPI strip are already self-contained — split into `_components/bands/*` with zero visual change. The split is also what makes role-ordered zones (DASH-H2) cheap.
- **DASH-C2:** Feedback primitives already extracted (VISUAL-013/014 closed) — page defines zero local feedback components. Good.

---

## 7. Improvement plan — four tranche-sized phases

**Phase 1 — "dashboard-truth" (P0, do first; smallest, highest trust ROI)**
DASH-T1 live clock (one 30s ticker context) · T2 CountUp prev→new · T3 exceptions headline=critical · T4 PO currency guard · T5 local-time day boundaries · T6 repoint/implement the two deep-link params. (T7/T8 backend lane: aggregate KPI endpoint + data-age freshness — file the contract request, re-point on landing.)

**Phase 2 — "dashboard-hierarchy" (P1)**
Declare the 5-band answer-pyramid in code comments + docs · merge hero status with Critical Today (chip anchors to the block) · role-tuned band order (operator: live blocks → production → numbers; planner: procurement first; admin/COO: numbers first) · collapse hero to one date + greeting + chips (~120px) · dedupe movement-log links · fix reveal-delay tail · lg grid 2×2.

**Phase 3 — "dashboard-calm" (P2)**
Tone policy: semantic colors only for state (neutral value tiles; single-accent ProductionWeek bars) · motion budget (cut hero breathe, fade dot-grid, simplify halos) · donut center = critical · chart y-reference + last-value label + measured aspect · Lucide glyphs · merge auto-refresh chip into freshness · touch-target + aria-live fixes.

**Phase 4 — "dashboard-structure" (P3, regression armor)**
Split page.tsx into band components (<500 lines each) · Playwright visual snapshots (light/dark × mobile/desktop) as the regression gate · write the dashboard design rules (zone map, tone policy, motion budget) into `docs/portal-os/` so the next polish pass has a constitution.

Each phase is one bounded tranche with a file manifest, per Portal OS invariants. Phase 1 has no visual-identity risk; Phases 2–3 are where Tom's taste calls land and should each get a before/after review.
