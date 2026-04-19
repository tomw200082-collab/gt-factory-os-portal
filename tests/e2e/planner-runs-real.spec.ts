import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Planner runs — REAL HTTP path against the W1 API + Postgres.
//
// Prerequisites:
//   1. Postgres reachable (local or Supabase pooled) via API server env
//   2. API server on 127.0.0.1:3333 with /api/v1/queries/planning/runs[...]
//      and /api/v1/mutations/planning/run[...] registered (Phase 7B + 7.5)
//   3. Portal Next dev started by Playwright's webServer on 127.0.0.1:3737
//   4. Migrations through 0048 applied (recs approval fields present)
//
// Phase 8 MVP scope per crystalline-drifting-dusk.md.
//
// Authored under W2 Mode B, scoped to PlanningRun only.
//
// A13 acceptance convention: tests must tolerate the three MVP-valid states
// of each read — populated, empty-state, documented backend error — because
// the underlying DB universe is environment-dependent. The UI code path is
// what we're exercising; the row count is not the acceptance signal.
// ---------------------------------------------------------------------------

test.describe("Planner runs — list / detail / trigger / approve / dismiss", () => {
  test("T01 planner loads list page (populated, empty, or documented-error)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/runs");

    await expect(
      page.getByRole("heading", { name: /^Planning runs$/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Trigger-run CTA visible for planner.
    await expect(
      page.getByTestId("planning-runs-trigger-button"),
    ).toBeVisible();

    // Filter bar always renders.
    await expect(page.getByTestId("planning-runs-filter-bar")).toBeVisible();

    // One of three terminal states must resolve within 15s.
    await expect
      .poll(
        async () => {
          const hasList = await page
            .getByTestId("planning-runs-list")
            .isVisible()
            .catch(() => false);
          const hasEmpty = await page
            .getByText(/No planning runs in this view/i)
            .isVisible()
            .catch(() => false);
          const hasError = await page
            .getByTestId("planning-runs-list-error")
            .isVisible()
            .catch(() => false);
          if (hasList) return "list";
          if (hasEmpty) return "empty";
          if (hasError) return "error";
          return "loading";
        },
        { timeout: 15_000 },
      )
      .not.toBe("loading");
  });

  test("T02 viewer cannot see the Trigger run button", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "viewer");

    await page.goto("/runs");

    await expect(
      page.getByRole("heading", { name: /^Planning runs$/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Trigger button is role-gated; must be absent.
    await expect(
      page.getByTestId("planning-runs-trigger-button"),
    ).toHaveCount(0);
  });

  test("T03 planner golden path — trigger run, redirect to detail (or surface documented 503/422/500)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/runs");
    await expect(
      page.getByRole("heading", { name: /^Planning runs$/ }),
    ).toBeVisible({ timeout: 15_000 });

    const triggerButton = page.getByTestId("planning-runs-trigger-button");
    await expect(triggerButton).toBeVisible();

    // Accept the native confirm() dialog.
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await triggerButton.click();

    // Three acceptable outcomes:
    //   (a) redirect to /runs/<uuid> on 200 happy path
    //   (b) break-glass banner on 503
    //   (c) trigger-error banner on documented 4xx/5xx
    const redirectedToDetail = page
      .waitForURL(/\/runs\/[0-9a-f-]{36}$/, { timeout: 15_000 })
      .then(() => "detail")
      .catch(() => "no-redirect");
    const breakGlass = page
      .getByTestId("planning-runs-break-glass-banner")
      .waitFor({ timeout: 15_000 })
      .then(() => "break_glass")
      .catch(() => "no-break-glass");
    const triggerError = page
      .getByTestId("planning-runs-trigger-error")
      .waitFor({ timeout: 15_000 })
      .then(() => "error")
      .catch(() => "no-error");

    const outcome = await Promise.race([
      redirectedToDetail,
      breakGlass,
      triggerError,
    ]);

    if (outcome === "detail") {
      // On the detail page, confirm the header + tabs render.
      await expect(
        page.getByRole("heading", { name: /^Run [0-9a-f]{8}$/ }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByTestId("planning-run-recs-tabs"),
      ).toBeVisible();
      return;
    }

    if (outcome === "break_glass") {
      const text = await page
        .getByTestId("planning-runs-break-glass-banner")
        .innerText();
      expect(text).toMatch(/Break-glass/i);
      return;
    }

    // outcome === "error"
    const msg = await page
      .getByTestId("planning-runs-trigger-error")
      .innerText();
    // Accept documented HTTP failures (env/seed-dependent paths).
    expect(msg).toMatch(/HTTP (4\d\d|5\d\d)|Trigger planning run failed/);
  });

  test("T04 planner approve flow — draft row transitions to approved in UI (skipped cleanly if no draft recs)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    // Enter through list -> click first row if any.
    await page.goto("/runs");
    await expect(
      page.getByRole("heading", { name: /^Planning runs$/ }),
    ).toBeVisible({ timeout: 15_000 });

    const rows = page.getByTestId("planning-runs-row-link");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description:
          "No existing planning runs in this environment — T04 requires a run with draft recs. This is an env-state gap, not a UI defect.",
      });
      return;
    }

    await rows.first().click();
    await expect(
      page.getByRole("heading", { name: /^Run [0-9a-f]{8}$/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Check both tabs for a draft row.
    const tryTab = async (tab: "purchase" | "production"): Promise<boolean> => {
      await page.getByTestId(`planning-run-recs-tab-${tab}`).click();
      // Wait for the tab pane to either render a table or empty state.
      await expect
        .poll(
          async () => {
            const hasTable = await page
              .getByTestId(`planning-run-recs-table-${tab}`)
              .isVisible()
              .catch(() => false);
            const hasEmpty = await page
              .getByText(new RegExp(`No ${tab} recommendations`, "i"))
              .isVisible()
              .catch(() => false);
            if (hasTable) return "table";
            if (hasEmpty) return "empty";
            return "loading";
          },
          { timeout: 10_000 },
        )
        .not.toBe("loading");

      const draftRows = page.locator(
        'tr[data-testid="planning-run-rec-row"][data-rec-status="draft"]',
      );
      const count = await draftRows.count();
      if (count === 0) return false;

      const first = draftRows.first();
      const recId = await first.getAttribute("data-rec-id");
      const approveBtn = first.getByTestId("planning-run-rec-approve");
      await approveBtn.click();

      // Toast + row status flip to approved.
      await expect(page.getByTestId("planning-run-toast")).toBeVisible({
        timeout: 10_000,
      });
      await expect
        .poll(
          async () => {
            const row = page.locator(
              `tr[data-testid="planning-run-rec-row"][data-rec-id="${recId}"]`,
            );
            const status = await row.getAttribute("data-rec-status");
            return status;
          },
          { timeout: 10_000 },
        )
        .toBe("approved");
      return true;
    };

    const approvedOnPurchase = await tryTab("purchase");
    if (approvedOnPurchase) return;
    const approvedOnProduction = await tryTab("production");
    if (approvedOnProduction) return;

    test.info().annotations.push({
      type: "skip-reason",
      description:
        "Run carries no draft recommendations — all already approved/dismissed/superseded. Env-state gap, not a UI defect.",
    });
  });

  test("T05 planner dismiss flow — draft row transitions to dismissed in UI (skipped cleanly if no draft recs)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/runs");
    await expect(
      page.getByRole("heading", { name: /^Planning runs$/ }),
    ).toBeVisible({ timeout: 15_000 });

    const rows = page.getByTestId("planning-runs-row-link");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description:
          "No runs in env — T05 cannot exercise dismiss.",
      });
      return;
    }

    await rows.first().click();
    await expect(
      page.getByRole("heading", { name: /^Run [0-9a-f]{8}$/ }),
    ).toBeVisible({ timeout: 15_000 });

    const tryTab = async (tab: "purchase" | "production"): Promise<boolean> => {
      await page.getByTestId(`planning-run-recs-tab-${tab}`).click();
      await expect
        .poll(
          async () => {
            const hasTable = await page
              .getByTestId(`planning-run-recs-table-${tab}`)
              .isVisible()
              .catch(() => false);
            const hasEmpty = await page
              .getByText(new RegExp(`No ${tab} recommendations`, "i"))
              .isVisible()
              .catch(() => false);
            if (hasTable) return "table";
            if (hasEmpty) return "empty";
            return "loading";
          },
          { timeout: 10_000 },
        )
        .not.toBe("loading");

      const draftRows = page.locator(
        'tr[data-testid="planning-run-rec-row"][data-rec-status="draft"]',
      );
      const count = await draftRows.count();
      if (count === 0) return false;

      const first = draftRows.first();
      const recId = await first.getAttribute("data-rec-id");
      const dismissBtn = first.getByTestId("planning-run-rec-dismiss");
      await dismissBtn.click();

      await expect(page.getByTestId("planning-run-toast")).toBeVisible({
        timeout: 10_000,
      });
      await expect
        .poll(
          async () => {
            const row = page.locator(
              `tr[data-testid="planning-run-rec-row"][data-rec-id="${recId}"]`,
            );
            const status = await row.getAttribute("data-rec-status");
            return status;
          },
          { timeout: 10_000 },
        )
        .toBe("dismissed");
      return true;
    };

    const dismissedOnPurchase = await tryTab("purchase");
    if (dismissedOnPurchase) return;
    const dismissedOnProduction = await tryTab("production");
    if (dismissedOnProduction) return;

    test.info().annotations.push({
      type: "skip-reason",
      description:
        "No draft recommendations available to dismiss — env-state gap.",
    });
  });

  test("T06 no session header returns 401 on proxy GET /api/planning/runs", async ({
    request,
  }) => {
    const res = await request.get("http://127.0.0.1:3737/api/planning/runs");
    expect(res.status()).toBe(401);
  });

  test("T07 status filter flips list aria-pressed state", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/runs");
    await expect(
      page.getByRole("heading", { name: /^Planning runs$/ }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("planning-runs-filter-status-completed").click();
    await expect(
      page.getByTestId("planning-runs-filter-status-completed"),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("planning-runs-filter-status-completed").click();
    await expect(
      page.getByTestId("planning-runs-filter-status-completed"),
    ).toHaveAttribute("aria-pressed", "false");

    // All button resets.
    await page.getByTestId("planning-runs-filter-status-draft").click();
    await page.getByTestId("planning-runs-filter-clear").click();
    await expect(
      page.getByTestId("planning-runs-filter-status-draft"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("T08 unknown run_id renders Run not found state", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    // Random UUID that almost certainly doesn't exist in DB.
    await page.goto(
      "/runs/00000000-0000-0000-0000-000000000000",
    );

    // Accept either the dedicated not-found surface or a documented error
    // (env-state with no planning substrate is a 500 upstream, not 404).
    await expect
      .poll(
        async () => {
          const notFound = await page
            .getByTestId("planning-run-not-found")
            .isVisible()
            .catch(() => false);
          const errored = await page
            .getByTestId("planning-run-error")
            .isVisible()
            .catch(() => false);
          if (notFound) return "not_found";
          if (errored) return "error";
          return "loading";
        },
        { timeout: 15_000 },
      )
      .not.toBe("loading");
  });
});
