# Tranche 066 — admin route consolidation (BOM + item detail)

status: implemented (branch `claude/admin-pages-uxui-testing-pyyurn`; Tom merges)
evidence: tsc --noEmit clean · vitest 663/663 (81 files; re-anchored
items-bom-display-only doctrine to masters/items, green) · next build OK.
Playwright not runnable in this environment — the BOM smoke goto was repointed to
the canonical route but not executed here.
source: consolidated admin UX/UI audit (2026-06-13, `docs/ux/admin-pages-uxui-audit-2026-06-13.md`),
THEME C "route duplication". Tom's decisions (2026-06-13):
  1. BOMs — keep the canonical `/admin/masters/boms` tree; the legacy `/admin/boms`
     tree becomes redirects (the duplicate ~1588-line legacy editor stops being a
     destination).
  2. Items — merge the two parallel detail surfaces into one. The survivor is the
     authority-designated canonical `/admin/masters/items/[item_id]` (CLAUDE.md
     Recipe-Readiness corridor; the items list already links there). The parallel
     "Product 360" at `/admin/products/[item_id]` becomes a redirect.

rationale (item direction): `masters/items` is the more operationally complete
surface (Overview / BOM / Supplier-items / Anchors / Policy / Exceptions) and uses
canonical `/admin/masters/boms/` links. Product 360's *unique* tabs are Aliases
(real, but alias management has a dedicated surface at `/admin/sku-aliases`),
Planning (stub — "Gate 5 not yet available") and History (stub — "Gate 3 not yet
live"). Consolidating onto `masters/items` keeps Exceptions/Anchors/Policy and loses
only a duplicated capability + two stubs.

note: gutting Product 360 (1945 lines) is reversible via git. Surfaced in the PR so
Tom can object to the direction. Alias management remains at `/admin/sku-aliases`.

## File manifest

Group A — BOM consolidation:
- `docs/portal-os/tranches/066-admin-route-consolidation.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — set to 066 while active; cleared at close.
- `src/app/(admin)/admin/boms/page.tsx` — A1: redirect → `/admin/masters/boms`.
- `src/app/(admin)/admin/boms/[head_id]/page.tsx` — A2: redirect →
  `/admin/masters/boms/[head_id]`.
- `src/app/(admin)/admin/boms/[head_id]/versions/[version_id]/page.tsx` — A3:
  redirect → `/admin/masters/boms/[head_id]/[version_id]`.
- `src/app/(admin)/admin/components/page.tsx` — A4: "Used in" link repointed from
  the silently-ignored `/admin/boms?head=` filter to the specific canonical head
  `/admin/masters/boms/[headId]`.
- `tests/e2e/admin-routes-smoke.spec.ts` — A5: BOM smoke `goto("/admin/boms")` →
  `goto("/admin/masters/boms")` (canonical; was already asserting the canonical
  "Bills of materials" heading).

Group B — item detail consolidation:
- `src/app/(admin)/admin/products/[item_id]/page.tsx` — B1: redirect →
  `/admin/masters/items/[item_id]`.
- `src/app/(admin)/admin/items/[item_id]/page.tsx` — B2: legacy redirect repointed
  from Product 360 to canonical `/admin/masters/items/[item_id]` (matches the items
  list row links).
- `src/app/(admin)/admin/products/new/page.tsx` — B3: wizard publish success
  `router.push` → `/admin/masters/items/[item_id]`.
- `tests/unit/admin/items-bom-display-only.test.ts` — B4: re-anchor the
  "detail renders linked BOM read-only" doctrine from `products/[item_id]` (now a
  redirect) to `masters/items/[item_id]`; update the BOM-link assertion to the
  canonical `/admin/masters/boms/` path.

## Verification gate
- `tsc --noEmit` clean.
- `vitest run` green (incl. updated `items-bom-display-only`).
- `next build` succeeds.
- No new inbound links to the now-redirected legacy routes; existing stragglers
  resolve transparently via the redirects.
