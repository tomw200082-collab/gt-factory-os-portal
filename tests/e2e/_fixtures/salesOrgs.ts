// Synthetic GT Pulse Unit B world for the @mocked e2e and the screenshot
// harness. Nothing here is a real customer: names are invented, phones sit in
// the +97250000xxxx test block, emails use .invalid, order numbers start at 9.

import type { Page, Route } from "@playwright/test";

const NOW = Date.parse("2026-10-02T09:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const day = 86_400_000;
const AS_OF = iso(NOW - 2 * 3_600_000);
const STALE_AS_OF = iso(NOW - 3 * day);

export const IDS = {
  full: "00000000-0000-4000-8000-00000000f001",
  one: "00000000-0000-4000-8000-00000000f002",
  eight: "00000000-0000-4000-8000-00000000f003",
  many: "00000000-0000-4000-8000-00000000f004",
  long: "00000000-0000-4000-8000-00000000f005",
  empty: "00000000-0000-4000-8000-00000000f006",
  review: "00000000-0000-4000-8000-00000000f007",
  disputed: "00000000-0000-4000-8000-00000000f008",
  stale: "00000000-0000-4000-8000-00000000f009",
  unverified: "00000000-0000-4000-8000-00000000f00a",
  merged: "00000000-0000-4000-8000-00000000f00b",
  moved: "00000000-0000-4000-8000-00000000f00c",
  forbidden: "00000000-0000-4000-8000-00000000f00d",
  retired: "00000000-0000-4000-8000-00000000f00e",
} as const;

export const LONG_NAME = "בית הקפה והמאפייה המשפחתית של משפחת לדוגמה בשדרות הנשיאים בראשון";

type Spec = {
  name: string;
  link: "verified" | "review" | "disputed" | "retired" | null;
  orders: number;
  history?: "ok" | "stale" | "unverified";
  chain?: { name: string; kind: string; branch_count: number } | null;
  moved?: { to: string; on: string } | null;
  contacts?: { verified: number; review: number };
  river?: number;
  lead?: boolean;
  merged?: { id: string; name: string } | null;
  longTitles?: boolean;
};

export const ORGS: Record<string, Spec> = {
  [IDS.full]: { name: "קפה הדגמה הרצליה", link: "verified", orders: 28, contacts: { verified: 1, review: 2 }, lead: true, chain: { name: "קפה הדגמה", kind: "רשת", branch_count: 4 } },
  [IDS.one]: { name: "מאפיית הבוקר לדוגמה", link: "verified", orders: 1, contacts: { verified: 0, review: 1 } },
  [IDS.eight]: { name: "בר המיץ בדיקה", link: "verified", orders: 8, contacts: { verified: 1, review: 0 }, lead: true },
  [IDS.many]: { name: "גלידריית הדגמה המרכזית", link: "verified", orders: 216, contacts: { verified: 10, review: 12 }, river: 300, lead: true },
  [IDS.long]: { name: LONG_NAME, link: "verified", orders: 28, contacts: { verified: 1, review: 1 }, longTitles: true, lead: true },
  [IDS.empty]: { name: "עסק חדש לדוגמה", link: null, orders: 0, contacts: { verified: 0, review: 0 } },
  [IDS.review]: { name: "קפה בבדיקה לדוגמה", link: "review", orders: 0, contacts: { verified: 0, review: 1 }, lead: true },
  [IDS.disputed]: { name: "סניף במחלוקת לדוגמה", link: "disputed", orders: 0, contacts: { verified: 0, review: 1 } },
  [IDS.stale]: { name: "קונדיטוריית הדגמה", link: "verified", orders: 12, history: "stale", contacts: { verified: 1, review: 0 } },
  [IDS.unverified]: { name: "מסעדת בדיקה", link: "verified", orders: 12, history: "unverified", contacts: { verified: 1, review: 0 } },
  [IDS.merged]: { name: "רשומה ישנה לדוגמה", link: "retired", orders: 0, merged: { id: "00000000-0000-4000-8000-00000000f001", name: "קפה הדגמה הרצליה" } },
  [IDS.retired]: { name: "רשומה סגורה לדוגמה", link: "retired", orders: 0, merged: null },
  [IDS.moved]: { name: "סניף שעבר למפיץ לדוגמה", link: "verified", orders: 8, chain: { name: "גלידה לדוגמה", kind: "רשת", branch_count: 6 }, moved: { to: "מפיץ הדגמה", on: "2026-03-01" }, contacts: { verified: 0, review: 0 } },
};

const PRODUCT_TITLES = ["בסיס לימונדה 1 ליטר", "בסיס תה קר אפרסק", "סירופ וניל"];
const LONG_TITLES = [
  "בסיס משקה קיצי בטעם אבטיח ונענע במארז מוסדי של שישה בקבוקים בנפח ליטר וחצי",
  "בסיס תה קר מבושל בטעם אפרסק וג'ינג'ר, ללא סוכר מוסף, מארז חסכוני למסעדות",
];

/** Orders spread over the last 30 months, newest first; every 9th cancelled, one refunded, one open draft. */
function ordersOf(id: string, spec: Spec) {
  const rows = [];
  for (let i = 0; i < spec.orders; i++) {
    const at = NOW - Math.round((i * 900) / Math.max(spec.orders, 30)) * day - 5 * 3_600_000;
    const cls = i % 9 === 4 ? "cancelled" : i === 2 ? "refunded" : "completed";
    rows.push({
      gid: `gid://shopify/Order/9${id.slice(-3)}${String(i).padStart(5, "0")}`,
      name: `#9${String(1000 + i)}`,
      created_at: iso(at),
      class: cls,
      draft_status: null,
      ex_vat_agorot: i === 0 ? 12345600 : 21000 + i * 1300,
      line_count: 1 + (i % 4),
    });
  }
  return rows;
}

function monthsOf(orders: ReturnType<typeof ordersOf>) {
  const months = [];
  const fmt = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).format(new Date(ms)).slice(0, 7);
  const cur = new Date(NOW);
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - i, 15));
    const ym = fmt(d.getTime());
    const inMonth = orders.filter((o) => fmt(Date.parse(o.created_at)) === ym);
    months.push({
      ym,
      completed: inMonth.filter((o) => o.class === "completed").length,
      refunded: inMonth.filter((o) => o.class === "refunded").length,
      cancelled: inMonth.filter((o) => o.class === "cancelled").length,
      drafts: inMonth.length * 2, // F1: the server counts completed drafts too; the portal must ignore this
    });
  }
  return months;
}

function detailOf(id: string, spec: Spec) {
  const orders = ordersOf(id, spec);
  const history = spec.history ?? "ok";
  const shown = spec.link === "verified" && history !== "unverified";
  const clean = orders.filter((o) => o.class !== "cancelled");
  const in12 = clean.filter((o) => Date.parse(o.created_at) > NOW - 365 * day);
  return {
    header: { id, name: spec.name, phone: "+972500000201", owner_email: id === IDS.full ? "rep@synthetic.invalid" : null },
    link_status: spec.link,
    chain: spec.link === "verified" ? (spec.chain ?? null) : null,
    moved: spec.link === "verified" ? (spec.moved ?? null) : null,
    counts: shown
      ? {
          orders_12m: in12.length,
          ex_vat_12m_agorot: in12.reduce((s, o) => s + o.ex_vat_agorot, 0),
          clean_orders: clean.length,
          cancelled_orders: orders.length - clean.length,
          open_drafts: spec.orders > 0 ? 1 : 0,
          last_order: clean[0] ? { gid: clean[0].gid, name: clean[0].name, created_at: clean[0].created_at, line_count: clean[0].line_count } : null,
        }
      : null,
    active: shown ? in12.length > 0 : null,
    coverage_line: null,
    history_status: history,
    as_of: history === "unverified" ? null : history === "stale" ? STALE_AS_OF : AS_OF,
    identity: spec.link === "review" || spec.link === "disputed" ? { reasons: [spec.link === "review" ? "b1_review_tag" : "phone_shared"], candidates: [] } : null,
    merged_into: spec.merged ?? null,
  };
}

function contactsOf(spec: Spec) {
  const c = spec.contacts ?? { verified: 0, review: 0 };
  const verified = Array.from({ length: c.verified }, (_, i) => {
    const phone = `+9725000003${String(i).padStart(2, "0")}`;
    const email = `contact${i}@example.invalid`;
    return {
      id: `00000000-0000-4000-8000-0000000c${String(i).padStart(4, "0")}`,
      name: i === 0 ? "יואב בדיקה" : `איש קשר מאומת ${i + 1}`,
      kind: "person", phone, email,
      verified_by: "manager@synthetic.invalid", verified_at: iso(NOW - 20 * day),
      source: { system: "customer_portal_access", observed_at: iso(NOW - 20 * day) },
      tel: `tel:${phone}`, wa: `https://wa.me/${phone.replace(/\D/g, "")}`, mailto: `mailto:${email}`,
    };
  });
  const review = Array.from({ length: c.review }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000d${String(i).padStart(4, "0")}`,
    name: i === 0 ? "נועה לדוגמה" : i % 3 === 1 ? null : `איש קשר לבדיקה ${i + 1}`,
    kind: i % 3 === 1 ? "org_channel" : "person",
    phone: `+9725000004${String(i).padStart(2, "0")}`,
    email: i === 0 ? "alexandra.bendavid.rosenblum.purchasing@verylongrestaurantgroupdomain-example.invalid" : null,
    verified_by: null, verified_at: null,
    source: { system: i % 2 ? "lead" : "customer_portal_access", observed_at: iso(NOW - (i + 3) * day) },
  }));
  return { verified, review };
}

function riverOf(id: string, spec: Spec, chip: string, cursor: string | null) {
  const orders = ordersOf(id, spec);
  const shown = spec.link === "verified" && (spec.history ?? "ok") !== "unverified";
  const events = [];
  const n = spec.river ?? Math.min(40, spec.orders + 6);
  for (let i = 0; i < n; i++) {
    const at = NOW - i * 2 * day - 3 * 3_600_000;
    if (shown && (chip === "all" || chip === "orders") && orders[i] && orders[i].class !== "cancelled") {
      events.push({ kind: "order", id: `o:${orders[i].gid}`, at: orders[i].created_at, order: orders[i] });
    } else if (chip === "all" || chip === "contact") {
      const t = ["outreach", "outcome", "note", "next_touch_set", "auto_message", "button_tap"][i % 6];
      events.push({ kind: "lead_event", id: `l:${i}`, at: iso(at), type: t, actor: "rep@synthetic.invalid", lead_id: "00000000-0000-4000-8000-0000000e0001", lead_name: "נועה לדוגמה", payload: {} });
    }
    if (i === 3 && (chip === "all" || chip === "contact")) events.push({ kind: "org_event", id: `e:${i}`, at: iso(at - 3_600_000), type: "identity_linked", actor: "system:identity" });
  }
  if (shown && chip === "cancelled") events.push(...orders.filter((o) => o.class === "cancelled").map((o) => ({ kind: "order", id: `o:${o.gid}`, at: o.created_at, order: o })));
  if (shown && chip === "drafts") {
    events.push(
      { kind: "order", id: "o:gid://shopify/DraftOrder/91", at: iso(NOW - 7 * day), order: { gid: "gid://shopify/DraftOrder/91", name: "#D91", created_at: iso(NOW - 7 * day), class: "draft", draft_status: "OPEN", ex_vat_agorot: 34000, line_count: 2 } },
      { kind: "order", id: "o:gid://shopify/DraftOrder/90", at: iso(NOW - 40 * day), order: { gid: "gid://shopify/DraftOrder/90", name: "#D90", created_at: iso(NOW - 40 * day), class: "draft", draft_status: "COMPLETED", ex_vat_agorot: 28000, line_count: 2 } },
    );
  }
  const start = cursor ? Number(cursor) : 0;
  const page = events.slice(start, start + 25);
  return {
    rows: page,
    next: start + 25 < events.length ? String(start + 25) : null,
    counts: shown ? { cancelled: orders.filter((o) => o.class === "cancelled").length, drafts: 2 } : { cancelled: 0, drafts: 0 },
    pending_drafts: shown && !cursor && spec.orders > 0 ? [{ gid: "gid://shopify/DraftOrder/91", name: "#D91", draft_status: "OPEN", created_at: iso(NOW - 7 * day), age_days: 7 }] : [],
    history_status: spec.history ?? "ok",
  };
}

export const ROSTER = [
  { email: "rep@synthetic.invalid", name: "נציגת הדגמה", active: true },
  { email: "manager@synthetic.invalid", name: "מנהל הדגמה", active: true },
];

export function listRows() {
  return Object.entries(ORGS).filter(([, s]) => s.link !== "retired").map(([id, s]) => {
    const d = detailOf(id, s);
    return {
      id, name: s.name, link_status: s.link, owner_email: d.header.owner_email, last_activity_at: iso(NOW - day),
      has_open_lead: Boolean(s.lead), is_active_customer: d.active, last_order_at: d.counts?.last_order?.created_at ?? null,
      orders_12m: d.counts?.orders_12m ?? null, ex_vat_12m_agorot: d.counts?.ex_vat_12m_agorot ?? null, chain_name: d.chain?.name ?? null,
    };
  });
}

export function leadFor(orgId: string, over: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-0000000e0001", org_id: orgId, org_name: ORGS[orgId]?.name ?? "עסק", contact_name: "נועה לדוגמה",
    phone_e164: "+972500000102", email: null, source: "form", campaign_name: null, ad_name: null, platform: null, is_organic: null,
    status: "working", lost_reason: null, assignee: "rep@synthetic.invalid", next_touch_at: iso(NOW + 2 * day), first_touch_at: iso(NOW - 30 * day),
    possible_duplicate_of: null, converted_order_ref: null, converted_amount: null, created_at: iso(NOW - 33 * day),
    is_existing_customer: true, shopify_customer_id: null, shopify_snapshot: null, shopify_snapshot_at: null, age_days: 33,
    sla_deadline_at: iso(NOW - 32 * day), sla_state: null, next_touch_overdue: false, uncontactable: false, ...over,
  };
}

export interface StubOptions {
  role?: "manager" | "rep";
  /** org ids the rep may read; others answer 403 */
  repOrgs?: string[];
  posts?: Array<{ url: string; body: unknown }>;
  identityReview?: unknown;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Stub every sales API the Unit B screens and the Unit A shell touch. */
export async function stubSalesOrgs(page: Page, opts: StubOptions = {}) {
  const rep = opts.role === "rep";
  const canRead = (id: string) => !rep || (opts.repOrgs ?? [IDS.full]).includes(id);

  await page.route("**/api/**", (r) => json(r, {}));
  await page.route("**/api/sales/settings**", (r) => json(r, {
    sla_hours: 24, whatsapp_templates: { new_lead: "היי {{name}}", reminder: "היי", returning_customer: "היי" },
    lost_reasons: ["לא רלוונטי", "אחר"], queue: { daily_cap: 15, order: "newest_first" }, assignees: ROSTER, last_changes: [],
  }));
  await page.route("**/api/sales/week-stats**", (r) => json(r, { stats: { week_new_leads: 1, working_now: 2, week_converted: 0, queue_today: 1, overdue_count: 0, unassigned_open_count: 0, never_contacted_count: 0, uncontactable_count: 0 } }));
  await page.route("**/api/sales/today**", (r) => json(r, { rows: [], queue: { daily_cap: 15, order: "newest_first" } }));
  await page.route("**/api/sales/attention**", (r) => json(r, { rows: [] }));
  await page.route("**/api/sales/activity**", (r) => json(r, { rows: [] }));
  await page.route("**/api/sales/leads**", (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/events")) return json(r, { rows: [] });
    return json(r, { rows: [leadFor(IDS.full), leadFor(IDS.eight, { id: "00000000-0000-4000-8000-0000000e0002", next_touch_at: iso(NOW - day), contact_name: "דן לדוגמה" })] });
  });
  await page.route("**/api/sales/tasks**", (r) => json(r, { rows: [{
    id: "00000000-0000-4000-8000-0000000f0001", lead_id: "00000000-0000-4000-8000-0000000e0001", org_id: null, kind: "call", title: "לחזור לליד",
    due_at: iso(NOW + day), status: "open", owner_email: "rep@synthetic.invalid", source_kind: "activity", source_id: "x", source_event_id: null,
    reason: "נקבע בעקבות תוצאת קשר", needs_assignment: false, lead_context: { org_name: ORGS[IDS.full].name, contact_name: "נועה לדוגמה", status: "working" },
  }] }));

  await page.route("**/api/sales/orgs/page**", (r) => {
    const url = new URL(r.request().url());
    const filter = url.searchParams.get("filter") ?? "active";
    let rows = listRows().filter((x) => !rep || canRead(x.id));
    if (filter === "active") rows = rows.filter((x) => x.is_active_customer || x.has_open_lead);
    if (filter === "prospect") rows = rows.filter((x) => x.link_status !== "verified");
    if (filter === "review") rows = rows.filter((x) => x.link_status === "review" || x.link_status === "disputed");
    const sort = url.searchParams.get("sort");
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
    return json(r, { rows, next: null, total: rows.length });
  });
  await page.route("**/api/sales/orgs/search**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    return json(r, listRows().filter((x) => x.name.includes(q) && (!rep || canRead(x.id))).map((x) => ({ id: x.id, name: x.name, phone: "+972500000201" })));
  });
  await page.route("**/api/sales/identity-review**", (r) => json(r, opts.identityReview ?? { orgs: [], exceptions: [], coverage: null }));
  await page.route("**/api/sales/orgs/*/identity", async (r) => {
    opts.posts?.push({ url: new URL(r.request().url()).pathname, body: r.request().postDataJSON() });
    return json(r, { org_id: "x", action: "confirm", link_status: "verified", customer_gid: null, merged_into: null });
  });
  await page.route("**/api/sales/orgs/owner", async (r) => {
    opts.posts?.push({ url: "/api/sales/orgs/owner", body: r.request().postDataJSON() });
    return json(r, { updated: 1 });
  });
  await page.route("**/api/sales/contacts/**", async (r) => {
    opts.posts?.push({ url: new URL(r.request().url()).pathname, body: r.request().postDataJSON() });
    return json(r, { contact_id: "x", action: "verify" });
  });

  // One business and its parts (reads only; a write falls back to the handlers above).
  await page.route(/\/api\/sales\/orgs\/[0-9a-f-]{36}(\/.*)?(\?.*)?$/, (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    const url = new URL(r.request().url());
    const [, , , , id, part, ...rest] = url.pathname.split("/");
    const spec = ORGS[id];
    if (!spec) return json(r, rep ? { error: "Not authorised" } : { error: "Org not found", code: "SALES_ORG_NOT_FOUND" }, rep ? 403 : 404);
    if (id === IDS.forbidden || !canRead(id)) return json(r, { error: "Not authorised" }, 403);
    if (!part) return json(r, detailOf(id, spec));
    if (part === "contacts") return json(r, contactsOf(spec));
    const shown = spec.link === "verified" && (spec.history ?? "ok") !== "unverified";
    if (part === "circle") return json(r, shown ? { months: monthsOf(ordersOf(id, spec)), last_order_at: ordersOf(id, spec).find((o) => o.class !== "cancelled")?.created_at ?? null, as_of: AS_OF, history_status: spec.history ?? "ok" } : { months: [], last_order_at: null, as_of: null, history_status: spec.history ?? "ok" });
    if (part === "river") return json(r, riverOf(id, spec, url.searchParams.get("chip") ?? "all", url.searchParams.get("cursor")));
    if (part === "orders" && rest.length === 0) {
      const all = shown ? ordersOf(id, spec) : [];
      const start = Number(url.searchParams.get("cursor") ?? 0);
      return json(r, { rows: all.slice(start, start + 50), next: start + 50 < all.length ? String(start + 50) : null, history_status: spec.history ?? "ok" });
    }
    if (part === "orders") {
      const gid = decodeURIComponent(rest.join("/"));
      const titles = spec.longTitles ? LONG_TITLES : PRODUCT_TITLES;
      return json(r, {
        gid, name: "#91000", created_at: iso(NOW - 12 * day), class: "completed", draft_status: null, ex_vat_agorot: 45600,
        lines: titles.map((t, i) => ({ title: t, sku: `SKU-${i}`, quantity: 6 * (i + 1), ex_vat_agorot: 15200 })),
        provenance: { source: "Shopify", observed_at: AS_OF },
      });
    }
    return json(r, {});
  });
}
