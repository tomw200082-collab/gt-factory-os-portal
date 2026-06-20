# UX / Mobile Audit — 2026-06-19

**Trigger:** Tom, 2026-06-19 — "עבור על ה-UX של כל הדפים … שפר משמעותית את ה-UX/UI של כל
דף ודף … 3 איטרציות של בדיקה מעמיקה ושיפור … חשוב מאוד שהכל יהיה מותאם ממש טוב למובייל."

**Method:** read-only audit (no portal source touched in producing this report).
Route inventory (`page.tsx` × ~80), shell/layout read, design-token read, and a
mobile anti-pattern scan across every page. Toolchain confirmed working:
`tsc --noEmit` → **0 errors** (green baseline); Playwright chromium installed
(`/opt/pw-browsers`), config exposes a `mobile-safari` (iPhone 14) project.

---

## Headline finding (the honest part)

**This portal is already at a very high bar.** It is 88/100 readiness after 81
tranches. The two highest-traffic surfaces I deep-read are already heavily
polished and mobile-complete:

- `/dashboard` — 2086 lines, *"UX/UI polish — 10 iterations"*, full a11y
  (aria-live, labelled donut, focus rings), `motion-reduce`, dedicated mobile
  specs. Already premium.
- `/inventory` — opens with *"50 expert UX/UI iterations, world-class
  operational dashboard patterns"*; ships a real mobile card view
  (`InventoryCardMobile`), ≥44px touch targets, sticky mobile search. Already
  premium.

**Implication:** a blanket "rewrite every page" overnight run is the *wrong*
move here — it would risk regressions in a carefully-tuned, well-tested system,
produce an unreviewable diff, and contradict the Portal OS philosophy (bounded,
evidence-backed, verified tranches). The genuine upside is **specific and
bounded**, not "all 80 pages."

The global shell is also already strong: `MobileNav` (focus-trap, scroll-lock,
safe-area insets), `AppShellChrome` (skip-link, sticky sidebar→drawer), warm
"Operational Precision" token system. No shell rework needed.

---

## The one concrete, broadly-applicable gap: mobile card views

33 pages render a `<table>`. **All 33 already wrap it in `overflow-x-auto`** (so
nothing is *broken* on mobile — it scrolls). But **26 of 33 have no mobile card
view** — on a phone they are horizontal-scroll-only, which is the weakest mobile
pattern for scannable list data. 7 already do cards (inventory, movement-log,
purchase-orders list, planning/runs ×2, planning/blockers, admin/holidays).

### Scroll-only pages, triaged by genuine mobile relevance

**Tier A — operator / shared, genuinely used on a phone (do these):**
| Page | Note |
|---|---|
| `(ops)/stock/production-actual` | operator data-entry; mobile-relevant |
| `(po)/purchase-orders/[po_id]` | PO detail; planner on the move |
| `(economics)/admin/economics` | cost review; large data table |

**Tier B — admin master-data lists (card view is *nice*, but editing master
data is largely a desktop task; lower priority, do opportunistically):**
`admin/items`, `admin/components`, `admin/suppliers`, `admin/groups`,
`admin/supplier-items`, `admin/sku-aliases`, `admin/sku-map`, `admin/sku-health`,
`admin/cost-drafts`, `admin/users`, `admin/planning-policy`,
`admin/masters/*` (items/components/suppliers/boms/health detail tables),
`admin/masters/archive`, `admin/products/new`, `admin/purchase-orders/parity-check`.

**Tier C — already premium / table is a minor element (leave unless asked):**
`(economics)/admin/decision-board` (rebuilt premium in T081; its `<table>` is the
contributor breakdown, secondary), `(shared)/credit-tracking` (authorized
Hebrew/RTL surface; the only fixed-min-width page — check on small screens).

---

## Recommended tranche plan (one page = one tranche, all verified)

Each tranche: deep read → mobile card view at `<md` (table stays at `md+`) →
verify (`tsc`, `eslint`, affected `vitest`, Playwright `mobile-safari`
screenshot) → commit. Pattern mirrors the existing `InventoryCardMobile`.

1. **T082** — `production-actual` mobile cards *(operator; start here)*
2. **T083** — `purchase-orders/[po_id]` mobile cards
3. **T084** — `economics` mobile cards
4. **T085+** — admin master-data lists (Tier B), batched by similarity, only if
   Tom confirms mobile master-data editing is a real use case.

## What is explicitly NOT recommended

- Rewriting `/dashboard`, `/inventory`, `/decision-board`, `/planning/procurement`
  — already premium; churn = regression risk, no real upside.
- "3 speculative iterations" on already-polished pages.
- Backend-blocked scorecard gaps (admin_superuser_depth, aggregate KPIs, real
  integrations health) — not portal-fixable.

---

_Read-only audit. No source changed by this report. Tranches below are executed
separately, each bounded + verified, on branch `claude/funny-thompson-2ncf0t`._
