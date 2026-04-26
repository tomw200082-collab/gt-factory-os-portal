# Inventory Flow — Canonical Portal Pattern Audit (Mode A handoff)

**Authored:** 2026-04-25 by executor-w2 (Mode A only).
**Authority basis:** No `RUNTIME_READY(InventoryFlow)` exists in `.claude/state/runtime_ready.json`. This document writes zero portal code. It maps existing canonical primitives, hooks, proxy patterns, and conventions that a future Mode B-InventoryFlow dispatch would consume to author `/planning/inventory-flow` per the Tom-approved plan at `C:/Users/tomw2/.claude/plans/robust-orbiting-rabin.md`.

**Cite-by-path discipline:** every file path below has been verified to exist via Read/Glob/ls during audit. Broken citations would be `assumption_failure`; none observed.

---

## §1 Existing Weekly Outlook surface inventory

### §1.1 Page being replaced

- **Path:** `src/app/(planning)/planning/weekly-outlook/page.tsx`
- **Shape:** `"use client"` page, default export `WeeklyOutlookPage`.
- **Single hook:** `useQuery<WeeklyOutlookResponse>` with `queryKey: ["inventory","weekly-outlook"]`, `staleTime: 5 * 60_000`, `retry: false`.
- **Response shape (inlined types in the file):**
  - `WeeklyOutlookResponse = { run_id, run_executed_at, planning_horizon_start_at, planning_horizon_weeks, rows[], count }`
  - `WeeklyOutlookRow = { item_id, item_name, supply_method, period_bucket_key, demand_qty, available_qty, projected_on_hand, shortage_flag, shortage_date, po_inbound_qty }` — all numerics returned as `string` (Postgres `numeric` over the wire).
- **Layout:** matrix table, items × weeks. Cell helper `cellClass()` maps `(projected_on_hand, shortage_flag)` → `bg-success-softer | bg-warning-softer | bg-danger-softer` with matching `text-*-fg` foreground.
- **Composes:** `<WorkflowHeader>` from `@/components/workflow/WorkflowHeader`. No other primitive imports.
- **Status flow:** isLoading → isError → !run_id → empty weeks → render. All four use plain divs, NOT the `<EmptyState>`/`<LoadingState>` primitives in `feedback/states.tsx` — small reuse gap, not a blocker.

### §1.2 Proxy being deprecated

- **Path:** `src/app/api/inventory/weekly-outlook/route.ts` (16 lines).
- **Shape:** single `GET` exporting a call to `proxyRequest(req, { method: "GET", upstreamPath: "/api/v1/queries/inventory/weekly-outlook", errorLabel: "inventory weekly-outlook" })`.
- **Helper:** `@/lib/api-proxy` (see §3).

### §1.3 Nav entry to rename

- **Path:** `src/lib/nav/manifest.ts` lines 218–224. Current entry:
  ```
  { href: "/planning/weekly-outlook", label: "Weekly Outlook", icon: CalendarDays, min_role: "viewer", required_capability: "planning:read" }
  ```
- **Plan §Phase 12.1:** rename label → `"Inventory Flow"`, repoint href → `/planning/inventory-flow`. Keep `CalendarDays` icon (or swap for `Activity` / `LineChart` per visual taste).
- **CI guard:** `scripts/check-no-persona-in-urls.mjs` enforces no route-group leakage. The new URL `/planning/inventory-flow` is domain-first → passes.

### §1.4 TanStack Query hooks consuming the weekly-outlook endpoint

- **Only consumer:** `src/app/(planning)/planning/weekly-outlook/page.tsx` itself (inline `useQuery`). No shared hook file.
- **No second consumer found** via grep of `inventory/weekly-outlook` across `src/`. The hook is single-call-site; the new `useInventoryFlow.ts` will not collide with any existing cache key.

---

## §2 Reusable primitives map

Every primitive cited below was verified via `ls src/components/<dir>/` during the audit. New components mark `NEW` only when no existing analog exists.

| Plan component (per Files map) | Existing primitive(s) to consume | Notes |
|---|---|---|
| `HeroBar.tsx` | `src/components/dashboard/KpiTiles.tsx`; `src/components/badges/StatusBadge.tsx` (`Badge` named export); `src/components/workflow/WorkflowHeader.tsx` for the page eyebrow above it | `KpiTiles` is the existing 4-card row pattern reused on `/dashboard`. Use it verbatim; pass tone per risk tier. |
| `FilterBar.tsx` | `src/components/data/SearchFilterBar.tsx` (existing primitive) | Plan Appendix already calls this out; primitive confirmed present. |
| `FlowGridDesktop.tsx` | `src/components/workflow/SectionCard.tsx` to wrap; pure CSS grid for inner | NEW composition. No existing matrix-grid primitive — `weekly-outlook/page.tsx` rolls its own `<table>`. The Plan §Phase 8.7 spec (`grid-template-columns: 320px repeat(14, 64px) 16px repeat(6, 96px)`) is outside any existing primitive; build inline. |
| `StickyItemPanel.tsx` | `Badge` (StatusBadge); `cn` from `@/lib/cn`; tier-strip = inline 4px `bg-{tone}` div | NEW. No sticky-left-rail primitive exists. |
| `DayCell.tsx` | `cn` utility; design tokens (success/warning/danger softer/fg) from `tailwind.config.ts` | NEW. 64×52 cell — pure JSX + Tailwind. |
| `WeekCell.tsx` | same as `DayCell` | NEW; 96×52. |
| `DayHeaderRow.tsx` | none; pure layout | NEW. |
| `ExpandedItemRow.tsx` | `SectionCard` for the two columns; existing tables convention from `weekly-outlook/page.tsx` | NEW composition. |
| `DayPopover.tsx` | **GAP** — see §8. Plan Appendix says "Radix Popover (already a transitive dep via shadcn)". **Verified false:** `package.json` only declares `@radix-ui/react-dialog ^1.1.15`. No `@radix-ui/react-popover` and no shadcn config in repo. Either install `@radix-ui/react-popover` (smallest delta) or implement an inline DOM-positioned popover. | Recommend: add `@radix-ui/react-popover` as a dependency tranche before component authoring, NOT inside Mode B-InventoryFlow. This is a substrate change. |
| `MobileCardStream.tsx` | Pure stack. None reusable. | NEW. |
| `MobileItemCard.tsx` | `Badge`; `cn` | NEW. |
| `AdminHolidaysPage` | `src/app/(admin)/admin/users/page.tsx` is the gold model (see §7). Reuses `WorkflowHeader`, `SectionCard`, `Badge`, `useQuery` + `useMutation` + `useQueryClient`. | NEW page; pattern fully precedented. |

Additional cross-cutting consumables (not in plan Files map but should be reused):

- `src/components/badges/FreshnessBadge.tsx` — props `{label, lastAt, warnAfterMinutes, failAfterMinutes, compact}`. Computes `formatAgo()` internally. Plan §Phase 9.6 names `StaleNotice`; `FreshnessBadge` is the existing primitive. `StaleNotice` does NOT exist; closest analog is the inline danger banner pattern in `weekly-outlook/page.tsx` lines 156–162. Treat as NEW component or re-use `<EmptyState>` with tone.
- `src/components/feedback/states.tsx` exports `EmptyState` and `LoadingState`. Plan §Phase 9.7 / §9.8 reference these by name; they exist.
- `src/components/workflow/WorkflowHeader.tsx`, `SectionCard.tsx`, `FieldGrid.tsx`, `FormActionsBar.tsx`, `ValidationSummary.tsx` — all confirmed present for admin holidays.

---

## §3 Proxy route pattern

### §3.1 Reference shape (the existing 16-line proxy)

`src/app/api/inventory/weekly-outlook/route.ts` (verbatim):

```ts
import { proxyRequest } from "@/lib/api-proxy";

// GET /api/inventory/weekly-outlook — proxy to Fastify API
//   GET /api/v1/queries/inventory/weekly-outlook

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/weekly-outlook",
    errorLabel: "inventory weekly-outlook",
  });
}
```

### §3.2 Helper

- **Path:** `src/lib/api-proxy.ts` (140 lines).
- **Public exports:** `proxyRequest(req, ProxyOptions)` and `ProxyOptions` interface.
- **`ProxyOptions`** fields: `method`, `upstreamPath`, `forwardBody?`, `forwardQuery?` (default = method==='GET'), `errorLabel`.
- **Auth chain:** reads `API_BASE` (or `NEXT_PUBLIC_API_BASE` fallback). Two paths: dev-shim (when `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH==='true'`, sets `x-test-session` header with hardcoded admin session) vs Supabase Bearer (`createSupabaseServerClient()` → `auth.getSession()` → `Authorization: Bearer <jwt>`). Missing session → 401. Upstream unreachable → 502 with `errorLabel`.
- **Status preservation:** mirrors upstream status + content-type back to caller.

### §3.3 Plan-mandated new proxies (Phase 6 §6.2)

Both files would follow this exact shape:

`src/app/api/inventory/flow/route.ts`:
- `GET` → `{ method: "GET", upstreamPath: "/api/v1/queries/inventory/flow", errorLabel: "inventory flow" }`
- `forwardQuery` defaults to `true` for GET (matches Plan §Phase 5.1 query schema: `start`, `horizon_weeks`, `family`, `supply_method`, `at_risk_only`).

`src/app/api/inventory/flow/item/[itemId]/route.ts`:
- Dynamic segment via Next 15 `{ params: Promise<{itemId: string}> }` await pattern (precedent: `src/app/api/users/[user_id]/route.ts` confirmed in `active_mode.json` Loop 14 entry).
- `GET` → `{ method: "GET", upstreamPath: \`/api/v1/queries/inventory/flow/item/${encodeURIComponent(itemId)}\`, errorLabel: "inventory flow item detail" }`.

`src/app/api/admin/holidays/route.ts`:
- `GET` (list) and `PATCH` (update) variants. PATCH uses `forwardBody: true` (auto when method is mutating).

**Plan §Phase 6.2 says** "validates the response against the schema (fail loud on contract mismatch)". No existing proxy in this portal does Zod validation at the proxy level — they pass-through bytes. Either add Zod validation only in the consuming hook, OR introduce a one-off pattern in this proxy. Recommend: validate in `useInventoryFlow.ts` (consumer side) to match house style.

---

## §4 TanStack Query pattern

### §4.1 Reference call site

`src/app/(admin)/admin/jobs/page.tsx` lines 35–43:

```ts
const { data, isLoading, error, refetch } = useQuery<{ rows: JobRow[] }>({
  queryKey: ["admin-jobs"],
  queryFn: async () => {
    const res = await fetch("/api/admin/jobs");
    if (!res.ok) throw new Error("Failed to load jobs");
    return res.json() as Promise<{ rows: JobRow[] }>;
  },
  refetchInterval: 60_000,
});
```

### §4.2 House style (consolidated from this and `weekly-outlook/page.tsx`)

- `queryKey` is an array of literals; no `as const` and no nested objects unless filter params demand it.
- `queryFn` is async, uses `fetch()` directly (no `axios`, no wrapper), throws `new Error("Failed to load X")` on `!res.ok`.
- `staleTime` typically `30_000` to `60_000` (recent dashboard work uses both); `refetchInterval: 60_000` is the canonical refresh cadence on auto-refreshing surfaces.
- `retry: false` is added on planning-data hooks where retries would mask shape errors (`weekly-outlook/page.tsx` line 86).
- Casting via `as Promise<T>` on the `res.json()` line — no zod parse in current consumers.
- Type interface defined inline above the hook (e.g., `WeeklyOutlookResponse`).

### §4.3 Plan-conformant `useInventoryFlow.ts` outline

The plan's Phase 6.3 snippet matches the house style exactly:
```ts
useQuery({
  queryKey: ['inventory-flow', params],
  queryFn: () => fetch(`/api/inventory/flow?${...}`).then(r => r.json()),
  refetchInterval: 60_000,
  staleTime: 30_000,
})
```

Recommendation: extract into `src/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow.ts` per plan; no shared `src/lib/hooks/` directory exists today (verified — `src/lib/` has no `hooks/` subdir; closest relevant lib is `src/lib/query/query-provider.tsx`).

---

## §5 Risk-tier color tokens map

### §5.1 Locked palette (per design doctrine)

`tailwind.config.ts` lines 54–86 define exactly four semantic palettes, each with `DEFAULT / soft / softer / fg / border`:

- **success** (HSL 146° — muted moss)
- **warning** (HSL 32° — burnt amber)
- **danger** (HSL 4° — oxidized red)
- **info** (HSL 210° — slate blue)

Plus accent (HSL 186° petrol teal) — reserved for primary actions, not status.

**There is no `emerald`, `amber`, `orange`, or `rose` palette.** Raw Tailwind color tokens must NOT be introduced; the project's UX/UI hardening tranches deliberately purged them.

### §5.2 Plan brainstorm palette → project tokens

The plan's locked decision #4 cites tier tints as "healthy=emerald, watch=amber, critical=orange, stockout=rose". This is **English-language shorthand only** — not Tailwind keys. Mapped to the project design system:

| Risk tier | Plan shorthand | Project token (use this) | Cell `bg` class | Cell `text` class | Border |
|---|---|---|---|---|---|
| `healthy` | emerald | `success` | `bg-success-softer` | `text-success-fg` | `border-success/40` |
| `watch` | amber | `warning` | `bg-warning-softer` | `text-warning-fg` | `border-warning/40` |
| `critical` | orange | `warning` (intensified) | `bg-warning-soft` (note: `soft` not `softer`) | `text-warning-fg font-semibold` | `border-warning/60` |
| `stockout` | rose | `danger` | `bg-danger-softer` | `text-danger-fg` | `border-danger/40` |
| `non_working` | (gray) | n/a | `bg-bg-muted` | `text-fg-faint` | `border-border/40` |

Distinguishing `watch` vs `critical` within the same `warning` palette is achieved via `soft` (deeper) vs `softer` (lighter) and weight, NOT via raw color. This matches the existing pattern in `weekly-outlook/page.tsx` where projected-on-hand intensity is implicit in the same three-tone palette.

### §5.3 Recommendation

- Use **project tokens only**. Risk tier → palette mapping is a pure-helper concern for `_lib/risk.ts` (Plan §Phase 7.3): `riskTierToCellClass(tier)` returns the exact Tailwind classes from the table above.
- Do NOT introduce `emerald-50`, `amber-100`, etc. — that would re-violate the discipline restored by the Loop-15 / UX hardening corridors (`active_mode.json` Loop 15: dashboard health tiles were intentionally re-tokenized; raw colors are gone from production paths).
- Reference: `weekly-outlook/page.tsx` `cellClass()` lines 63–72 already proves this pattern works for FG projections.

---

## §6 Mobile breakpoint pattern

### §6.1 Existing portal uses pure Tailwind responsive classes — no JS hook

Verified:
- `src/components/layout/AppShellChrome.tsx` lines 17–22 uses `md:gap-10`, `md:px-8`, `xl:px-10`, and `hidden ... md:block` to swap sidebar visibility. No `useMediaQuery`.
- `src/components/layout/MobileNav.tsx` exists but renders the mobile nav alongside (CSS-driven), it does not gate via JS hook.
- Grep across `src/` for `useMediaQuery` returns **zero** matches.
- Grep for `matchMedia` returns hits only inside Radix's dialog dist (irrelevant).

### §6.2 Plan §Phase 9.3 demands a JS-side switch

Plan code: `const isMobile = useMediaQuery('(max-width: 1023px)'); return isMobile ? <MobileCardStream /> : <FlowGridDesktop />;`

This is a **NEW substrate primitive**. Two options:

**Option A (recommended):** add `src/lib/hooks/useMediaQuery.ts` (NEW) — naming follows the existing `src/lib/cn.ts` flat-file convention (no `hooks/` dir today; create it). Implementation = the standard SSR-safe pattern with `useEffect` + `window.matchMedia`, returning `false` until `isMounted` to avoid SSR mismatch (the plan acknowledges this on §9.3 last line).

**Option B:** keep server-render-friendly: render BOTH layouts in DOM, gate via `block lg:hidden` (mobile) and `hidden lg:block` (desktop). Pros: zero JS, zero hydration mismatch. Cons: doubles render cost on cell counts ≈ 14 days × 60+ items.

**Recommendation for Mode B-InventoryFlow:** Option A. Author `src/lib/hooks/useMediaQuery.ts` as a small substrate add (≤30 LoC) inside Tranche A of the dispatch (see §9). Naming convention precedent: existing `src/lib/cn.ts`, `src/lib/display.ts`, `src/lib/env.ts`, `src/lib/user-initials.ts` — flat single-purpose `.ts` files. Adding `hooks/useMediaQuery.ts` (or `useMediaQuery.ts` flat) is conventional.

---

## §7 Admin page pattern (for `/admin/holidays`)

### §7.1 Gold-standard reference

**File:** `src/app/(admin)/admin/users/page.tsx` (200+ lines). Structure verified during audit:

1. `"use client"` + imports (`useState`, `useMutation`, `useQuery`, `useQueryClient` from `@tanstack/react-query`; `WorkflowHeader`, `SectionCard`, `Badge`).
2. **Inline interface** for the row (`AppUser`).
3. **Per-row state pattern:**
   - `interface RowState { roleError, statusError, rolePending, statusPending }`
   - `const DEFAULT_ROW_STATE: RowState = { ... }`
   - Top-level `useState<Record<string, RowState>>({})` keyed by primary key.
   - Helpers: `getRowState(id)` (returns existing or DEFAULT), `setRowField(id, patch)` (merges).
4. **PATCH helper:** `async function patchUser(user_id, body)` that throws on `!res.ok` with reason-code-aware messaging.
5. **Two `useMutation` instances** — one per editable field — each with `onMutate` (set pending), `onSuccess` (clear pending + `qc.invalidateQueries({ queryKey: [...] })`), `onError` (set error message).
6. **Render:** `<WorkflowHeader>` → `<SectionCard contentClassName="p-0">` → `<table>` with sticky-style headers using `text-3xs font-semibold uppercase tracking-sops text-fg-subtle`.
7. **Row content:** native `<select>` for enum fields; `<button className="btn btn-ghost btn-sm">` for actions. Loading shows `…`; errors render as `<span className="text-2xs text-danger-fg">`.
8. **Mutation invalidation:** every mutation invalidates the same root `queryKey: ["admin-users"]` to refetch the table.

### §7.2 Application to `/admin/holidays`

The new page should mirror `users/page.tsx` exactly:

- Query: `useQuery<{ rows: HolidayRow[] }>` with `queryKey: ["admin-holidays"]`.
- Per-row editable: `blocks_pickup` (toggle), `blocks_supply` (toggle). Read-only: `holiday_date`, `holiday_name`, `holiday_name_he`, `type`.
- Two mutations OR one combined PATCH with whichever toggle changed; precedent leans toward separate mutations per field for the Per-Row State to track independently. For only-2-fields, a single mutation may suffice.
- Permission gate: admin-only — wired by `(admin)/layout.tsx` already (verified in §W2 nav manifest entry: `min_role: "admin"`, `required_capability: "admin:execute"`).
- Use `<Badge tone="...">` to render `type` (`full_holiday` → `danger`, `erev_chag` → `warning`, `chol_hamoed` → `info`).

### §7.3 Other admin precedents (sanity check)

- `src/app/(admin)/admin/sku-aliases/page.tsx` — same shape (verified existence; `active_mode.json` Loop 12 documents the pattern).
- `src/app/(admin)/admin/jobs/page.tsx` — read-only table with `refetchInterval: 60_000` (the same pattern useful here for monitoring; not needed for holidays).

---

## §8 Risks and reuse gaps

Items the plan calls for that have NO existing primitive. Each names the smallest new primitive and where it should live.

| # | Plan reference | Gap | Smallest fix | Location |
|---|---|---|---|---|
| 1 | §Phase 8.5 `DayPopover.tsx` (Radix Popover) | Plan Appendix says "already a transitive dep via shadcn"; **package.json verified — `@radix-ui/react-popover` is NOT installed**, no shadcn config exists. Only `@radix-ui/react-dialog ^1.1.15` is present. | Add `@radix-ui/react-popover` to `package.json` as part of Tranche A substrate; ≤1 KB gz. Alternative: build inline absolute-positioned div with click-outside handler (≈40 LoC). | `package.json` (preferred) OR `src/app/(planning)/planning/inventory-flow/_components/DayPopover.tsx` (NEW) |
| 2 | §Phase 9.3 `useMediaQuery` | No existing hook. No `src/lib/hooks/` directory. | NEW: `src/lib/hooks/useMediaQuery.ts` (or flat `src/lib/useMediaQuery.ts` to match `cn.ts` style). ~30 LoC. | `src/lib/hooks/useMediaQuery.ts` |
| 3 | §Phase 8.8 per-cell column-hover via `:has()` | No existing primitive uses `:has()`; Tailwind 3.4.x supports `[&:has(...)]` arbitrary variants. Browser support is the risk (Safari 15.4+, Chrome 105+, Firefox 121+). | Implement as CSS-only with `[data-day]` attribute selectors on cells; column-highlight via `[data-day="2026-05-04"]:hover ~ [data-day="2026-05-04"]` pattern. Fallback to JS sync when `:has` unsupported. | `_components/FlowGridDesktop.tsx` inline; document the browser baseline. |
| 4 | §Phase 8.10 density toggle persisted to localStorage | No `useLocalStorage` hook in repo. | Inline `useState` + `useEffect` (≈12 LoC) inside `FlowGridDesktop.tsx`. Do NOT generalize to substrate this cycle. | `FlowGridDesktop.tsx` |
| 5 | §Phase 9.6 `StaleNotice` primitive | Named in plan Appendix but does not exist. Closest: inline `bg-warning-softer` banner in `weekly-outlook/page.tsx` lines 156–162. `FreshnessBadge` exists but it's a small badge, not a banner. | Either (a) compose `<EmptyState tone="warning">` from `feedback/states.tsx`, or (b) author a thin `<StaleBanner>` in `_components/`. (b) preferred for clarity. | `_components/StaleBanner.tsx` (NEW, scoped to inventory-flow; promote later if reused) |
| 6 | §Phase 9.5 unknown-SKU gate banner (`<UnmappedSkusBanner />`) | No primitive named in repo. | Compose from `<SectionCard>` + `Badge` tone=danger. ~30 LoC. | `_components/UnmappedSkusBanner.tsx` |
| 7 | Plan §Phase 6.2 — Zod-validate proxy response | No existing proxy validates with Zod. | Validate in the **consumer hook** `useInventoryFlow.ts`, not the proxy. Matches house style. | `_lib/useInventoryFlow.ts` |
| 8 | Holiday names rendered Hebrew (`holiday_name_he`) | CLAUDE.md §"UI language" allows Hebrew in **data values**, English chrome only. The day-cell holiday tooltip rendering Hebrew text is inside the data-value carve-out. No RTL layout switch needed. | No fix needed; just be aware: render the field as-is, no `dir="rtl"` wrapping. | n/a |

---

## §9 Mode B-InventoryFlow scope sketch

A future Mode B-InventoryFlow dispatch will need an EXECUTION_POLICY.md amendment (W4-owned) authorizing pan-form portal authoring scoped to `/planning/inventory-flow/**` + `/admin/holidays`. Below is the exact file-touch list with cross-scope flags.

### §9.1 In-scope files (within `/planning/inventory-flow/**` + `/admin/holidays`)

**Portal pages + components (NEW):**
- `src/app/(planning)/planning/inventory-flow/page.tsx`
- `src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/HeroBar.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/FilterBar.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/FlowGridDesktop.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/StickyItemPanel.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/DayCell.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/WeekCell.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/DayHeaderRow.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/ExpandedItemRow.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/DayPopover.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/MobileCardStream.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/MobileItemCard.tsx`
- `src/app/(planning)/planning/inventory-flow/_components/StaleBanner.tsx` (gap §8 #5)
- `src/app/(planning)/planning/inventory-flow/_components/UnmappedSkusBanner.tsx` (gap §8 #6)
- `src/app/(planning)/planning/inventory-flow/[itemId]/page.tsx`
- `src/app/(planning)/planning/inventory-flow/_lib/risk.ts`
- `src/app/(planning)/planning/inventory-flow/_lib/format.ts`
- `src/app/(planning)/planning/inventory-flow/_lib/types.ts`
- `src/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow.ts`
- `src/app/api/inventory/flow/route.ts`
- `src/app/api/inventory/flow/item/[itemId]/route.ts`
- `src/app/(admin)/admin/holidays/page.tsx`
- `src/app/api/admin/holidays/route.ts`

All cleanly within scope. ✓

### §9.2 Cross-scope substrate (FLAG — needs explicit Tranche A authorization)

These touch shared substrate outside the `/planning/inventory-flow/**` scope. They MUST be called out in the dispatch and either rolled into Tranche A or split into a substrate sub-tranche before component work begins. Splitting them off ("substrate first, then truthfulness") would be a clean repeat of the plan §B sequencing pattern.

| File | Reason it's cross-scope | Recommended placement |
|---|---|---|
| `src/lib/nav/manifest.ts` | Sidebar substrate, shared by all pages. Plan §Phase 12.1: rename Weekly Outlook → Inventory Flow + repoint URL. | Tranche A (sidebar substrate) — single-line edit; near-zero risk of cross-page regression. |
| `src/app/(planning)/planning/weekly-outlook/page.tsx` | Existing canonical page being replaced. Plan §Phase 12.2: replace body with `redirect('/planning/inventory-flow')`. | Tranche A. Two-line file. Preserves all bookmarks. |
| `src/app/api/inventory/weekly-outlook/route.ts` | Plan §"Modify": keep alive 1 release with `Deprecation: true` header. | Tranche A. The proxy can pass through unchanged (upstream keeps the endpoint alive 1 release; portal need not even add a Deprecation header since it just transparently proxies bytes). Recommend: leave the file untouched this dispatch. |
| `src/app/(shared)/home/page.tsx` (or equivalent) | Plan §"Modify": add a hero card linking to inventory-flow with a live "X products at risk" badge. Verified path (via `(shared)` route group). | Tranche A or last tranche. This is a small additive edit (one card). |
| `src/lib/hooks/useMediaQuery.ts` | NEW substrate hook (gap §8 #2). | Tranche A. Required before `InventoryFlowClient.tsx`. |
| `package.json` | NEW dependency `@radix-ui/react-popover` (gap §8 #1). | Tranche A. Smallest substrate change. Alternative: skip Radix and build inline (still possible, but loses keyboard a11y polish). |

### §9.3 Out-of-scope concerns / contract dependencies

- **Backend authorship is W1.** The plan's Phases 0–5 (DB migrations 0080–0084, LionWheel poller pickup_at, A3 unlock, daily projection function/view, API handler+contract+routes) are entirely outside W2. Mode B-InventoryFlow cannot author any `db/migrations/*.sql`, `api/src/**`, or `supabase/functions/**`.
- **Phase 0 governance unlocks (A3 Option 3 + unknown-SKU gate threshold)** are pre-conditions for the W1 work and outside W2 scope entirely.
- **`RUNTIME_READY(InventoryFlow)` is the gate.** The future emission must come from W1 with `evidence_path` pointing at the W1 closure pack (the daily projection function passing pgTAP + the API handler test suite green). Mode B-InventoryFlow may not begin until this signal lands.
- **No invented contract values.** Plan §Phase 5.1 Zod schemas are W4/W1-owned. The portal `_lib/types.ts` will mirror them only AFTER they exist on disk in `api/src/inventory/contracts.flow.ts`. If the portal needs a field not in upstream, emit `assumption_failure`.

### §9.4 Suggested tranche split for the future dispatch

| Tranche | Scope | Files |
|---|---|---|
| **A — substrate** | nav rename, weekly-outlook redirect, useMediaQuery hook, optional `@radix-ui/react-popover` install | `src/lib/nav/manifest.ts`, `src/app/(planning)/planning/weekly-outlook/page.tsx`, `src/lib/hooks/useMediaQuery.ts`, `package.json` |
| **B — proxies + types + hook** | API surface bridge | `src/app/api/inventory/flow/route.ts`, `src/app/api/inventory/flow/item/[itemId]/route.ts`, `_lib/types.ts`, `_lib/useInventoryFlow.ts`, `_lib/risk.ts`, `_lib/format.ts` |
| **C — desktop grid** | leaf components + `FlowGridDesktop` + page assembly | all `_components/*.tsx` desktop set + `page.tsx` + `InventoryFlowClient.tsx` |
| **D — mobile + detail** | mobile card stream + per-item detail route | `_components/MobileCardStream.tsx`, `_components/MobileItemCard.tsx`, `[itemId]/page.tsx` |
| **E — admin holidays** | CRUD page + proxy | `src/app/(admin)/admin/holidays/page.tsx`, `src/app/api/admin/holidays/route.ts` |
| **F — home hero** | small additive home card | `src/app/(shared)/home/page.tsx` (or equivalent) |

Each tranche ends with the standard 3-gate validation: `npx tsc --noEmit`, `npm run build`, `npm run lint:urls`.

---

## §10 Verification — every cited path was Read or ls-verified during audit

| Path | Verified by |
|---|---|
| `src/app/(planning)/planning/weekly-outlook/page.tsx` | Read full content |
| `src/app/api/inventory/weekly-outlook/route.ts` | Read full content |
| `src/lib/nav/manifest.ts` | Read full content |
| `src/lib/api-proxy.ts` | Read full content |
| `tailwind.config.ts` | Read full content |
| `src/app/(admin)/admin/users/page.tsx` | Read first 200 lines |
| `src/app/(admin)/admin/jobs/page.tsx` | Read 30–55 |
| `src/components/badges/{FreshnessBadge,StatusBadge,ReadinessBadge}.tsx` | ls + partial Read |
| `src/components/feedback/states.tsx` | Read first 50 lines |
| `src/components/workflow/{WorkflowHeader,SectionCard,FieldGrid,FormActionsBar,ValidationSummary,ApprovalBanner,DiffNotice}.tsx` | ls verified |
| `src/components/dashboard/KpiTiles.tsx` | ls verified |
| `src/components/data/{SearchFilterBar,AuditSnippet}.tsx` | ls verified |
| `src/components/layout/{AppShellChrome,SideNav,TopBar,MobileNav,Breadcrumbs,AppPageShell}.tsx` | ls + partial Read on AppShellChrome |
| `src/components/patterns/{ListPage,DetailPage,FormPage}.tsx` | ls verified |
| `src/components/overlays/Drawer.tsx` | ls verified |
| `src/components/tables/InlineEditCell.tsx` | ls verified |
| `package.json` | Read full content (radix-popover absence confirmed) |
| `src/lib/` directory | ls verified (no `hooks/` subdir; flat `cn.ts`, `display.ts`, `env.ts`, `user-initials.ts`) |
| `src/app/(planning)/planning/` directory | ls verified (boms, forecast, page.tsx, production-simulation, runs, weekly-outlook) |

No path cited in this document is unverified.

---

## §11 Summary for the next dispatch

1. **Mode A held throughout this audit.** No portal code authored. `runtime_ready.json` and `active_mode.json` not touched.
2. **The `/planning/weekly-outlook` page replacement is well-bounded** — single page, single proxy, single nav entry, single cache key. Zero collateral cleanup needed.
3. **Reusable surface area is high.** Workflow primitives (`WorkflowHeader`, `SectionCard`, `Badge`, `KpiTiles`, `SearchFilterBar`, `EmptyState`, `LoadingState`, `FreshnessBadge`) all exist and match the plan's Appendix verbatim — except for the false claim about Radix Popover being a transitive dep (it is not).
4. **Six gaps require substrate work** ahead of component authoring: Radix Popover install, useMediaQuery hook, density localStorage, StaleBanner, UnmappedSkusBanner, hover `:has()` strategy. All are small; none reopen locked decisions.
5. **Color discipline must hold.** No raw `emerald/amber/orange/rose` tokens. The four-palette `success / warning / danger / info` system already maps cleanly to `healthy / watch / critical / stockout` (with `watch` vs `critical` distinguished by `softer` vs `soft` intensity).
6. **Mode B-InventoryFlow scope is clean** — file list is finite, cross-scope substrate edits are minimal (nav manifest, redirect, home hero, useMediaQuery, package.json), and a 6-tranche split lands the work without violating the "atomic substrate then truthfulness" plan §C principle.
7. **Open governance dependencies are clearly W1/W4-owned** — the portal cannot land until backend ships and `RUNTIME_READY(InventoryFlow)` is emitted.

End of audit.
