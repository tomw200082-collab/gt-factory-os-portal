# Tranche 024: Operator forms — top-tier UI/UX design pass

status: in-progress
created: 2026-05-25
scorecard_target_category: ux_polish
expected_delta: major (visual hierarchy, typography, density; no behavior change)
sizing: L (8 files, 100-iteration design campaign)

## Why this tranche

Tom direct request (2026-05-25): "use the frontend design skill and do 100
iterations of design improvements across all forms. Forms should be perfect
for usability and beauty. Not a lot of confusing text, relatively large
fonts and bold where needed. Think like a graphic designer and UI expert
at the highest level in the world."

Tranche 023 closed the emoji→Lucide polish on receipts. Tranche 024 takes
the next leap on the five operator forms (waste, physical count, production
actual, goods receipt, manual PO) and the three approval surfaces (waste
approval, physical count approval, inline approval card on inbox).

## Design principles applied

**Typography hierarchy**
- Hero numeric inputs (counted_qty, output_qty, scrap_qty, line.quantity)
  rendered at `text-4xl` to `text-5xl` with `font-mono tabular-nums`.
  These are the operator's primary point of focus on every screen and
  must read effortlessly.
- Field labels promoted from `text-3xs uppercase tracking-sops` (10px,
  enterprise-y) to `text-sm font-semibold` (14px, modern + readable).
- Section headings use `text-lg font-bold` so the form's structure
  scans in one glance.
- Help / hint text stays small (`text-xs text-fg-muted`) but uses
  proper line-height so a 2-line hint reads as a sentence, not as two
  cramped lines.

**Less text**
- Workflow header descriptions trimmed to one sentence.
- Pre-submit panels are bullet-free single statements where possible.
- Result banners lead with the outcome verb in bold, then minimal detail.
- Field placeholders shortened.

**Visual weight**
- Primary action buttons (Submit / Approve / Post): `btn-lg` or
  `btn-primary` with explicit `text-base font-semibold`.
- Secondary actions (Reset / Cancel): `btn-ghost` muted, smaller weight.
- Destructive actions (Reject) keep `btn-danger`.

**Spacing scale**
- Form section gap: `space-y-6` (24px) — more breathing room.
- Field-to-field gap inside a section: `gap-4` (16px).
- Sticky bar bottom safe-area padding so the submit always lands on
  the thumb on iPhone.

**Color discipline**
- Color reserved for status (success / warning / danger / info / accent).
- Body text uses the neutral scale (`fg`, `fg-muted`, `fg-subtle`).
- Decorative chips lose tone color when not communicating status.

**Iconography**
- All emoji removed (continues Tranche 023's discipline).
- Inline SVG for context-specific icons; Lucide for shared icons.
- Consistent 14-16 px next to body text, 18-24 px in card heads, 32+ px
  in result banners.

**Mobile-first (390 px)**
- One-column layout below `sm`.
- Touch targets ≥ 44 px.
- Input font-size ≥ 16 px (iOS auto-zoom prevention is already enforced
  globally; verify each form still consumes the `.input` class).
- Sticky submit bar reachable without scrolling past it.

## Scope

Files included:
- `src/app/(ops)/stock/waste-adjustments/page.tsx`
- `src/app/(ops)/stock/physical-count/page.tsx`
- `src/app/(ops)/stock/production-actual/page.tsx`
- `src/app/(ops)/stock/receipts/page.tsx`
- `src/app/(po)/purchase-orders/new/page.tsx`
- `src/app/(inbox)/inbox/approvals/waste/[submission_id]/page.tsx`
- `src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx`
- `src/features/inbox/approval-inline-card.tsx`

Plus the WorkflowHeader / SectionCard shared components if a structural
adjustment is required (will be documented per change).

## Out of scope

- No backend contract changes.
- No new endpoints, fields, enums, status names, or reason codes.
- No locked-decision semantic changes.
- No removal of any action affordance (only restyling).
- No new tranche-wide design token additions to `globals.css` —
  per-form Tailwind utilities only.

## Verification

Per iteration:
- `npx tsc --noEmit` must remain clean.

End of tranche:
- `npm run test` for unit tests in scope (waste schema, production
  simulation) must pass.
- Mobile smoke test (`tests/e2e/mobile-operator-forms-smoke.spec.ts`)
  must continue to pass (font-size floor + SSR + WorkflowHeader visible).
