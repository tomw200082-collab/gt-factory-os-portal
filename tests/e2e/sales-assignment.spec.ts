import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — tranche 166: leads can be handed to a second person, and every
// screen says who has what.

const now = new Date();
const iso = (d: Date) => d.toISOString();

const QUEUE = { daily_cap: 15, order: "newest_first" as const };

const ROSTER = [
  { email: "tom@gteveryday.com", name: "תום", active: true },
  { email: "erik@gteveryday.com", name: "אריק", active: true },
  { email: "left@gteveryday.com", name: "עזב", active: false },
];

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}", reminder: "היי", returning_customer: "היי" },
  lost_reasons: ["לא רלוונטי", "אחר"],
  queue: QUEUE,
  assignees: ROSTER,
  last_changes: [],
};

const STATS = {
  week_new_leads: 0,
  working_now: 0,
  week_converted: 0,
  queue_today: 2,
  overdue_count: 0,
  unassigned_open_count: 1,
  never_contacted_count: 2,
  uncontactable_count: 0,
};

function leadRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    org_id: `O-${id}`,
    org_name: `עסק ${id}`,
    contact_name: `איש ${id}`,
    phone_e164: "+972521234567",
    email: null,
    source: "import",
    campaign_name: null,
    ad_name: null,
    platform: null,
    is_organic: null,
    status: "new",
    lost_reason: null,
    assignee: null,
    next_touch_at: null,
    first_touch_at: null,
    possible_duplicate_of: null,
    converted_order_ref: null,
    converted_amount: null,
    created_at: iso(new Date(now.getTime() - 4 * 86400e3)),
    is_existing_customer: false,
    shopify_customer_id: null,
    shopify_snapshot: null,
    shopify_snapshot_at: null,
    age_days: 4,
    sla_deadline_at: iso(now),
    sla_state: "overdue",
    next_touch_overdue: false,
    uncontactable: false,
    ...over,
  };
}

interface Posted {
  url: string;
  body: unknown;
}

async function stub(page: Page, leadRows: unknown[]): Promise<Posted[]> {
  const posted: Posted[] = [];
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: STATS } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads/*/events**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: leadRows } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [], queue: QUEUE } }));
  await page.route("**/api/sales/bulk-assign", (r) => {
    const body = r.request().postDataJSON() as { lead_ids: string[] };
    posted.push({ url: r.request().url(), body });
    return r.fulfill({ json: { assigned: body.lead_ids.length, rows: [] } });
  });
  await page.route("**/api/sales/leads/*/assign", (r) => {
    posted.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { lead_id: "X", assignee: "erik@gteveryday.com" } });
  });
  return posted;
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
});

test("the picker offers the active roster and never a raw email box @mocked", async ({ page }) => {
  await stub(page, [leadRow("A")]);
  await page.goto("/sales/leads");
  await page.getByTestId("lead-row-A").click();

  const picker = page.getByTestId("assignee-picker");
  await expect(picker).toBeVisible();
  // Names, not addresses — and the person who left is not on offer.
  await expect(picker.locator("option")).toContainText(["— ללא בעלים —", "תום", "אריק"]);
  await expect(picker.locator("option", { hasText: "עזב" })).toHaveCount(0);
});

test("assigning from the drawer carries a due date @mocked", async ({ page }) => {
  const posted = await stub(page, [leadRow("A")]);
  await page.goto("/sales/leads");
  await page.getByTestId("lead-row-A").click();

  await page.getByTestId("assignee-picker").selectOption("erik@gteveryday.com");
  await page.getByTestId("drawer-assign-save").click();

  await expect.poll(() => posted.length).toBeGreaterThan(0);
  const body = posted[0].body as { assignee: string; next_touch_at?: string };
  expect(body.assignee).toBe("erik@gteveryday.com");
  // An assignment with no date lands in a name but in nobody's queue.
  expect(body.next_touch_at).toBeTruthy();
});

test("the table says who owns each lead @mocked", async ({ page }) => {
  await stub(page, [
    leadRow("A", { assignee: "erik@gteveryday.com" }),
    leadRow("B"),
  ]);
  await page.goto("/sales/leads");

  await expect(page.getByTestId("lead-owner-A")).toHaveText("אריק");
  await expect(page.getByTestId("lead-owner-B")).toHaveText("—");
});

test("the unowned chip isolates the leads nobody has taken @mocked", async ({ page }) => {
  await stub(page, [
    leadRow("A", { assignee: "erik@gteveryday.com" }),
    leadRow("B"),
  ]);
  await page.goto("/sales/leads");

  await page.getByTestId("leads-chip-unowned").click();
  await expect(page.getByTestId("lead-row-A")).toHaveCount(0);
  await expect(page.getByTestId("lead-row-B")).toBeVisible();
});

test("selecting rows hands the batch over in one call @mocked", async ({ page }) => {
  const posted = await stub(page, [leadRow("A"), leadRow("B"), leadRow("C")]);
  await page.goto("/sales/leads");

  await page.getByTestId("leads-select-all").check();
  await expect(page.getByTestId("bulk-bar")).toBeVisible();
  await page.getByTestId("bulk-bar").getByTestId("assignee-picker").selectOption("erik@gteveryday.com");
  await page.getByTestId("bulk-assign-confirm").click();

  await expect.poll(() => posted.length).toBe(1);
  const body = posted[0].body as { lead_ids: string[]; next_touch_at?: string };
  // One request for the whole batch, not three.
  expect(body.lead_ids.sort()).toEqual(["A", "B", "C"]);
  expect(body.next_touch_at).toBeTruthy();
  await expect(page.getByTestId("sales-toast")).toContainText("אריק");
});

test("the queue can be scoped to whoever is looking at it @mocked", async ({ page }) => {
  const scopes: string[] = [];
  await stub(page, []);
  await page.route("**/api/sales/today**", (r) => {
    scopes.push(new URL(r.request().url()).searchParams.get("assignee") ?? "");
    return r.fulfill({ json: { rows: [], queue: QUEUE } });
  });
  await page.goto("/sales/today");

  await expect(page.getByRole("heading", { name: "כל התור" })).toBeVisible();
  await page.getByTestId("queue-scope-mine").click();
  await expect(page.getByRole("heading", { name: "התור שלי" })).toBeVisible();
  // The parameter existed since v1 and had no caller until now.
  await expect.poll(() => scopes.some((s) => s.length > 0)).toBe(true);
});

test("settings reads the roster back and refuses to write one @mocked", async ({ page }) => {
  // Was: "settings can add somebody and deactivate somebody else". It could,
  // and that was the defect — this screen was a THIRD registry of who works
  // leads, beside private_core.app_users and beside the check on the endpoints,
  // with nothing reconciling the three. A name could be handed leads without
  // being able to sign in, and a person could be deactivated as a user and go
  // on collecting them. People live in one place now (D6, tranche 173).
  const saved: unknown[] = [];
  await stub(page, [leadRow("A", { assignee: "erik@gteveryday.com" })]);
  await page.route("**/api/sales/settings", (r) => {
    if (r.request().method() === "PUT") {
      saved.push(r.request().postDataJSON());
      return r.fulfill({ json: { updated: ["queue"] } });
    }
    return r.fulfill({ json: SETTINGS });
  });
  await page.goto("/sales/settings");

  // What the screen still owes an admin: who is on the roster, and what
  // deactivating them would strand — the fact you need BEFORE going to do it.
  await expect(page.getByTestId("person-open-erik@gteveryday.com")).toBeVisible();

  // What it no longer offers, and where it sends you instead.
  await expect(page.getByTestId("person-add")).toBeHidden();
  await expect(page.getByTestId("person-active-erik@gteveryday.com")).toBeHidden();
  await expect(page.getByTestId("people-registry-link")).toHaveAttribute(
    "href",
    "/admin/users",
  );

  // And a save from this screen carries no roster at all — the endpoint stopped
  // accepting one in the same change, so sending it would be writing into a void.
  await page.getByTestId("settings-save").click();
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  expect(saved[0]).not.toHaveProperty("assignees");
});
