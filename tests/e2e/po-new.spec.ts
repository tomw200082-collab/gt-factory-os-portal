// ---------------------------------------------------------------------------
// Tranche 027 (procurement-shared-line-editor): pre/post-refactor equivalence
// guard for the manual-PO form at /purchase-orders/new.
//
// The field + line UI moved out of the page into the shared <PoLineEditor>
// component. This spec locks the structural surface that must survive the
// extraction unchanged — heading, "Manual entry" badge, the editor's sections,
// the manual-reason field (manual mode), add-line, and the submit control —
// plus the RoleGate boundary (planning:execute).
//
// Deterministic by design: every assertion is on markup that renders regardless
// of whether the master-data queries resolve, so the spec does not depend on a
// live backend. A full create→success path needs seeded master data and is
// covered separately when the procurement focus mode lands (T029).
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe("/purchase-orders/new — manual PO form (shared editor)", () => {
  test("planner sees the form rendered by the shared PoLineEditor", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.goto("/purchase-orders/new");

    // Header + manual-entry affordance.
    await expect(
      page.getByRole("heading", { name: "New manual order" }),
    ).toBeVisible();
    await expect(page.getByText("Manual entry")).toBeVisible();

    // Editor sections (rendered by PoLineEditor).
    await expect(
      page.getByRole("heading", { name: "Order details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Order lines" }),
    ).toBeVisible();

    // Manual-mode-only reason field is present.
    await expect(page.getByTestId("po-new-reason")).toBeVisible();

    // First line + add-line affordance + submit control.
    await expect(page.getByTestId("po-new-line-0")).toBeVisible();
    await expect(page.getByTestId("po-new-add-line")).toBeVisible();
    await expect(page.getByTestId("po-new-submit")).toBeVisible();
  });

  test("operator is blocked by the planning:execute RoleGate", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/purchase-orders/new");

    await expect(page.getByText("Access restricted")).toBeVisible();
    await expect(page.getByTestId("po-new-reason")).toHaveCount(0);
  });
});
