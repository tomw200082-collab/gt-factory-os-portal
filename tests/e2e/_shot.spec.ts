// SCRATCH — local mobile screenshot harness for the UX iteration loop.
// NOT committed, NOT @mocked (CI runs --grep @mocked only). Tagged @shot.
// Run: NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true npx playwright test tests/e2e/_shot.spec.ts --project=chromium
import { test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const SHOTS = "/tmp/shots";

async function genericApi(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

test("@shot planning", async ({ page }) => {
  await setFakeRole(page, "planner");
  await genericApi(page);
  await page.route("**/api/planning/runs**", (r) =>
    r.fulfill({ json: { total: 1, rows: [
      { run_id: "RUN1", executed_at: new Date().toISOString(), trigger_source: "scheduled",
        planning_horizon_start_at: "2026-06-21", planning_horizon_weeks: 6, status: "completed",
        triggered_by_name: "Tom",
        summary: { fg_coverage_count: 12, purchase_recs_count: 7, production_recs_count: 4, exceptions_count: 2 } },
    ] } }),
  );
  // Detail route registered AFTER the list → wins for the /runs/<id> URL.
  await page.route("**/api/planning/runs/*", (r) =>
    r.fulfill({ json: {
      run_id: "RUN1", executed_at: new Date().toISOString(),
      planning_horizon_start_at: "2026-06-21", planning_horizon_weeks: 6, status: "completed",
      triggered_by_name: "Tom",
      summary: { fg_coverage_count: 12, purchase_recs_count: 7, production_recs_count: 4,
        exceptions_count: 2, exceptions_by_severity: { info: 1, warning: 1, fail_hard: 0 } },
    } }),
  );
  await page.route("**/api/planning/blockers**", (r) =>
    r.fulfill({ json: { total_blocker_count: 1, run: { run_id: "RUN1", run_status: "completed" }, rows: [
      { exception_id: "EX1", category: "no_active_bom", severity: "warning",
        display_name: "Mojito 330ml", demand_qty: "120" },
    ] } }),
  );
  await page.route("**/api/planning/demand-coverage**", (r) =>
    r.fulfill({ json: { as_of: new Date().toISOString(), total_lines: 0, rows: [] } }),
  );
  await page.route("**/api/forecasts/versions**", (r) =>
    r.fulfill({ json: { rows: [
      { version_id: "FC1", label: "Jun 2026", status: "active", created_at: new Date().toISOString() },
    ] } }),
  );
  await page.route("**/api/admin/jobs**", (r) =>
    r.fulfill({ json: { rows: [
      { job_name: "planning_run", last_status: "success", last_run_at: new Date().toISOString() },
    ] } }),
  );
  await page.goto("/planning");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/planning-full.png`, fullPage: true });
  await page.screenshot({ path: `${SHOTS}/planning-fold.png` });
});
