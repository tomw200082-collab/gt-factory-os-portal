import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Waste / Adjustment — REAL HTTP submit path against the Window 1 local-safe DB.
//
// Prerequisites (same shape as goods-receipt-real-submit.spec.ts):
//   1. Local Postgres on 127.0.0.1:54322 (db = gtfo) seeded with
//      db/test-seed/portal_universe.sql
//   2. API server on 127.0.0.1:3333 pointing at the LOCAL DB
//   3. Portal next dev started with:
//      WASTE_ADJUSTMENTS_API_BASE=http://localhost:3333
//   4. planning_policy row waste_auto_post_threshold=5 present in the local DB
//
// These tests exercise /ops/waste-adjustments driving the real
// form → buildWasteEnvelope → proxy → API → DB transaction → render path.
// "Adjustment recorded (mock)" NEVER appears on this path; success renders
// "Adjustment posted" with the real submission_id.
//
// Authored under W2 Mode B, scoped to WasteAdjustment only, after
// RUNTIME_READY(Waste) emission 2026-04-17.
// ---------------------------------------------------------------------------

test.describe("Waste / Adjustment — real submit against local target", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
  });

  test("operator fills loss form → auto-post → 'Adjustment posted' with live submission_id", async ({
    page,
  }) => {
    await page.goto("/ops/waste-adjustments");
    await expect(
      page.getByRole("heading", { name: /Waste.*Adjustment/i }),
    ).toBeVisible();

    // Event time — fixed past ISO, not-in-future under clock skew.
    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:00");

    // Direction = loss (default) — click the loss tile to ensure state.
    await page.getByText("Loss / write-down", { exact: true }).click();

    // Item: index 1 after the blank placeholder (first active RM/FG/PKG).
    await page.locator('select[name="item_id"]').selectOption({ index: 1 });

    // Quantity: below threshold=5 → auto-post.
    await page.locator('input[name="quantity"]').fill("1");

    // Reason: breakage (loss-compatible).
    await page.locator('select[name="reason_code"]').selectOption("breakage");

    await page.getByRole("button", { name: /Submit/i }).click();

    // Real success state. Regex/substring match tolerates the SuccessState
    // DOM structure — `{ exact: true }` with the literal string matched the
    // inner title div AND ancestor wrappers whose concatenated text includes
    // the title, causing strict-resolution ambiguity. Substring match on the
    // unique phrase is the minimum correction that stays deterministic
    // ("Adjustment posted" does not appear anywhere else on the page).
    await expect(
      page.getByText(/Adjustment posted/),
    ).toBeVisible({ timeout: 15_000 });

    // Submission ID visible in description
    await expect(page.getByText(/Submission [0-9a-f-]{36} posted/)).toBeVisible();

    // "Record another" CTA
    await expect(
      page.getByTestId("waste-record-another"),
    ).toBeVisible();
  });

  test("operator fills positive form → 'Held for planner approval' + exception_id", async ({
    page,
  }) => {
    await page.goto("/ops/waste-adjustments");

    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:00");

    // Direction = positive → always goes to pending approval.
    // Control-scoped locator: the direction tiles wrap a hidden (sr-only)
    // radio input inside a `<label>`. Click the LABEL that contains the
    // input[value="positive"]. This is exactly one element on the page
    // (vs "Positive correction" text which matched 4 ancestors). The
    // underlying radio still receives the click via the label-input pair.
    await page
      .locator("label")
      .filter({ has: page.locator('input[value="positive"]') })
      .click();

    await page.locator('select[name="item_id"]').selectOption({ index: 1 });
    await page.locator('input[name="quantity"]').fill("1");
    await page.locator('select[name="reason_code"]').selectOption("found_stock");
    // Positive + found_stock requires notes
    await page.locator('textarea[name="notes"]').fill("E2E smoke: positive found_stock test");

    // Confirm dialog on positive direction
    page.once("dialog", (d) => d.accept());

    await page.getByRole("button", { name: /Submit/i }).click();

    await expect(
      page.getByText("Held for planner approval", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/Submission [0-9a-f-]{36} pending \(positive_direction\)/),
    ).toBeVisible();
    await expect(page.getByText(/Exception [0-9a-f-]{36} opened/)).toBeVisible();
  });

  test("loss-above-threshold (qty=10) → 'Held for planner approval' with loss_above_threshold reason", async ({
    page,
  }) => {
    await page.goto("/ops/waste-adjustments");

    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:00");

    await page.getByText("Loss / write-down", { exact: true }).click();
    await page.locator('select[name="item_id"]').selectOption({ index: 1 });
    await page.locator('input[name="quantity"]').fill("10"); // > threshold=5
    // Reason: "spoilage" (loss-compatible). Chosen over "theft_loss" because
    // the portal's client-side waste-adjustment-schema.ts validates against
    // `ADJUSTMENT_REASONS` (lib/contracts/enums.ts) which has NOT yet been
    // synced to the frozen backend contract's WASTE_REASON_CODES. "spoilage"
    // is in BOTH lists AND is loss-compatible per REASON_CODES_BY_DIRECTION
    // in the contract mirror. The portal-enum drift itself is deferred to
    // a follow-up W2 pass; picking a valid-in-both reason is the minimum
    // deterministic change that lets the spec pass today.
    await page.locator('select[name="reason_code"]').selectOption("spoilage");
    await page.locator('textarea[name="notes"]').fill("E2E smoke: large loss test");

    await page.getByRole("button", { name: /Submit/i }).click();

    await expect(
      page.getByText("Held for planner approval", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/loss_above_threshold/),
    ).toBeVisible();
  });
});
