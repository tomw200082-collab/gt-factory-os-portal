import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Exceptions Inbox — REAL HTTP path against the Window 1 local-safe DB.
//
// Prerequisites:
//   1. Local Postgres (db = gtfo) on 127.0.0.1:54322
//   2. API server on 127.0.0.1:3333 (DATABASE_URL pointed at the same DB)
//   3. Portal next dev started by Playwright's webServer on 127.0.0.1:3737
//   4. At least one 'open' exception present in gtfo. Seed deterministically:
//        powershell.exe -Command "wsl -- bash /mnt/c/Users/tomw2/Projects/\
//          window2-portal-sandbox/tests/e2e/wsl-seed-exc.sh"
//      Seeder inserts three open rows keyed 'E2E seed open row A/B/C' under
//      category=e2e_smoke, and revives prior-run rows so the spec is
//      re-runnable without manual cleanup.
//
// These tests drive the /exceptions planner surface end-to-end through the
// portal Next proxy → API → Postgres. No page.route() interception on the
// success path: the HTTP response is the evidence.
//
// Authored under W2 Mode B, scoped to ExceptionsInbox only.
// ---------------------------------------------------------------------------

const ROW = 'li[data-testid="exceptions-row"]';

test.describe("Exceptions Inbox — real list/ack/resolve against local target", () => {
  test("planner: lists working set; filter to resolved flips the list; clear returns working set", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/exceptions");
    await expect(
      page.getByRole("heading", { name: /^Exceptions$/ }),
    ).toBeVisible();

    // Default working set: open + acknowledged. Seeded open rows must appear.
    await expect(page.getByText("E2E seed open row A").first()).toBeVisible({
      timeout: 15_000,
    });
    const workingSetCount = await page.locator(ROW).count();
    expect(workingSetCount).toBeGreaterThan(0);

    // Capture some visible titles so we can prove the list content changed.
    const workingTitles = await page
      .locator('[data-testid="exceptions-row-title"]')
      .allInnerTexts();
    expect(workingTitles.some((t) => t.includes("E2E seed open row"))).toBe(
      true,
    );

    // Switch to resolved-only. Toggle off open + acknowledged, toggle on resolved.
    await page.getByTestId("exceptions-filter-status-open").click();
    await page.getByTestId("exceptions-filter-status-acknowledged").click();
    await page.getByTestId("exceptions-filter-status-resolved").click();

    // The 19 pre-existing resolved rows in the DB guarantee a non-empty list
    // here; regardless of count, every row rendered MUST have status=resolved.
    await expect
      .poll(
        async () => {
          const rows = page.locator(ROW);
          const count = await rows.count();
          if (count === 0) return "empty";
          const statuses = await rows.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-status")),
          );
          return statuses.every((s) => s === "resolved")
            ? "all_resolved"
            : `mixed:${statuses.join(",")}`;
        },
        { timeout: 15_000 },
      )
      .toBe("all_resolved");

    // No seeded-open row titles in the resolved view.
    const resolvedTitles = await page
      .locator('[data-testid="exceptions-row-title"]')
      .allInnerTexts();
    expect(resolvedTitles.some((t) => t.includes("E2E seed open row"))).toBe(
      false,
    );

    // Reset filters → default working set returns.
    await page.getByTestId("exceptions-filter-clear").click();
    await expect(page.getByText("E2E seed open row A").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("planner: acknowledge an open seeded row → status flips in DB and UI reflects it", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/exceptions");
    await expect(
      page.getByRole("heading", { name: /^Exceptions$/ }),
    ).toBeVisible();

    // Target the seeded row 'A' (warning). Working set default shows it.
    const rowA = page
      .locator(ROW)
      .filter({ hasText: "E2E seed open row A" })
      .first();
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await expect(rowA).toHaveAttribute("data-status", "open");

    // Click the Acknowledge button inside that row.
    await rowA.getByTestId("exceptions-row-acknowledge").click();

    // Success surface: action message + list refetch. The default filter
    // includes 'acknowledged', so the row should now appear with data-status
    // 'acknowledged' (same card re-rendered) — not disappear.
    await expect(page.getByTestId("exceptions-action-message")).toContainText(
      /Acknowledged/i,
      { timeout: 15_000 },
    );
    const rowAReloaded = page
      .locator(ROW)
      .filter({ hasText: "E2E seed open row A" })
      .first();
    await expect
      .poll(() => rowAReloaded.getAttribute("data-status"), {
        timeout: 15_000,
      })
      .toBe("acknowledged");

    // Flip the status filter to acknowledged-only as a second confirmation
    // that the DB transition is durable and reflected via a fresh refetch.
    await page.getByTestId("exceptions-filter-status-open").click();
    await expect(
      page
        .locator(ROW)
        .filter({ hasText: "E2E seed open row A" })
        .first(),
    ).toHaveAttribute("data-status", "acknowledged", { timeout: 15_000 });
  });

  test("planner: resolve a seeded row with required notes → resolved status in UI", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/exceptions");
    await expect(
      page.getByRole("heading", { name: /^Exceptions$/ }),
    ).toBeVisible();

    // Target seeded row 'C' (info) for resolve. Seeder revives it each run.
    const rowC = page
      .locator(ROW)
      .filter({ hasText: "E2E seed open row C" })
      .first();
    await expect(rowC).toBeVisible({ timeout: 15_000 });

    await rowC.getByTestId("exceptions-row-resolve").click();

    // Confirm disabled when notes empty.
    const confirmBtn = rowC.getByTestId("exceptions-resolve-confirm");
    await expect(confirmBtn).toBeDisabled();

    await rowC
      .getByTestId("exceptions-resolve-notes")
      .fill("E2E resolve smoke: close seeded row C.");

    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.getByTestId("exceptions-action-message")).toContainText(
      /^Resolved\.?$/i,
      { timeout: 15_000 },
    );

    // Working-set filter no longer shows this row (resolved is excluded).
    await expect(
      page.locator(ROW).filter({ hasText: "E2E seed open row C" }),
    ).toHaveCount(0, { timeout: 15_000 });

    // Flip filter to resolved-only and assert the row now appears with
    // data-status=resolved (durable DB transition evidence).
    await page.getByTestId("exceptions-filter-status-open").click();
    await page.getByTestId("exceptions-filter-status-acknowledged").click();
    await page.getByTestId("exceptions-filter-status-resolved").click();

    const rowCResolved = page
      .locator(ROW)
      .filter({ hasText: "E2E seed open row C" })
      .first();
    await expect(rowCResolved).toBeVisible({ timeout: 15_000 });
    await expect(rowCResolved).toHaveAttribute("data-status", "resolved");
  });

  test("operator: ack and resolve controls are NOT visible", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");

    await page.goto("/exceptions");

    // Operator is NOT allowed by the planner layout's RoleGate
    // (allow=['planner','admin','viewer']). Operator sees the 'Not available
    // for your role' surface AND zero action buttons.
    await expect(
      page.getByText(/Not available for your role/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("exceptions-row-acknowledge"),
    ).toHaveCount(0);
    await expect(page.getByTestId("exceptions-row-resolve")).toHaveCount(0);
  });
});
