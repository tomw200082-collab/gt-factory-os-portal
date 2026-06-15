# Overnight UX/UI review — GT Factory OS portal

> Date: 2026-06-15 · Author: autonomous session (Tranche 072) · Branch: `claude/system-ux-review-yfobyn` · PR #95 (draft)
> Mandate (Tom): review the UX of every page; make every button "hit the bullseye"; emphasis on the **purchase-order process as it happens today**, and within it on **price & cost accuracy**. Portal-only; skip backend-blocked surfaces; Tom merges.

## How to read this

The portal is already mature (readiness 88/100, 84 test files / 679 tests green, a deep custom design system). So "improve every page" here is **precision and flow completion**, not a rebuild. This report has three parts:

1. **What changed tonight** — shipped, verified code (waves).
2. **Findings** — per-area, with severity and concrete fixes, button-precision first.
3. **Pages to add** — the surfaces missing for each process to be complete & auditable, prioritized. (Backend-dependent ones are listed as *recommendations only*, per your "skip backend-blocked" instruction — no code was written for them.)

Severity: **P0** decision-grade (blocks/erodes trust now) · **P1** flow-completion · **P2** polish/precision.

---

## Part 1 — What changed tonight (shipped & verified)

| Wave | Area | Change | Evidence |
|---|---|---|---|
| 1 | PO line editor (`/purchase-orders/new`, focus mode) | Per-line **live total** + **price-variance signal** vs catalog (none/info/warn/high). A 10× fat-finger (125 vs 12.5) renders danger-styled — caught before it becomes PO truth and writes back to the catalog. | `computeLinePriceInsight`; 43/43 PO tests (11 new) |
| 2 | **Every** button + field (app-wide) | Base `.btn` gained a `focus-visible` ring; `.input`/`.textarea` gained a focus ring (WCAG 2.4.7). One base-class change → every control shows a clear keyboard focus. | `globals-css-focus-visible` guard test; `next build` OK |
| 3 | PO detail (`/purchase-orders/[po_id]`) | **Lines** tab opens with a cost summary: Ordered / Received / Outstanding value + "% received by value" bar. The cost half of price/cost accuracy at a glance. | `summarizePoLineCosts`; 48/48 PO tests (5 new) |

All waves: additive (new `data-testid`s, no existing ids changed), `tsc --noEmit` exit 0, affected vitest green, production build compiles.

---

## Part 2 — The purchase-order corridor as it happens today

### The end-to-end flow (today)

```
                       ┌─ planning engine (W1/W4 backend, out of lane) ─┐
Thursday/Sunday        │                                                │
  /planning/procurement ── "start weekly session" ──> decision list ────┤
   (Hebrew, RTL)         (🔴 must-send-today / 🟡 can-wait / ✅ handled)  │
        │  Focus mode (approve → place → auto-advance) ──> creates PO    │
        ▼                                                                ▼
  /purchase-orders ──(list: Open/Partial/Late/Received KPIs, filters)── /purchase-orders/new
        │                                                          (manual, reason required)
        ▼
  /purchase-orders/[po_id] ── lines · overview · source-rec · attached-GRs · history
        │   header CTA "Receive against this PO →" (visible iff OPEN|PARTIAL)
        ▼
  /stock/receipts?po_id=… ── goods receipt against PO lines ──> PO advances PARTIAL/RECEIVED
        │
        ▼
  (over-receipt emits an exception → /inbox)   ·   /admin/purchase-orders/parity-check
```

The corridor is **closeable end-to-end today**: recommendation → PO → receive-against-PO → PO advances. That is a real achievement (Tranches 012–015, 027–036). The gaps below are about *price/cost truth*, *button precision*, and *a few missing surfaces*.

### Findings — price & cost accuracy (your priority)

- **[P1 → FIXED wave 1]** Manual PO lines had no feedback when an entered price diverged from the catalog cost. A typo silently became PO truth and could write back to the supplier catalog (the writeback checkbox defaults **on**). Now flagged inline by severity.
- **[P1 → FIXED wave 3]** PO detail showed per-line totals but no committed/received/outstanding rollup. Now summarized at the top of Lines.
- **[P1 — open, in-lane]** The **price write-back confirmation** on `/purchase-orders/new` (`po-new-confirm-price-update`) defaults checked and is a bare checkbox below the fold. Recommendation: when any line shows a `warn`/`high` variance, surface a one-line caution next to the checkbox ("2 lines differ a lot from catalog — review before updating prices"). Pure UI, uses the wave-1 insight. *Candidate wave.*
- **[P2 — open, in-lane]** Unit-price inputs are left-aligned. Financial convention (and scanning accuracy) favors **right-aligned** price entry with the currency affix visible. The fields already use `tabular-nums`; add `text-right` and a leading ₪ affix. *Candidate wave.*
- **[P1 — recommendation only, backend]** Price-change-on-**receipt** has no review surface: if goods arrive at a different price than ordered, there is nowhere in-portal to reconcile PO price vs receipt price vs invoice. Needs a receipt-price field in the GR contract → *out of lane, listed in Part 4.*

### Findings — button precision in the corridor ("hits the bullseye")

- **[P2]** PO list "New purchase order" is a custom dropdown (`NewPoDropdown`) — solid, but the two paths ("From procurement session" / "Manual entry") could read as one decision. Label precision is good; keep.
- **[P2]** PO detail header crowds up to 5 actions (Back, Receive-against, View receipts, Cancel + inline confirm). The **destructive** "Cancel PO" is correctly separated and uses an inline two-step confirm (good, matches best practice — friction on destructive). Recommendation: give the primary terminal action ("Receive against this PO") visual primacy and demote "← Back to POs" to a quieter ghost (already ghost — good).
- **[P1 — FIXED wave 2]** Many corridor buttons relied on per-component focus rings; the base `.btn` had none. Now uniform.

### Purchase-order pages to ADD (in-lane, buildable today)

1. **PO print / share sheet polish** — a printable order sheet exists (#93, Hebrew). Confirm it is reachable from `/purchase-orders/[po_id]` header (not only from the draft). *P2, in-lane.*
2. **"My open POs awaiting receipt" operator view** — operators receiving goods need a fast, mobile list of OPEN/PARTIAL POs filtered to *today's expected* deliveries, one tap to receive. The PO list is planner-framed; a receiver-framed entry would shorten the receive loop. *P1, in-lane (reuses the PO list query + receipts deep-link).*

---

## Part 3 — Cross-cutting (every page inherits these)

These are the highest-leverage "every button hits the bullseye" items because they touch the whole app:

- **[P0 → FIXED wave 2]** Keyboard focus visibility on `.btn`/`.input`/`.textarea`.
- **[P1 — open]** **Destructive-action consistency.** Cancel/delete/reversal confirmations are mostly inline two-step (good) but vary in copy and styling (some `btn-danger`, some text links, some `window.confirm` remnants noted historically). Recommendation: a shared `<ConfirmInline>` primitive (danger tone, "X this? — Yes, X / Keep") so every destructive button behaves identically. *Candidate wave — additive component, adopt incrementally.*
- **[P1 — open]** **Submit buttons** mostly disable + show "…ing" on submit (good). A few secondary actions don't. A lint-style sweep to guarantee every mutation button has `disabled={isPending}` + a pending label. *Candidate wave.*
- **[P2 — open]** **Primary-action singularity.** Some toolbars show two filled/accent buttons. Convention: one primary per view; others ghost/outline. A pass over toolbars to enforce single-primary. *Candidate wave.*
- **Design system is strong** — semantic tokens, shimmer skeletons, `reveal`, shared `states.tsx` (Empty/Loading/Error/Success/AllClear/Stale). No rebuild needed.

---

## Part 4 — Pages/surfaces to add, prioritized

### In-lane (buildable now, no backend) — candidate future waves
| # | Surface | Why | Pri |
|---|---|---|---|
| 1 | Receiver-framed "POs to receive today" list | shortens receive loop for floor operators | P1 |
| 2 | Shared `<ConfirmInline>` destructive primitive + adoption | uniform, safe destructive actions everywhere | P1 |
| 3 | Price-variance caution next to the catalog-writeback checkbox | stops a bad price updating the catalog | P1 |
| 4 | Right-aligned price inputs + ₪ affix across PO/receipt forms | scanning accuracy, financial convention | P2 |
| 5 | Single-primary toolbar sweep | clear action hierarchy | P2 |

### Backend-dependent (RECOMMENDATION ONLY — not built, per "skip backend-blocked")
These need W1/W4 contract work and are **out of the portal lane**. Listed so the picture is complete:

- **Send-PO-to-supplier + acknowledgement** — today a PO is created but there is no in-portal "send to supplier" + confirmation state. Biggest true gap in "ordering as it happens".
- **Receipt-price reconciliation** — PO price vs received price vs Green Invoice evidence, with a review/approve surface.
- **Partial-receipt close-out workflow** — explicit "close remaining short" action with reason, rather than compensating receipts.
- **Aggregate spend KPIs** — supplier spend, on-time %, price-drift trend (needs read models).

---

## Part 5 — Operator & approval surfaces (detailed findings)

From dedicated interaction-design audits this session. **[FIXED]** items shipped in waves 4–5; others are prioritized recommendations.

### Inbox / approvals
- **[FIXED — wave 4, BLOCKER]** Physical-count & waste approval pages shared one `busy` flag → approving disabled+relabelled the reject button too. Split per-action; irreversible approve now behind an inline confirm gate.
- **[FIXED — wave 4]** Waste page: status raw-string → pill chip; plain-text loading → skeleton.
- **[FIXED — wave 5]** Credit "reject" trigger now danger-toned (was identical to acknowledge).
- **[P1 — recommend]** `/inbox` bulk-resolve uses `window.confirm()` (thread-blocking native dialog, poor mobile UX, no item breakdown). Replace with an inline/modal confirm naming the N items + categories. *In-lane; the inbox page is large — its own tranche.*
- **[P1 — recommend]** `/inbox` deep-link button promotes to `btn-primary` via a fragile Hebrew-regex label test; should be a declared `isDecision` flag per category. *In-lane.*
- **[P1 — recommend, both pages]** When the detail GET errors, Approve/Reject stay enabled — approving with no visible item/qty/delta is decision-grade risk. Consider disabling actions on detail error. *In-lane; left as a deliberate call for Tom (the page intentionally says "you may still act").*
- **[P2 — recommend]** Physical-count/credit approve success states carry no ledger-movement reference (waste does). Needs the success contract to expose the id → *backend, out of lane.*

### Production report (`/ops/stock/production-actual`)
- **[P0 — recommend]** "Cancel and start over" calls `resetFlow()` instantly — unrecoverable loss of mid-entry quantities/variance reason, and it sits ~8px from the primary submit in the sticky footer. Gate behind an inline "Lose changes?" confirm when any field is non-empty; give it ghost styling + more separation. *In-lane; 4k-line file — its own tranche.*
- **[P1 — recommend]** "Open production form" (Step 1) has no loading/disabled state during the BOM open call → page blanks for 300–800ms, re-tap risk. Disable + "Opening…" while in-flight. *In-lane.*
- **[P1 — recommend]** Recent-reports history section is absent during load and when empty (no skeleton, no empty state). Add both. *In-lane.*
- **[P1 — recommend]** Three Hebrew UI strings in the BOM preview panel (composition banner + "רכיבי אריזה"/"רכיבי נוזל" headings) on an English-first operator surface not covered by the Recipe-Readiness Hebrew exception. Translate to English. *In-lane, but a language-policy call — confirm with Tom.*

### Other operator surfaces (`/ops/stock/*`, bulk-count, submissions)
Reviewed directly; broadly solid (skeletons, retry, role gates, mobile cards present). Candidate precision items fold into the cross-cutting passes in Part 3 (single-primary toolbars, shared `<ConfirmInline>`, guaranteed pending labels).

## Appendix — page inventory reviewed

~70 routes across `(po)`, `(planning)`, `(ops)`, `(inbox)`, `(admin)`, `(shared)`, `(auth)`. Deep-read this session: the full PO corridor + procurement + the design-system foundations (`globals.css`, `states.tsx`, patterns). Operator/inbox and admin/planning groups: see the per-group sections appended as audit agents complete (this is a living report on PR #95).
