// ---------------------------------------------------------------------------
// Tranche 028 (procurement-unified-action-list): the merged procurement page.
//
// Deterministic structural assertions only — the action list's contents depend
// on a live open purchase session (backend), so this spec locks the page shell,
// the decision-section scaffolding, and the planning RoleGate boundary rather
// than seeded rows. Row rendering + decision bucketing are covered by the
// decision.test.ts unit suite.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe("/planning/procurement — unified procurement page", () => {
  test("planner reaches the procurement page with its header + start control", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.goto("/planning/procurement");

    await expect(page.getByRole("heading", { name: "רכש" })).toBeVisible();
    await expect(page.getByTestId("procurement-start")).toBeVisible();
    // The Procurement tab is present in the planning sub-nav.
    await expect(
      page.getByRole("link", { name: /Procurement/ }).first(),
    ).toBeVisible();
  });

  test("operator is blocked by the planning:read RoleGate", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/planning/procurement");

    await expect(page.getByText("Access restricted")).toBeVisible();
    await expect(page.getByTestId("procurement-start")).toHaveCount(0);
  });

  test("DR-018 ux-release-gate FLOW-016: a reason_code-carrying start-session failure never leaks the raw English enum", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-session/current**", (route) =>
      route.fulfill({ json: { session: null } }),
    );
    await page.route("**/api/purchase-session/start", (route) =>
      route.fulfill({
        status: 409,
        json: { reason_code: "SESSION_LOCKED", detail: "קיים מושב פתוח כבר." },
      }),
    );

    await page.goto("/planning/procurement");
    await page.getByTestId("procurement-start").click();

    await expect(page.getByText("קיים מושב פתוח כבר.")).toBeVisible();
    await expect(page.getByText(/SESSION_LOCKED/)).toHaveCount(0);
  });
});
