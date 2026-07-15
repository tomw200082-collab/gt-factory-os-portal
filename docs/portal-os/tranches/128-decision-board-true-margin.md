# Tranche 128 — Decision Board: true gross margin (CM2) + in-page operating costs

**Status:** ACTIVE
**Corridor spec:** `gt-factory-os/SPEC.md` (Decision Board true-gross-profit corridor; §T4 is this tranche)
**Backend contract:** `GET /api/v1/queries/unit-economics` + `PATCH /api/v1/mutations/economics/operating-costs` (gt-factory-os PR #166 — migrations 0282/0283, unit_economics_route)
**Authorized by:** Tom, 2026-07-15 (this session: "נלך עם ההמלצה שלך… שבדף עצמו תהיה אופצייה להוסיף את כל עלויות התפעול הנדרשות")

## Goal

The Product Decision Board stops showing material-only margin computed from a
manual price and starts showing **true gross margin (CM2)** from the server's
unit-economics read model: realized Shopify revenue first, operating costs
(labor / overhead / channel fees / shipping) applied server-side, a target
price per product, and an **in-page Operating-costs drawer** where Tom
maintains the cost lines.

**SPEC §V.1 (the page-level law this tranche lands):** no money semantic is
computed in the browser. Every ₪/% rendered traces to a named field of the
GET response. Allowed client work: sort, filter, format, and Σ/max of
server-provided columns for display grouping (segment cards, bar scaling).

## Scope — files this tranche may touch

- `docs/portal-os/tranches/128-decision-board-true-margin.md` (this manifest)
- `docs/portal-os/tranches/_active.txt`
- `src/app/api/unit-economics/route.ts` (new GET proxy)
- `src/app/api/economics/operating-costs/route.ts` (new PATCH proxy)
- `src/app/(economics)/admin/decision-board/page.tsx` (rebuild on new contract)
- `src/app/(economics)/admin/decision-board/OperatingCostsDrawer.tsx` (new)
- `tests/e2e/decision-board.spec.ts` (assertions follow the new copy; testids unchanged)
- `docs/portal-os/registry.md` (one index row)

## Checklist

- [x] GET/PATCH proxies follow `src/lib/api-proxy.ts` contract (API_BASE, SSR session, bearer forward).
- [x] Page consumes `/api/unit-economics` only; the in-browser derivation block (old page.tsx:236-330 — velocity map, contribution/revenue math, decision thresholds, median) is DELETED.
- [x] Decision, contribution, totals, target price, fees ₪, waterfall components all come from the server response.
- [x] Operating-costs drawer: lists cost_model rows (GLOBAL first), edit value/active/basis, add line, PATCH batch, invalidate query on success. English UI (route not in the Hebrew exception list).
- [x] Inspector shows the CM2 waterfall (price → fees → CM1 → opex → per-order → CM2) + target price + price-basis / anomaly / stale badges.
- [x] Table: CM2 % ("True margin %"), Contribution 90d, Target price columns; sort keys updated.
- [x] Verdict band ranks by CM2 (server totals); vitals from totals.
- [x] Stale-sync banner when any row `stale=true`; anomaly badge on `price_anomaly=true` rows (SPEC §V.13/§V.14).
- [x] Locked testids preserved: `decision-board`, `verdict-band`, `segments`, `segment-<key>`, `quadrant`, `inspector` (SPEC §V.7) — e2e content assertions are item-name-based, no spec edit needed.
- [x] `npx tsc --noEmit` clean (exit 0); `npx vitest run` green (886/886); e2e execution pending a live app+API with migrations 0282/0283 applied — not runnable in this container.
- [x] No `.env*`, no `X-Fake-Session`/`X-Test-Session`, no files outside this manifest (tranche renumbered 122→128 on collision with the DR-018 batch renumbering).

## Notes

- Target price omits the per-order component for products with no 90d sales
  (server allocates 0 — SPEC §V.11); the drawer/tooltip says so.
- The old `/api/economics` proxy remains untouched — the Economics page
  (ProfitabilityTab) still consumes it (SPEC §V.6).
- Trend arrow compares the two server-provided unit counts (prev vs current
  90d) — quantity presentation, not money math.

## Evidence

- (fill at close) typecheck/vitest outputs, commit SHAs, screenshots.
