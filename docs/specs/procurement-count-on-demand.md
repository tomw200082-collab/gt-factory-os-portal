# Spec — Count-on-demand from Procurement (cross-lane)

status: **PROPOSAL for Tom's approval** — not yet built. Cross-lane (backend
`gt-factory-os` W1 + portal `gt-factory-os-portal` W2). Grounded in a read-only
backend investigation (2026-06-16); `file:line` evidence inline.

---

## 1. Problem & goal

There are hundreds of components / raw materials — too many to physically count
on a routine basis. So counts are either skipped (stock drifts from truth) or
done broadly with no priority (wasted floor time). Tom wants to count **only what
matters for an accurate purchase decision**, and have that be dead-simple:

> While buying on the procurement page, flag the components that aren't fully
> counted → walk the floor with a phone → open the physical-count form which shows
> exactly the flagged list → count them → return to procurement and buy with the
> real quantities.

## 2. The loop — and the one timing fact that shapes the design

```
Procurement page ──"mark for counting"──▶ component joins a count list (the "collect")
        │                                            │
        │                                   phone: physical-count form shows the list
        │                                            │  count each (blind) → drops off
        │                                            ▼
        │                              count corrects current_balances  (instant, atomic)
        ▼                                            │
   return to procurement ◀──"recheck / recompute"────┘   ← REQUIRED, explicit step
        │
   recommended quantities now reflect real stock → buy
```

**Critical backend fact (investigated, confirmed):**
- A physical count is *anchor-first*: `handlePhysicalCountSubmit`
  (`api/src/physical-counts/handler.ts:232`) calls `replace_anchor(...)`, which
  fires the projection trigger and rebases `current_balances` **synchronously in
  the same transaction** (`db/migrations/0009_current_balances.sql:218,261`). Live
  stock is correct the instant a count auto-posts (or is approved).
- BUT procurement recommendations are a **frozen snapshot**. The engine
  `fn_generate_purchase_session` (`db/migrations/0206:411`) reads `current_balances`
  live **only at run time**, then persists `recommended_qty` / `coverage_trace`
  into `purchase_session_po_line` (`0205:202`). The page's read path
  `loadSessionDto` (`api/src/purchase-session/queries.ts:100`) selects **only** from
  the snapshot tables — it never touches `current_balances`.
- **Therefore:** after a count, the open session's quantities are stale until the
  engine is re-run. There is **no** live per-line recompute endpoint today. The
  feature must add an explicit recompute trigger. (This is the whole reason the
  loop above has an explicit "recheck/recompute" arrow, not an automatic one.)

## 3. Backend (lane W1 — `gt-factory-os`) — proposed contract

> Requirements spec only. The backend lane authors the migration + handlers; this
> doc does not commit schema. Conventions matched to the real codebase.

### 3.1 Data model — `private_core.count_request`
A lightweight, append-light lifecycle row (pattern: `purchase_session_po`
`0205:112` + `audit_runs` `0151`). **Metadata only — never touches
`stock_ledger` / anchors / `current_balances`.**

| column | type | notes |
|---|---|---|
| `count_request_id` | `uuid pk default gen_random_uuid()` | event-row convention |
| `item_type` | `text check (item_type in ('FG','RM','PKG'))` | what the count form opens on |
| `item_id` | `text references private_core.items(item_id)` | text PK convention (locked dec. 57) |
| `component_id` | `text references private_core.components(component_id)` null | when the flagged thing is a component; polymorphic exactly-one CHECK like `purchase_session_po_line` `0205:202` |
| `status` | `text not null default 'open' check (status in ('open','fulfilled','cancelled'))` | partial index on `status='open'` |
| `source` | `text not null default 'procurement'` | provenance |
| `opened_by_user_id` | `uuid references private_core.app_users(user_id)` | actor |
| `fulfilled_by_submission_id` | `uuid` null | FK target like `count_freezes.consumed_by_submission_id` |
| `opened_at` / `updated_at` | `timestamptz not null default now()` | `+ touch_updated_at` trigger |

Dedup: **one open request per countable identity** (partial unique index on
`(item_type,item_id) where status='open'`).

### 3.2 Endpoints
1. **Mark for counting** — `POST /api/v1/mutations/count-request`
   `{ item_type, item_id, component_id? , idempotency_key }` → upserts an `open`
   request (idempotent on the open-dedup index). Planner/admin only (mirror
   `handleSkipPo` authz, `handler.actions.ts:568`).
2. **Worklist** — `GET /api/v1/queries/count-request/open` → the `open` requests
   (display name + unit), consumed by the physical-count form. **Returns no
   expected quantity** — preserves the blind-count invariant
   (`physical-count/handler.ts` header).
3. **Fulfillment hook** — inside `handlePhysicalCountSubmit` (and
   `handlePhysicalCountApprove`): when a count corrects stock for an identity that
   has an `open` count_request, set it `fulfilled` + `fulfilled_by_submission_id`
   in the **same transaction** as `replace_anchor`. (Auto-post 201 / approval path;
   a 202-pending count leaves the request `open` until approved.)
4. **Recompute trigger** — see §5 (the one real design decision).

## 4. Portal (lane W2 — `gt-factory-os-portal`) — proposed UX

### 4.1 Procurement page (`/planning/procurement`, Hebrew RTL — locked exception)
- New per-line / FocusCard action **"סמן לספירה"** next to the existing
  "דלג" / "צור הזמנה". Calls endpoint #1.
- A small tray/counter: **"N רכיבים מסומנים לספירה → פתח רשימת ספירה"** (the
  "collect" — links to the count form). Reflects open requests.
- After counting + return: a **"חשב מחדש מול מלאי אמיתי"** affordance (the
  recompute trigger, §5) so the line quantities refresh to real stock.
- New Hebrew strings here need Tom's sign-off (locked RTL surface) — listed in §7.

### 4.2 Physical-count form (`/stock/physical-count`, ops, phone-first)
- New block at the top: **"Components to count (N)"** — the worklist from endpoint
  #2. Tap a row → opens that item's blind snapshot (the existing
  `GET /api/physical-count/open` flow) pre-selected; on submit it drops off the
  list. Big tap targets, one-handed.
- Keep the existing manual item/component picker as a fallback below the worklist.

## 5. The one real design decision — how to recompute

After counting, the open session's numbers are stale (§2). Two ways to refresh:

- **Option A — per-line "recheck against live stock" (recommended).** New backend
  endpoint recomputes just the flagged line(s) `recommended_qty` + `coverage_trace`
  from current `current_balances`, reusing the engine's per-line coverage logic.
  **Surgical — preserves every other in-progress skip/approve decision in the open
  session.** More backend work (extract per-line recompute from
  `fn_generate_purchase_session`).
- **Option B — regenerate the session (minimal).** Reuse the existing
  `POST /purchase-session/start` with `supersede=true` (`handler.ts:47`). Cheap (no
  new engine code) but **discards in-progress decisions** on every other line —
  disruptive if Tom already acted on some.

**My recommendation: Option A.** It matches the mental model ("fix *these*
quantities, leave my other decisions alone") and avoids destroying work mid-session.
Option B is an acceptable v1 only if counting always happens *before* any other line
decisions. (This is the single thing I'd want your call on.)

## 6. Edge cases / decisions already made
- **Recompute is explicit, not automatic** — a "recheck" click, not a silent
  refresh. Safer and matches the backend reality.
- **No reason field** (Tom's call) — flagging is one tap.
- **Bought before counted:** placing/skipping a flagged line may auto-cancel its
  open request (or leave it — minor; recommend auto-cancel on place).
- **Identity mapping:** a procurement line references `component_id`/`item_id`
  (polymorphic); the count form opens on `item_type+item_id`. The backend lane
  confirms the component→countable-item mapping when building #1/#2.

## 7. Build sequence & governance
1. **You approve this spec** (esp. §5 recompute choice + the new Hebrew strings).
2. **Backend lane** (`gt-factory-os`): migration (`count_request`) + endpoints
   #1–#3 + the §5 recompute + fulfillment hook → emits a RUNTIME_READY signal.
   *(Stock-truth domain + schema → Tom-gated per the boot kernel; I do not author
   or push backend autonomously.)*
3. **Portal lane** (`gt-factory-os-portal`): the two surfaces in §4, built against
   the real contract, full gate (tsc / vitest / build / eslint) + a tranche.
4. **Merge + deploy** — yours, per the locked kernel.

## 8. Why it's good (the value, in one line)
It closes the stock-truth loop exactly where money is about to move: procurement
surfaces *which* numbers are decision-critical and uncertain; the count form acts on
exactly those; the corrected stock flows back into the buy — so counting effort goes
only where it changes a purchase, and Excel stops carrying that risk.
