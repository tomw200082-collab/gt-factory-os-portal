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

async function stub(
  page: Page,
  opts: { attention?: unknown[]; saved?: unknown[]; leads?: unknown[]; outreach?: string[] } = {},
) {
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
  await page.route("**/api/sales/leads**", (r) =>
    r.fulfill({ json: { rows: opts.leads ?? [] } }),
  );
  await page.route("**/api/sales/leads/*/outreach", (r) => {
    opts.outreach?.push(r.request().url());
    return r.fulfill({ json: { lead_id: "L-LATE", event_id: "E9" } });
  });
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

/** A real trip away from the app and back — the sheet is raised on return,
 *  never on the tap, because the tap is when the dialler takes over. */
async function leaveAndReturn(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
  await page.addInitScript(() => {
    window.__GT_SALES_OUTCOME_DELAY_MS__ = 0;
  });
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

  await page.getByTestId("lost-reason-new").fill("מחיר");
  await page.getByTestId("lost-reason-add").click();
  await page.getByTestId("settings-save").click();

  await expect.poll(() => saved.length).toBeGreaterThan(0);
  const body = saved[0] as { lost_reasons: string[] };
  expect(body.lost_reasons).toContain("מחיר");
  // The free-text entry stays last, because that is the rule the hint states.
  expect(body.lost_reasons[body.lost_reasons.length - 1]).toBe("אחר");
});

/** The lead behind L-LATE, as /leads returns it — the outcome sheet names its
 *  subject from there. */
const LEAD_LATE = {
  id: "L-LATE",
  org_id: "O-LATE",
  org_name: "מסעדה מאחרת",
  contact_name: "יעל",
  phone_e164: "+972521234567",
  email: null,
  source: "manual",
  campaign_name: null,
  ad_name: null,
  platform: null,
  is_organic: false,
  status: "working",
  lost_reason: null,
  assignee: "tom@gteveryday.com",
  next_touch_at: iso(new Date(now.getTime() - 4 * 86400e3)),
  first_touch_at: null,
  possible_duplicate_of: null,
  converted_order_ref: null,
  converted_amount: null,
  created_at: iso(new Date(now.getTime() - 10 * 86400e3)),
  is_existing_customer: false,
  shopify_customer_id: null,
  shopify_snapshot: null,
  shopify_snapshot_at: null,
  age_days: 10,
  sla_deadline_at: null,
  sla_state: "overdue",
  next_touch_overdue: true,
  uncontactable: false,
};

test("a call placed from /attention is answered for on /attention @mocked", async ({ page }) => {
  // Gate flow P1 / INTER-008. This screen dialled and asked nothing — so the
  // one surface built for "what is stuck" was itself a way to have a
  // conversation that no record ever showed, which is the exact defect the
  // outcome loop exists to close.
  const outreach: string[] = [];
  await stub(page, { leads: [LEAD_LATE], outreach });
  await page.goto("/sales/attention");

  await page.getByTestId("attention-call-L-LATE-overdue").click();

  // The intent is recorded server-side …
  await expect.poll(() => outreach.length).toBeGreaterThan(0);
  expect(outreach[0]).toContain("/L-LATE/outreach");

  await leaveAndReturn(page);

  // … and the screen asks what came of it, naming the business.
  const sheet = page.getByTestId("outcome-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("יעל");
});

test("the activity feed says it is loading rather than showing nothing @mocked", async ({
  page,
}) => {
  // A blank <section> while the query was in flight was indistinguishable from
  // "no activity has ever happened" (gate flow P1).
  await stub(page);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/sales/activity**", async (r) => {
    await held;
    return r.fulfill({ json: { rows: ACTIVITY } });
  });

  await page.goto("/sales/attention");
  await expect(page.getByTestId("activity-loading")).toBeVisible();
  release();
  await expect(page.getByTestId("activity-feed")).toBeVisible();
});

test("a call placed from the drawer on /attention is answered for too @mocked", async ({
  page,
}) => {
  // Gate iteration 2: tranche 171 armed the attention *cards* and left the
  // drawer opened from those same cards unarmed — the same hole, one tap
  // deeper. A call placed from inside the drawer dialled and asked nothing.
  const outreach: string[] = [];
  await stub(page, { leads: [LEAD_LATE], outreach });
  await page.goto("/sales/attention");

  await page.getByTestId("attention-open-L-LATE-overdue").click();
  await expect(page.getByTestId("lead-drawer")).toBeVisible();
  await page.getByTestId("drawer-call").click();

  await expect.poll(() => outreach.length).toBeGreaterThan(0);
  expect(outreach[0]).toContain("/L-LATE/outreach");

  await leaveAndReturn(page);
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();
});

test("the queue is hidden from assistive tech while a sheet is open @mocked", async ({
  page,
}) => {
  // aria-modal is only partly honoured on iOS, so /sales/today wraps the
  // content behind a sheet in aria-hidden. The sheet arrived on this screen
  // without that wrapper.
  await stub(page, { leads: [LEAD_LATE] });
  await page.goto("/sales/attention");

  const body = page.getByTestId("attention-body");
  await expect(body).not.toHaveAttribute("aria-hidden", "true");

  await page.getByTestId("attention-call-L-LATE-overdue").click();
  await leaveAndReturn(page);
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();
  await expect(body).toHaveAttribute("aria-hidden", "true");
});
