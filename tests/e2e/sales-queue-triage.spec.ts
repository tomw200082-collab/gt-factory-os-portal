import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — tranche 164: the queue is a daily commitment rather than a wall,
// age is impossible to ignore, and the leads table survives 188 rows.

const now = new Date();
const iso = (d: Date) => d.toISOString();

function lead(i: number, over: Record<string, unknown> = {}) {
  const ageDays = 3 + i;
  return {
    lead_id: `L${i}`,
    item_type: "new_lead",
    org_id: `O${i}`,
    org_name: `עסק ${i}`,
    contact_name: `איש קשר ${i}`,
    phone_e164: "+972521234567",
    email: null,
    campaign_name: null,
    platform: "fb",
    status: "new",
    assignee: null,
    next_touch_at: null,
    first_touch_at: null,
    created_at: iso(new Date(now.getTime() - ageDays * 86400e3)),
    is_existing_customer: false,
    shopify_snapshot: null,
    shopify_snapshot_at: null,
    converted_order_ref: null,
    converted_amount: null,
    converted_at: null,
    sla_deadline_at: iso(new Date(now.getTime() - (ageDays - 1) * 86400e3)),
    sla_state: "overdue",
    age_days: ageDays,
    uncontactable: false,
    ...over,
  };
}

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}", reminder: "היי", returning_customer: "היי" },
  lost_reasons: ["לא רלוונטי", "אחר"],
  queue: { daily_cap: 15, order: "newest_first" },
  assignees: [{ email: "tom@gteveryday.com", name: "תום", active: true }],
  last_changes: [],
};

const STATS = {
  week_new_leads: 0,
  working_now: 0,
  week_converted: 0,
  queue_today: 40,
  overdue_count: 7,
  unassigned_open_count: 40,
  never_contacted_count: 40,
  uncontactable_count: 39,
};

async function stub(page: Page, rows: unknown[], leadRows: unknown[] = []) {
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: STATS } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: leadRows } }));
  await page.route("**/api/sales/today**", (r) =>
    r.fulfill({ json: { rows, queue: SETTINGS.queue } }),
  );
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
});

test("the queue caps the backlog and states what is waiting @mocked", async ({ page }) => {
  await stub(page, Array.from({ length: 40 }, (_, i) => lead(i)));
  await page.goto("/sales/today");

  const section = page.getByTestId("today-section-new_lead");
  // The count stays honest: forty leads exist, and the screen says so.
  await expect(section.getByTestId("today-section-count")).toHaveText("40");
  // Fifteen belong to today; the other twenty-five are named, not hidden.
  await expect(section.getByTestId("today-daily-commitment")).toContainText("15");
  await expect(section.getByTestId("today-daily-commitment")).toContainText("25");
});

test("age is stated in days and reads as urgent past the SLA @mocked", async ({ page }) => {
  await stub(page, [lead(16)]); // 19 days old against a 24h SLA
  await page.goto("/sales/today");

  const age = page.getByTestId("today-card-L16").getByTestId("today-age");
  await expect(age).toContainText("19");
  await expect(age).toHaveAttribute("data-tone", "overdue");
});

test("the SLA badge appears only on an overdue lead @mocked", async ({ page }) => {
  await stub(page, [
    lead(0, { lead_id: "FRESH", sla_state: "within", age_days: 0 }),
    lead(1, { lead_id: "LATE", sla_state: "overdue", age_days: 9 }),
  ]);
  await page.goto("/sales/today");

  // Assert the card is there before asserting what it lacks: toHaveCount(0)
  // against a screen that never rendered would pass for the wrong reason.
  await expect(page.getByTestId("today-card-FRESH")).toBeVisible();
  await expect(page.getByTestId("today-card-FRESH").getByTestId("sla-badge")).toHaveCount(0);
  await expect(page.getByTestId("today-card-LATE").getByTestId("sla-badge")).toBeVisible();
});

test("the strip leads with the triage counts, not the weekly zeros @mocked", async ({ page }) => {
  await stub(page, [lead(0)]);
  await page.goto("/sales/today");

  const strip = page.getByTestId("stats-strip");
  await expect(strip).toContainText("40"); // in the queue today
  await expect(strip).toContainText("7"); // overdue
});

test("leads: the uncontactable chip isolates the leads nobody can call @mocked", async ({
  page,
}) => {
  const leadRows = [
    {
      id: "A",
      org_id: "O1",
      org_name: "עסק עם טלפון",
      contact_name: "דנה",
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
      created_at: iso(now),
      is_existing_customer: false,
      shopify_customer_id: null,
      shopify_snapshot: null,
      shopify_snapshot_at: null,
      age_days: 1,
      sla_deadline_at: iso(now),
      sla_state: "overdue",
      next_touch_overdue: false,
      uncontactable: false,
    },
    {
      id: "B",
      org_id: "O2",
      org_name: "עסק בלי פרטים",
      contact_name: null,
      phone_e164: null,
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
      created_at: iso(now),
      is_existing_customer: false,
      shopify_customer_id: null,
      shopify_snapshot: null,
      shopify_snapshot_at: null,
      age_days: 40,
      sla_deadline_at: iso(now),
      sla_state: "overdue",
      next_touch_overdue: false,
      uncontactable: true,
    },
  ];
  await stub(page, [], leadRows);
  await page.goto("/sales/leads");

  // Desktop project: the phone's card list is md:hidden and the table renders.
  await expect(page.getByTestId("lead-row-A")).toBeVisible();
  await page.getByTestId("leads-chip-uncontactable").click();
  // Filtered: only the lead nobody can call survives.
  await expect(page.getByTestId("lead-row-A")).toHaveCount(0);
  await expect(page.getByTestId("lead-row-B")).toBeVisible();
});
