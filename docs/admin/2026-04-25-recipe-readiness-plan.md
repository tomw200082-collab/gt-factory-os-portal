# Recipe-Readiness Corridor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a product-first surface where an admin edits a BOM recipe (clone-and-edit) and verifies supplier/price readiness, then publishes a new BOM version — without leaving the product context.

**Architecture:** Pure-function readiness layer (no UI deps) at the bottom; React components compose those functions into a Recipe-Health card on `/admin/masters/items/[item_id]`, a draft-line editor page at `/admin/masters/boms/[bom_head_id]/[version_id]/edit`, an inline supplier/price quick-fix drawer, and a publish-preview-driven confirm modal. All endpoints already exist; no backend work.

**Tech Stack:** Next.js 15 App Router, TanStack Query 5, Tailwind, Vitest + happy-dom + React Testing Library for unit tests, Playwright for E2E. Existing primitives: `DetailPage`, `MasterSummaryCard`, `ClassWEditDrawer`, `InlineEditCell`, `EntityPickerPlus`, `QuickCreateSupplierItem`, `patchEntity`, `postStatus`.

**Spec reference:** `docs/admin/2026-04-25-recipe-readiness-design.md`. **Where this plan and the spec disagree, the spec wins** — open a discussion before deviating.

---

## File structure (locked before tasks)

### Created files

| Path | Responsibility |
|---|---|
| `src/lib/policy/recipe-readiness.ts` | `RECIPE_READINESS_POLICY` constants — single edit point for thresholds |
| `src/lib/admin/recipe-readiness.ts` | Pure functions: `computeLinePipState()`, `computeTrackHealth()`, `computeRecipeHealthState()`, `formatPriceAge()`. NO React, NO async, NO `fetch`. |
| `src/lib/admin/recipe-readiness.types.ts` | Shared types: `LinePipState`, `TrackHealth`, `RecipeHealthState`, `ComponentReadiness` |
| `src/components/admin/recipe-health/RecipeHealthCard.tsx` | Top-level health card composed into product detail page for MANUFACTURED items |
| `src/components/admin/recipe-health/RecipeTrackSummary.tsx` | One track (base or pack) — used twice inside the card |
| `src/components/admin/recipe-health/ReadinessPanel.tsx` | Supplier/price readiness panel (right-side or mobile drawer) |
| `src/components/admin/recipe-health/QuickFixDrawer.tsx` | Three-action drawer (Set primary / Add link / Swap primary) |
| `src/components/admin/recipe-health/SwapPrimaryConfirm.tsx` | Step-2 side-by-side confirm pane for the swap action |
| `src/components/admin/recipe-health/VersionHistorySection.tsx` | Collapsible re-skin of `/api/boms/versions` list under the product |
| `src/components/bom-edit/BomDraftEditorPage.tsx` | Page-level component for `/admin/masters/boms/[head]/[version]/edit` |
| `src/components/bom-edit/BomLineRow.tsx` | One row in the lines table (display + edit) |
| `src/components/bom-edit/BomLineAddDrawer.tsx` | Component picker → `POST /api/boms/versions/:id/lines` |
| `src/components/bom-edit/BomLineDiff.tsx` | "Changes from v{active}" collapsible block |
| `src/components/bom-edit/PublishConfirmModal.tsx` | Three-variant publish modal driven by `publish-preview` |
| `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/edit/page.tsx` | Next.js route shell — wires `BomDraftEditorPage` |
| `tests/unit/admin/recipe-readiness.test.ts` | Pure-function unit tests for the readiness layer |
| `tests/unit/admin/recipe-health-card.test.tsx` | Component test for `RecipeHealthCard` rendering paths |
| `tests/unit/admin/quick-fix-drawer.test.tsx` | Component test for the three drawer actions |
| `tests/unit/admin/publish-confirm-modal.test.tsx` | Component test for the three modal variants |
| `tests/unit/admin/bom-line-row.test.tsx` | Component test for line-row edit / delete / pip |
| `tests/e2e/admin-recipe-readiness-real.spec.ts` | Playwright happy-path: clone draft → edit qty → publish |

### Modified files

| Path | Change |
|---|---|
| `src/app/(admin)/admin/masters/items/[item_id]/page.tsx` | Replace generic `MasterSummaryCard` with `RecipeHealthCard` for MANUFACTURED items only. Add `VersionHistorySection`. BOUGHT_FINISHED / REPACK paths untouched. |
| `docs/admin/master-editability-matrix.md` | Update BOM head / version / lines rows from 🔒 Slice B → ✅ for Class S/W edit, archive, restore, mobile, persistence. Note that the corridor adds the editor; the read-only BOM detail pages remain. |
| `CLAUDE.md` | Add a one-line note acknowledging Hebrew labels for the Recipe-Health surface as an explicit deviation from English-first. |

### Untouched (must not change)

- `src/app/(admin)/admin/masters/boms/[bom_head_id]/page.tsx` — read-only head detail
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/page.tsx` — read-only version detail
- All existing API routes under `src/app/api/boms/**` and `src/app/api/supplier-items/**`
- `src/components/admin/MasterSummaryCard.tsx` (the BOUGHT_FINISHED path keeps using it)
- `src/components/tables/InlineEditCell.tsx` (already T9-affordance fixed)
- `src/lib/admin/mutations.ts` (`patchEntity`, `postStatus` reused as-is)

---

## Conventions used by every task

- **TDD order:** write failing test → run to confirm fail → minimal implementation → run to confirm pass → commit. Every task that produces user-visible behaviour follows this. Pure-function tasks always follow it. Layout-only/pure-style tweaks may skip the failing-test step where no behaviour is being asserted, and the task says so explicitly.
- **Commands:**
  - Unit test: `npm test -- <path>` (one shot) or `npm run test:watch -- <path>` (during dev)
  - Type check: `npm run typecheck`
  - URL guard: `npm run lint:urls`
  - E2E: `npm run test:e2e -- <path>`
- **Commit messages:** prefix with `feat(R1):` for feature, `test(R1):` for tests-only, `refactor(R1):` for restructure, `docs(R1):` for docs. `R1` = "Recipe-readiness corridor 1".
- **Push policy:** push after every commit (per project convention). No PR — direct to `main`.
- **No code comments unless WHY is non-obvious.** Files start with a 1–3 line header explaining purpose only when the file isn't self-evident from its name and contents.
- **Hebrew strings live in code** for the labels Tom approved (see spec §11 risk #7). Not translated. Wrap them in helper objects only when reused 3+ times.

---

## Chunk 1: Foundation — policy constants and pure readiness functions

This chunk produces the readiness logic with **zero React, zero async, zero `fetch`**. Every public function is unit-tested. Subsequent chunks compose these pure functions into UI.

### Task 1.1: `RECIPE_READINESS_POLICY` constants module

**Files:**
- Create: `src/lib/policy/recipe-readiness.ts`
- Test: `tests/unit/admin/recipe-readiness-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/admin/recipe-readiness-policy.test.ts
import { describe, expect, it } from "vitest";
import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";

describe("RECIPE_READINESS_POLICY (v1 defaults)", () => {
  it("exposes price-age warn threshold as 90 days", () => {
    expect(RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS).toBe(90);
  });

  it("exposes price-age strong-warn threshold as 180 days", () => {
    expect(RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS).toBe(180);
  });

  it("strong threshold is strictly greater than warn threshold", () => {
    expect(RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS).toBeGreaterThan(
      RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS,
    );
  });

  it("frozen object — attempting mutation throws in strict mode", () => {
    expect(Object.isFrozen(RECIPE_READINESS_POLICY)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/admin/recipe-readiness-policy.test.ts`
Expected: FAIL — `RECIPE_READINESS_POLICY` is not exported (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/policy/recipe-readiness.ts
// Single-edit-point thresholds for the recipe-readiness UI. Tom-approved
// 2026-04-25. To revise: change the numbers here, ship.
export const RECIPE_READINESS_POLICY = Object.freeze({
  PRICE_AGE_WARN_DAYS: 90,
  PRICE_AGE_STRONG_WARN_DAYS: 180,
} as const);

export type RecipeReadinessPolicy = typeof RECIPE_READINESS_POLICY;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/admin/recipe-readiness-policy.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/policy/recipe-readiness.ts tests/unit/admin/recipe-readiness-policy.test.ts
git commit -m "feat(R1): add RECIPE_READINESS_POLICY constants (90d / 180d)"
git push
```

---

### Task 1.2: Shared types for readiness layer

**Files:**
- Create: `src/lib/admin/recipe-readiness.types.ts`

This task has no test of its own — the types are consumed by the next tasks' tests. Keeping it isolated keeps later tasks atomic.

- [ ] **Step 1: Write the file**

```ts
// src/lib/admin/recipe-readiness.types.ts
// Public types for the readiness pure-function layer. Consumed by the
// readiness functions, by the Recipe-Health card, and by the line editor.
// No imports of React, no async, no fetch.

export type LinePipColor = "green" | "yellow" | "red";

// Structured categories so callers (e.g. computeTrackHealth) can count
// per-category occurrences without parsing the human reason strings.
export type LineWarningCategory =
  | "missing-supplier"
  | "no-active-price"
  | "stale-price"
  | "strong-stale-price";

export type LineBlockerCategory = "invalid-qty" | "inactive-component";

export interface LinePipState {
  color: LinePipColor;
  reasons: string[]; // human-readable Hebrew. Empty when color is green.
  warningCategories: LineWarningCategory[]; // empty unless yellow
  blockerCategories: LineBlockerCategory[]; // empty unless red
  isHardBlock: boolean; // true ⇔ color === "red"
}

export type TrackHealthColor = "green" | "yellow" | "red";

export interface TrackHealth {
  color: TrackHealthColor;
  hasActiveVersion: boolean;
  lineCount: number;
  warnings: string[]; // per-category summaries, e.g. ["2 חומרים חסרי ספק ראשי", "1 חומר עם מחיר ישן"]
  blockers: string[]; // empty unless color is "red"
}

export type RecipeHealthColor = "green" | "yellow" | "red";

export interface RecipeHealthState {
  color: RecipeHealthColor;
  // Top-line label derived from color; UI uses this verbatim.
  // green:  "מוכן לייצור"
  // yellow: "מוכן לייצור עם אזהרות"
  // red:    "לא ניתן לפרסם"
  label: string;
  warnings: string[];
  blockers: string[];
  // Whether the *Recipe-Health-card-level* state permits publish — i.e.
  // false iff color === "red". Backend hard-blockers (EMPTY_VERSION,
  // PLANNING_RUN_IN_FLIGHT, …) are surfaced separately at publish time
  // by the publish-preview integration; this layer doesn't see them.
  publishPermitted: boolean;
}

// One referenced raw/pack item, used by readiness panel and line pip.
export interface ComponentReadiness {
  component_id: string;
  component_name: string;
  component_status: "ACTIVE" | "INACTIVE";
  primary_supplier_id: string | null;
  primary_supplier_name: string | null;
  active_price_value: string | null;       // null when no active price record
  active_price_updated_at: string | null;  // ISO timestamp; null when no record
}
```

- [ ] **Step 2: Type check passes**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/admin/recipe-readiness.types.ts
git commit -m "feat(R1): readiness layer shared types"
git push
```

---

### Task 1.3: `formatPriceAge` pure helper

Days-since utility with explicit "no price" handling. Used by every readiness check and the panel display.

**Files:**
- Create (start): `src/lib/admin/recipe-readiness.ts`
- Test: `tests/unit/admin/recipe-readiness-format-age.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/admin/recipe-readiness-format-age.test.ts
import { describe, expect, it } from "vitest";
import { formatPriceAge, priceAgeDays } from "@/lib/admin/recipe-readiness";

describe("formatPriceAge", () => {
  const NOW = new Date("2026-04-25T12:00:00Z").getTime();

  it("returns 'אין מחיר פעיל' when input is null", () => {
    expect(formatPriceAge(null, NOW)).toBe("אין מחיר פעיל");
  });

  it("returns '0 ימים' for the same instant", () => {
    expect(formatPriceAge("2026-04-25T12:00:00Z", NOW)).toBe("0 ימים");
  });

  it("returns 'יום 1' (singular) for exactly 24h ago", () => {
    expect(formatPriceAge("2026-04-24T12:00:00Z", NOW)).toBe("יום 1");
  });

  it("returns '{N} ימים' for 2..n days ago", () => {
    expect(formatPriceAge("2026-04-15T12:00:00Z", NOW)).toBe("10 ימים");
  });

  it("clamps a future timestamp to '0 ימים' rather than negative", () => {
    expect(formatPriceAge("2026-05-01T12:00:00Z", NOW)).toBe("0 ימים");
  });

  it("returns 'אין מחיר פעיל' when input is malformed", () => {
    expect(formatPriceAge("not-a-date", NOW)).toBe("אין מחיר פעיל");
  });

  it("threshold-edge: exactly 89, 90, 91 days produce sequential day counts", () => {
    expect(formatPriceAge("2026-01-26T12:00:00Z", NOW)).toBe("89 ימים");
    expect(formatPriceAge("2026-01-25T12:00:00Z", NOW)).toBe("90 ימים");
    expect(formatPriceAge("2026-01-24T12:00:00Z", NOW)).toBe("91 ימים");
  });

  it("threshold-edge: 180-day boundary", () => {
    expect(formatPriceAge("2025-10-27T12:00:00Z", NOW)).toBe("180 ימים");
    expect(formatPriceAge("2025-10-26T12:00:00Z", NOW)).toBe("181 ימים");
  });
});

describe("priceAgeDays — pure days helper consumed by readiness rules", () => {
  const NOW = new Date("2026-04-25T12:00:00Z").getTime();
  it("returns null when input is null or malformed", () => {
    expect(priceAgeDays(null, NOW)).toBeNull();
    expect(priceAgeDays("not-a-date", NOW)).toBeNull();
  });
  it("clamps a future timestamp to 0", () => {
    expect(priceAgeDays("2026-05-01T12:00:00Z", NOW)).toBe(0);
  });
  it("returns floored integer days for past timestamps", () => {
    expect(priceAgeDays("2026-04-23T12:00:00Z", NOW)).toBe(2);
    // 23h ago floors to 0 (not yet a full day)
    expect(priceAgeDays("2026-04-24T13:00:00Z", NOW)).toBe(0);
    // 25h ago floors to 1
    expect(priceAgeDays("2026-04-24T11:00:00Z", NOW)).toBe(1);
  });
});
```


- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-readiness-format-age.test.ts`
Expected: FAIL — `formatPriceAge` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/admin/recipe-readiness.ts
// Pure readiness functions. No React, no async, no fetch.
// Imports: types only; policy constants for thresholds.
//
// Time-injection contract: every function that needs "now" takes `nowMs:
// number` explicitly. Callers pass `Date.now()`. Tests pass a fixed
// timestamp for determinism. Do not call `Date.now()` inside this file.

import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";
import type {
  ComponentReadiness,
  LinePipState,
  RecipeHealthState,
  TrackHealth,
} from "./recipe-readiness.types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function priceAgeDays(
  updatedAtIso: string | null,
  nowMs: number,
): number | null {
  if (updatedAtIso === null) return null;
  const t = Date.parse(updatedAtIso);
  if (Number.isNaN(t)) return null;
  const ageMs = nowMs - t;
  if (ageMs <= 0) return 0;
  return Math.floor(ageMs / MS_PER_DAY);
}

export function formatPriceAge(
  updatedAtIso: string | null,
  nowMs: number,
): string {
  const days = priceAgeDays(updatedAtIso, nowMs);
  if (days === null) return "אין מחיר פעיל";
  if (days === 0) return "0 ימים";
  if (days === 1) return "יום 1";
  return `${days} ימים`;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-readiness-format-age.test.ts`
Expected: PASS — 11/11 (8 in `formatPriceAge` block + 3 in `priceAgeDays` block).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/admin/recipe-readiness.ts tests/unit/admin/recipe-readiness-format-age.test.ts
git commit -m "feat(R1): formatPriceAge + priceAgeDays helpers"
git push
```

---

### Task 1.4: `computeLinePipState` per-line color rule

Inputs: one component's readiness snapshot + the line's quantity. Output: pip color + reasons.

**Files:**
- Modify: `src/lib/admin/recipe-readiness.ts` (append `computeLinePipState`)
- Test: `tests/unit/admin/recipe-readiness-line-pip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/admin/recipe-readiness-line-pip.test.ts
import { describe, expect, it } from "vitest";
import { computeLinePipState } from "@/lib/admin/recipe-readiness";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

const NOW = new Date("2026-04-25T12:00:00Z").getTime();

function comp(over: Partial<ComponentReadiness> = {}): ComponentReadiness {
  return {
    component_id: "C-1",
    component_name: "Sugar",
    component_status: "ACTIVE",
    primary_supplier_id: "SUP-1",
    primary_supplier_name: "Sweet Co",
    active_price_value: "2.50",
    active_price_updated_at: "2026-04-20T12:00:00Z",
    ...over,
  };
}

describe("computeLinePipState — green path", () => {
  it("returns green with empty reasons when component is fully ready and qty > 0", () => {
    const r = computeLinePipState({ qty: "1.0", component: comp(), nowMs: NOW });
    expect(r.color).toBe("green");
    expect(r.reasons).toEqual([]);
    expect(r.isHardBlock).toBe(false);
  });
});

describe("computeLinePipState — red (hard block)", () => {
  it("returns red when qty is 0", () => {
    const r = computeLinePipState({ qty: "0", component: comp(), nowMs: NOW });
    expect(r.color).toBe("red");
    expect(r.isHardBlock).toBe(true);
    expect(r.reasons.some((s) => s.includes("כמות"))).toBe(true);
  });

  it("returns red when qty is negative", () => {
    const r = computeLinePipState({ qty: "-1", component: comp(), nowMs: NOW });
    expect(r.color).toBe("red");
  });

  it("returns red when qty is non-numeric", () => {
    const r = computeLinePipState({ qty: "abc", component: comp(), nowMs: NOW });
    expect(r.color).toBe("red");
  });

  it("returns red when component is INACTIVE", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ component_status: "INACTIVE" }),
      nowMs: NOW,
    });
    expect(r.color).toBe("red");
    expect(r.reasons.some((s) => s.includes("לא פעיל"))).toBe(true);
  });

  it("red trumps yellow when both INACTIVE and missing supplier", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({
        component_status: "INACTIVE",
        primary_supplier_id: null,
      }),
      nowMs: NOW,
    });
    expect(r.color).toBe("red");
    // Yellow categories MUST NOT co-mingle with red. Red short-circuits.
    expect(r.warningCategories).toEqual([]);
    expect(r.blockerCategories).toContain("inactive-component");
    expect(r.reasons.some((s) => s.includes("ספק"))).toBe(false);
  });
});

describe("computeLinePipState — yellow (warning, not hard block)", () => {
  it("returns yellow when no primary supplier", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ primary_supplier_id: null, primary_supplier_name: null }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.isHardBlock).toBe(false);
    expect(r.reasons.some((s) => s.includes("ספק"))).toBe(true);
  });

  it("returns yellow when no active price record", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ active_price_value: null, active_price_updated_at: null }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.reasons.some((s) => s.includes("מחיר"))).toBe(true);
  });

  it("returns yellow when active price age exceeds PRICE_AGE_WARN_DAYS", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({ active_price_updated_at: "2025-12-01T12:00:00Z" }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.reasons.some((s) => /\d+ ימים/.test(s))).toBe(true);
  });

  it("collects multiple reasons in yellow state", () => {
    const r = computeLinePipState({
      qty: "1",
      component: comp({
        primary_supplier_id: null,
        primary_supplier_name: null,
        active_price_value: null,
        active_price_updated_at: null,
      }),
      nowMs: NOW,
    });
    expect(r.color).toBe("yellow");
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.warningCategories).toContain("missing-supplier");
    expect(r.warningCategories).toContain("no-active-price");
  });

  it("price age threshold edges — day 89 green, day 90 green, day 91 yellow", () => {
    // > comparator means day 90 is still green; day 91 first yellow.
    const at = (iso: string) =>
      computeLinePipState({ qty: "1", component: comp({ active_price_updated_at: iso }), nowMs: NOW }).color;
    expect(at("2026-01-26T12:00:00Z")).toBe("green"); // 89 days
    expect(at("2026-01-25T12:00:00Z")).toBe("green"); // 90 days exactly
    expect(at("2026-01-24T12:00:00Z")).toBe("yellow"); // 91 days
  });

  it("price age 180 days = stale-price; 181 days = strong-stale-price", () => {
    const r180 = computeLinePipState({
      qty: "1",
      component: comp({ active_price_updated_at: "2025-10-27T12:00:00Z" }),
      nowMs: NOW,
    });
    expect(r180.color).toBe("yellow");
    expect(r180.warningCategories).toContain("stale-price");
    expect(r180.warningCategories).not.toContain("strong-stale-price");
    expect(r180.reasons.some((s) => /^מחיר ישן \(/.test(s))).toBe(true);

    const r181 = computeLinePipState({
      qty: "1",
      component: comp({ active_price_updated_at: "2025-10-26T12:00:00Z" }),
      nowMs: NOW,
    });
    expect(r181.color).toBe("yellow");
    expect(r181.warningCategories).toContain("strong-stale-price");
    expect(r181.warningCategories).not.toContain("stale-price");
    expect(r181.reasons.some((s) => s.startsWith("מחיר ישן מאוד"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-readiness-line-pip.test.ts`
Expected: FAIL — `computeLinePipState` not exported.

- [ ] **Step 3: Implement (append to `recipe-readiness.ts`)**

**Important:** the two type imports below MUST be merged into the existing top-of-file import block from Task 1.3. Do NOT paste them inline at the bottom of the file. After merging, the top-of-file imports should read:

```ts
import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";
import type {
  ComponentReadiness,
  LineBlockerCategory,
  LinePipState,
  LineWarningCategory,
  RecipeHealthState,
  TrackHealth,
} from "./recipe-readiness.types";
```

Then append the function body below (no `import` statements in this snippet — they belong at the top, as merged above):

```ts
// Append to src/lib/admin/recipe-readiness.ts (function body only):

export interface ComputeLinePipStateInput {
  qty: string | number;
  component: ComponentReadiness;
  nowMs: number;
}

export function computeLinePipState(
  input: ComputeLinePipStateInput,
): LinePipState {
  const reasons: string[] = [];
  const blockerCategories: LineBlockerCategory[] = [];
  const warningCategories: LineWarningCategory[] = [];

  const qtyNum = Number(input.qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    reasons.push("כמות חייבת להיות חיובית");
    blockerCategories.push("invalid-qty");
  }
  if (input.component.component_status === "INACTIVE") {
    reasons.push(`החומר ${input.component.component_name} מסומן כלא פעיל`);
    blockerCategories.push("inactive-component");
  }
  if (blockerCategories.length > 0) {
    return {
      color: "red",
      reasons,
      warningCategories: [],
      blockerCategories,
      isHardBlock: true,
    };
  }

  if (input.component.primary_supplier_id === null) {
    reasons.push("אין ספק ראשי");
    warningCategories.push("missing-supplier");
  }
  if (input.component.active_price_value === null) {
    reasons.push("אין מחיר פעיל");
    warningCategories.push("no-active-price");
  } else {
    const days = priceAgeDays(
      input.component.active_price_updated_at,
      input.nowMs,
    );
    if (days !== null && days > RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS) {
      const strong = days > RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS;
      if (strong) {
        reasons.push(`מחיר ישן מאוד (${days} ימים)`);
        warningCategories.push("strong-stale-price");
      } else {
        reasons.push(`מחיר ישן (${days} ימים)`);
        warningCategories.push("stale-price");
      }
    }
  }
  if (warningCategories.length > 0) {
    return {
      color: "yellow",
      reasons,
      warningCategories,
      blockerCategories: [],
      isHardBlock: false,
    };
  }

  return {
    color: "green",
    reasons: [],
    warningCategories: [],
    blockerCategories: [],
    isHardBlock: false,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-readiness-line-pip.test.ts`
Expected: PASS — 12/12 (1 green + 5 red + 6 yellow including 2 boundary edge tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/admin/recipe-readiness.ts tests/unit/admin/recipe-readiness-line-pip.test.ts
git commit -m "feat(R1): computeLinePipState pure function"
git push
```

---

### Task 1.5: `computeTrackHealth` (one BOM head)

Inputs: track type ("base"|"pack") + line count + per-line pips. Output: track-level health.

**Files:**
- Modify: `src/lib/admin/recipe-readiness.ts` (append `computeTrackHealth`)
- Test: `tests/unit/admin/recipe-readiness-track.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/admin/recipe-readiness-track.test.ts
import { describe, expect, it } from "vitest";
import { computeTrackHealth } from "@/lib/admin/recipe-readiness";
import type {
  LineBlockerCategory,
  LinePipState,
  LineWarningCategory,
} from "@/lib/admin/recipe-readiness.types";

function pip(
  color: LinePipState["color"],
  cats: { warn?: LineWarningCategory[]; block?: LineBlockerCategory[] } = {},
): LinePipState {
  return {
    color,
    reasons: color === "green" ? [] : ["reason"],
    warningCategories: cats.warn ?? (color === "yellow" ? ["missing-supplier"] : []),
    blockerCategories: cats.block ?? (color === "red" ? ["invalid-qty"] : []),
    isHardBlock: color === "red",
  };
}

describe("computeTrackHealth — red conditions (cannot publish)", () => {
  it("red when no active version (no head linked)", () => {
    const r = computeTrackHealth({
      hasActiveVersion: false,
      pips: [],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("red");
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("red when active version has 0 lines", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("red");
    expect(r.blockers.some((s) => s.includes("ריק"))).toBe(true);
  });

  it("red when any line is red (qty<=0 or INACTIVE)", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("red"), pip("green")],
      trackLabel: "pack BOM",
    });
    expect(r.color).toBe("red");
  });
});

describe("computeTrackHealth — yellow / green", () => {
  it("yellow when at least one line is yellow and none red", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("yellow"), pip("green")],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("yellow");
  });

  it("green when version is active, has lines, all pips green", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("green"), pip("green")],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("green");
    expect(r.warnings).toEqual([]);
    expect(r.blockers).toEqual([]);
  });

  it("warnings count summarizes yellow-line categories separately", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["stale-price"] }),
        pip("green"),
      ],
      trackLabel: "base formula",
    });
    expect(r.color).toBe("yellow");
    // Two distinct category summaries — supplier and price are separate buckets
    const joined = r.warnings.join(" | ");
    expect(joined).toContain("2 חומרים חסרי ספק ראשי");
    expect(joined).toMatch(/1 חומר עם מחיר ישן/);
  });

  it("warnings use Hebrew singular vs plural correctly", () => {
    const oneMissing = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("yellow", { warn: ["missing-supplier"] }), pip("green")],
      trackLabel: "base formula",
    });
    expect(oneMissing.warnings.some((s) => s.includes("חומר אחד חסר ספק ראשי"))).toBe(true);

    const fiveMissing = computeTrackHealth({
      hasActiveVersion: true,
      pips: [
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
        pip("yellow", { warn: ["missing-supplier"] }),
      ],
      trackLabel: "base formula",
    });
    expect(fiveMissing.warnings.some((s) => s.includes("5 חומרים חסרי ספק ראשי"))).toBe(true);
  });

  it("strong-stale-price counts toward stale-price summary (not a separate one)", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [
        pip("yellow", { warn: ["stale-price"] }),
        pip("yellow", { warn: ["strong-stale-price"] }),
      ],
      trackLabel: "base formula",
    });
    // Two yellow lines, both about price, summarized together
    expect(r.warnings.some((s) => /2 חומרים עם מחיר ישן/.test(s))).toBe(true);
  });

  it("lineCount mirrors pips.length", () => {
    const r = computeTrackHealth({
      hasActiveVersion: true,
      pips: [pip("green"), pip("green")],
      trackLabel: "pack BOM",
    });
    expect(r.lineCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-readiness-track.test.ts`
Expected: FAIL — `computeTrackHealth` not exported.

- [ ] **Step 3: Implement (append to `recipe-readiness.ts`)**

```ts
export interface ComputeTrackHealthInput {
  hasActiveVersion: boolean;
  pips: LinePipState[];
  trackLabel: string; // for human-facing blocker messages
}

export function computeTrackHealth(
  input: ComputeTrackHealthInput,
): TrackHealth {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.hasActiveVersion) {
    blockers.push(`אין גרסה פעילה ל-${input.trackLabel}`);
  } else if (input.pips.length === 0) {
    blockers.push(`${input.trackLabel} ריק (0 שורות)`);
  }

  // Count per-category. Strong-stale-price collapses into the stale-price
  // bucket for the track-level summary; the line-level pip already
  // distinguishes the two.
  let invalidQtyCount = 0;
  let inactiveComponentCount = 0;
  let missingSupplierCount = 0;
  let noActivePriceCount = 0;
  let stalePriceCount = 0;

  for (const p of input.pips) {
    for (const b of p.blockerCategories) {
      if (b === "invalid-qty") invalidQtyCount++;
      else if (b === "inactive-component") inactiveComponentCount++;
    }
    for (const w of p.warningCategories) {
      if (w === "missing-supplier") missingSupplierCount++;
      else if (w === "no-active-price") noActivePriceCount++;
      else if (w === "stale-price" || w === "strong-stale-price") {
        stalePriceCount++;
      }
    }
  }

  if (invalidQtyCount > 0) {
    blockers.push(
      invalidQtyCount === 1
        ? "שורה אחת עם כמות לא תקינה"
        : `${invalidQtyCount} שורות עם כמות לא תקינה`,
    );
  }
  if (inactiveComponentCount > 0) {
    blockers.push(
      inactiveComponentCount === 1
        ? "חומר אחד מסומן כלא פעיל"
        : `${inactiveComponentCount} חומרים מסומנים כלא פעילים`,
    );
  }

  if (missingSupplierCount > 0) {
    warnings.push(
      missingSupplierCount === 1
        ? "חומר אחד חסר ספק ראשי"
        : `${missingSupplierCount} חומרים חסרי ספק ראשי`,
    );
  }
  if (noActivePriceCount > 0) {
    warnings.push(
      noActivePriceCount === 1
        ? "חומר אחד ללא מחיר פעיל"
        : `${noActivePriceCount} חומרים ללא מחיר פעיל`,
    );
  }
  if (stalePriceCount > 0) {
    warnings.push(
      stalePriceCount === 1
        ? "חומר אחד עם מחיר ישן"
        : `${stalePriceCount} חומרים עם מחיר ישן`,
    );
  }

  let color: TrackHealth["color"];
  if (blockers.length > 0) color = "red";
  else if (warnings.length > 0) color = "yellow";
  else color = "green";

  return {
    color,
    hasActiveVersion: input.hasActiveVersion,
    lineCount: input.pips.length,
    warnings,
    blockers,
  };
}
```


- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-readiness-track.test.ts`
Expected: PASS — 9/9 (3 red + 1 yellow basic + 1 green + 1 categories + 1 plurals + 1 strong-stale-merging + 1 lineCount).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/admin/recipe-readiness.ts tests/unit/admin/recipe-readiness-track.test.ts
git commit -m "feat(R1): computeTrackHealth pure function"
git push
```

---

### Task 1.6: `computeRecipeHealthState` (top-line — combines base + pack)

**Files:**
- Modify: `src/lib/admin/recipe-readiness.ts` (append `computeRecipeHealthState`)
- Test: `tests/unit/admin/recipe-readiness-top.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/admin/recipe-readiness-top.test.ts
import { describe, expect, it } from "vitest";
import { computeRecipeHealthState } from "@/lib/admin/recipe-readiness";
import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

function track(over: Partial<TrackHealth>): TrackHealth {
  return {
    color: "green",
    hasActiveVersion: true,
    lineCount: 5,
    warnings: [],
    blockers: [],
    ...over,
  };
}

describe("computeRecipeHealthState", () => {
  it("green when both tracks are green", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({}),
    });
    expect(r.color).toBe("green");
    expect(r.label).toBe("מוכן לייצור");
    expect(r.publishPermitted).toBe(true);
  });

  it("yellow when base green and pack yellow", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({ color: "yellow", warnings: ["1 אזהרה"] }),
    });
    expect(r.color).toBe("yellow");
    expect(r.label).toBe("מוכן לייצור עם אזהרות");
    expect(r.publishPermitted).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("red when pack is red — base green", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({ color: "red", blockers: ["ריק"], lineCount: 0 }),
    });
    expect(r.color).toBe("red");
    expect(r.label).toBe("לא ניתן לפרסם");
    expect(r.publishPermitted).toBe(false);
  });

  it("red when base is red — pack green (symmetric to previous case)", () => {
    const r = computeRecipeHealthState({
      base: track({ color: "red", blockers: ["ריק"], lineCount: 0 }),
      pack: track({}),
    });
    expect(r.color).toBe("red");
    expect(r.publishPermitted).toBe(false);
  });

  it("publishPermitted is true when color is yellow", () => {
    const r = computeRecipeHealthState({
      base: track({}),
      pack: track({ color: "yellow", warnings: ["w1"] }),
    });
    expect(r.publishPermitted).toBe(true);
  });

  it("publishPermitted is true when color is green", () => {
    const r = computeRecipeHealthState({ base: track({}), pack: track({}) });
    expect(r.publishPermitted).toBe(true);
  });

  it("red trumps yellow trumps green when tracks disagree", () => {
    const r1 = computeRecipeHealthState({
      base: track({ color: "red", blockers: ["b1"] }),
      pack: track({ color: "yellow", warnings: ["w1"] }),
    });
    expect(r1.color).toBe("red");

    const r2 = computeRecipeHealthState({
      base: track({ color: "yellow", warnings: ["w1"] }),
      pack: track({ color: "yellow", warnings: ["w2"] }),
    });
    expect(r2.color).toBe("yellow");
  });

  it("aggregates blockers and warnings from both tracks", () => {
    const r = computeRecipeHealthState({
      base: track({ color: "yellow", warnings: ["base-w1"] }),
      pack: track({ color: "yellow", warnings: ["pack-w1"] }),
    });
    expect(r.warnings).toContain("base-w1");
    expect(r.warnings).toContain("pack-w1");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-readiness-top.test.ts`
Expected: FAIL — `computeRecipeHealthState` not exported.

- [ ] **Step 3: Implement (append to `recipe-readiness.ts`)**

```ts
export interface ComputeRecipeHealthInput {
  base: TrackHealth;
  pack: TrackHealth;
}

const LABEL_BY_COLOR: Record<RecipeHealthState["color"], string> = {
  green: "מוכן לייצור",
  yellow: "מוכן לייצור עם אזהרות",
  red: "לא ניתן לפרסם",
};

export function computeRecipeHealthState(
  input: ComputeRecipeHealthInput,
): RecipeHealthState {
  const blockers = [...input.base.blockers, ...input.pack.blockers];
  const warnings = [...input.base.warnings, ...input.pack.warnings];

  let color: RecipeHealthState["color"];
  if (blockers.length > 0) color = "red";
  else if (warnings.length > 0) color = "yellow";
  else color = "green";

  return {
    color,
    label: LABEL_BY_COLOR[color],
    blockers,
    warnings,
    publishPermitted: color !== "red",
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-readiness-top.test.ts`
Expected: PASS — 8/8 (1 green + 1 yellow + 2 red symmetric + 1 trumps + 1 aggregates + 2 publishPermitted explicit).

- [ ] **Step 5: Run the full readiness test suite**

Run: `npx vitest run tests/unit/admin/recipe-readiness-policy.test.ts tests/unit/admin/recipe-readiness-format-age.test.ts tests/unit/admin/recipe-readiness-line-pip.test.ts tests/unit/admin/recipe-readiness-track.test.ts tests/unit/admin/recipe-readiness-top.test.ts`
Expected: PASS — 44 tests total (4 policy + 11 format-age + 12 line-pip + 9 track + 8 top). Listing files explicitly avoids any surprise from glob matching across vitest versions.

- [ ] **Step 6: Commit + push**

```bash
git add src/lib/admin/recipe-readiness.ts tests/unit/admin/recipe-readiness-top.test.ts
git commit -m "feat(R1): computeRecipeHealthState pure function"
git push
```

---

### Task 1.7: Type check + lint pass on the foundation

This is the chunk-end gate. The foundation must be clean before UI starts consuming it.

- [ ] **Step 1: Type check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: URL lint (no regressions)**

Run: `npm run lint:urls`
Expected: clean.

- [ ] **Step 3: ESLint on the new files**

Run: `npx eslint src/lib/policy/recipe-readiness.ts src/lib/admin/recipe-readiness.ts src/lib/admin/recipe-readiness.types.ts tests/unit/admin/recipe-readiness*.ts`
Expected: clean.

- [ ] **Step 4: If any of the above fail**, fix in place. The foundation is small enough that any error is local.

Once green: **Chunk 1 complete.** Dispatch the plan reviewer for Chunk 1, then proceed to Chunk 2.

---

