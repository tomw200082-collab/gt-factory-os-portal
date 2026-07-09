// ---------------------------------------------------------------------------
// Production Plan board — DR-018 Tranche 123 (production-plan-board-clarity).
//
// Tagged @mocked: stubs GET /api/production-plan at the browser so the
// draft-review banner, the "Edited" badge, and the "Completed" chip are
// verified WITHOUT a live backend.
//
// Covers:
//   - FLOW-007: non-dismissible draft-review banner appears when any draft
//     rows exist, and links to Weekly Meeting.
//   - INTER-002: an "Edited" badge appears on a draft row whose
//     is_user_modified flag is true (degrades gracefully — this field is
//     optional until the backend PR deploys).
//   - COPY-007: a "Completed" chip appears on done rows (not color-only).
//   - INTER-007: the Edit modal guards a dirty close with an inline
//     "Discard unsaved changes?" confirm instead of closing silently.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

// The board defaults to the real current week (startOfWeek(new Date())..+6,
// see page.tsx) and only renders a row's production-job-card into the day
// lane matching its plan_date. A hardcoded plan_date ages out of that window
// and the card silently stops rendering — mirror the app's own toIsoDate()
// (local Y-M-D) so fixture rows always land in today's lane.
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: "plan_1",
    plan_type: "production",
    plan_date: todayIso(),
    item_id: "ITEM-1",
    item_name: "CALM 1L",
    item_supply_method: "MANUFACTURED",
    planned_qty: "500",
    uom: "L",
    status: "planned",
    rendered_state: "planned",
    base_bom_head_id: null,
    is_base_batch: false,
    pack_manifest_count: 0,
    source_recommendation_id: null,
    source_run_id: null,
    source_run_status: null,
    source_recommendation_qty: null,
    bom_version_id_pinned: null,
    bom_version_label: null,
    notes: null,
    created_by_user_id: "u1",
    created_by_snapshot: "Tom",
    created_at: "2026-06-30T00:00:00Z",
    updated_at: "2026-06-30T00:00:00Z",
    updated_by_user_id: null,
    updated_by_snapshot: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancel_reason: null,
    completed_submission_id: null,
    completed_actual: null,
    ...overrides,
  };
}

test.describe("@mocked production plan board", () => {
  test("FLOW-007/INTER-002: draft banner + Edited badge appear for draft rows", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");

    const rows = [
      baseRow({
        plan_id: "plan_draft_edited",
        item_name: "CALM 1L",
        status: "draft",
        rendered_state: "planned",
        is_user_modified: true,
      }),
      baseRow({
        plan_id: "plan_done",
        item_name: "MATCHA 500ML",
        status: "completed",
        rendered_state: "done",
        completed_submission_id: "sub_1",
        completed_actual: {
          submission_id: "sub_1",
          event_at: "2026-07-01T10:00:00Z",
          output_qty: "500",
          scrap_qty: "0",
          output_uom: "L",
          variance_qty: "0",
          variance_pct: "0.00",
        },
      }),
    ];

    await page.route("**/api/production-plan?**", (route) =>
      route.fulfill({ json: { rows, count: rows.length, as_of: "2026-07-03T00:00:00Z" } }),
    );

    await page.goto("/planning/production-plan");

    await expect(page.getByTestId("draft-review-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("draft-review-banner-link")).toHaveAttribute(
      "href",
      /^\/planning\/meeting\?step=firm&week=\d{4}-\d{2}-\d{2}$/,
    );

    await expect(page.getByTestId("plan-card-edited-badge")).toBeVisible();
    await expect(page.getByTestId("plan-card-completed-chip")).toBeVisible();
  });

  test("no draft rows: banner is absent", async ({ page }) => {
    await setFakeRole(page, "planner");

    const rows = [baseRow({ plan_id: "plan_live", status: "planned", rendered_state: "planned" })];

    await page.route("**/api/production-plan?**", (route) =>
      route.fulfill({ json: { rows, count: rows.length, as_of: "2026-07-03T00:00:00Z" } }),
    );

    await page.goto("/planning/production-plan");
    await expect(page.getByTestId("production-job-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("draft-review-banner")).toHaveCount(0);
  });

  test("INTER-007: Edit modal guards a dirty close with an inline discard confirm", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");

    const rows = [baseRow({ plan_id: "plan_edit_me", status: "planned", rendered_state: "planned" })];

    await page.route("**/api/production-plan?**", (route) =>
      route.fulfill({ json: { rows, count: rows.length, as_of: "2026-07-03T00:00:00Z" } }),
    );

    await page.goto("/planning/production-plan");
    await expect(page.getByTestId("production-job-card").first()).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("plan-row-edit").first().click();
    await expect(page.getByTestId("edit-modal")).toBeVisible();

    // Dirty the form.
    const qtyInput = page.getByTestId("edit-modal").locator('input[type="number"]');
    await qtyInput.fill("750");

    // Escape should NOT close the modal silently — it must show the guard.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("edit-discard-confirm")).toBeVisible();
    await expect(page.getByTestId("edit-modal")).toBeVisible();

    // "Keep editing" dismisses the guard, modal + edit stay.
    await page.getByTestId("edit-discard-keep").click();
    await expect(page.getByTestId("edit-discard-confirm")).toHaveCount(0);
    await expect(qtyInput).toHaveValue("750");

    // Cancel button hits the same requestClose() guard as Escape.
    await page.getByTestId("edit-modal").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("edit-discard-confirm")).toBeVisible();
    await page.getByTestId("edit-discard-confirm-yes").click();
    await expect(page.getByTestId("edit-modal")).toHaveCount(0);
  });

  test("DR-018 ux-release-gate: a malformed 200 response (no rows field) doesn't crash the board", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");

    // Regression guard for a real bug the release gate found: the board used
    // `plansQuery.data!.rows` (non-null assertion) which threw
    // "Cannot read properties of undefined (reading 'filter')" and hit the
    // error boundary whenever the API returned a 200 without a `rows` array.
    await page.route("**/api/production-plan?**", (route) =>
      route.fulfill({ json: {} }),
    );

    await page.goto("/planning/production-plan");
    await expect(
      page.getByRole("heading", { name: /Production Plan/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Never the raw JS error boundary.
    await expect(
      page.getByText(/Cannot read properties of undefined/i),
    ).toHaveCount(0);
  });
});
