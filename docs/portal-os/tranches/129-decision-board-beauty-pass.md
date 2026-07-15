# Tranche 129 — Decision Board beauty pass (visual elevation + gate conditions C1/C2/C5)

**Status:** BUILT — awaiting Tom's visual sign-off before merge (design = client's call)
**Authorized by:** Tom, 2026-07-15 ("תעשה את הדף הזה יפייפה!" — /frontend-design + /ui-ux-pro-max + /deepen)
**Follows:** tranche 128 (CM2 rebuild, merged in PR #169). Corridor SPEC invariants still bind — V1 (no money math in browser), V7 (locked testids).

## Design thesis

Stay inside the portal's "Operational Precision" system (product consistency over
one-off novelty). Spend the boldness in ONE place: the portfolio map's
negative-margin region gets **factory-floor hazard striping** — diagonal caution
stripes in oxidized red, the factory's own visual language for "dangerous
territory". Everything else is disciplined refinement: an orchestrated page-load
reveal, numeric typography with a de-emphasized ₪, proportional waterfall bars in
the Inspector, drawer slide-in, and precision spacing.

## Scope — files this tranche may touch

- `docs/portal-os/tranches/129-decision-board-beauty-pass.md` (this manifest)
- `docs/portal-os/tranches/_active.txt`
- `src/app/(economics)/admin/decision-board/decision-board.css` (new — page-scoped: reveal keyframes, reduced-motion gate, drawer slide-in)
- `src/app/(economics)/admin/decision-board/page.tsx`
- `src/app/(economics)/admin/decision-board/OperatingCostsDrawer.tsx`
- `tests/e2e/decision-board.spec.ts` (only if an assertion needs alignment; testids unchanged)
- `docs/portal-os/registry.md` (one index row)

NOT touched: `tailwind.config.ts`, `globals.css`, `portal_ux_standard.md` (frozen);
all styling additions live in the page-scoped CSS file.

## Checklist

- [x] Signature: hazard-stripe SVG pattern over the below-zero quadrant region + "loss zone" caption; subtle (≤12% opacity), meaning-first.
- [x] Page-load orchestration: verdict → vitals → segments → map → table staggered reveal (~60ms steps, ease-out); fully disabled under `prefers-reduced-motion` (gate condition **C5**).
- [x] Numeric type treatment: vitals amounts larger (1.75rem, leading-none, tabular-nums). The ₪-shrink `MoneyDisplay` splitter was CUT during the self-critique pass (Chanel rule — parsing the formatted string added risk for marginal gain; the size/rhythm upgrade carries the moment).
- [x] Inspector waterfall: proportional mini-bars per line (width = served value ÷ served unit price — display scaling only, SPEC V1 intact).
- [x] Gate **C1**: transient "Costs saved" confirmation chip (role="status", auto-dismiss ~4.5s) after a successful drawer save, alongside the Recalculating indicator.
- [x] Gate **C2**: on viewports < lg, selecting a product scrolls the Inspector into view.
- [x] Drawer: slide-in/fade entrance (reduced-motion safe), on/off switch hit-area ≥44px, section rhythm pass.
- [x] Table: hover/active left accent bar in decision color; refined transitions.
- [x] Locked testids preserved (SPEC V7): decision-board, verdict-band, segments, segment-<key>, quadrant, inspector.
- [x] Oracles: tsc 0 · eslint 0 · vitest green · decision-board e2e green · fresh desktop+mobile shots reviewed (self-critique pass — remove one accessory).
- [x] English-only copy; no new fonts, no new global tokens (C3 stays open by design — palette remains the JS map).

## Evidence

- tsc 0 · eslint 0 · vitest **886/886** · decision-board e2e **1/1** (tap + keyboard paths through the animated page).
- Self-critique loop on rendered shots: caught + fixed a bubble-label collision with the quadrant captions (labels now drop below the bubble inside the caption band). Shots: /tmp/ux-shots-v4 (pre-fix), /tmp/ux-shots-v5 (final).
- Gate conditions closed this tranche: **C1** (saved chip, role=status, 4.5s), **C2** (mobile scrollIntoView on select), **C5** (prefers-reduced-motion kills all page-owned motion via decision-board.css). Remaining from the 128 gate: C3 (palette tokens — needs Tom token authorization), C4 (target_pct affordance — product decision).
- ui-ux-pro-max --design-system consulted; its generic blue/Fira system deliberately REJECTED in favor of the portal's Operational Precision identity (reasoning in tranche header). Adopted from it: row hover accents, 150-300ms transitions, reduced-motion, no ornament.
