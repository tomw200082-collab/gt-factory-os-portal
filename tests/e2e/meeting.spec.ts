// ---------------------------------------------------------------------------
// Weekly Meeting cockpit — DR-018 Tranche 121 (thursday-corridor-p0).
//
// Tagged @mocked: stubs the cadence API at the browser (page.route) so the
// generate-drafts confirmation gate is verified WITHOUT a live backend.
//
// Covers:
//   - FLOW-001: "Weekly Meeting" is discoverable from the primary sidebar.
//   - INTER-001: "Generate / refresh drafts" requires an explicit second
//     click before it fires — the first click shows the confirm copy and
//     posts nothing; only the confirm button posts.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

function draftWeekResponse(overrides: Record<string, unknown> = {}) {
  return {
    week_start: "2026-07-12",
    week_end: "2026-07-16",
    as_of: "2026-07-03T00:00:00Z",
    batch_count: 1,
    firmed_count: 0,
    rows: [],
    ...overrides,
  };
}

function firmedWeekDemandResponse() {
  return {
    week_start: "2026-07-05",
    week_end: "2026-07-09",
    as_of: "2026-07-03T00:00:00Z",
    total_fg_units: 0,
    distinct_fg_count: 0,
    rows: [],
  };
}

test.describe("@mocked weekly meeting", () => {
  test("FLOW-001: sidebar shows Weekly Meeting for planner", async ({ page }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/planning/draft-week**", (route) =>
      route.fulfill({ json: draftWeekResponse() }),
    );
    await page.route("**/api/planning/firmed-week-demand**", (route) =>
      route.fulfill({ json: firmedWeekDemandResponse() }),
    );

    await page.goto("/planning");

    await expect(
      page.getByRole("link", { name: /Weekly Meeting/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("INTER-001: generate drafts requires an explicit confirm before posting", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");

    let postCount = 0;
    await page.route("**/api/planning/draft-week**", (route) =>
      route.fulfill({ json: draftWeekResponse() }),
    );
    await page.route("**/api/planning/firmed-week-demand**", (route) =>
      route.fulfill({ json: firmedWeekDemandResponse() }),
    );
    await page.route("**/api/planning/generate-drafts", (route) => {
      postCount += 1;
      return route.fulfill({
        json: {
          tea_proposal_id: "tp_1",
          matcha_proposal_id: null,
          draft_total_upcoming: 3,
          generated_at: "2026-07-03T00:00:00Z",
          idempotent_replay: false,
        },
      });
    });

    await page.goto("/planning/meeting");

    // 2026-07-03 is a Friday — the cockpit opens on Execute; switch to Firm.
    await page.getByRole("button", { name: /Firm — Thursday/i }).click();

    await expect(page.getByTestId("meeting-gen-trigger")).toBeVisible();
    await page.getByTestId("meeting-gen-trigger").click();

    // First click only reveals the confirm — nothing posted yet.
    await expect(page.getByTestId("meeting-gen-confirm-copy")).toBeVisible();
    await expect(page.getByTestId("meeting-gen-confirm")).toBeVisible();
    expect(postCount).toBe(0);

    // Explicit confirm fires exactly one POST.
    await page.getByTestId("meeting-gen-confirm").click();
    await expect.poll(() => postCount).toBe(1);
  });

  test("INTER-001: Keep current drafts dismisses the confirm without posting", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");

    let postCount = 0;
    await page.route("**/api/planning/draft-week**", (route) =>
      route.fulfill({ json: draftWeekResponse() }),
    );
    await page.route("**/api/planning/firmed-week-demand**", (route) =>
      route.fulfill({ json: firmedWeekDemandResponse() }),
    );
    await page.route("**/api/planning/generate-drafts", (route) => {
      postCount += 1;
      return route.fulfill({
        json: {
          tea_proposal_id: "tp_1",
          matcha_proposal_id: null,
          draft_total_upcoming: 3,
          generated_at: "2026-07-03T00:00:00Z",
          idempotent_replay: false,
        },
      });
    });

    await page.goto("/planning/meeting");
    await page.getByRole("button", { name: /Firm — Thursday/i }).click();
    await page.getByTestId("meeting-gen-trigger").click();
    await expect(page.getByTestId("meeting-gen-confirm-copy")).toBeVisible();

    await page.getByTestId("meeting-gen-keep").click();
    await expect(page.getByTestId("meeting-gen-trigger")).toBeVisible();
    expect(postCount).toBe(0);
  });
});
