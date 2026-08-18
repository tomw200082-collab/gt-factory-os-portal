import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — tranche 167: the admin console. What is stuck, who did what, and
// the two lists that used to need a deploy to change.

const now = new Date();
const iso = (d: Date) => d.toISOString();

const QUEUE = { daily_cap: 15, order: "newest_first" as const };

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}", reminder: "היי", returning_customer: "היי" },
  lost_reasons: ["לא רלוונטי", "אין תקציב", "אחר"],
  queue: QUEUE,
  assignees: [{ email: "tom@gteveryday.com", name: "תום", active: true }],
  last_changes: [{ key: "queue", actor: "Tom", at: iso(new Date(now.getTime() - 3600e3)) }],
};

const ATTENTION = [
  {
    lead_id: "L-LATE",
    org_name: "מסעדה מאחרת",
    contact_name: "יעל",
    phone_e164: "+972521234567",
    assignee: "tom@gteveryday.com",
    status: "working",
    bucket: "overdue",
    days_stuck: 4,
    next_touch_at: iso(new Date(now.getTime() - 4 * 86400e3)),
    last_event_at: null,
  },
  {
    lead_id: "L-OPEN",
    org_name: "בית קפה ללא בעלים",
    contact_name: "דן",
    phone_e164: "+972521234568",
    assignee: null,
    status: "new",
    bucket: "unowned",
    days_stuck: 6,
    next_touch_at: null,
    last_event_at: null,
  },
];

const ACTIVITY = [
  {
    event_id: "E1",
    lead_id: "L-LATE",
    org_name: "מסעדה מאחרת",
    contact_name: "יעל",
    event_type: "assignment",
    payload: { assignee: "tom@gteveryday.com" },
    actor: "Tom",
    created_at: iso(new Date(now.getTime() - 1800e3)),
  },
];

async function stub(page: Page, opts: { attention?: unknown[]; saved?: unknown[] } = {}) {
  await page.route("**/api/sales/week-stats**", (r) =>
    r.fulfill({
      json: {
        stats: {
          week_new_leads: 0,
          working_now: 1,
          week_converted: 0,
          queue_today: 1,
          overdue_count: 1,
          unassigned_open_count: 1,
          never_contacted_count: 1,
          uncontactable_count: 0,
        },
      },
    }),
  );
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads/*/events**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [], queue: QUEUE } }));
  await page.route("**/api/sales/attention**", (r) =>
    r.fulfill({ json: { rows: opts.attention ?? ATTENTION } }),
  );
  await page.route("**/api/sales/activity**", (r) => r.fulfill({ json: { rows: ACTIVITY } }));
  await page.route("**/api/sales/settings", (r) => {
    if (r.request().method() === "PUT") {
      opts.saved?.push(r.request().postDataJSON());
      return r.fulfill({ json: { updated: ["queue"] } });
    }
    return r.fulfill({ json: SETTINGS });
  });
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
});

test("attention buckets what is overdue and what nobody owns @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/attention");

  await expect(page.getByTestId("attention-section-overdue")).toContainText("באיחור (1)");
  await expect(page.getByTestId("attention-section-unowned")).toContainText("ללא בעלים (1)");
  await expect(page.getByTestId("attention-row-L-LATE-overdue")).toContainText("מסעדה מאחרת");
  await expect(page.getByTestId("attention-days-L-OPEN-unowned")).toContainText("6");
});

test("a clean board says so instead of showing nothing @mocked", async ({ page }) => {
  await stub(page, { attention: [] });
  await page.goto("/sales/attention");
  await expect(page.getByTestId("attention-clear")).toBeVisible();
});

test("the activity feed reads across leads @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/attention");
  await expect(page.getByTestId("activity-E1")).toContainText("מסעדה מאחרת");
  await expect(page.getByTestId("activity-E1")).toContainText("Tom");
});

test("the screen is reachable from the tab bar @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");
  await page.getByRole("link", { name: "מצב" }).first().click();
  await expect(page).toHaveURL(/\/sales\/attention/, { timeout: 15_000 });
});

test("queue shape is Tom's to change, and says who changed it last @mocked", async ({ page }) => {
  const saved: unknown[] = [];
  await stub(page, { saved });
  await page.goto("/sales/settings");

  await expect(page.getByTestId("settings-queue")).toContainText("שונה על ידי Tom");
  await page.getByTestId("queue-cap").fill("7");
  await page.getByTestId("queue-order-oldest_first").click();
  await page.getByTestId("settings-save").click();

  await expect.poll(() => saved.length).toBeGreaterThan(0);
  const body = saved[0] as { queue: { daily_cap: number; order: string } };
  expect(body.queue.daily_cap).toBe(7);
  expect(body.queue.order).toBe("oldest_first");
});

test("lost reasons are editable without a deploy @mocked", async ({ page }) => {
  const saved: unknown[] = [];
  await stub(page, { saved });
  await page.goto("/sales/settings");

  await page.getByLabel("סיבות אבוד").fill("מחיר");
  await page.getByTestId("lost-reason-add").click();
  await page.getByTestId("settings-save").click();

  await expect.poll(() => saved.length).toBeGreaterThan(0);
  const body = saved[0] as { lost_reasons: string[] };
  expect(body.lost_reasons).toContain("מחיר");
  // The free-text entry stays last, because that is the rule the hint states.
  expect(body.lost_reasons[body.lost_reasons.length - 1]).toBe("אחר");
});
