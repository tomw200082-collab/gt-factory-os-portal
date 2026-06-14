# Tranche 070 — copy & terminology polish (P2)

status: implemented (branch `claude/admin-pages-uxui-testing-pyyurn`; Tom merges)
evidence: tsc --noEmit clean · vitest 673/673 (83 files) · next build OK ·
eslint 0 errors. Pure UI copy; Playwright not runnable in this environment.
source: consolidated admin UX/UI audit (2026-06-13, `docs/ux/admin-pages-uxui-audit-2026-06-13.md`)
THEME E tail — safe, text-only operator-clarity wins. No layout/visual-judgment
changes (global `size="section"`, shared SectionCard eyebrow, `.table-base`
restyle and the 22-file `<th scope>` pass are intentionally deferred — they
either need Tom's eyes on a preview or a dedicated mechanical pass).

language: English-first. No DB / backend / token / corridor edits.

## Scope (all pure UI copy)
- "live API" status badge → "Live data" (7 list headers): components, suppliers,
  items, supplier-items, planning-policy, sku-health, groups. (COPY-004)
- supplier-items terminology aligned to the page's own title "Sourcing links":
  eyebrow "Supplier-items" → "Sourcing links"; button "New supplier-item" →
  "New sourcing link". (COPY-073/074)
- groups — SQL field names / regex out of operator copy: section descriptions
  ("…come from items.product_group_key" → plain), key rule
  ("lower_snake only ([a-z0-9_]+)" → plain example), permanent-key note and the
  key input placeholder. (COPY-070/071/072)
- components — read-only field labels say what the operator can do, and the
  abbreviations are spelled out: "Code (locked)" → "Component ID (read-only)";
  "Stock/Purchase unit (locked)" → "(read-only)"; "Purchase → stock factor
  (locked)" → "Units per purchase pack (read-only)"; "MOQ (purchase UOM)" →
  "Min. order quantity (purchase unit)". (COPY-018/019/020)

## File manifest
- `docs/portal-os/tranches/070-copy-terminology-polish.md` — this plan.
- `docs/portal-os/tranches/_active.txt` · `docs/portal-os/registry.md`.
- `src/app/(admin)/admin/components/page.tsx`
- `src/app/(admin)/admin/suppliers/page.tsx`
- `src/app/(admin)/admin/items/page.tsx`
- `src/app/(admin)/admin/supplier-items/page.tsx`
- `src/app/(admin)/admin/planning-policy/page.tsx`
- `src/app/(admin)/admin/sku-health/page.tsx`
- `src/app/(admin)/admin/groups/page.tsx`

## Verification gate
- `tsc --noEmit` clean · `vitest run` green · `next build` OK · `eslint` 0 errors.
