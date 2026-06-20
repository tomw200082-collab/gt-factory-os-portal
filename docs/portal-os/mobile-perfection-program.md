# Mobile-Perfection Program (2026-06-19, Tom-directed)

Tom: make **every page perfect on mobile**, using the `ui-ux-pro-max` skill +
**Playwright to actually see** each page at phone width and iterate. Full
3-iteration treatment per page **including** already-premium pages (they were
never iterated with this skill). Autonomous, overnight.

## Priority order (Tom)
1. **Planning** (the `(planning)` route group)
2. **Dashboard** (`(shared)/dashboard`) — *most important*
3. **Inventory** (`(shared)/inventory`) **+ bulk-count** (`(ops)/inventory/bulk-count`)
4. Everything else (ops stock, inbox, po, admin, economics, auth)

## PROVEN visual-iteration recipe  ⚠️ keep this exact
The dev-shim auth needs an env flag, and `pkill`/`sleep` break in this sandbox.

```bash
# from repo root. tool timeout ~240000ms. NO pkill, NO sleep.
NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true \
  npx playwright test tests/e2e/_shot.spec.ts --project=chromium
```
- Harness: `tests/e2e/_shot.spec.ts` (scratch, untracked, tagged `@shot` so CI's
  `--grep @mocked` never runs it). Edit its mocks per page.
- `test.use({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })` = iPhone 14.
- Auth: `setFakeRole(page, "planner"|"operator"|"admin")` from `./helpers`.
- Mocks: `page.route("**/api/**", r=>r.fulfill({status:200,contentType:"application/json",body:"{}"}))`
  generic fallback FIRST, then specific `page.route("**/api/x", r=>r.fulfill({json:{...}}))`.
  (Playwright matches in reverse-registration order — specifics win.)
- Screenshot to `/tmp/shots/<page>.png` (keep out of repo). `fullPage:true` for the
  whole page; drop it for above-the-fold. Then Read the PNG.
- Server reuse: Playwright tears its webServer down on exit; just re-run.

## ui-ux-pro-max mobile rubric (the bar)
CRITICAL: touch targets ≥44×44px, ≥8px between targets; **no horizontal scroll**;
body text ≥16px (avoids iOS auto-zoom on inputs); visible focus rings; color never
the only signal; safe-area insets; `min-h-dvh` not `100vh`. HIGH: mobile-first,
content priority (core first), 4/8px spacing rhythm, sticky toolbars reserve space,
tabular-nums for data, truncation+title over overflow. Respect `prefers-reduced-motion`.

## Per-page loop (3 iterations)
1. **See**: add page+mocks to `_shot.spec.ts`, run recipe, Read PNG. Note issues vs rubric.
2. **Fix** iteration 1 → re-shot → compare.
3. **Refine** iteration 2–3 (touch targets, overflow, density, safe-area) → re-shot.
4. Verify: `tsc --noEmit` 0, `npx eslint <page>` 0 errors. Commit as a tranche
   (NNN, manifest = page + this doc + _active.txt + registry). Push.

## Progress tracker
| # | Page | Status | Tranche | Notes |
|---|------|--------|---------|-------|
| – | (toolchain) | ✅ proven | – | recipe works; iPhone-14 shots OK |
| 1 | /planning | ◑ partial | T085 | SubNav→44px touch targets (shared, all planning pages). Page itself already mobile-solid. |
| 2 | /dashboard | ▢ todo | – | first shot looks OK; needs real iteration |
| 3 | /inventory | ▢ todo | – | already has InventoryCardMobile |
| 4 | /inventory/bulk-count | ▢ todo | – | |
| … | rest | ▢ | – | per priority |

> Already-shipped mobile-card tranches (pre-program): T082 suppliers, T083 items,
> T084 components.
