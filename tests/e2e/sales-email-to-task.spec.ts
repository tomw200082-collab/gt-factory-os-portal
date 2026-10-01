import { expect, test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked render/interaction coverage. The real signed-out auth and database
// journey remains a separate release gate, never inferred from this fixture.
const task = {
  id: "T1", lead_id: "11111111-2222-3333-4444-555555555555", org_id: null,
  kind: "contact_first", title: "קשר ראשון", due_at: new Date().toISOString(), status: "open",
  owner_email: "rep@synthetic.invalid", source_kind: "lead_event", source_id: "E1",
  source_event_id: "E1", reason: "קשר ראשון", needs_assignment: false,
  lead_context: { org_name: "עסק בדיקה", contact_name: "איש קשר", status: "new" },
};

async function stub(page: Page, tasks: unknown[]) {
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: { sla_hours: 24, queue: { daily_cap: 15, order: "newest_first" }, assignees: [], lost_reasons: [] } }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: { week_new_leads: 0, working_now: 0, week_converted: 0, queue_today: 1, overdue_count: 0, unassigned_open_count: 0, never_contacted_count: 1, uncontactable_count: 0 } } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [], queue: { daily_cap: 15, order: "newest_first" } } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/tasks**", (r) => r.fulfill({ json: { rows: tasks } }));
}

test("rep sees only the personal task query, source and no fake completion @mocked", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gt.fakeauth.v1", JSON.stringify({
    user_id: "rep-1", email: "rep@synthetic.invalid", display_name: "נציג", role: "sales_rep",
  })));
  const scopes: string[] = [];
  await stub(page, [task]);
  await page.route("**/api/sales/tasks**", (r) => {
    scopes.push(new URL(r.request().url()).searchParams.get("scope") ?? "");
    return r.fulfill({ json: { rows: [task] } });
  });
  await page.goto("/sales/today");
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("task-card").getByRole("link", { name: "מקור" }))
    .toHaveAttribute("href", /lead=11111111-2222-3333-4444-555555555555/);
  expect(scopes).toEqual(["mine"]);
  await page.getByTestId("task-card").getByRole("button", { name: "השלם משימה" }).click();
  await page.getByLabel("מה בוצע?").fill("אבגד");
  await expect(page.getByTestId("task-card").getByRole("button", { name: "השלם משימה" }).last()).toBeDisabled();
  await expect(page.getByTestId("task-card")).toBeVisible();
});

test("manager can verify contact details on a contactless task @mocked", async ({ page }) => {
  await setFakeRole(page, "planner");
  const contact = { ...task, kind: "contact_resolution", owner_email: null, needs_assignment: true,
    title: "בירור פרטי קשר", reason: "בירור פרטי קשר" };
  await stub(page, [contact]);
  let saved: unknown = null;
  await page.route("**/api/sales/leads/*/contact", (r) => {
    saved = r.request().postDataJSON();
    return r.fulfill({ json: { lead_id: task.lead_id, event_id: "E2", task_id: "T2" } });
  });
  await page.goto("/sales/today");
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("task-card").getByText("התקשר")).toHaveCount(0);
  await page.getByLabel("טלפון").fill("0501111234");
  await page.getByLabel("איך אומתו הפרטים?").fill("אומת מול העסק");
  await page.getByRole("button", { name: "שמור פרטי קשר" }).click();
  await expect.poll(() => saved).toEqual({ phone: "0501111234", provenance: "אומת מול העסק" });
});

test("a rep's Today carries no team-wide counts under their own queue @mocked", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gt.fakeauth.v1", JSON.stringify({
    user_id: "rep-1", email: "rep@synthetic.invalid", display_name: "נציג", role: "sales_rep",
  })));
  await stub(page, [task]);
  await page.goto("/sales/today");
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("stats-strip")).toHaveCount(0);
});

test("a rep cannot edit team-wide sales settings @mocked", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gt.fakeauth.v1", JSON.stringify({
    user_id: "rep-1", email: "rep@synthetic.invalid", display_name: "נציג", role: "sales_rep",
  })));
  await stub(page, []);
  await page.goto("/sales/settings");
  await expect(page.getByText("הגדרות אלה מנוהלות בידי מנהל המכירות")).toBeVisible();
  await expect(page.getByRole("button", { name: "שמור", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "הגדרות" })).toHaveCount(0);
});

test("future waiting review stays out of Today while its source remains a task @mocked", async ({ page }) => {
  await setFakeRole(page, "planner");
  await stub(page, [{ ...task, kind: "wait_review", due_at: new Date(Date.now() + 86400000).toISOString() }]);
  await page.goto("/sales/today");
  await expect(page.getByTestId("task-card")).toHaveCount(0);
});
