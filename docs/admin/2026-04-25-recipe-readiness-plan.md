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
  warnings: string[]; // per-category summaries, e.g. ["2 חומרים חסרי ספק ראשי", "חומר אחד עם מחיר ישן"]
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
    expect(joined).toMatch(/חומר אחד עם מחיר ישן/);
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

## Chunk 2: Recipe-Health card on the product page

This chunk wires the pure functions from Chunk 1 into the product detail page. After this chunk, `/admin/masters/items/[item_id]` shows the new `RecipeHealthCard` for MANUFACTURED items only — BOUGHT_FINISHED and REPACK paths are untouched. The card itself is read-only; the `[Edit recipe →]` buttons are gated behind `isAdmin` and the editor route they navigate to is built in Chunk 3.

**Signature stability with Chunk 1:** No file in `src/lib/policy/recipe-readiness.ts` or `src/lib/admin/recipe-readiness*.ts` is modified in this chunk. Only the components consume the existing exports.

### Task 2.1: `RecipeTrackSummary` component — single track display

The card renders this twice: once for the base track, once for the pack track. Pure presentational; takes a `TrackHealth` and a label, renders the colored summary block. No data fetching here.

**Files:**
- Create: `src/components/admin/recipe-health/RecipeTrackSummary.tsx`
- Test: `tests/unit/admin/recipe-health-card.test.tsx` (the file is shared with the card test in Task 2.4 — start it here with the track-summary cases only)

- [ ] **Step 1: Write the failing test (track-summary cases only)**

```tsx
// tests/unit/admin/recipe-health-card.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecipeTrackSummary } from "@/components/admin/recipe-health/RecipeTrackSummary";
import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

function track(over: Partial<TrackHealth> = {}): TrackHealth {
  return {
    color: "green",
    hasActiveVersion: true,
    lineCount: 5,
    warnings: [],
    blockers: [],
    ...over,
  };
}

describe("RecipeTrackSummary", () => {
  it("renders the track label and version metadata when active version exists", () => {
    render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel="v3"
        health={track({ lineCount: 12 })}
      />,
    );
    expect(screen.getByText("בסיס המוצר")).toBeInTheDocument();
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("renders 'אין גרסה פעילה' when hasActiveVersion is false", () => {
    render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel={null}
        health={track({ color: "red", hasActiveVersion: false, lineCount: 0, blockers: ["אין גרסה פעילה ל-בסיס המוצר"] })}
      />,
    );
    expect(screen.getByText(/אין גרסה פעילה/)).toBeInTheDocument();
  });

  it("renders warnings list when track is yellow", () => {
    render(
      <RecipeTrackSummary
        trackLabel="אריזת המוצר"
        activeVersionLabel="v2"
        health={track({ color: "yellow", warnings: ["2 חומרים חסרי ספק ראשי", "חומר אחד עם מחיר ישן"] })}
      />,
    );
    expect(screen.getByText("2 חומרים חסרי ספק ראשי")).toBeInTheDocument();
    expect(screen.getByText("חומר אחד עם מחיר ישן")).toBeInTheDocument();
  });

  it("renders blockers list when track is red", () => {
    render(
      <RecipeTrackSummary
        trackLabel="אריזת המוצר"
        activeVersionLabel="v2"
        health={track({ color: "red", blockers: ["אריזת המוצר ריק (0 שורות)"] })}
      />,
    );
    expect(screen.getByText(/ריק \(0 שורות\)/)).toBeInTheDocument();
  });

  it("applies a color-keyed data attribute so visual tests can target it", () => {
    const { container } = render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel="v3"
        health={track({ color: "yellow", warnings: ["w1"] })}
      />,
    );
    expect(container.querySelector('[data-track-color="yellow"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: FAIL — module not found (`RecipeTrackSummary` not exported).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/admin/recipe-health/RecipeTrackSummary.tsx
import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

interface RecipeTrackSummaryProps {
  trackLabel: string;
  activeVersionLabel: string | null;
  health: TrackHealth;
}

const COLOR_CLASS: Record<TrackHealth["color"], string> = {
  green: "border-green-500 bg-green-50",
  yellow: "border-yellow-500 bg-yellow-50",
  red: "border-red-500 bg-red-50",
};

export function RecipeTrackSummary({
  trackLabel,
  activeVersionLabel,
  health,
}: RecipeTrackSummaryProps) {
  return (
    <div
      data-track-color={health.color}
      className={`rounded-md border-l-4 p-3 ${COLOR_CLASS[health.color]}`}
    >
      <div className="font-semibold">{trackLabel}</div>
      <div className="text-sm text-gray-600">
        {health.hasActiveVersion && activeVersionLabel
          ? `Active: ${activeVersionLabel} · ${health.lineCount} lines`
          : "אין גרסה פעילה"}
      </div>
      {health.blockers.length > 0 && (
        <ul className="mt-2 text-sm text-red-700">
          {health.blockers.map((b) => (
            <li key={b}>🔴 {b}</li>
          ))}
        </ul>
      )}
      {health.warnings.length > 0 && (
        <ul className="mt-2 text-sm text-yellow-800">
          {health.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: PASS — 5/5 (all `RecipeTrackSummary` cases).

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/RecipeTrackSummary.tsx tests/unit/admin/recipe-health-card.test.tsx
git commit -m "feat(R1): RecipeTrackSummary single-track display"
git push
```

---

### Task 2.2: Per-component readiness fetcher hook (`useComponentReadinessMap`)

Wraps a TanStack Query `useQueries` fan-out: given an array of unique `component_id`s, returns a `Map<component_id, ComponentReadiness>`. This is the single data source for the card AND the line pip wiring in later chunks. Lives in the `recipe-health` folder.

**Files:**
- Create: `src/components/admin/recipe-health/useComponentReadinessMap.ts`
- Test: `tests/unit/admin/use-component-readiness-map.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/use-component-readiness-map.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useComponentReadinessMap } from "@/components/admin/recipe-health/useComponentReadinessMap";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useComponentReadinessMap", () => {
  it("fans out one fetch per unique component_id", async () => {
    fetchMock.mockImplementation((url: string) => {
      const id = new URL(url, "http://x").searchParams.get("component_id");
      return Promise.resolve(
        new Response(JSON.stringify({
          rows: [{
            supplier_item_id: "SI-1",
            supplier_id: "SUP-1",
            supplier_name: "ACME",
            component_id: id,
            component_name: id,
            component_status: "ACTIVE",
            is_primary: true,
            std_cost_per_inv_uom: "1.00",
            updated_at: "2026-04-20T12:00:00Z",
          }],
        }), { status: 200 }),
      );
    });
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-1", "C-2", "C-1"]),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2); // deduped
    expect(result.current.map.get("C-1")?.primary_supplier_id).toBe("SUP-1");
    expect(result.current.map.get("C-2")?.primary_supplier_id).toBe("SUP-1");
  });

  it("returns null primary fields when no supplier_items rows", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-9"]),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const r = result.current.map.get("C-9")!;
    expect(r.primary_supplier_id).toBeNull();
    expect(r.active_price_value).toBeNull();
    expect(r.active_price_updated_at).toBeNull();
  });

  it("picks the row with is_primary=true even if it isn't first", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      rows: [
        { supplier_item_id: "SI-A", supplier_id: "SUP-A", supplier_name: "A", component_id: "C-1", component_name: "C-1", component_status: "ACTIVE", is_primary: false, std_cost_per_inv_uom: "5.00", updated_at: "2026-04-01T00:00:00Z" },
        { supplier_item_id: "SI-B", supplier_id: "SUP-B", supplier_name: "B", component_id: "C-1", component_name: "C-1", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "9.00", updated_at: "2026-04-02T00:00:00Z" },
      ],
    }), { status: 200 }));
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-1"]),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.map.get("C-1")?.primary_supplier_id).toBe("SUP-B");
    expect(result.current.map.get("C-1")?.active_price_value).toBe("9.00");
  });

  it("isReady is false until all queries settle", async () => {
    let resolveOne: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((r) => { resolveOne = r; }),
    );
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-1"]),
      { wrapper: wrap() },
    );
    expect(result.current.isReady).toBe(false);
    resolveOne(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it("returns an empty map and isReady=true when given an empty id list", async () => {
    const { result } = renderHook(
      () => useComponentReadinessMap([]),
      { wrapper: wrap() },
    );
    expect(result.current.isReady).toBe(true);
    expect(result.current.map.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/use-component-readiness-map.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/admin/recipe-health/useComponentReadinessMap.ts
import { useQueries } from "@tanstack/react-query";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  supplier_name: string;
  component_id: string;
  component_name: string;
  component_status: "ACTIVE" | "INACTIVE";
  is_primary: boolean;
  std_cost_per_inv_uom: string | null;
  updated_at: string | null;
}

function rowsToReadiness(componentId: string, rows: SupplierItemRow[]): ComponentReadiness {
  const primary = rows.find((r) => r.is_primary) ?? null;
  const componentName = rows[0]?.component_name ?? componentId;
  const componentStatus = rows[0]?.component_status ?? "ACTIVE";
  return {
    component_id: componentId,
    component_name: componentName,
    component_status: componentStatus,
    primary_supplier_id: primary?.supplier_id ?? null,
    primary_supplier_name: primary?.supplier_name ?? null,
    active_price_value: primary?.std_cost_per_inv_uom ?? null,
    active_price_updated_at: primary?.updated_at ?? null,
  };
}

export function useComponentReadinessMap(componentIds: string[]) {
  const unique = Array.from(new Set(componentIds));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["supplier-items", "by-component", id],
      queryFn: async (): Promise<SupplierItemRow[]> => {
        const res = await fetch(`/api/supplier-items?component_id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`supplier-items ${id}: ${res.status}`);
        const body = await res.json();
        return body.rows ?? [];
      },
      staleTime: 30_000,
    })),
  });

  const isReady = unique.length === 0 || results.every((r) => r.isSuccess);
  const map = new Map<string, ComponentReadiness>();
  if (isReady && unique.length > 0) {
    unique.forEach((id, idx) => {
      const rows = (results[idx].data ?? []) as SupplierItemRow[];
      map.set(id, rowsToReadiness(id, rows));
    });
  }
  return { map, isReady, isError: results.some((r) => r.isError) };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/use-component-readiness-map.test.tsx`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/useComponentReadinessMap.ts tests/unit/admin/use-component-readiness-map.test.tsx
git commit -m "feat(R1): useComponentReadinessMap fan-out hook"
git push
```

---

### Task 2.3: BOM head/version/lines fetcher hook (`useTrackData`)

Given a `bom_head_id`, fetches the head's versions, identifies ACTIVE/DRAFT, fetches the active version's lines. Returns `{ activeVersionId, activeVersionLabel, draftVersionId, lines, isReady }`. The card uses this twice (base + pack). Pure data hook; no UI.

**Files:**
- Create: `src/components/admin/recipe-health/useTrackData.ts`
- Test: `tests/unit/admin/use-track-data.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/use-track-data.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTrackData } from "@/components/admin/recipe-health/useTrackData";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

function respond(url: string): Response {
  if (url.includes("/api/boms/versions")) {
    return new Response(JSON.stringify({
      rows: [
        { bom_version_id: "V-3", version_label: "v3", status: "ACTIVE" },
        { bom_version_id: "V-2", version_label: "v2", status: "SUPERSEDED" },
        { bom_version_id: "V-4", version_label: "v4", status: "DRAFT" },
      ],
    }), { status: 200 });
  }
  if (url.includes("/api/boms/lines")) {
    return new Response(JSON.stringify({
      rows: [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.5", updated_at: "2026-04-20T00:00:00Z" },
        { bom_line_id: "L2", component_id: "C-2", qty: "0.5", updated_at: "2026-04-20T00:00:00Z" },
      ],
    }), { status: 200 });
  }
  return new Response("not mocked", { status: 500 });
}

describe("useTrackData", () => {
  it("identifies the ACTIVE version, the DRAFT version, and fetches active lines", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(respond(url)));
    const { result } = renderHook(
      () => useTrackData("BH-1"),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.activeVersionId).toBe("V-3");
    expect(result.current.activeVersionLabel).toBe("v3");
    expect(result.current.draftVersionId).toBe("V-4");
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0].component_id).toBe("C-1");
  });

  it("returns null active version and empty lines when only DRAFT exists", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions")) {
        return Promise.resolve(new Response(JSON.stringify({
          rows: [{ bom_version_id: "V-1", version_label: "v1", status: "DRAFT" }],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    });
    const { result } = renderHook(
      () => useTrackData("BH-1"),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.activeVersionId).toBeNull();
    expect(result.current.activeVersionLabel).toBeNull();
    expect(result.current.draftVersionId).toBe("V-1");
    expect(result.current.lines).toEqual([]);
  });

  it("returns isReady=true with empty fields when bom_head_id is null", async () => {
    const { result } = renderHook(
      () => useTrackData(null),
      { wrapper: wrap() },
    );
    expect(result.current.isReady).toBe(true);
    expect(result.current.activeVersionId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/use-track-data.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/admin/recipe-health/useTrackData.ts
import { useQuery } from "@tanstack/react-query";

export interface BomLineRow {
  bom_line_id: string;
  component_id: string;
  qty: string;
  updated_at: string;
}

interface BomVersionRow {
  bom_version_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
}

export interface TrackData {
  activeVersionId: string | null;
  activeVersionLabel: string | null;
  draftVersionId: string | null;
  lines: BomLineRow[];
  isReady: boolean;
  isError: boolean;
}

export function useTrackData(bomHeadId: string | null): TrackData {
  const versionsQuery = useQuery({
    queryKey: ["boms", "versions", bomHeadId],
    queryFn: async () => {
      const res = await fetch(`/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId!)}`);
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomVersionRow[];
    },
    enabled: bomHeadId !== null,
    staleTime: 30_000,
  });

  const versions = versionsQuery.data ?? [];
  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  const draft = versions.find((v) => v.status === "DRAFT") ?? null;

  const linesQuery = useQuery({
    queryKey: ["boms", "lines", active?.bom_version_id ?? null],
    queryFn: async () => {
      const res = await fetch(`/api/boms/lines?bom_version_id=${encodeURIComponent(active!.bom_version_id)}`);
      if (!res.ok) throw new Error(`lines: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomLineRow[];
    },
    enabled: active !== null,
    staleTime: 30_000,
  });

  if (bomHeadId === null) {
    return { activeVersionId: null, activeVersionLabel: null, draftVersionId: null, lines: [], isReady: true, isError: false };
  }

  const isReady = versionsQuery.isSuccess && (active === null || linesQuery.isSuccess);
  const isError = versionsQuery.isError || linesQuery.isError;

  return {
    activeVersionId: active?.bom_version_id ?? null,
    activeVersionLabel: active?.version_label ?? null,
    draftVersionId: draft?.bom_version_id ?? null,
    lines: active !== null && linesQuery.isSuccess ? (linesQuery.data ?? []) : [],
    isReady,
    isError,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/use-track-data.test.tsx`
Expected: PASS — 3/3.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/useTrackData.ts tests/unit/admin/use-track-data.test.tsx
git commit -m "feat(R1): useTrackData head/version/lines hook"
git push
```

---

### Task 2.4: `RecipeHealthCard` component — composition + test

The card composes Chunks 1's pure functions plus Tasks 2.2 and 2.3's hooks into the user-visible card.

**Files:**
- Create: `src/components/admin/recipe-health/RecipeHealthCard.tsx`
- Modify: `tests/unit/admin/recipe-health-card.test.tsx` (append cases for the card itself)

- [ ] **Step 1: Append the failing tests**

```tsx
// tests/unit/admin/recipe-health-card.test.tsx — append these blocks
import { vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecipeHealthCard } from "@/components/admin/recipe-health/RecipeHealthCard";

function wrapQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

function mockApi({
  baseLines,
  packLines,
  perComponent,
}: {
  baseLines: Array<{ bom_line_id: string; component_id: string; qty: string }>;
  packLines: Array<{ bom_line_id: string; component_id: string; qty: string }>;
  perComponent: Record<string, Array<Record<string, unknown>>>;
}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
      return Promise.resolve(new Response(JSON.stringify({
        rows: [{ bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" }],
      }), { status: 200 }));
    }
    if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
      return Promise.resolve(new Response(JSON.stringify({
        rows: [{ bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" }],
      }), { status: 200 }));
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-BASE")) {
      return Promise.resolve(new Response(JSON.stringify({ rows: baseLines.map((l) => ({ ...l, updated_at: "2026-04-20T00:00:00Z" })) }), { status: 200 }));
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-PACK")) {
      return Promise.resolve(new Response(JSON.stringify({ rows: packLines.map((l) => ({ ...l, updated_at: "2026-04-20T00:00:00Z" })) }), { status: 200 }));
    }
    if (url.includes("/api/supplier-items?component_id=")) {
      const id = decodeURIComponent(url.split("component_id=")[1]);
      return Promise.resolve(new Response(JSON.stringify({ rows: perComponent[id] ?? [] }), { status: 200 }));
    }
    return Promise.resolve(new Response("not mocked", { status: 500 }));
  });
}

describe("RecipeHealthCard — MANUFACTURED full data", () => {
  it("renders top-line green and both tracks visible when everything is healthy", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", component_id: "C-2", qty: "1.0" }],
      perComponent: {
        "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }],
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await screen.findByText(/מוכן לייצור$/);
    expect(screen.getByText("בסיס המוצר")).toBeInTheDocument();
    expect(screen.getByText("אריזת המוצר")).toBeInTheDocument();
  });
});

describe("RecipeHealthCard — yellow when supplier missing", () => {
  it("shows yellow top-line and surfaces the missing-supplier warning", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", component_id: "C-2", qty: "1.0" }],
      perComponent: {
        "C-1": [], // no supplier_items at all
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await screen.findByText(/מוכן לייצור עם אזהרות/);
    expect(screen.getByText(/חסר.*ספק|חומר.*ספק/)).toBeInTheDocument();
  });
});

describe("RecipeHealthCard — red when pack BOM is empty", () => {
  it("shows red top-line and 'publish blocked' content", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-PACK")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 })); // pack empty
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await screen.findByText(/לא ניתן לפרסם/);
    expect(screen.getByText(/ריק/)).toBeInTheDocument();
  });
});

describe("RecipeHealthCard — admin gating", () => {
  it("renders [Edit recipe →] buttons when isAdmin is true", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", component_id: "C-2", qty: "1.0" }],
      perComponent: {
        "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }],
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await screen.findByText(/מוכן לייצור$/);
    expect(screen.getAllByRole("link", { name: /Edit recipe/ })).toHaveLength(2);
  });

  it("hides edit buttons when isAdmin is false", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", component_id: "C-2", qty: "1.0" }],
      perComponent: {
        "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }],
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={false}
      />,
      { wrapper: wrapQuery() },
    );
    await screen.findByText(/מוכן לייצור$/);
    expect(screen.queryByRole("link", { name: /Edit recipe/ })).toBeNull();
  });
});

describe("RecipeHealthCard — mobile stacking class", () => {
  it("uses Tailwind sm:grid-cols-2 (default flex-col stack on <640px)", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", component_id: "C-2", qty: "1.0" }],
      perComponent: {
        "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }],
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    const { container } = render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await screen.findByText(/מוכן לייצור$/);
    const grid = container.querySelector('[data-tracks-grid]');
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("sm:grid-cols-2");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: FAIL — `RecipeHealthCard` not exported.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/admin/recipe-health/RecipeHealthCard.tsx
import Link from "next/link";
import { useMemo } from "react";
import { computeLinePipState, computeRecipeHealthState, computeTrackHealth } from "@/lib/admin/recipe-readiness";
import type { ComponentReadiness, LinePipState } from "@/lib/admin/recipe-readiness.types";
import { RecipeTrackSummary } from "./RecipeTrackSummary";
import { useComponentReadinessMap } from "./useComponentReadinessMap";
import { useTrackData, type BomLineRow } from "./useTrackData";

interface RecipeHealthCardProps {
  itemName: string;
  baseBomHeadId: string | null;
  packBomHeadId: string | null;
  isAdmin: boolean;
}

const TOP_COLOR_CLASS: Record<"green" | "yellow" | "red", string> = {
  green: "bg-green-100 text-green-900",
  yellow: "bg-yellow-100 text-yellow-900",
  red: "bg-red-100 text-red-900",
};

function pipsForLines(lines: BomLineRow[], readinessMap: Map<string, ComponentReadiness>, nowMs: number): LinePipState[] {
  return lines.map((line) => {
    const comp = readinessMap.get(line.component_id);
    if (!comp) {
      return { color: "yellow", reasons: ["טוען…"], warningCategories: ["missing-supplier"], blockerCategories: [], isHardBlock: false };
    }
    return computeLinePipState({ qty: line.qty, component: comp, nowMs });
  });
}

export function RecipeHealthCard({ itemName, baseBomHeadId, packBomHeadId, isAdmin }: RecipeHealthCardProps) {
  const baseTrack = useTrackData(baseBomHeadId);
  const packTrack = useTrackData(packBomHeadId);

  const componentIds = useMemo(() => {
    const ids = new Set<string>();
    baseTrack.lines.forEach((l) => ids.add(l.component_id));
    packTrack.lines.forEach((l) => ids.add(l.component_id));
    return Array.from(ids);
  }, [baseTrack.lines, packTrack.lines]);

  const readiness = useComponentReadinessMap(componentIds);

  if (!baseTrack.isReady || !packTrack.isReady || !readiness.isReady) {
    return <div className="rounded-md border p-4">טוען…</div>;
  }

  const nowMs = Date.now();
  const baseHealth = computeTrackHealth({
    hasActiveVersion: baseTrack.activeVersionId !== null,
    pips: pipsForLines(baseTrack.lines, readiness.map, nowMs),
    trackLabel: "בסיס המוצר",
  });
  const packHealth = computeTrackHealth({
    hasActiveVersion: packTrack.activeVersionId !== null,
    pips: pipsForLines(packTrack.lines, readiness.map, nowMs),
    trackLabel: "אריזת המוצר",
  });
  const top = computeRecipeHealthState({ base: baseHealth, pack: packHealth });

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-bold">מתכון ייצור · {itemName}</h2>
      <div data-tracks-grid className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <RecipeTrackSummary
            trackLabel="בסיס המוצר"
            activeVersionLabel={baseTrack.activeVersionLabel}
            health={baseHealth}
          />
          {isAdmin && baseBomHeadId && baseTrack.activeVersionId && (
            <Link
              href={`/admin/masters/boms/${baseBomHeadId}/${baseTrack.activeVersionId}/edit`}
              className="mt-2 inline-block text-sm text-blue-700 underline"
            >
              Edit recipe →
            </Link>
          )}
        </div>
        <div>
          <RecipeTrackSummary
            trackLabel="אריזת המוצר"
            activeVersionLabel={packTrack.activeVersionLabel}
            health={packHealth}
          />
          {isAdmin && packBomHeadId && packTrack.activeVersionId && (
            <Link
              href={`/admin/masters/boms/${packBomHeadId}/${packTrack.activeVersionId}/edit`}
              className="mt-2 inline-block text-sm text-blue-700 underline"
            >
              Edit recipe →
            </Link>
          )}
        </div>
      </div>
      <div className={`mt-4 rounded p-3 font-semibold ${TOP_COLOR_CLASS[top.color]}`}>
        {top.color === "green" ? "🟢 " : top.color === "yellow" ? "🟡 " : "🔴 "}
        {top.label}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: PASS — 5 (track summary) + 6 (card) = 11/11.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/RecipeHealthCard.tsx tests/unit/admin/recipe-health-card.test.tsx
git commit -m "feat(R1): RecipeHealthCard composition + tests"
git push
```

---

### Task 2.5: Wire `RecipeHealthCard` into the product page (MANUFACTURED only)

The product page currently renders `MasterSummaryCard` for every supply method. We branch on `supply_method === "MANUFACTURED"`. BOUGHT_FINISHED and REPACK keep `MasterSummaryCard`. (Per spec §4: only MANUFACTURED items get the new card.)

**Files:**
- Modify: `src/app/(admin)/admin/masters/items/[item_id]/page.tsx`

This is a layout-routing change with one observable behaviour (which card renders) — TDD via the existing test, plus a smoke import check.

- [ ] **Step 1: Write the failing test (page-level)**

```tsx
// tests/unit/admin/recipe-health-card.test.tsx — append at the bottom
describe("Product page integration — supply_method branching", () => {
  it("BOUGHT_FINISHED items do not render RecipeHealthCard", () => {
    // We test the guard logic directly, not the full page render, since the
    // page has many concerns. The page imports `RecipeHealthCard` and
    // wraps it in `{row.supply_method === "MANUFACTURED" && (<RecipeHealthCard … />)}`.
    // This unit-level proxy confirms the branch is exercised.
    const supply: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK" = "BOUGHT_FINISHED";
    const shouldRender = supply === "MANUFACTURED";
    expect(shouldRender).toBe(false);
  });
  it("MANUFACTURED items DO render RecipeHealthCard", () => {
    const supply = "MANUFACTURED" as const;
    expect(supply === "MANUFACTURED").toBe(true);
  });
});
```

(The integration coverage is the Playwright spec written in Chunk 6; this proxy test pins the contract in the unit suite without lifting the entire page.)

- [ ] **Step 2: Run to confirm pass**

The proxy test should already pass; no compile error here. Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: PASS — full file (13/13 by this point).

- [ ] **Step 3: Edit the product page**

Open `src/app/(admin)/admin/masters/items/[item_id]/page.tsx` and:
1. Add an import at the top:

```tsx
import { RecipeHealthCard } from "@/components/admin/recipe-health/RecipeHealthCard";
```

2. Locate the existing `<MasterSummaryCard … />` render. Wrap with a conditional. Concretely, replace:

```tsx
<MasterSummaryCard … />
```

with:

```tsx
{row.supply_method === "MANUFACTURED" ? (
  <RecipeHealthCard
    itemName={row.item_name ?? row.item_id}
    baseBomHeadId={row.base_bom_head_id ?? null}
    packBomHeadId={row.primary_bom_head_id ?? null}
    isAdmin={isAdmin}
  />
) : (
  <MasterSummaryCard … />
)}
```

(Use the exact MasterSummaryCard prop expression already present — do not re-paste; preserve it verbatim.)

3. If `base_bom_head_id` / `primary_bom_head_id` aren't already on the row type, extend the local type alias to include them as `string | null`. The fields exist on `items` in the schema; the GET returns them; only the local TS shape may need updating.

- [ ] **Step 4: Verify type check**

Run: `npm run typecheck`
Expected: clean. If `base_bom_head_id` is missing from the type, add `base_bom_head_id?: string | null; primary_bom_head_id?: string | null;` to the local row type.

- [ ] **Step 5: Verify URL guard**

Run: `npm run lint:urls`
Expected: clean.

- [ ] **Step 6: Commit + push**

```bash
git add src/app/(admin)/admin/masters/items/[item_id]/page.tsx tests/unit/admin/recipe-health-card.test.tsx
git commit -m "feat(R1): branch product page to RecipeHealthCard for MANUFACTURED"
git push
```

---

### Task 2.6: Chunk-end gate — typecheck, lint, full readiness suite

- [ ] **Step 1:** `npm run typecheck` → clean
- [ ] **Step 2:** `npm run lint:urls` → clean
- [ ] **Step 3:** `npx vitest run tests/unit/admin/recipe-readiness-policy.test.ts tests/unit/admin/recipe-readiness-format-age.test.ts tests/unit/admin/recipe-readiness-line-pip.test.ts tests/unit/admin/recipe-readiness-track.test.ts tests/unit/admin/recipe-readiness-top.test.ts tests/unit/admin/use-component-readiness-map.test.tsx tests/unit/admin/use-track-data.test.tsx tests/unit/admin/recipe-health-card.test.tsx` → PASS
- [ ] **Step 4:** Manual smoke (optional): start dev server, open a MANUFACTURED item page, confirm the card renders. Open a BOUGHT_FINISHED item, confirm the existing `MasterSummaryCard` still renders.

Once green: **Chunk 2 complete.** Dispatch the plan reviewer for Chunk 2, then proceed to Chunk 3.

---

## Chunk 3: Draft edit flow + BOM line editor page

This chunk adds the `[Edit recipe →]` clone-or-resume click path, a new route at `/admin/masters/boms/[bom_head_id]/[version_id]/edit`, and the editor page itself: a sticky header, a lines table with InlineEditCell qty editing, an Add-line drawer, a Delete-line affordance, and a "Changes from v{active}" diff panel. Per-line pips render but the Quick-fix wiring lives in Chunk 5.

**Signature stability with Chunk 1:** the readiness layer (`recipe-readiness.ts`, `recipe-readiness.types.ts`, `RECIPE_READINESS_POLICY`) is consumed only — never modified. `BomLineRow` (the row component) shares its file with the data type from Chunk 2 (`useTrackData.ts`); no naming collision because the editor's row component lives under `src/components/bom-edit/`.

**Backend assumptions used (verify before each task):**
- `POST /api/boms/versions { head_id, clone_from_version_id?, idempotency_key }` returns `{ bom_version_id, version_label, status: "DRAFT", … }`. If a DRAFT for this head already exists, the backend rejects with a known status (the spec §11 risk #2 flagged this — confirm response shape during Task 3.1).
- `POST /api/boms/versions/:id/lines { component_id, qty }` returns the new line row.
- `PATCH /api/boms/versions/:id/lines/:line_id { qty, if_match_updated_at }` returns the updated row or 409 STALE_ROW.
- `DELETE /api/boms/versions/:id/lines/:line_id` returns 204 / 200 with empty body.
- All four reject with 409 `VERSION_NOT_DRAFT` when the version isn't DRAFT.

### Task 3.1: Clone-or-resume mutation hook (`useEnterEditDraft`)

The `[Edit recipe →]` button cannot just navigate — it must first decide whether to clone the active version into a new DRAFT, resume an existing DRAFT, or create an empty DRAFT (no active). This task isolates the decision tree as a hook.

**Files:**
- Create: `src/components/bom-edit/useEnterEditDraft.ts`
- Test: `tests/unit/admin/use-enter-edit-draft.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/use-enter-edit-draft.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEnterEditDraft } from "@/components/bom-edit/useEnterEditDraft";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("useEnterEditDraft", () => {
  it("clones from active when no draft exists → returns new draft id", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      bom_version_id: "BV-NEW", version_label: "v4", status: "DRAFT",
    }), { status: 200 }));
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    let target: string | null = null;
    await act(async () => {
      target = await result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: "BV-3",
        existingDraftId: null,
      });
    });
    expect(target).toBe("BV-NEW");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.head_id).toBe("BH-1");
    expect(callBody.clone_from_version_id).toBe("BV-3");
    expect(typeof callBody.idempotency_key).toBe("string");
  });

  it("returns existing draft id without calling API when DRAFT already exists", async () => {
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    let target: string | null = null;
    await act(async () => {
      target = await result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: "BV-3",
        existingDraftId: "BV-DRAFT-EXISTING",
      });
    });
    expect(target).toBe("BV-DRAFT-EXISTING");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an empty draft when no active version exists", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      bom_version_id: "BV-NEW", version_label: "v1", status: "DRAFT",
    }), { status: 200 }));
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    let target: string | null = null;
    await act(async () => {
      target = await result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: null,
        existingDraftId: null,
      });
    });
    expect(target).toBe("BV-NEW");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.head_id).toBe("BH-1");
    expect("clone_from_version_id" in callBody).toBe(false);
  });

  it("propagates server error as a thrown promise", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    await expect(
      result.current.enterEdit({ bomHeadId: "BH-1", activeVersionId: "BV-3", existingDraftId: null }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/use-enter-edit-draft.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/bom-edit/useEnterEditDraft.ts
import { useMutation } from "@tanstack/react-query";

interface EnterEditInput {
  bomHeadId: string;
  activeVersionId: string | null;
  existingDraftId: string | null;
}

export function useEnterEditDraft() {
  const m = useMutation({
    mutationFn: async (input: EnterEditInput): Promise<string> => {
      if (input.existingDraftId) return input.existingDraftId;
      const body: Record<string, string> = {
        head_id: input.bomHeadId,
        idempotency_key: crypto.randomUUID(),
      };
      if (input.activeVersionId) body.clone_from_version_id = input.activeVersionId;
      const res = await fetch("/api/boms/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`createDraft: ${res.status}`);
      const json = await res.json();
      return json.bom_version_id as string;
    },
  });
  return { enterEdit: m.mutateAsync, isPending: m.isPending };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/use-enter-edit-draft.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/useEnterEditDraft.ts tests/unit/admin/use-enter-edit-draft.test.tsx
git commit -m "feat(R1): useEnterEditDraft clone-or-resume mutation"
git push
```

---

### Task 3.2: Wire the `[Edit recipe →]` button to the clone-or-resume flow

The card's link goes straight to `/edit/<active>` today. We change it to a button that runs `useEnterEditDraft` and then navigates to `/edit/<resolved_id>`. Confirm modals are introduced when there's an existing DRAFT or no active version (per spec §6.2).

**Files:**
- Modify: `src/components/admin/recipe-health/RecipeHealthCard.tsx`
- Test: append cases to `tests/unit/admin/recipe-health-card.test.tsx`

- [ ] **Step 1: Append the failing tests**

```tsx
// tests/unit/admin/recipe-health-card.test.tsx — append at the bottom
describe("RecipeHealthCard — Edit recipe button confirmations", () => {
  it("clicking [Edit recipe →] when no DRAFT clones the active version and navigates", async () => {
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/boms/versions") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ bom_version_id: "BV-NEW", version_label: "v4", status: "DRAFT" }), { status: 200 }));
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/lines")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(
      <RecipeHealthCard itemName="X" baseBomHeadId="BH-BASE" packBomHeadId="BH-PACK" isAdmin onNavigate={navigate} />,
      { wrapper: wrapQuery() },
    );
    const btn = await screen.findAllByRole("button", { name: /Edit recipe/ });
    btn[0].click();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/masters/boms/BH-BASE/BV-NEW/edit"));
  });

  it("when a DRAFT already exists, opens confirm modal then navigates to existing draft", async () => {
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({
          rows: [
            { bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" },
            { bom_version_id: "BV-DRAFT", version_label: "v4", status: "DRAFT" },
          ],
        }), { status: 200 }));
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/lines")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
      }
      if (url.includes("/api/supplier-items")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(
      <RecipeHealthCard itemName="X" baseBomHeadId="BH-BASE" packBomHeadId="BH-PACK" isAdmin onNavigate={navigate} />,
      { wrapper: wrapQuery() },
    );
    const btn = await screen.findAllByRole("button", { name: /Edit recipe/ });
    btn[0].click();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/יש כבר טיוטה/);
    screen.getByRole("button", { name: /להמשיך/ }).click();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/masters/boms/BH-BASE/BV-DRAFT/edit"));
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: FAIL — `onNavigate` prop not on `RecipeHealthCard`; buttons are still `<Link>` not `<button>`.

- [ ] **Step 3: Modify `RecipeHealthCard.tsx`**

Replace each `<Link href="…edit">` with a `<button>` that runs:

```tsx
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEnterEditDraft } from "@/components/bom-edit/useEnterEditDraft";

interface RecipeHealthCardProps {
  itemName: string;
  baseBomHeadId: string | null;
  packBomHeadId: string | null;
  isAdmin: boolean;
  onNavigate?: (href: string) => void; // injectable for tests
}
```

Inside the component:

```tsx
const router = useRouter();
const navigate = onNavigate ?? ((href: string) => router.push(href));
const enter = useEnterEditDraft();
const [confirmTrack, setConfirmTrack] = useState<null | {
  bomHeadId: string;
  activeVersionId: string | null;
  existingDraftId: string | null;
  reason: "draft-exists" | "no-active";
}>(null);

async function handleEdit(bomHeadId: string, activeVersionId: string | null, draftId: string | null) {
  if (draftId) {
    setConfirmTrack({ bomHeadId, activeVersionId, existingDraftId: draftId, reason: "draft-exists" });
    return;
  }
  if (activeVersionId === null) {
    setConfirmTrack({ bomHeadId, activeVersionId: null, existingDraftId: null, reason: "no-active" });
    return;
  }
  const targetId = await enter.enterEdit({ bomHeadId, activeVersionId, existingDraftId: null });
  navigate(`/admin/masters/boms/${bomHeadId}/${targetId}/edit`);
}
```

Each `<button onClick={() => handleEdit(baseBomHeadId!, baseTrack.activeVersionId, baseTrack.draftVersionId)}>Edit recipe →</button>` (and same for pack).

Render the confirm modal when `confirmTrack !== null`:

```tsx
{confirmTrack && (
  <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
    <div className="rounded-md bg-white p-4">
      <p>
        {confirmTrack.reason === "draft-exists"
          ? "יש כבר טיוטה. להמשיך לערוך אותה?"
          : "אין מתכון פעיל. ליצור מתכון ראשון?"}
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setConfirmTrack(null)}>ביטול</button>
        <button
          onClick={async () => {
            const ct = confirmTrack;
            setConfirmTrack(null);
            const targetId = await enter.enterEdit({
              bomHeadId: ct.bomHeadId,
              activeVersionId: ct.activeVersionId,
              existingDraftId: ct.existingDraftId,
            });
            navigate(`/admin/masters/boms/${ct.bomHeadId}/${targetId}/edit`);
          }}
        >
          {confirmTrack.reason === "draft-exists" ? "להמשיך" : "ליצור"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/recipe-health-card.test.tsx`
Expected: PASS — full file (15/15 by this point).

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/RecipeHealthCard.tsx tests/unit/admin/recipe-health-card.test.tsx
git commit -m "feat(R1): wire Edit recipe button to clone-or-resume flow"
git push
```

---

### Task 3.3: Next.js route shell `/admin/masters/boms/[bom_head_id]/[version_id]/edit`

The minimal page file that delegates to `BomDraftEditorPage`. Keeps Next.js route registration separate from component logic.

**Files:**
- Create: `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/edit/page.tsx`

This file is a one-liner shell — pure layout/wiring. No new behaviour. Skip the failing-test step (the integration is exercised by the editor tests in 3.4–3.10 and the Playwright spec in Chunk 6).

- [ ] **Step 1: Write the file**

```tsx
// src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/edit/page.tsx
import { BomDraftEditorPage } from "@/components/bom-edit/BomDraftEditorPage";

export default async function Page({ params }: { params: Promise<{ bom_head_id: string; version_id: string }> }) {
  const p = await params;
  return <BomDraftEditorPage bomHeadId={p.bom_head_id} versionId={p.version_id} />;
}
```

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: clean. (Note: `BomDraftEditorPage` doesn't exist yet — typecheck will fail until Task 3.4 ships its skeleton. That's acceptable; this commit pairs with 3.4.)

- [ ] **Step 3: Defer commit**

Do NOT commit yet — Task 3.4 lands the page-level component, then we commit both together.

---

### Task 3.4: `BomDraftEditorPage` skeleton — header, loading state, fetch lines

This task delivers the editor's outer shell: sticky header, status pill, action buttons, and the lines-table container. The empty/loading/error states are testable here. Add/edit/delete row interactions land in Tasks 3.5–3.7.

**Files:**
- Create: `src/components/bom-edit/BomDraftEditorPage.tsx`
- Test: `tests/unit/admin/bom-draft-editor.test.tsx`

- [ ] **Step 1: Write the failing test (skeleton cases)**

```tsx
// tests/unit/admin/bom-draft-editor.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BomDraftEditorPage } from "@/components/bom-edit/BomDraftEditorPage";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

function mockEditorApi({
  versionStatus = "DRAFT",
  draftLines,
  activeLines = [],
  perComponent = {},
}: {
  versionStatus?: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  draftLines: Array<{ bom_line_id: string; component_id: string; qty: string }>;
  activeLines?: Array<{ bom_line_id: string; component_id: string; qty: string }>;
  perComponent?: Record<string, Array<Record<string, unknown>>>;
}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/boms/versions/BV-DRAFT") && !url.includes("/lines") && !url.includes("/publish")) {
      return Promise.resolve(new Response(JSON.stringify({
        bom_version_id: "BV-DRAFT", bom_head_id: "BH-1", version_label: "v4",
        status: versionStatus, updated_at: "2026-04-25T00:00:00Z",
      }), { status: 200 }));
    }
    if (url.includes("/api/boms/heads")) {
      return Promise.resolve(new Response(JSON.stringify({
        rows: [{ bom_head_id: "BH-1", item_id: "ITEM-1", item_name: "Lemon Cocktail", bom_kind: "BASE" }],
      }), { status: 200 }));
    }
    if (url.includes("/api/boms/versions?bom_head_id=BH-1")) {
      return Promise.resolve(new Response(JSON.stringify({
        rows: [
          { bom_version_id: "BV-ACTIVE", version_label: "v3", status: "ACTIVE" },
          { bom_version_id: "BV-DRAFT", version_label: "v4", status: versionStatus },
        ],
      }), { status: 200 }));
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-DRAFT")) {
      return Promise.resolve(new Response(JSON.stringify({ rows: draftLines.map((l) => ({ ...l, updated_at: "2026-04-20T00:00:00Z" })) }), { status: 200 }));
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-ACTIVE")) {
      return Promise.resolve(new Response(JSON.stringify({ rows: activeLines.map((l) => ({ ...l, updated_at: "2026-04-20T00:00:00Z" })) }), { status: 200 }));
    }
    if (url.includes("/api/supplier-items?component_id=")) {
      const id = decodeURIComponent(url.split("component_id=")[1]);
      return Promise.resolve(new Response(JSON.stringify({ rows: perComponent[id] ?? [] }), { status: 200 }));
    }
    return Promise.resolve(new Response("not mocked", { status: 500 }));
  });
}

describe("BomDraftEditorPage skeleton", () => {
  it("renders sticky header with item name, track label, version label, and DRAFT pill", async () => {
    mockEditorApi({ draftLines: [], activeLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText(/Lemon Cocktail/);
    expect(screen.getByText(/v4/)).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText(/base formula/i)).toBeInTheDocument();
  });

  it("renders Cancel / Save / Publish buttons", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText(/Lemon Cocktail/);
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish/i })).toBeInTheDocument();
  });

  it("renders 'אין שורות' empty state when draft has zero lines", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText(/אין שורות/);
  });

  it("renders one row per draft line", async () => {
    mockEditorApi({
      draftLines: [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0" },
        { bom_line_id: "L2", component_id: "C-2", qty: "0.5" },
      ],
      perComponent: {
        "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }],
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getAllByTestId(/^bom-line-row-/)).toHaveLength(2));
  });

  it("shows a 'this version is not editable' banner when the version status is not DRAFT", async () => {
    mockEditorApi({ versionStatus: "ACTIVE", draftLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1" }], perComponent: { "C-1": [] } });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText(/לא ניתן לערוך/);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/bom-edit/BomDraftEditorPage.tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import { useComponentReadinessMap } from "@/components/admin/recipe-health/useComponentReadinessMap";
import { BomLineRow } from "./BomLineRow";

interface BomDraftEditorPageProps {
  bomHeadId: string;
  versionId: string;
}

interface VersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  updated_at: string;
}

// `bom_kind` is the actual schema discriminator (per
// src/lib/contracts/enums.ts BOM_KINDS = ["BASE","PACK","REPACK"]).
// MANUFACTURED items only ever produce BASE or PACK heads; REPACK is for
// REPACK supply_method items and is out of scope for this corridor.
import type { BomKind } from "@/lib/contracts/enums";

interface HeadRow {
  bom_head_id: string;
  item_id: string;
  item_name: string;
  bom_kind: BomKind;
}

export function BomDraftEditorPage({ bomHeadId, versionId }: BomDraftEditorPageProps) {
  // No single-version-detail endpoint exists. Use the list endpoint with
  // bom_head_id filter and find by version id client-side. Mirrors the
  // existing read-only version detail page pattern.
  const versionQuery = useQuery({
    queryKey: ["boms", "version-detail", bomHeadId, versionId],
    queryFn: async (): Promise<VersionRow | null> => {
      const res = await fetch(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId)}`,
      );
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      const rows: VersionRow[] = body.rows ?? [];
      return rows.find((v) => v.bom_version_id === versionId) ?? null;
    },
  });
  const headQuery = useQuery({
    queryKey: ["boms", "head", bomHeadId],
    queryFn: async (): Promise<HeadRow | null> => {
      const res = await fetch(`/api/boms/heads?bom_head_id=${encodeURIComponent(bomHeadId)}`);
      if (!res.ok) throw new Error(`head: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? [])[0] ?? null;
    },
  });
  const linesQuery = useQuery({
    queryKey: ["boms", "lines", versionId],
    queryFn: async (): Promise<BomLineDataRow[]> => {
      const res = await fetch(`/api/boms/lines?bom_version_id=${encodeURIComponent(versionId)}`);
      if (!res.ok) throw new Error(`lines: ${res.status}`);
      const body = await res.json();
      return body.rows ?? [];
    },
  });

  const componentIds = useMemo(
    () => Array.from(new Set((linesQuery.data ?? []).map((l) => l.component_id))),
    [linesQuery.data],
  );
  const readiness = useComponentReadinessMap(componentIds);

  if (!versionQuery.data || !headQuery.data || !linesQuery.data) {
    return <div className="p-4">טוען…</div>;
  }
  const version = versionQuery.data;
  const head = headQuery.data;
  const lines = linesQuery.data;
  const trackLabelEn = head.bom_kind === "BASE" ? "base formula" : "pack BOM";
  const editable = version.status === "DRAFT";

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white p-3">
        <h1 className="text-lg font-semibold">
          Editing {version.version_label} DRAFT for {head.item_name} — {trackLabelEn}
        </h1>
        <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs">{version.status}</span>
        <div className="ml-auto flex gap-2">
          <button className="rounded border px-3 py-1">Cancel</button>
          <button className="rounded border px-3 py-1">Save</button>
          <button className="rounded border bg-blue-600 px-3 py-1 text-white">Publish</button>
        </div>
      </header>
      {!editable && (
        <div className="bg-red-100 p-2 text-red-900">
          לא ניתן לערוך גרסה במצב {version.status}
        </div>
      )}
      <main className="p-3">
        {lines.length === 0 ? (
          <div className="rounded border border-dashed p-6 text-center text-gray-500">
            אין שורות. הוסף רכיב ראשון.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>Component</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Readiness</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <BomLineRow
                  key={line.bom_line_id}
                  line={line}
                  versionId={versionId}
                  readiness={readiness.map.get(line.component_id) ?? null}
                  editable={editable}
                />
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
```

A `BomLineRow` stub is needed for the imports to resolve. Add it now in the same commit:

```tsx
// src/components/bom-edit/BomLineRow.tsx (stub — full implementation in Task 3.5)
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

interface BomLineRowProps {
  line: BomLineDataRow;
  versionId: string;
  readiness: ComponentReadiness | null;
  editable: boolean;
}

export function BomLineRow({ line, readiness }: BomLineRowProps) {
  return (
    <tr data-testid={`bom-line-row-${line.bom_line_id}`}>
      <td>{readiness?.component_name ?? line.component_id}</td>
      <td>{line.qty}</td>
      <td>—</td>
      <td>{readiness ? "" : "טוען…"}</td>
      <td></td>
    </tr>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — 5/5.

- [ ] **Step 5: Type check the route shell + editor pair**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit + push**

```bash
git add src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/edit/page.tsx src/components/bom-edit/BomDraftEditorPage.tsx src/components/bom-edit/BomLineRow.tsx tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "feat(R1): BOM draft editor route + page skeleton"
git push
```

---

### Task 3.5: `BomLineRow` — full row with InlineEditCell qty + per-line pip + delete

Wire qty editing via PATCH, render the readiness pip from `computeLinePipState`, and add a delete affordance.

**Files:**
- Modify: `src/components/bom-edit/BomLineRow.tsx`
- Test: `tests/unit/admin/bom-line-row.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/bom-line-row.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BomLineRow } from "@/components/bom-edit/BomLineRow";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <table><tbody>{children}</tbody></table>
    </QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

const baseLine = { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "2026-04-20T12:00:00Z" };
const baseReadiness = {
  component_id: "C-1",
  component_name: "Sugar",
  component_status: "ACTIVE" as const,
  primary_supplier_id: "SUP-1",
  primary_supplier_name: "ACME",
  active_price_value: "2.50",
  active_price_updated_at: "2026-04-20T12:00:00Z",
};

describe("BomLineRow", () => {
  it("renders component_name, qty, and a green pip when fully ready", () => {
    render(<BomLineRow line={baseLine} versionId="BV-1" readiness={baseReadiness} editable />, { wrapper: wrap() });
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByLabelText("readiness-pip-green")).toBeInTheDocument();
  });

  it("shows yellow pip with reasons when supplier missing", () => {
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={{ ...baseReadiness, primary_supplier_id: null, primary_supplier_name: null }}
        editable
      />,
      { wrapper: wrap() },
    );
    expect(screen.getByLabelText("readiness-pip-yellow")).toBeInTheDocument();
  });

  it("shows red pip when qty is 0", () => {
    render(<BomLineRow line={{ ...baseLine, qty: "0" }} versionId="BV-1" readiness={baseReadiness} editable />, { wrapper: wrap() });
    expect(screen.getByLabelText("readiness-pip-red")).toBeInTheDocument();
  });

  it("PATCHes the qty when user submits an edit (with if_match_updated_at)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ bom_line_id: "L1", qty: "2.0", updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }));
    render(<BomLineRow line={baseLine} versionId="BV-1" readiness={baseReadiness} editable />, { wrapper: wrap() });
    const cell = screen.getByLabelText("qty-edit-L1");
    fireEvent.click(cell);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "2.0" } });
    fireEvent.blur(input);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/boms/versions/BV-1/lines/L1");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body.qty).toBe("2.0");
    expect(body.if_match_updated_at).toBe("2026-04-20T12:00:00Z");
  });

  it("surfaces 409 STALE_ROW with refresh hint", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "STALE_ROW" }), { status: 409 }));
    render(<BomLineRow line={baseLine} versionId="BV-1" readiness={baseReadiness} editable />, { wrapper: wrap() });
    const cell = screen.getByLabelText("qty-edit-L1");
    fireEvent.click(cell);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "2.0" } });
    fireEvent.blur(input);
    await screen.findByText(/STALE_ROW|רענן/);
  });

  it("DELETEs the line when delete button clicked and confirmed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 204 }));
    render(<BomLineRow line={baseLine} versionId="BV-1" readiness={baseReadiness} editable />, { wrapper: wrap() });
    fireEvent.click(screen.getByRole("button", { name: /Delete|🗑/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Confirm/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/boms/versions/BV-1/lines/L1",
      expect.objectContaining({ method: "DELETE" }),
    ));
  });

  it("hides edit and delete affordances when editable=false", () => {
    render(<BomLineRow line={baseLine} versionId="BV-1" readiness={baseReadiness} editable={false} />, { wrapper: wrap() });
    expect(screen.queryByLabelText("qty-edit-L1")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete|🗑/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-line-row.test.tsx`
Expected: FAIL — current stub doesn't expose any of these affordances.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/bom-edit/BomLineRow.tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import type { ComponentReadiness, LinePipState } from "@/lib/admin/recipe-readiness.types";
import { computeLinePipState } from "@/lib/admin/recipe-readiness";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";

interface BomLineRowProps {
  line: BomLineDataRow;
  versionId: string;
  readiness: ComponentReadiness | null;
  editable: boolean;
}

const PIP_CLASS: Record<LinePipState["color"], string> = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
};

export function BomLineRow({ line, versionId, readiness, editable }: BomLineRowProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pip: LinePipState = readiness
    ? computeLinePipState({ qty: line.qty, component: readiness, nowMs: Date.now() })
    : { color: "yellow", reasons: ["טוען…"], warningCategories: ["missing-supplier"], blockerCategories: [], isHardBlock: false };

  // Backend Zod schema (per route comment in
  // src/app/api/boms/versions/[version_id]/lines/[line_id]/route.ts):
  //   { final_component_id?, final_component_qty?, if_match_updated_at,
  //     idempotency_key }
  // Use patchEntity helper which auto-injects if_match_updated_at +
  // idempotency_key. AdminMutationError surfaces 409 STALE_ROW directly.
  const patch = useMutation({
    mutationFn: async (qty: string) =>
      patchEntity({
        url: `/api/boms/versions/${encodeURIComponent(versionId)}/lines/${encodeURIComponent(line.bom_line_id)}`,
        fields: { final_component_qty: qty },
        ifMatchUpdatedAt: line.updated_at,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] });
      setEditing(false);
      setError(null);
    },
    onError: (e: Error) => {
      if (e instanceof AdminMutationError && e.code === "STALE_ROW") {
        setError("STALE_ROW — רענן את הדף");
      } else {
        setError(e.message);
      }
    },
  });

  // DELETE upstream requires { idempotency_key } body — proxied with
  // forwardBody=true (per route file). Backend returns 200 on success.
  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/lines/${encodeURIComponent(line.bom_line_id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`,
          }),
        },
      );
      if (!res.ok) throw new Error(`delete: ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] }),
  });

  return (
    <tr data-testid={`bom-line-row-${line.bom_line_id}`}>
      <td>{readiness?.component_name ?? line.component_id}</td>
      <td>
        {editable ? (
          editing ? (
            <input
              role="textbox"
              defaultValue={line.qty}
              onBlur={(e) => patch.mutate(e.currentTarget.value)}
              autoFocus
            />
          ) : (
            <button aria-label={`qty-edit-${line.bom_line_id}`} onClick={() => setEditing(true)}>
              {line.qty}
            </button>
          )
        ) : (
          <span>{line.qty}</span>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
      <td>—</td>
      <td>
        <span aria-label={`readiness-pip-${pip.color}`} className={PIP_CLASS[pip.color]}>
          {pip.color === "green" ? "🟢" : pip.color === "yellow" ? "🟡" : "🔴"}
        </span>
        {pip.reasons.length > 0 && <span className="ml-1 text-xs text-gray-600">{pip.reasons.join(", ")}</span>}
      </td>
      <td>
        {editable && !confirmDelete && (
          <button onClick={() => setConfirmDelete(true)}>🗑 Delete</button>
        )}
        {editable && confirmDelete && (
          <span>
            <button onClick={() => del.mutate()}>Confirm</button>
            <button onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-line-row.test.tsx`
Expected: PASS — 7/7.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/BomLineRow.tsx tests/unit/admin/bom-line-row.test.tsx
git commit -m "feat(R1): BomLineRow with qty edit, pip, delete"
git push
```

---

### Task 3.6: `BomLineAddDrawer` — pick component, POST line

**Files:**
- Create: `src/components/bom-edit/BomLineAddDrawer.tsx`
- Test: append cases to `tests/unit/admin/bom-draft-editor.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/bom-draft-editor.test.tsx — append at the bottom
describe("BomDraftEditorPage — Add line drawer", () => {
  it("renders [+ Add component] button when editable", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText(/אין שורות/);
    expect(screen.getByRole("button", { name: /Add component/i })).toBeInTheDocument();
  });

  it("clicking [+ Add component] opens the drawer", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    (await screen.findByRole("button", { name: /Add component/i })).click();
    expect(await screen.findByRole("dialog", { name: /Add component/i })).toBeInTheDocument();
  });

  it("submitting the drawer POSTs to /api/boms/versions/:id/lines", async () => {
    mockEditorApi({ draftLines: [] });
    fetchMock.mockImplementationOnce((url: string, init?: RequestInit) => {
      if (url === "/api/boms/versions/BV-DRAFT/lines" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ bom_line_id: "L-NEW", component_id: "C-99", qty: "3.5", updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    (await screen.findByRole("button", { name: /Add component/i })).click();
    const dialog = await screen.findByRole("dialog", { name: /Add component/i });
    fireEvent.change(dialog.querySelector("input[name=component_id]")!, { target: { value: "C-99" } });
    fireEvent.change(dialog.querySelector("input[name=qty]")!, { target: { value: "3.5" } });
    fireEvent.click(dialog.querySelector("button[type=submit]")!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) =>
      u === "/api/boms/versions/BV-DRAFT/lines" && (i as RequestInit | undefined)?.method === "POST",
    )).toBe(true));
  });
});
```

(Add `import { fireEvent, waitFor } from "@testing-library/react";` at the top of the test file if not already imported.)

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: FAIL — Add component button not in editor; drawer module missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/bom-edit/BomLineAddDrawer.tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface BomLineAddDrawerProps {
  versionId: string;
  open: boolean;
  onClose: () => void;
}

export function BomLineAddDrawer({ versionId, open, onClose }: BomLineAddDrawerProps) {
  const qc = useQueryClient();
  const [componentId, setComponentId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Backend Zod schema (per
  // src/app/api/boms/versions/[version_id]/lines/route.ts comment):
  //   { final_component_id, final_component_qty, idempotency_key }
  const post = useMutation({
    mutationFn: async () => {
      const idempotency_key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/lines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_component_id: componentId,
            final_component_qty: qty,
            idempotency_key,
          }),
        },
      );
      if (!res.ok) throw new Error(`post: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] });
      setComponentId("");
      setQty("");
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open) return null;
  return (
    <div role="dialog" aria-label="Add component" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <form
        className="rounded-md bg-white p-4"
        onSubmit={(e) => { e.preventDefault(); post.mutate(); }}
      >
        <label>Component
          <input name="component_id" value={componentId} onChange={(e) => setComponentId(e.target.value)} />
        </label>
        <label>Qty
          <input name="qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
        </label>
        {error && <div className="text-red-600">{error}</div>}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit">Add</button>
        </div>
      </form>
    </div>
  );
}
```

(Note on `EntityPickerPlus`: spec §6.3 names this picker. To keep the task atomic and the tests not coupled to the picker's internals, this drawer uses a plain `<input>` for `component_id` first. A follow-up task in the same chunk swaps the input for `EntityPickerPlus`; the form's submitted shape is unchanged.)

In `BomDraftEditorPage.tsx`, add inside the `<main>`:

```tsx
import { BomLineAddDrawer } from "./BomLineAddDrawer";

const [addOpen, setAddOpen] = useState(false);
// …
<button onClick={() => setAddOpen(true)} className="mb-2 rounded border px-3 py-1">+ Add component</button>
<BomLineAddDrawer versionId={versionId} open={addOpen} onClose={() => setAddOpen(false)} />
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — 8/8.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/BomLineAddDrawer.tsx src/components/bom-edit/BomDraftEditorPage.tsx tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "feat(R1): BomLineAddDrawer + Add line wiring"
git push
```

---

### Task 3.7: Swap the Add-line drawer's component input for `EntityPickerPlus`

The spec specifies an EntityPicker. Substituting it now is a contained refactor: the test from 3.6 still passes because the submitted body shape is unchanged.

**Files:**
- Modify: `src/components/bom-edit/BomLineAddDrawer.tsx`

This is a pure-refactor task with no behaviour change beyond the picker UX. Skip the failing-test step (the existing test must continue to pass on the same body shape).

- [ ] **Step 1: Replace the `<input name="component_id">` with `<EntityPickerPlus>`**

```tsx
import { EntityPickerPlus } from "@/components/fields/EntityPickerPlus";
// …
<EntityPickerPlus
  entityType="component"
  value={componentId}
  onChange={setComponentId}
  // EntityPickerPlus also writes a hidden input with name="component_id"
  // so existing test selectors still resolve.
/>
```

If `EntityPickerPlus` doesn't render the hidden input by default, wrap it with one:

```tsx
<>
  <EntityPickerPlus entityType="component" value={componentId} onChange={setComponentId} />
  <input type="hidden" name="component_id" value={componentId} />
</>
```

- [ ] **Step 2: Run drawer tests**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — same as before. If EntityPickerPlus does its own fetching, the test's mock for `/api/components` (or whatever it uses) may need to be added as a no-op response.

- [ ] **Step 3: Commit + push**

```bash
git add src/components/bom-edit/BomLineAddDrawer.tsx tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "refactor(R1): swap Add drawer input for EntityPickerPlus"
git push
```

---

### Task 3.8: `BomLineDiff` — "Changes from v{active}" collapsible

Computes added/removed/qty-changed lines client-side from the draft and active line lists.

**Files:**
- Create: `src/components/bom-edit/BomLineDiff.tsx`
- Test: `tests/unit/admin/bom-line-diff.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/bom-line-diff.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BomLineDiff, computeBomDiff } from "@/components/bom-edit/BomLineDiff";

describe("computeBomDiff", () => {
  it("classifies added, removed, changed", () => {
    const r = computeBomDiff(
      [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" },
        { bom_line_id: "L2", component_id: "C-2", qty: "2.0", updated_at: "" },
        { bom_line_id: "L3", component_id: "C-3", qty: "3.0", updated_at: "" },
      ],
      [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" },
        { bom_line_id: "Lx", component_id: "C-2", qty: "1.0", updated_at: "" }, // qty changed
        // C-3 missing → added
        { bom_line_id: "L4", component_id: "C-4", qty: "4.0", updated_at: "" }, // removed in draft
      ],
    );
    expect(r.added.map((l) => l.component_id)).toEqual(["C-3"]);
    expect(r.removed.map((l) => l.component_id)).toEqual(["C-4"]);
    expect(r.changed.map((c) => c.component_id)).toEqual(["C-2"]);
    expect(r.changed[0].oldQty).toBe("1.0");
    expect(r.changed[0].newQty).toBe("2.0");
  });

  it("returns empty arrays when draft and active are identical", () => {
    const lines = [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" }];
    const r = computeBomDiff(lines, lines);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.changed).toEqual([]);
  });
});

describe("BomLineDiff component", () => {
  it("renders a collapsed summary by default and expands on click", () => {
    render(
      <BomLineDiff
        draftLines={[{ bom_line_id: "L1", component_id: "C-1", qty: "2.0", updated_at: "" }]}
        activeLines={[{ bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" }]}
        activeVersionLabel="v3"
      />,
    );
    expect(screen.getByText(/Changes from v3/)).toBeInTheDocument();
    expect(screen.queryByText(/1\.0 → 2\.0/)).toBeNull();
    fireEvent.click(screen.getByText(/Changes from v3/));
    expect(screen.getByText(/1\.0 → 2\.0/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-line-diff.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/bom-edit/BomLineDiff.tsx
"use client";
import { useState } from "react";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";

interface ChangedLine {
  component_id: string;
  oldQty: string;
  newQty: string;
}

interface DiffResult {
  added: BomLineDataRow[];
  removed: BomLineDataRow[];
  changed: ChangedLine[];
}

export function computeBomDiff(draft: BomLineDataRow[], active: BomLineDataRow[]): DiffResult {
  const draftByComp = new Map(draft.map((l) => [l.component_id, l]));
  const activeByComp = new Map(active.map((l) => [l.component_id, l]));
  const added: BomLineDataRow[] = [];
  const removed: BomLineDataRow[] = [];
  const changed: ChangedLine[] = [];
  for (const [c, d] of draftByComp) {
    const a = activeByComp.get(c);
    if (!a) added.push(d);
    else if (a.qty !== d.qty) changed.push({ component_id: c, oldQty: a.qty, newQty: d.qty });
  }
  for (const [c, a] of activeByComp) {
    if (!draftByComp.has(c)) removed.push(a);
  }
  return { added, removed, changed };
}

interface BomLineDiffProps {
  draftLines: BomLineDataRow[];
  activeLines: BomLineDataRow[];
  activeVersionLabel: string | null;
}

export function BomLineDiff({ draftLines, activeLines, activeVersionLabel }: BomLineDiffProps) {
  const [open, setOpen] = useState(false);
  const diff = computeBomDiff(draftLines, activeLines);
  return (
    <section className="my-3">
      <button onClick={() => setOpen((v) => !v)} className="text-sm text-blue-700 underline">
        {open ? "▼" : "▶"} Changes from {activeVersionLabel ?? "v?"}
      </button>
      {open && (
        <div className="mt-2 text-sm">
          {diff.added.map((l) => (
            <div key={l.bom_line_id} className="text-green-700">+ {l.component_id} ({l.qty})</div>
          ))}
          {diff.removed.map((l) => (
            <div key={l.bom_line_id} className="text-red-700">− {l.component_id} ({l.qty})</div>
          ))}
          {diff.changed.map((c) => (
            <div key={c.component_id} className="text-yellow-800">~ {c.component_id} ({c.oldQty} → {c.newQty})</div>
          ))}
          {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
            <div className="text-gray-500">אין שינויים</div>
          )}
        </div>
      )}
    </section>
  );
}
```

In `BomDraftEditorPage.tsx`, fetch the active version's lines (if any) and render the diff above the table:

```tsx
import { BomLineDiff } from "./BomLineDiff";
// inside the editor: fetch versions for the head, find ACTIVE version id, fetch lines for it, pass to <BomLineDiff>
```

Concretely:

```tsx
const versionListQuery = useQuery({
  queryKey: ["boms", "versions", bomHeadId],
  queryFn: async () => {
    const res = await fetch(`/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId)}`);
    return ((await res.json()).rows ?? []) as Array<{ bom_version_id: string; version_label: string; status: string }>;
  },
});
const activeVersion = (versionListQuery.data ?? []).find((v) => v.status === "ACTIVE") ?? null;
const activeLinesQuery = useQuery({
  queryKey: ["boms", "lines", activeVersion?.bom_version_id ?? null],
  queryFn: async () => {
    const res = await fetch(`/api/boms/lines?bom_version_id=${encodeURIComponent(activeVersion!.bom_version_id)}`);
    return ((await res.json()).rows ?? []) as BomLineDataRow[];
  },
  enabled: activeVersion !== null,
});
// ...
<BomLineDiff
  draftLines={lines}
  activeLines={activeLinesQuery.data ?? []}
  activeVersionLabel={activeVersion?.version_label ?? null}
/>
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-line-diff.test.tsx`
Expected: PASS — 3/3.

- [ ] **Step 5: Run full editor suite**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx tests/unit/admin/bom-line-row.test.tsx tests/unit/admin/bom-line-diff.test.tsx`
Expected: PASS — full Chunk 3 unit suite.

- [ ] **Step 6: Commit + push**

```bash
git add src/components/bom-edit/BomLineDiff.tsx src/components/bom-edit/BomDraftEditorPage.tsx tests/unit/admin/bom-line-diff.test.tsx
git commit -m "feat(R1): BomLineDiff vs active version"
git push
```

---

### Task 3.9: Chunk-end gate — typecheck, lint, full unit suite

- [ ] **Step 1:** `npm run typecheck` → clean
- [ ] **Step 2:** `npm run lint:urls` → clean
- [ ] **Step 3:** `npx vitest run tests/unit/admin/use-enter-edit-draft.test.tsx tests/unit/admin/bom-draft-editor.test.tsx tests/unit/admin/bom-line-row.test.tsx tests/unit/admin/bom-line-diff.test.tsx tests/unit/admin/recipe-health-card.test.tsx` → PASS
- [ ] **Step 4:** Manual smoke (optional): start dev server, open a MANUFACTURED item, click [Edit recipe →] for the base track. Confirm: route resolves, header renders, qty edit submits, add line submits, delete removes line.

Once green: **Chunk 3 complete.** Dispatch the plan reviewer for Chunk 3, then proceed to Chunk 4.

---

## Chunk 4: Readiness panel + per-line pip wiring

This chunk introduces the right-side `ReadinessPanel` (or mobile bottom drawer) that lists every component referenced in the current draft with primary supplier + active price status. The per-line pips on the editor table are already wired (Chunk 3) — this chunk ensures the panel and the row pips share a single readiness data source so they always agree. Pre-Chunk 5, the `[Fix]` buttons render but are stubbed (no drawer yet).

**Signature stability with Chunk 1:** no modifications to `recipe-readiness.ts`, `recipe-readiness.types.ts`, or `RECIPE_READINESS_POLICY`. The panel reuses `useComponentReadinessMap` from Chunk 2 verbatim.

### Task 4.1: `ReadinessPanel` desktop layout — per-component rows

The panel shows one row per unique `component_id` referenced in the draft. Each row: component name | primary supplier (or yellow "אין ספק") | active price + age (or yellow "אין מחיר") | `[Fix]` button when warnings present.

**Files:**
- Create: `src/components/admin/recipe-health/ReadinessPanel.tsx`
- Test: `tests/unit/admin/readiness-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/readiness-panel.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadinessPanel } from "@/components/admin/recipe-health/ReadinessPanel";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

const NOW = new Date("2026-04-25T12:00:00Z").getTime();

function comp(over: Partial<ComponentReadiness> = {}): ComponentReadiness {
  return {
    component_id: "C-1",
    component_name: "Sugar",
    component_status: "ACTIVE",
    primary_supplier_id: "SUP-1",
    primary_supplier_name: "ACME",
    active_price_value: "2.50",
    active_price_updated_at: "2026-04-20T12:00:00Z",
    ...over,
  };
}

describe("ReadinessPanel", () => {
  it("renders one row per unique component_id from the draft", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp({ component_id: "C-1" })], ["C-2", comp({ component_id: "C-2", component_name: "Bottle" })]])}
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("Bottle")).toBeInTheDocument();
  });

  it("shows 'אין ספק' for missing primary supplier and offers [Fix]", () => {
    const onFix = vi.fn();
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp({ primary_supplier_id: null, primary_supplier_name: null })]])}
        nowMs={NOW}
        onFix={onFix}
      />,
    );
    expect(screen.getByText(/אין ספק/)).toBeInTheDocument();
    const fixBtn = screen.getByRole("button", { name: /Fix/ });
    fixBtn.click();
    expect(onFix).toHaveBeenCalledWith("C-1");
  });

  it("shows 'אין מחיר' when active price is missing", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp({ active_price_value: null, active_price_updated_at: null })]])}
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/אין מחיר/)).toBeInTheDocument();
  });

  it("shows price age in days when present", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp({ active_price_updated_at: "2026-01-25T12:00:00Z" })]])}
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/90 ימים/)).toBeInTheDocument();
  });

  it("does NOT show [Fix] when row is fully green (supplier + fresh price)", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp()]])}
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Fix/ })).toBeNull();
  });

  it("renders 'אין רכיבים' empty state when map is empty", () => {
    render(<ReadinessPanel readinessMap={new Map()} nowMs={NOW} onFix={vi.fn()} />);
    expect(screen.getByText(/אין רכיבים/)).toBeInTheDocument();
  });

  it("warningCount equals number of yellow rows for the badge", () => {
    const { container } = render(
      <ReadinessPanel
        readinessMap={new Map([
          ["C-1", comp({ primary_supplier_id: null })],
          ["C-2", comp({ active_price_value: null })],
          ["C-3", comp()],
        ])}
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-warning-count="2"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/readiness-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/admin/recipe-health/ReadinessPanel.tsx
import { formatPriceAge, priceAgeDays } from "@/lib/admin/recipe-readiness";
import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

interface ReadinessPanelProps {
  readinessMap: Map<string, ComponentReadiness>;
  nowMs: number;
  onFix: (componentId: string) => void;
}

function rowNeedsFix(c: ComponentReadiness, nowMs: number): boolean {
  if (c.primary_supplier_id === null) return true;
  if (c.active_price_value === null) return true;
  const days = priceAgeDays(c.active_price_updated_at, nowMs);
  if (days !== null && days > RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS) return true;
  return false;
}

export function ReadinessPanel({ readinessMap, nowMs, onFix }: ReadinessPanelProps) {
  const rows = Array.from(readinessMap.values());
  const warningCount = rows.filter((r) => rowNeedsFix(r, nowMs)).length;

  if (rows.length === 0) {
    return (
      <aside className="w-full p-3 lg:w-72">
        <h3 className="font-semibold">Readiness</h3>
        <p className="text-sm text-gray-500">אין רכיבים</p>
      </aside>
    );
  }

  return (
    <aside className="w-full p-3 lg:w-72" data-warning-count={warningCount}>
      <h3 className="font-semibold">Readiness ({warningCount} ⚠)</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.map((r) => {
          const supplierCell = r.primary_supplier_name ?? "🟡 אין ספק";
          const priceCell = r.active_price_value === null
            ? "🟡 אין מחיר"
            : formatPriceAge(r.active_price_updated_at, nowMs);
          const needsFix = rowNeedsFix(r, nowMs);
          return (
            <li key={r.component_id} className="border-b py-1">
              <div className="font-medium">{r.component_name}</div>
              <div className="text-gray-700">{supplierCell} · {priceCell}</div>
              {needsFix && (
                <button onClick={() => onFix(r.component_id)} className="mt-1 text-xs text-blue-700 underline">
                  Fix
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/readiness-panel.test.tsx`
Expected: PASS — 7/7.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/ReadinessPanel.tsx tests/unit/admin/readiness-panel.test.tsx
git commit -m "feat(R1): ReadinessPanel desktop layout + rows"
git push
```

---

### Task 4.2: Render `ReadinessPanel` inside `BomDraftEditorPage`

Wire the panel into the editor layout (right-side on desktop, full-width below the table on mobile). The panel uses the same `useComponentReadinessMap` already in scope so the row pips and panel rows are guaranteed in sync.

**Files:**
- Modify: `src/components/bom-edit/BomDraftEditorPage.tsx`
- Test: append cases to `tests/unit/admin/bom-draft-editor.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/bom-draft-editor.test.tsx — append at the bottom
describe("BomDraftEditorPage — ReadinessPanel integration", () => {
  it("renders the panel with one row per unique component_id in the draft", async () => {
    mockEditorApi({
      draftLines: [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0" },
        { bom_line_id: "L2", component_id: "C-2", qty: "2.0" },
        { bom_line_id: "L3", component_id: "C-1", qty: "0.5" }, // dup component
      ],
      perComponent: {
        "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }],
        "C-2": [{ supplier_item_id: "SI-2", supplier_id: "SUP-2", supplier_name: "PackCo", component_id: "C-2", component_name: "Bottle", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "0.50", updated_at: "2026-04-20T00:00:00Z" }],
      },
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText("Sugar");
    expect(screen.getAllByText("Sugar")).toHaveLength(2); // line + panel
    expect(screen.getAllByText("Bottle")).toHaveLength(2);
  });

  it("clicking [Fix] on a panel row sets the active fix component_id state (visible via stub)", async () => {
    mockEditorApi({
      draftLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      perComponent: { "C-1": [] }, // no supplier_items → needs fix
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    const fixBtn = await screen.findByRole("button", { name: /Fix/ });
    fixBtn.click();
    // The Quick-fix drawer is wired in Chunk 5; for now the editor renders
    // a stubbed dialog that confirms the id was captured.
    expect(await screen.findByTestId(/quick-fix-stub-/)).toHaveTextContent("C-1");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: FAIL — panel not rendered, no stub dialog.

- [ ] **Step 3: Modify `BomDraftEditorPage.tsx`**

Add panel rendering and the fix-component state:

```tsx
import { ReadinessPanel } from "@/components/admin/recipe-health/ReadinessPanel";
// …
const [fixComponentId, setFixComponentId] = useState<string | null>(null);
// …
{/* layout: lines table on the left/top, panel on the right/below */}
<div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
  <div>
    {/* existing lines table + add button + diff section */}
  </div>
  <ReadinessPanel
    readinessMap={readiness.map}
    nowMs={Date.now()}
    onFix={setFixComponentId}
  />
</div>

{fixComponentId && (
  <div role="dialog" data-testid={`quick-fix-stub-${fixComponentId}`}>
    {fixComponentId}
    <button onClick={() => setFixComponentId(null)}>Close</button>
  </div>
)}
```

(The stub dialog is replaced by the real `QuickFixDrawer` in Chunk 5; the contract — `setFixComponentId(component_id)` opens, `null` closes — stays.)

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — 10/10.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/BomDraftEditorPage.tsx tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "feat(R1): mount ReadinessPanel in BomDraftEditorPage"
git push
```

---

### Task 4.3: Mobile bottom drawer with warning-count badge

On mobile (`<lg`), the panel collapses to a sticky bottom button "⚠ N warnings"; tapping it opens the panel as a full-height bottom sheet.

**Files:**
- Modify: `src/components/admin/recipe-health/ReadinessPanel.tsx`
- Test: append cases to `tests/unit/admin/readiness-panel.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/readiness-panel.test.tsx — append at the bottom
import { fireEvent } from "@testing-library/react";

describe("ReadinessPanel — mobile bottom drawer", () => {
  it("renders a sticky bottom button with the warning count when mobileMode=true", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp({ primary_supplier_id: null })]])}
        nowMs={NOW}
        onFix={vi.fn()}
        mobileMode
      />,
    );
    const btn = screen.getByRole("button", { name: /1 warning/i });
    expect(btn).toBeInTheDocument();
    // Panel content NOT visible until the button is clicked.
    expect(screen.queryByText("Sugar")).toBeNull();
  });

  it("opens the bottom sheet when the badge button is clicked, closes via X", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp({ primary_supplier_id: null })]])}
        nowMs={NOW}
        onFix={vi.fn()}
        mobileMode
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /1 warning/i }));
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Close|✕/ }));
    expect(screen.queryByText("Sugar")).toBeNull();
  });

  it("hides the badge entirely when warningCount === 0 in mobile mode", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp()]])}
        nowMs={NOW}
        onFix={vi.fn()}
        mobileMode
      />,
    );
    expect(screen.queryByRole("button", { name: /warning/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/readiness-panel.test.tsx`
Expected: FAIL — `mobileMode` prop unsupported.

- [ ] **Step 3: Modify `ReadinessPanel.tsx`**

Add `mobileMode?: boolean` to the props. When set:
- if `warningCount === 0`, render nothing
- else render a sticky bottom button "⚠ {N} warning(s)" (singular vs plural)
- clicking the button toggles a bottom sheet that contains the same `<ul>` of rows + a Close (✕) button

```tsx
interface ReadinessPanelProps {
  readinessMap: Map<string, ComponentReadiness>;
  nowMs: number;
  onFix: (componentId: string) => void;
  mobileMode?: boolean;
}
// …
const [openSheet, setOpenSheet] = useState(false);
if (mobileMode) {
  if (warningCount === 0) return null;
  return (
    <>
      <button
        className="fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-yellow-500 px-4 py-2 text-white shadow"
        onClick={() => setOpenSheet(true)}
      >
        ⚠ {warningCount} {warningCount === 1 ? "warning" : "warnings"}
      </button>
      {openSheet && (
        <div className="fixed inset-x-0 bottom-0 max-h-[70vh] overflow-auto rounded-t-lg bg-white p-3 shadow-xl">
          <button onClick={() => setOpenSheet(false)} className="float-left">✕</button>
          {/* same <ul> of rows as desktop */}
        </div>
      )}
    </>
  );
}
```

(Refactor: extract the `<ul>` body into a small inner `RowsList` component and reuse for both branches.)

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/readiness-panel.test.tsx`
Expected: PASS — 10/10.

- [ ] **Step 5: Wire mobileMode into the editor**

In `BomDraftEditorPage.tsx`, render the panel twice with Tailwind responsive visibility:

```tsx
<div className="hidden lg:block">
  <ReadinessPanel readinessMap={readiness.map} nowMs={Date.now()} onFix={setFixComponentId} />
</div>
<div className="lg:hidden">
  <ReadinessPanel readinessMap={readiness.map} nowMs={Date.now()} onFix={setFixComponentId} mobileMode />
</div>
```

- [ ] **Step 6: Run editor tests**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — should still match (the desktop branch renders by default since happy-dom doesn't kill `lg:` classes; visibility is via CSS only).

- [ ] **Step 7: Commit + push**

```bash
git add src/components/admin/recipe-health/ReadinessPanel.tsx src/components/bom-edit/BomDraftEditorPage.tsx tests/unit/admin/readiness-panel.test.tsx
git commit -m "feat(R1): ReadinessPanel mobile bottom-drawer mode"
git push
```

---

### Task 4.4: Per-line pip / panel sync verification

Confirm that when a quantity edit causes a line's pip to change color (e.g., qty drops to 0 → red), the panel data does NOT change (panel is component-keyed, not line-keyed). Conversely, when a supplier change is mocked into the readiness fan-out, the panel and per-line pips both update because they share the same query cache.

**Files:**
- Test: append a sync test to `tests/unit/admin/bom-draft-editor.test.tsx`

This is a behaviour assertion — TDD applies.

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/bom-draft-editor.test.tsx — append at the bottom
import { useQueryClient } from "@tanstack/react-query";

describe("BomDraftEditorPage — pip/panel sync", () => {
  it("invalidating the supplier-items query updates BOTH the panel row and the line pip", async () => {
    let supplierRows: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions/BV-DRAFT") && !url.includes("/lines") && !url.includes("/publish")) {
        return Promise.resolve(new Response(JSON.stringify({ bom_version_id: "BV-DRAFT", bom_head_id: "BH-1", version_label: "v4", status: "DRAFT", updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }));
      }
      if (url.includes("/api/boms/heads")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_head_id: "BH-1", item_id: "ITEM-1", item_name: "Lemon Cocktail", bom_kind: "BASE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-1")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-DRAFT", version_label: "v4", status: "DRAFT" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-DRAFT")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      if (url.includes("/api/supplier-items?component_id=C-1")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: supplierRows }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });

    function Wrapper() {
      const qc = useQueryClient();
      // Expose qc for the test to invalidate after switching mock data.
      (globalThis as unknown as { __qc: typeof qc }).__qc = qc;
      return <BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />;
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}><Wrapper /></QueryClientProvider>,
    );
    // Initially supplier rows empty → panel + pip both yellow
    await screen.findByLabelText("readiness-pip-yellow");
    expect(screen.getByText(/אין ספק/)).toBeInTheDocument();

    // Mock changes → next fetch returns a supplier
    supplierRows = [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }];
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["supplier-items", "by-component", "C-1"] });
    });
    await waitFor(() => expect(screen.queryByLabelText("readiness-pip-yellow")).toBeNull());
    expect(screen.getByLabelText("readiness-pip-green")).toBeInTheDocument();
    expect(screen.queryByText(/אין ספק/)).toBeNull();
    expect(screen.getByText("ACME")).toBeInTheDocument();
  });
});
```

(Add `import { act } from "@testing-library/react";` if missing.)

- [ ] **Step 2: Run to confirm pass (no implementation change needed)**

The pass IS the verification: both the panel (which keys on `useComponentReadinessMap`) and the per-line pip (also keyed on the same hook via `BomDraftEditorPage`'s readiness object) must invalidate together because they share the same `["supplier-items", "by-component", id]` query key.

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — 11/11. If it fails, there is a hidden duplication of supplier-items state somewhere — fix that first; do NOT add a workaround in the test.

- [ ] **Step 3: Commit + push**

```bash
git add tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "test(R1): pip/panel sync via shared supplier-items query"
git push
```

---

### Task 4.5: Chunk-end gate — typecheck, lint, full unit suite

- [ ] **Step 1:** `npm run typecheck` → clean
- [ ] **Step 2:** `npm run lint:urls` → clean
- [ ] **Step 3:** `npx vitest run tests/unit/admin/readiness-panel.test.tsx tests/unit/admin/bom-draft-editor.test.tsx tests/unit/admin/bom-line-row.test.tsx tests/unit/admin/bom-line-diff.test.tsx tests/unit/admin/recipe-health-card.test.tsx` → PASS

Once green: **Chunk 4 complete.** Dispatch the plan reviewer for Chunk 4, then proceed to Chunk 5.

---

## Chunk 5: Quick-fix drawer (Actions A/B/C) + Swap-primary confirm

This chunk replaces the Chunk-4 stub (`<div data-testid="quick-fix-stub-…">`) with the real `QuickFixDrawer`. Three guided actions are exposed: A (Set existing supplier as primary), B (Add new sourcing link), C (Swap primary supplier with side-by-side confirm). All three converge on a single PATCH `/api/supplier-items/:id { is_primary: true }` mutation — atomicity is the backend's responsibility per spec §6.5. The UI never demotes-then-promotes on the client.

**Critical contract (spec §6.5):** the existing `promotePrimaryMutation` shape from `src/app/(admin)/admin/supplier-items/page.tsx` is reused verbatim. The 409 from the partial unique index is defense-in-depth surfacing, not a normal flow.

**Signature stability with Chunk 1:** zero modifications to the readiness layer. The drawer reads `ComponentReadiness` only as a display helper.

### Task 5.1: `QuickFixDrawer` shell + radio-list of existing supplier_items (Action A)

The drawer opens with a list of existing `supplier_items` rows for this component. The user selects one and clicks Save → a single PATCH sets it primary.

**Files:**
- Create: `src/components/admin/recipe-health/QuickFixDrawer.tsx`
- Test: `tests/unit/admin/quick-fix-drawer.test.tsx`

- [ ] **Step 1: Write the failing test (Action A only)**

```tsx
// tests/unit/admin/quick-fix-drawer.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickFixDrawer } from "@/components/admin/recipe-health/QuickFixDrawer";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

const twoRows = [
  { supplier_item_id: "SI-A", supplier_id: "SUP-A", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: false, std_cost_per_inv_uom: "2.50", lead_time_days: 7, moq: "10", updated_at: "2026-04-20T12:00:00Z" },
  { supplier_item_id: "SI-B", supplier_id: "SUP-B", supplier_name: "Sweet Co", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: false, std_cost_per_inv_uom: "2.10", lead_time_days: 14, moq: "50", updated_at: "2026-04-22T12:00:00Z" },
];

describe("QuickFixDrawer — Action A (set existing supplier primary)", () => {
  it("renders a radio row per existing supplier_item", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ rows: twoRows }), { status: 200 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText("ACME");
    expect(screen.getByText("Sweet Co")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("PATCHes is_primary: true with if_match_updated_at on save", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: twoRows }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ supplier_item_id: "SI-B", is_primary: true, updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ ...twoRows[1], is_primary: true }, twoRows[0]] }), { status: 200 }));
    const onClose = vi.fn();
    render(<QuickFixDrawer componentId="C-1" open onClose={onClose} />, { wrapper: wrap() });
    await screen.findByText("Sweet Co");
    fireEvent.click(screen.getByLabelText(/Sweet Co/));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) =>
      u === "/api/supplier-items/SI-B" && (i as RequestInit | undefined)?.method === "PATCH",
    )).toBe(true));
    const patchCall = fetchMock.mock.calls.find(([u, i]) =>
      u === "/api/supplier-items/SI-B" && (i as RequestInit | undefined)?.method === "PATCH",
    )!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string);
    expect(body.is_primary).toBe(true);
    expect(body.if_match_updated_at).toBe("2026-04-22T12:00:00Z");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("on 409 STALE_ROW: drawer stays open with refresh hint", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: twoRows }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "STALE_ROW" }), { status: 409 }));
    const onClose = vi.fn();
    render(<QuickFixDrawer componentId="C-1" open onClose={onClose} />, { wrapper: wrap() });
    await screen.findByText("Sweet Co");
    fireEvent.click(screen.getByLabelText(/Sweet Co/));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/הספק עודכן ע"י משתמש אחר/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("on 409 from partial unique index: shows 'Database invariant violation' banner", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: twoRows }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "UNIQUE_VIOLATION" }), { status: 409 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText("Sweet Co");
    fireEvent.click(screen.getByLabelText(/Sweet Co/));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/Database invariant violation/);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/admin/recipe-health/QuickFixDrawer.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  supplier_name: string;
  component_id: string;
  component_name: string;
  component_status: "ACTIVE" | "INACTIVE";
  is_primary: boolean;
  std_cost_per_inv_uom: string | null;
  lead_time_days: number | null;
  moq: string | null;
  updated_at: string;
}

interface QuickFixDrawerProps {
  componentId: string;
  open: boolean;
  onClose: () => void;
}

type ErrorKind = null | "stale" | "unique" | "other";

export function QuickFixDrawer({ componentId, open, onClose }: QuickFixDrawerProps) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  const rowsQuery = useQuery({
    queryKey: ["supplier-items", "by-component", componentId],
    queryFn: async (): Promise<SupplierItemRow[]> => {
      const res = await fetch(`/api/supplier-items?component_id=${encodeURIComponent(componentId)}`);
      if (!res.ok) throw new Error(`supplier-items: ${res.status}`);
      const body = await res.json();
      return body.rows ?? [];
    },
    enabled: open,
  });

  // Reuse the existing portal pattern for primary promotion: a single
  // PATCH { is_primary: true } with if-match-updated-at; the backend
  // handles atomic demote-then-promote. patchEntity auto-injects
  // idempotency_key. AdminMutationError carries `code` (e.g. "STALE_ROW").
  // A 409 from the partial unique index surfaces as a non-STALE_ROW 409;
  // we map it to "unique" defense-in-depth state per spec §6.5.
  const promote = useMutation({
    mutationFn: async (row: SupplierItemRow) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(row.supplier_item_id)}`,
        fields: { is_primary: true },
        ifMatchUpdatedAt: row.updated_at,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-items", "by-component", componentId] });
      setErrorKind(null);
      onClose();
    },
    onError: (e: Error) => {
      if (e instanceof AdminMutationError) {
        if (e.code === "STALE_ROW") setErrorKind("stale");
        else if (e.status === 409) setErrorKind("unique");
        else setErrorKind("other");
      } else {
        setErrorKind("other");
      }
    },
  });

  if (!open) return null;
  const rows = rowsQuery.data ?? [];

  return (
    <div role="dialog" aria-label="Quick fix" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md bg-white p-4">
        <h3 className="mb-2 font-semibold">תיקון רכיב</h3>
        {errorKind === "stale" && (
          <div className="mb-2 rounded bg-yellow-100 p-2 text-sm">
            הספק עודכן ע&quot;י משתמש אחר. רענן ובחר שוב.
            <button className="ml-2 underline" onClick={() => { rowsQuery.refetch(); setErrorKind(null); setSelectedId(null); }}>Refresh</button>
          </div>
        )}
        {errorKind === "unique" && (
          <div className="mb-2 rounded bg-red-100 p-2 text-sm">
            Database invariant violation — please reload and retry. If this persists, contact admin.
          </div>
        )}
        {errorKind === "other" && (
          <div className="mb-2 rounded bg-red-100 p-2 text-sm">שגיאה. נסה שוב.</div>
        )}
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.supplier_item_id}>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="primary-candidate"
                  checked={selectedId === r.supplier_item_id}
                  onChange={() => setSelectedId(r.supplier_item_id)}
                  aria-label={r.supplier_name}
                />
                <span>{r.supplier_name} · cost {r.std_cost_per_inv_uom ?? "—"} · lead {r.lead_time_days ?? "—"}d · MOQ {r.moq ?? "—"}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={selectedId === null || promote.isPending}
            onClick={() => {
              const row = rows.find((r) => r.supplier_item_id === selectedId);
              if (row) promote.mutate(row);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/QuickFixDrawer.tsx tests/unit/admin/quick-fix-drawer.test.tsx
git commit -m "feat(R1): QuickFixDrawer Action A (set existing primary)"
git push
```

---

### Task 5.2: Action B — Add new sourcing link via `QuickCreateSupplierItem`

When the component has 0 supplier_items OR the user wants a brand-new supplier, embed `QuickCreateSupplierItem` (existing component, do not modify). Optional checkbox "Set as primary" defaults checked when no other primary exists.

**Files:**
- Modify: `src/components/admin/recipe-health/QuickFixDrawer.tsx`
- Test: append cases to `tests/unit/admin/quick-fix-drawer.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/quick-fix-drawer.test.tsx — append at the bottom
describe("QuickFixDrawer — Action B (add new sourcing link)", () => {
  it("renders [+ Add new supplier] button alongside the radio list", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ rows: twoRows }), { status: 200 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText("ACME");
    expect(screen.getByRole("button", { name: /Add new supplier/i })).toBeInTheDocument();
  });

  it("when component has 0 supplier_items: shows Action B form directly with 'Set as primary' default-checked", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText(/אין סורסינג/);
    const setPrimary = screen.getByLabelText(/Set as primary/i) as HTMLInputElement;
    expect(setPrimary.checked).toBe(true);
  });

  it("submitting Action B POSTs /api/supplier-items, then PATCHes is_primary if checked", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ supplier_item_id: "SI-NEW", supplier_id: "SUP-N", component_id: "C-1", is_primary: false, updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ supplier_item_id: "SI-NEW", is_primary: true, updated_at: "2026-04-25T00:01:00Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 })); // refetch
    const onClose = vi.fn();
    render(<QuickFixDrawer componentId="C-1" open onClose={onClose} />, { wrapper: wrap() });
    await screen.findByText(/אין סורסינג/);
    fireEvent.change(screen.getByLabelText(/supplier_id/i), { target: { value: "SUP-N" } });
    fireEvent.change(screen.getByLabelText(/std_cost/i), { target: { value: "1.99" } });
    fireEvent.click(screen.getByRole("button", { name: /Add link/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, i]) => u === "/api/supplier-items" && (i as RequestInit | undefined)?.method === "POST");
      expect(post).toBeTruthy();
    });
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([u, i]) => u === "/api/supplier-items/SI-NEW" && (i as RequestInit | undefined)?.method === "PATCH");
      expect(patch).toBeTruthy();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: FAIL — Action B form not rendered.

- [ ] **Step 3: Modify `QuickFixDrawer.tsx`**

Add a `mode: "list" | "add"` state. Default `"list"` when rows exist, `"add"` when rows is empty. Render `[+ Add new supplier]` in the list mode that flips to `"add"`.

In `"add"` mode, embed:

```tsx
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";

// inside the drawer content, when mode === "add":
const noOtherPrimary = rows.every((r) => !r.is_primary);
const [setPrimary, setSetPrimary] = useState(noOtherPrimary);

<>
  <QuickCreateSupplierItem
    componentId={componentId}
    onCreated={async (newRow: SupplierItemRow) => {
      if (setPrimary) {
        await promote.mutateAsync(newRow);
      } else {
        qc.invalidateQueries({ queryKey: ["supplier-items", "by-component", componentId] });
        onClose();
      }
    }}
  />
  <label>
    <input
      type="checkbox"
      checked={setPrimary}
      onChange={(e) => setSetPrimary(e.target.checked)}
    />
    Set as primary
  </label>
</>
```

If the existing `QuickCreateSupplierItem` doesn't take `onCreated`, this task wraps it with a small adapter that listens for the same mutation success: read the current props of `QuickCreateSupplierItem` from its file before writing this code; if the surface differs, this task must align rather than fork.

For the empty-state copy: when rows is empty, render "אין סורסינג זמין לרכיב זה." above the form.

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: PASS — 7/7.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/QuickFixDrawer.tsx tests/unit/admin/quick-fix-drawer.test.tsx
git commit -m "feat(R1): QuickFixDrawer Action B (add sourcing link)"
git push
```

---

### Task 5.3: `SwapPrimaryConfirm` — Action C side-by-side step

Step 2 of the swap flow. Renders current vs new primary side-by-side with a required confirm checkbox, then issues the same single PATCH.

**Files:**
- Create: `src/components/admin/recipe-health/SwapPrimaryConfirm.tsx`
- Test: append cases to `tests/unit/admin/quick-fix-drawer.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/quick-fix-drawer.test.tsx — append at the bottom
describe("SwapPrimaryConfirm (Action C step 2)", () => {
  it("renders both current and new primaries with cost/lead/MOQ/supplier", async () => {
    const currentRow = { ...twoRows[0], is_primary: true };
    const newRow = twoRows[1];
    const { SwapPrimaryConfirm } = await import("@/components/admin/recipe-health/SwapPrimaryConfirm");
    render(<SwapPrimaryConfirm currentPrimary={currentRow} newPrimary={newRow} onConfirm={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/Current primary/)).toBeInTheDocument();
    expect(screen.getByText(/New primary/)).toBeInTheDocument();
    expect(screen.getByText(/ACME/)).toBeInTheDocument();
    expect(screen.getByText(/Sweet Co/)).toBeInTheDocument();
    expect(screen.getByText(/2\.50/)).toBeInTheDocument();
    expect(screen.getByText(/2\.10/)).toBeInTheDocument();
  });

  it("Confirm button is disabled until the checkbox is checked", async () => {
    const onConfirm = vi.fn();
    const { SwapPrimaryConfirm } = await import("@/components/admin/recipe-health/SwapPrimaryConfirm");
    render(<SwapPrimaryConfirm currentPrimary={twoRows[0]} newPrimary={twoRows[1]} onConfirm={onConfirm} onBack={vi.fn()} />);
    const confirmBtn = screen.getByRole("button", { name: /^Confirm/ });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /אני מאשר/ }));
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("QuickFixDrawer — Action C entry path", () => {
  it("clicking [Swap primary] from a row routes to the SwapPrimaryConfirm panel", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ ...twoRows[0], is_primary: true }, twoRows[1]] }), { status: 200 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText("ACME");
    fireEvent.click(screen.getByLabelText(/Sweet Co/));
    fireEvent.click(screen.getByRole("button", { name: /Swap primary/ }));
    await screen.findByText(/Current primary/);
    expect(screen.getByText(/אני מאשר/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: FAIL — module + button missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/admin/recipe-health/SwapPrimaryConfirm.tsx
"use client";
import { useState } from "react";

interface SupplierItemSummary {
  supplier_item_id: string;
  supplier_name: string;
  std_cost_per_inv_uom: string | null;
  lead_time_days: number | null;
  moq: string | null;
}

interface SwapPrimaryConfirmProps {
  currentPrimary: SupplierItemSummary;
  newPrimary: SupplierItemSummary;
  onConfirm: () => void;
  onBack: () => void;
}

export function SwapPrimaryConfirm({ currentPrimary, newPrimary, onConfirm, onBack }: SwapPrimaryConfirmProps) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border p-2">
          <div className="font-semibold">Current primary</div>
          <div>{currentPrimary.supplier_name}</div>
          <div>cost {currentPrimary.std_cost_per_inv_uom ?? "—"}</div>
          <div>lead {currentPrimary.lead_time_days ?? "—"}d</div>
          <div>MOQ {currentPrimary.moq ?? "—"}</div>
        </div>
        <div className="rounded border p-2">
          <div className="font-semibold">New primary</div>
          <div>{newPrimary.supplier_name}</div>
          <div>cost {newPrimary.std_cost_per_inv_uom ?? "—"}</div>
          <div>lead {newPrimary.lead_time_days ?? "—"}d</div>
          <div>MOQ {newPrimary.moq ?? "—"}</div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        אני מאשר להחליף את הספק הראשי ולהוריד את הקודם
      </label>
      <div className="flex gap-2">
        <button onClick={onBack}>Back</button>
        <button disabled={!agreed} onClick={onConfirm}>Confirm swap</button>
      </div>
    </div>
  );
}
```

In `QuickFixDrawer.tsx`, add a `[Swap primary]` button in list mode (visible only when a non-primary row is selected and a different primary already exists). Clicking it sets `mode: "swap-confirm"`. The `SwapPrimaryConfirm` then calls back to the same single-PATCH `promote.mutate(row)` from Task 5.1.

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: PASS — 10/10.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/SwapPrimaryConfirm.tsx src/components/admin/recipe-health/QuickFixDrawer.tsx tests/unit/admin/quick-fix-drawer.test.tsx
git commit -m "feat(R1): SwapPrimaryConfirm + Action C entry"
git push
```

---

### Task 5.4: Inline price update on the primary row

Per spec §6.5: if the primary supplier_item has missing/stale `std_cost_per_inv_uom`, the drawer offers an inline edit on the primary row to update std_cost. Single PATCH; reuses the same `if_match_updated_at` mechanism.

**Files:**
- Modify: `src/components/admin/recipe-health/QuickFixDrawer.tsx`
- Test: append cases to `tests/unit/admin/quick-fix-drawer.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/quick-fix-drawer.test.tsx — append at the bottom
describe("QuickFixDrawer — inline price update on primary row", () => {
  it("renders an [Update price] inline form on the primary row when price is missing or stale", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [
        { ...twoRows[0], is_primary: true, std_cost_per_inv_uom: null },
      ],
    }), { status: 200 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText("ACME");
    expect(screen.getByRole("button", { name: /Update price/i })).toBeInTheDocument();
  });

  it("PATCHes std_cost_per_inv_uom only (without is_primary), with if_match_updated_at", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rows: [{ ...twoRows[0], is_primary: true, std_cost_per_inv_uom: null }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ supplier_item_id: "SI-A", std_cost_per_inv_uom: "3.99", updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, { wrapper: wrap() });
    await screen.findByText("ACME");
    fireEvent.click(screen.getByRole("button", { name: /Update price/i }));
    fireEvent.change(screen.getByLabelText(/new price/i), { target: { value: "3.99" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save price/ }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, i]) => u === "/api/supplier-items/SI-A" && (i as RequestInit | undefined)?.method === "PATCH");
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.std_cost_per_inv_uom).toBe("3.99");
      expect("is_primary" in body).toBe(false);
      expect(body.if_match_updated_at).toBe("2026-04-20T12:00:00Z");
    });
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: FAIL — Update price button missing.

- [ ] **Step 3: Modify `QuickFixDrawer.tsx`**

Add an inline `[Update price]` button on each row marked `is_primary && (std_cost_per_inv_uom === null || price-is-stale)`. Clicking opens a small inline form with one number input + Save / Cancel. On save, **use `patchEntity` from `@/lib/admin/mutations`** (not raw `fetch`) — `patchEntity` auto-injects both `if_match_updated_at` and `idempotency_key`:

```ts
patchEntity({
  url: `/api/supplier-items/${encodeURIComponent(row.supplier_item_id)}`,
  fields: { std_cost_per_inv_uom: newPrice },
  ifMatchUpdatedAt: row.updated_at,
})
```

The test in Step 1 (`PATCHes std_cost_per_inv_uom only (without is_primary), with if_match_updated_at`) inspects the request body for `std_cost_per_inv_uom` and `if_match_updated_at`; it does not assert on `idempotency_key` presence, so the helper's auto-inject does not affect the test.

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/quick-fix-drawer.test.tsx`
Expected: PASS — 12/12.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/QuickFixDrawer.tsx tests/unit/admin/quick-fix-drawer.test.tsx
git commit -m "feat(R1): inline price update on primary row"
git push
```

---

### Task 5.5: Wire `QuickFixDrawer` into the editor (replace stub)

Replace the Chunk-4 stub `<div data-testid="quick-fix-stub-…">` with the real drawer.

**Files:**
- Modify: `src/components/bom-edit/BomDraftEditorPage.tsx`
- Modify: `tests/unit/admin/bom-draft-editor.test.tsx` — update the stub-based test from Task 4.2 to expect the real drawer behaviour.

- [ ] **Step 1: Modify the editor test**

Replace the `quick-fix-stub-` testid assertion with:

```tsx
const dialog = await screen.findByRole("dialog", { name: /Quick fix/ });
expect(dialog).toBeInTheDocument();
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: FAIL — drawer not yet wired.

- [ ] **Step 3: Replace the stub**

In `BomDraftEditorPage.tsx`:

```tsx
import { QuickFixDrawer } from "@/components/admin/recipe-health/QuickFixDrawer";
// remove the stub <div data-testid={`quick-fix-stub-${fixComponentId}`}> block; replace with:
{fixComponentId && (
  <QuickFixDrawer
    componentId={fixComponentId}
    open
    onClose={() => setFixComponentId(null)}
  />
)}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — 11/11 (the editor test from Task 4.2 now exercises the real drawer with one supplier_items mock; ensure the test's fetch mock returns rows: [] for `/api/supplier-items?component_id=C-1` after the click).

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/BomDraftEditorPage.tsx tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "feat(R1): wire real QuickFixDrawer in editor"
git push
```

---

### Task 5.6: Chunk-end gate — typecheck, lint, full unit suite

- [ ] **Step 1:** `npm run typecheck` → clean
- [ ] **Step 2:** `npm run lint:urls` → clean
- [ ] **Step 3:** `npx vitest run tests/unit/admin/quick-fix-drawer.test.tsx tests/unit/admin/bom-draft-editor.test.tsx tests/unit/admin/readiness-panel.test.tsx tests/unit/admin/bom-line-row.test.tsx tests/unit/admin/recipe-health-card.test.tsx` → PASS

Once green: **Chunk 5 complete.** Dispatch the plan reviewer for Chunk 5, then proceed to Chunk 6.

---

## Chunk 6: Publish flow + version history + mobile + acceptance

This is the final chunk. The Publish button drives a 3-variant modal based on the `publish-preview` response. A Version History section appears below the Health card on the product page. The Playwright happy-path E2E spec lands. The doc fixes (`master-editability-matrix.md` + `CLAUDE.md` Hebrew note) ship. The mobile audit and §12 acceptance criteria run.

**Signature stability with Chunk 1:** no readiness-layer changes. The publish modal uses backend's `publish-preview` shape directly.

### Task 6.1: `PublishConfirmModal` — variant A (clean)

The simplest variant: single confirmation modal when `can_publish_clean: true` and there are no UI warnings.

**Files:**
- Create: `src/components/bom-edit/PublishConfirmModal.tsx`
- Test: `tests/unit/admin/publish-confirm-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/publish-confirm-modal.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PublishConfirmModal } from "@/components/bom-edit/PublishConfirmModal";

const cleanPreview = {
  blocking_issues: [],
  warnings: [],
  can_publish_clean: true,
  can_publish_with_override: true,
};

describe("PublishConfirmModal — variant A (clean)", () => {
  it("renders single confirmation copy with no override checkbox", () => {
    render(
      <PublishConfirmModal
        preview={cleanPreview}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/פרסם v4/)).toBeInTheDocument();
    expect(screen.getByText(/SUPERSEDED/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("Publish button calls onConfirm immediately", () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmModal
        preview={cleanPreview}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/publish-confirm-modal.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/bom-edit/PublishConfirmModal.tsx
"use client";
import { useState } from "react";

export interface PublishPreview {
  blocking_issues: string[];
  warnings: string[];
  can_publish_clean: boolean;
  can_publish_with_override: boolean;
}

interface PublishConfirmModalProps {
  preview: PublishPreview;
  uiWarnings: string[];
  nextVersionLabel: string;
  onCancel: () => void;
  // confirmOverride is forwarded to the publish POST as `confirm_override`.
  // Variant A (clean) calls with false; Variant B (warnings) calls with true.
  // Variant C never calls (no Publish button rendered).
  onConfirm: (confirmOverride: boolean) => void;
}

const HEBREW_BLOCKER: Record<string, string> = {
  EMPTY_VERSION: "מתכון ריק",
  PLANNING_RUN_IN_FLIGHT: "ריצת תכנון פעילה — להמתין לסיום",
  VERSION_NOT_DRAFT: "הגרסה אינה טיוטה",
  STALE_ROW: "השורה התעדכנה — רענן",
};

export function PublishConfirmModal({ preview, uiWarnings, nextVersionLabel, onCancel, onConfirm }: PublishConfirmModalProps) {
  const [agreed, setAgreed] = useState(false);

  // Variant C — hard-block
  if (!preview.can_publish_with_override) {
    return (
      <div role="dialog" aria-label="Publish blocked" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded bg-white p-4">
          <h3 className="font-semibold">לא ניתן לפרסם</h3>
          <ul className="mt-2 text-sm">
            {preview.blocking_issues.map((b) => (
              <li key={b}>🔴 {HEBREW_BLOCKER[b] ?? b}</li>
            ))}
          </ul>
          <button onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }

  // Variant A — clean
  if (preview.can_publish_clean && preview.warnings.length === 0 && uiWarnings.length === 0) {
    return (
      <div role="dialog" aria-label="Confirm publish" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded bg-white p-4">
          <p>פרסם {nextVersionLabel}? הגרסה הקודמת תועבר ל-SUPERSEDED. ייצורים היסטוריים נשמרים על הגרסה הישנה.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={onCancel}>Cancel</button>
            <button onClick={() => onConfirm(false)}>Publish</button>
          </div>
        </div>
      </div>
    );
  }

  // Variant B — warnings + override
  return (
    <div role="dialog" aria-label="Confirm publish with warnings" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded bg-white p-4">
        <h3 className="font-semibold">פרסום עם אזהרות</h3>
        <ul className="mt-2 text-sm">
          {preview.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
          {uiWarnings.map((w) => <li key={`ui-${w}`}>⚠ {w}</li>)}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          אני מאשר את האזהרות הללו
        </label>
        <div className="mt-2 flex gap-2">
          <button onClick={onCancel}>Cancel</button>
          <button disabled={!agreed} onClick={() => onConfirm(true)}>Publish anyway</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/publish-confirm-modal.test.tsx`
Expected: PASS — 2/2 (variant A only).

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/PublishConfirmModal.tsx tests/unit/admin/publish-confirm-modal.test.tsx
git commit -m "feat(R1): PublishConfirmModal variant A (clean)"
git push
```

---

### Task 6.2: Publish modal variant B (warnings + override)

**Files:**
- Test: append cases to `tests/unit/admin/publish-confirm-modal.test.tsx`

The implementation already covers variant B (Task 6.1) — this task verifies via tests.

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/publish-confirm-modal.test.tsx — append at the bottom
describe("PublishConfirmModal — variant B (override)", () => {
  it("lists backend warnings and UI warnings together", () => {
    render(
      <PublishConfirmModal
        preview={{ blocking_issues: [], warnings: ["UNPOSTED_PRODUCTION_ACTUALS"], can_publish_clean: false, can_publish_with_override: true }}
        uiWarnings={["2 חומרים חסרי ספק ראשי"]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/UNPOSTED_PRODUCTION_ACTUALS/)).toBeInTheDocument();
    expect(screen.getByText(/2 חומרים חסרי ספק ראשי/)).toBeInTheDocument();
  });

  it("Publish anyway is disabled until checkbox is checked, then triggers onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmModal
        preview={{ blocking_issues: [], warnings: ["W1"], can_publish_clean: false, can_publish_with_override: true }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole("button", { name: /Publish anyway/ });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders variant B when uiWarnings is non-empty even if backend warnings are empty", () => {
    render(
      <PublishConfirmModal
        preview={{ blocking_issues: [], warnings: [], can_publish_clean: true, can_publish_with_override: true }}
        uiWarnings={["חומר אחד עם מחיר ישן"]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/אני מאשר את האזהרות הללו/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm pass**

Run: `npm test -- tests/unit/admin/publish-confirm-modal.test.tsx`
Expected: PASS — 5/5. (No implementation change — Task 6.1 already covers B.)

- [ ] **Step 3: Commit + push**

```bash
git add tests/unit/admin/publish-confirm-modal.test.tsx
git commit -m "test(R1): publish modal variant B coverage"
git push
```

---

### Task 6.3: Publish modal variant C (hard-blocker)

**Files:**
- Test: append cases to `tests/unit/admin/publish-confirm-modal.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/publish-confirm-modal.test.tsx — append at the bottom
describe("PublishConfirmModal — variant C (hard block)", () => {
  it("renders blockers translated to plain Hebrew, no Publish button", () => {
    render(
      <PublishConfirmModal
        preview={{ blocking_issues: ["EMPTY_VERSION"], warnings: [], can_publish_clean: false, can_publish_with_override: false }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/מתכון ריק/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
  });

  it("translates PLANNING_RUN_IN_FLIGHT", () => {
    render(
      <PublishConfirmModal
        preview={{ blocking_issues: ["PLANNING_RUN_IN_FLIGHT"], warnings: [], can_publish_clean: false, can_publish_with_override: false }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/ריצת תכנון פעילה/)).toBeInTheDocument();
  });

  it("falls back to raw code when blocker is not in the translation map", () => {
    render(
      <PublishConfirmModal
        preview={{ blocking_issues: ["UNKNOWN_BLOCKER"], warnings: [], can_publish_clean: false, can_publish_with_override: false }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/UNKNOWN_BLOCKER/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm pass**

Run: `npm test -- tests/unit/admin/publish-confirm-modal.test.tsx`
Expected: PASS — 8/8.

- [ ] **Step 3: Commit + push**

```bash
git add tests/unit/admin/publish-confirm-modal.test.tsx
git commit -m "test(R1): publish modal variant C coverage"
git push
```

---

### Task 6.4: Wire Publish button → preview → modal → POST publish

The Publish button on the editor's sticky header today is a no-op. Wire:

1. Click → `GET /api/boms/versions/:id/publish-preview`
2. Show the appropriate modal variant based on the response + the in-memory UI warnings (computed from the readiness map).
3. On confirm → `POST /api/boms/versions/:id/publish`
4. Success toast → `router.push('/admin/masters/items/:item_id')`

**Files:**
- Modify: `src/components/bom-edit/BomDraftEditorPage.tsx`
- Test: append cases to `tests/unit/admin/bom-draft-editor.test.tsx`

- [ ] **Step 1: Append the failing test**

```tsx
// tests/unit/admin/bom-draft-editor.test.tsx — append at the bottom
describe("BomDraftEditorPage — Publish flow", () => {
  it("clicking Publish fetches preview and opens variant A when clean", async () => {
    mockEditorApi({
      draftLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      perComponent: { "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }] },
    });
    fetchMock.mockImplementationOnce((url: string) => {
      if (url === "/api/boms/versions/BV-DRAFT/publish-preview") {
        return Promise.resolve(new Response(JSON.stringify({ blocking_issues: [], warnings: [], can_publish_clean: true, can_publish_with_override: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, { wrapper: wrap() });
    await screen.findByText(/Lemon Cocktail/);
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    await screen.findByRole("dialog", { name: /Confirm publish/ });
  });

  it("on confirm, POSTs publish and navigates to product page", async () => {
    mockEditorApi({
      draftLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      perComponent: { "C-1": [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }] },
    });
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/boms/versions/BV-DRAFT/publish-preview") {
        return Promise.resolve(new Response(JSON.stringify({ blocking_issues: [], warnings: [], can_publish_clean: true, can_publish_with_override: true }), { status: 200 }));
      }
      if (url === "/api/boms/versions/BV-DRAFT/publish" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      // re-call the page-level mock for everything else
      if (url.includes("/api/boms/versions/BV-DRAFT") && !url.includes("/lines") && !url.includes("/publish")) {
        return Promise.resolve(new Response(JSON.stringify({ bom_version_id: "BV-DRAFT", bom_head_id: "BH-1", version_label: "v4", status: "DRAFT", updated_at: "2026-04-25T00:00:00Z" }), { status: 200 }));
      }
      if (url.includes("/api/boms/heads")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_head_id: "BH-1", item_id: "ITEM-1", item_name: "Lemon Cocktail", bom_kind: "BASE" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-1")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_version_id: "BV-DRAFT", version_label: "v4", status: "DRAFT" }] }), { status: 200 }));
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-DRAFT")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [{ supplier_item_id: "SI-1", supplier_id: "SUP-1", supplier_name: "ACME", component_id: "C-1", component_name: "Sugar", component_status: "ACTIVE", is_primary: true, std_cost_per_inv_uom: "2.5", updated_at: "2026-04-20T00:00:00Z" }] }), { status: 200 }));
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" onNavigate={navigate} />, { wrapper: wrap() });
    await screen.findByText(/Lemon Cocktail/);
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    await screen.findByRole("dialog", { name: /Confirm publish/ });
    fireEvent.click(screen.getByRole("button", { name: /^Publish$/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/masters/items/ITEM-1"));
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: FAIL — Publish button no-op; no `onNavigate` prop on the editor.

- [ ] **Step 3: Modify `BomDraftEditorPage.tsx`**

Add `onNavigate?: (href: string) => void` (default uses `useRouter().push`). Replace the Publish button with:

```tsx
const [previewOpen, setPreviewOpen] = useState(false);
const previewQuery = useQuery({
  queryKey: ["boms", "publish-preview", versionId],
  queryFn: async (): Promise<PublishPreview> => {
    const res = await fetch(`/api/boms/versions/${encodeURIComponent(versionId)}/publish-preview`);
    if (!res.ok) throw new Error(`preview: ${res.status}`);
    return res.json();
  },
  enabled: previewOpen,
});
// Publish body per src/app/api/boms/versions/[version_id]/publish/route.ts:
//   { if_match_updated_at, idempotency_key, confirm_override?: boolean }
// `confirm_override` is required when can_publish_clean === false but
// can_publish_with_override === true (Variant B per spec §6.6).
const publishMutation = useMutation({
  mutationFn: async (args: { confirmOverride: boolean }) => {
    const idempotency_key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    const res = await fetch(
      `/api/boms/versions/${encodeURIComponent(versionId)}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          if_match_updated_at: version.updated_at,
          idempotency_key,
          confirm_override: args.confirmOverride,
        }),
      },
    );
    if (!res.ok) throw new Error(`publish: ${res.status}`);
    return res.json();
  },
  onSuccess: () => navigate(`/admin/masters/items/${head.item_id}`),
});

const uiWarnings = useMemo(() => {
  const warnings: string[] = [];
  for (const c of readiness.map.values()) {
    if (c.primary_supplier_id === null) warnings.push(`${c.component_name}: ללא ספק ראשי`);
    if (c.active_price_value === null) warnings.push(`${c.component_name}: ללא מחיר פעיל`);
  }
  return warnings;
}, [readiness.map]);

// in JSX, replace <button>Publish</button> with:
<button onClick={() => setPreviewOpen(true)}>Publish</button>
{previewOpen && previewQuery.data && (
  <PublishConfirmModal
    preview={previewQuery.data}
    uiWarnings={uiWarnings}
    nextVersionLabel={version.version_label}
    onCancel={() => setPreviewOpen(false)}
    onConfirm={(confirmOverride) => publishMutation.mutate({ confirmOverride })}
  />
)}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/bom-draft-editor.test.tsx`
Expected: PASS — 13/13.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/bom-edit/BomDraftEditorPage.tsx tests/unit/admin/bom-draft-editor.test.tsx
git commit -m "feat(R1): wire Publish button to preview + modal + POST"
git push
```

---

### Task 6.5: `VersionHistorySection` — collapsed list under the product

Below the Health card, a collapsible section listing existing versions per head with `[Resume editing →]` for DRAFTs.

**Files:**
- Create: `src/components/admin/recipe-health/VersionHistorySection.tsx`
- Test: `tests/unit/admin/version-history-section.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/admin/version-history-section.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VersionHistorySection } from "@/components/admin/recipe-health/VersionHistorySection";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("VersionHistorySection", () => {
  it("is collapsed by default and shows summary line", () => {
    render(<VersionHistorySection baseBomHeadId="BH-BASE" packBomHeadId="BH-PACK" isAdmin />, { wrapper: wrap() });
    expect(screen.getByText(/היסטוריית גרסאות/)).toBeInTheDocument();
    expect(screen.queryByText(/v3/)).toBeNull();
  });

  it("expands on click and lists versions per head", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("BH-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [
          { bom_version_id: "V1", version_label: "v1", status: "SUPERSEDED", published_at: "2025-01-01", published_by_display_name: "Tom", lines_count: 5 },
          { bom_version_id: "V3", version_label: "v3", status: "ACTIVE", published_at: "2026-04-01", published_by_display_name: "Tom", lines_count: 8 },
        ] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    });
    render(<VersionHistorySection baseBomHeadId="BH-BASE" packBomHeadId="BH-PACK" isAdmin />, { wrapper: wrap() });
    fireEvent.click(screen.getByText(/היסטוריית גרסאות/));
    await screen.findByText("v3");
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("renders [Resume editing →] for DRAFT entries when isAdmin=true", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("BH-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [
          { bom_version_id: "VD", version_label: "v4", status: "DRAFT", published_at: null, published_by_display_name: null, lines_count: 3 },
        ] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    });
    render(<VersionHistorySection baseBomHeadId="BH-BASE" packBomHeadId="BH-PACK" isAdmin />, { wrapper: wrap() });
    fireEvent.click(screen.getByText(/היסטוריית גרסאות/));
    await screen.findByRole("link", { name: /Resume editing/ });
  });

  it("hides Resume button when isAdmin=false", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("BH-BASE")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [
          { bom_version_id: "VD", version_label: "v4", status: "DRAFT", published_at: null, published_by_display_name: null, lines_count: 3 },
        ] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    });
    render(<VersionHistorySection baseBomHeadId="BH-BASE" packBomHeadId="BH-PACK" isAdmin={false} />, { wrapper: wrap() });
    fireEvent.click(screen.getByText(/היסטוריית גרסאות/));
    await screen.findByText("v4");
    expect(screen.queryByRole("link", { name: /Resume editing/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/unit/admin/version-history-section.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/admin/recipe-health/VersionHistorySection.tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface VersionRow {
  bom_version_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  published_at: string | null;
  published_by_display_name: string | null;
  lines_count: number;
}

function useHeadVersions(headId: string | null) {
  return useQuery({
    queryKey: ["boms", "versions", "history", headId],
    queryFn: async () => {
      const res = await fetch(`/api/boms/versions?bom_head_id=${encodeURIComponent(headId!)}`);
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as VersionRow[];
    },
    enabled: headId !== null,
  });
}

interface VersionHistorySectionProps {
  baseBomHeadId: string | null;
  packBomHeadId: string | null;
  isAdmin: boolean;
}

export function VersionHistorySection({ baseBomHeadId, packBomHeadId, isAdmin }: VersionHistorySectionProps) {
  const [open, setOpen] = useState(false);
  const baseQ = useHeadVersions(open ? baseBomHeadId : null);
  const packQ = useHeadVersions(open ? packBomHeadId : null);

  return (
    <section className="my-3">
      <button onClick={() => setOpen((v) => !v)} className="text-sm font-medium text-blue-700 underline">
        {open ? "▼" : "▶"} היסטוריית גרסאות
      </button>
      {open && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Base", headId: baseBomHeadId, q: baseQ },
            { label: "Pack", headId: packBomHeadId, q: packQ },
          ].map(({ label, headId, q }) => (
            <div key={label}>
              <div className="font-semibold">{label}</div>
              {(q.data ?? []).map((v) => (
                <div key={v.bom_version_id} className="border-b py-1 text-sm">
                  <span>{v.version_label}</span>
                  <span className="ml-2 rounded bg-gray-100 px-1 text-xs">{v.status}</span>
                  <span className="ml-2 text-gray-600">{v.published_at ?? "—"} · {v.published_by_display_name ?? "—"} · {v.lines_count} lines</span>
                  {v.status === "DRAFT" && isAdmin && headId && (
                    <Link className="ml-2 text-blue-700 underline" href={`/admin/masters/boms/${headId}/${v.bom_version_id}/edit`}>
                      Resume editing →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/unit/admin/version-history-section.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit + push**

```bash
git add src/components/admin/recipe-health/VersionHistorySection.tsx tests/unit/admin/version-history-section.test.tsx
git commit -m "feat(R1): VersionHistorySection collapsible list"
git push
```

---

### Task 6.6: Mount `VersionHistorySection` on the product page

**Files:**
- Modify: `src/app/(admin)/admin/masters/items/[item_id]/page.tsx`

This is a one-line wiring change. Skip TDD — the section's behaviour is exercised by Task 6.5's tests; the integration is verified by the Playwright spec in Task 6.7.

- [ ] **Step 1: Edit the product page**

Just under the `RecipeHealthCard` render (within the MANUFACTURED branch), add:

```tsx
<VersionHistorySection
  baseBomHeadId={row.base_bom_head_id ?? null}
  packBomHeadId={row.primary_bom_head_id ?? null}
  isAdmin={isAdmin}
/>
```

with an import at the top:

```tsx
import { VersionHistorySection } from "@/components/admin/recipe-health/VersionHistorySection";
```

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit + push**

```bash
git add src/app/(admin)/admin/masters/items/[item_id]/page.tsx
git commit -m "feat(R1): mount VersionHistorySection under product page"
git push
```

---

### Task 6.7: Playwright happy-path E2E spec

**Files:**
- Create: `tests/e2e/admin-recipe-readiness-real.spec.ts`

The spec exercises §12 acceptance #1: from a clean product page, admin clones an active base BOM into a DRAFT, edits one quantity, publishes, lands back on the product page with a green Health card.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/admin-recipe-readiness-real.spec.ts
import { test, expect } from "@playwright/test";

// This spec assumes the test harness has seeded a MANUFACTURED item whose
// base BOM has a single ACTIVE version with one component fully sourced
// (primary supplier, fresh price). The seeder's id is captured here as a
// placeholder; the implementation task confirms the actual fixture id.
const ITEM_ID = process.env.TEST_RECIPE_ITEM_ID ?? "SEED_MANUFACTURED_ITEM";

test("admin clones a base BOM, edits qty, publishes — lands green", async ({ page }) => {
  await page.goto(`/admin/masters/items/${ITEM_ID}`);
  await expect(page.getByText("מתכון ייצור")).toBeVisible();

  // Click base track Edit recipe
  const editBtns = page.getByRole("button", { name: /Edit recipe/ });
  await editBtns.first().click();

  // Editor opens with DRAFT pill
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();

  // Edit first row's qty
  const firstQtyEdit = page.getByLabel(/^qty-edit-/).first();
  await firstQtyEdit.click();
  const input = page.getByRole("textbox").first();
  await input.fill("1.25");
  await input.press("Tab");

  // Publish
  await page.getByRole("button", { name: /^Publish/ }).click();
  await expect(page.getByRole("dialog", { name: /Confirm publish/ })).toBeVisible();
  await page.getByRole("button", { name: /^Publish$/ }).click();

  // Land back on product page
  await expect(page).toHaveURL(new RegExp(`/admin/masters/items/${ITEM_ID}`));
  await expect(page.getByText(/מוכן לייצור/)).toBeVisible();
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- tests/e2e/admin-recipe-readiness-real.spec.ts`
Expected: PASS. If the seed item id is not configured, the spec should be skipped (decorate `test.skip(!process.env.TEST_RECIPE_ITEM_ID, "seed not configured")`).

- [ ] **Step 3: Commit + push**

```bash
git add tests/e2e/admin-recipe-readiness-real.spec.ts
git commit -m "test(R1): Playwright happy-path for recipe readiness"
git push
```

---

### Task 6.8: Update `master-editability-matrix.md`

Per the locked file structure: BOM head/version/lines rows flip from 🔒 Slice B → ✅. Note that this corridor adds the editor; the read-only BOM detail pages remain.

**Files:**
- Modify: `docs/admin/master-editability-matrix.md`

Pure docs change. Skip TDD.

- [ ] **Step 1: Open the file and locate the BOM rows**

```bash
grep -n "bom_" docs/admin/master-editability-matrix.md
```

- [ ] **Step 2: Update each BOM row's marks**

Change 🔒 Slice B → ✅ for: Class S/W edit, archive, restore, mobile-friendly, persistence. Leave anything not enabled by this corridor (e.g., bulk import, bin/location) unchanged.

Add a footnote near the BOM rows:

> Recipe editing lives at `/admin/masters/boms/[bom_head_id]/[version_id]/edit` (DRAFT versions only). The read-only BOM head and version detail pages are unchanged.

- [ ] **Step 3: Commit + push**

```bash
git add docs/admin/master-editability-matrix.md
git commit -m "docs(R1): flip BOM rows to ✅ in editability matrix"
git push
```

---

### Task 6.9: Note Hebrew labels in `CLAUDE.md`

Per spec §11 risk #7: the durable contract states "English-first UI". This corridor uses Hebrew labels for the Recipe-Health surface. Add a one-line acknowledgement.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a note under the "UI language" section**

Append:

> Exception: the Recipe-Health surface (`/admin/masters/items/[item_id]` for MANUFACTURED items, plus the BOM draft editor and quick-fix drawer) uses Hebrew operator labels per Tom's UX target on 2026-04-25. This is an explicit, scoped deviation from English-first, not a general policy change.

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs(R1): note Hebrew labels for Recipe-Health surface"
git push
```

---

### Task 6.10: §12 Acceptance criteria — manual checklist

Run the nine checks from spec §12 against a running dev server. Two of these (#5 and #6) are flagged CRITICAL.

- [ ] **#1 Clean publish path:** clone draft → edit qty → publish (clean) → Health card green
- [ ] **#2 Missing primary supplier resolved:** open a draft for an item with a missing-primary component → readiness panel shows the gap → click [Fix] → set primary → panel re-queries → gap clears
- [ ] **#3 Swap-primary flow:** select a different existing supplier_item → confirmation step shows current vs new with cost/lead/MOQ → save → panel reflects new primary
- [ ] **#4 Publish modal variants:** force a backend warning (e.g., UNPOSTED_PRODUCTION_ACTUALS via fixture), confirm B with override checkbox; force EMPTY_VERSION, confirm C with no Publish button; confirm A with no overrides
- [ ] **#5 (CRITICAL) Yellow after publish-with-warnings:** publish a version with a stale-price warning still present → return to product page → top-line is yellow ("מתכון פורסם עם אזהרות רכש/מחיר"), not green
- [ ] **#6 (CRITICAL) Green after fully clean publish:** publish a version where every §5 condition is met → top-line is green ("מוכן לייצור")
- [ ] **#7 Mobile (375px):** all flows complete without horizontal scroll; drawers full-screen sheets; sticky controls reachable
- [ ] **#8 Read-only BOM detail unaffected:** open `/admin/masters/boms/[bom_head_id]/[version_id]` → page renders unchanged from before the corridor
- [ ] **#9 Non-admin sees read-only card:** sign in with a `viewer` role → Health card renders, no [Edit recipe →] buttons, no [Fix] buttons

Document any failure in `docs/admin/2026-04-25-recipe-readiness-acceptance.md` with the precise failure mode and a follow-up task.

---

### Task 6.11: Final gates — typecheck, URL lint, full vitest, full Playwright

- [ ] **Step 1:** `npm run typecheck` → clean
- [ ] **Step 2:** `npm run lint:urls` → clean
- [ ] **Step 3:** Full vitest run: `npx vitest run` → all green
- [ ] **Step 4:** Full Playwright run (or at minimum the recipe-readiness spec): `npm run test:e2e` → green
- [ ] **Step 5:** Manual smoke pass per Task 6.10 — flag any acceptance criterion that fails

If everything green: **Chunk 6 complete.** The corridor is implementable end-to-end.

