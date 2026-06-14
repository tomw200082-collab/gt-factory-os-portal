# Tranche 069 — operator copy clarity + last modal a11y

status: implemented (branch `claude/admin-pages-uxui-testing-pyyurn`; Tom merges)
evidence: tsc --noEmit clean · vitest 673/673 (83 files) · next build OK ·
eslint 0 errors · zero HTTP-code prefixes and zero internal refs
(GAP-AHC/W1/soft-delete/Edge Function/live DB/"Failed to load") left in (admin).
Playwright not runnable in this environment.
source: consolidated admin UX/UI audit (2026-06-13, `docs/ux/admin-pages-uxui-audit-2026-06-13.md`)
THEME E (microcopy) + the last remaining P0 a11y (holiday ModalShell focus).

language: English-first (no Recipe-Readiness corridor surfaces touched).
No DB / backend / token-file edits — UI copy + one modal-primitive a11y rebuild.

## Scope

A11y (P0 — A11Y-008):
- `ModalShell` (holidays) rebuilt on Radix Dialog → real focus trap, Escape,
  focus return, aria-modal, aria-labelledby (auto, unique per instance — fixes
  the duplicate `id="modal-title"`).

Copy P0 — raw HTTP status/code in operator error banners (COPY-002/008/015/…):
- Drop the `${err.status}${err.code}: ${err.message}` prefix → just `err.message`
  (already a human string / friendly fallback from AdminMutationError) across:
  items, suppliers, components, supplier-items, planning-policy,
  masters/components/[component_id], groups.

Copy P0 — internal/developer references in operator text:
- holidays — strip "Soft-deleting", "W1 cycle 8", "GAP-AHC-1", "archived_at",
  "diff against the live DB", "upsert/skip-existing" option labels.
- jobs — strip "W1 migrations / Edge Functions", "jobs registry"/cron caveat.

Copy P1 — unfriendly load-error templates:
- jobs / users / integrations — "Failed to load X" → actionable sentence.

Copy P0/P1 — raw enum option text → human (value attr unchanged):
- supplier-items approval status (approved/pending/rejected → Title Case),
- sku-health supply-method filter (MANUFACTURED/BOUGHT_FINISHED → human),
- products/new supply-method select (MANUFACTURED/BOUGHT_FINISHED/REPACK → human).

## File manifest
- `docs/portal-os/tranches/069-operator-copy-clarity.md` — this plan.
- `docs/portal-os/tranches/_active.txt` · `docs/portal-os/registry.md`.
- `src/app/(admin)/admin/holidays/page.tsx` — ModalShell→Radix + copy scrub.
- `src/app/(admin)/admin/jobs/page.tsx` — copy scrub + error template.
- `src/app/(admin)/admin/users/page.tsx` — error template.
- `src/app/(admin)/admin/integrations/page.tsx` — error template.
- `src/app/(admin)/admin/items/page.tsx` — HTTP-code prefix drop.
- `src/app/(admin)/admin/suppliers/page.tsx` — HTTP-code prefix drop.
- `src/app/(admin)/admin/components/page.tsx` — HTTP-code prefix drop.
- `src/app/(admin)/admin/supplier-items/page.tsx` — HTTP-code prefix drop + enum text.
- `src/app/(admin)/admin/planning-policy/page.tsx` — HTTP-code prefix drop.
- `src/app/(admin)/admin/masters/components/[component_id]/page.tsx` — HTTP-code drop.
- `src/app/(admin)/admin/groups/page.tsx` — HTTP-code prefix drop.
- `src/app/(admin)/admin/sku-health/page.tsx` — enum filter text.
- `src/app/(admin)/admin/products/new/page.tsx` — supply-method option text.

## Verification gate
- `tsc --noEmit` clean · `vitest run` green · `next build` OK · `eslint` 0 errors.
