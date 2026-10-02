// GT Pulse Unit B, tranche 190: the business workspace. Synthetic fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const role = vi.hoisted(() => ({ value: "admin" as string }));
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({ session: { role: role.value, email: role.value === "sales_rep" ? "rep@synthetic.invalid" : "manager@synthetic.invalid" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/sales/orgs/x",
  useSearchParams: () => new URLSearchParams(),
}));

import { OrgWorkspace } from "@/app/(sales)/_components/org/OrgWorkspace";
import { UI } from "@/app/(sales)/_lib/labels";
import { CONTACTS, ORG_ID, circle, contact, detail, lead, river, task, verifiedContact } from "./_orgFixtures";

type Route = { status?: number; body: unknown };
let routes: Record<string, Route> = {};
const calls: Array<{ url: string; method: string; body?: unknown }> = [];

function baseRoutes(): Record<string, Route> {
  return {
    [`/api/sales/orgs/${ORG_ID}`]: { body: detail() },
    [`/api/sales/orgs/${ORG_ID}/contacts`]: { body: CONTACTS },
    [`/api/sales/orgs/${ORG_ID}/circle`]: { body: circle() },
    [`/api/sales/orgs/${ORG_ID}/river`]: { body: river() },
    "/api/sales/tasks": { body: { rows: [task()] } },
    "/api/sales/leads": { body: { rows: [lead()] } },
  };
}

beforeEach(() => {
  role.value = "admin";
  calls.length = 0;
  routes = baseRoutes();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = url.split("?")[0];
    const hit = routes[path] ?? (method === "POST" ? { body: { ok: true } } : undefined);
    if (!hit) return new Response(JSON.stringify({ error: "not stubbed" }), { status: 500 });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function view(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("workspace: a verified customer with published history", () => {
  it("opens on the business, its next action, its contact and its summary", async () => {
    view(<OrgWorkspace orgId={ORG_ID} />);
    expect(await screen.findByRole("heading", { level: 1, name: "קפה הדגמה הרצליה" })).toBeTruthy();
    const next = await screen.findByTestId("next-action");
    expect(next.textContent).toContain("לחזור לליד");
    expect(within(next).getByRole("link").getAttribute("href")).toBe("/sales/leads?lead=00000000-0000-4000-8000-0000000000d1");
    const primary = await screen.findByTestId("primary-contact");
    expect(primary.textContent).toContain("יואב בדיקה");
    const summary = await screen.findByTestId("org-summary");
    expect(summary.textContent).toContain(UI.exVat);
    expect(summary.textContent).toContain("12,345");
  });

  it("orders the first viewport: header, next action, contact, summary", async () => {
    view(<OrgWorkspace orgId={ORG_ID} />);
    await screen.findByTestId("org-summary");
    const ids = ["org-header", "next-action", "primary-contact", "org-summary"];
    const nodes = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${ids[i - 1]} before ${ids[i]}`).toBeTruthy();
    }
  });

  it("opens the source of a number with where it came from and when", async () => {
    view(<OrgWorkspace orgId={ORG_ID} />);
    const summary = await screen.findByTestId("org-summary");
    fireEvent.click(within(summary).getByRole("button", { name: UI.sourceOpen }));
    const sheet = await screen.findByRole("dialog", { name: UI.sourceTitle });
    expect(sheet.textContent).toContain("Shopify");
    expect(sheet.textContent).toContain(UI.sourceBasisMoney);
    expect(sheet.textContent).not.toMatch(/sales_core|mirror_run|api_read/);
  });

  it("gives a verified contact call, WhatsApp and email links", async () => {
    view(<OrgWorkspace orgId={ORG_ID} />);
    const primary = await screen.findByTestId("primary-contact");
    const hrefs = within(primary).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("tel:+972500000103");
    expect(hrefs).toContain("https://wa.me/972500000103");
    expect(hrefs).toContain("mailto:yoav@example.invalid");
  });

  it("never links an unverified contact, even when its values are present", async () => {
    routes[`/api/sales/orgs/${ORG_ID}/contacts`] = {
      body: { verified: [], review: Array.from({ length: 12 }, (_, i) => contact({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, tel: "tel:+972500000999" } as never)) },
    };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const review = await screen.findByTestId("contacts-review");
    expect(review.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length).toBe(0);
    const primary = screen.getByTestId("primary-contact");
    expect(primary.textContent).toContain(UI.noVerifiedContact);
    expect(primary.querySelectorAll("a[href^='tel:']").length).toBe(0);
  });

  it("lets a manager verify a contact that awaits review", async () => {
    view(<OrgWorkspace orgId={ORG_ID} />);
    const review = await screen.findByTestId("contacts-review");
    fireEvent.click(within(review).getByRole("button", { name: UI.contactVerifyNamed("נועה לדוגמה") }));
    const confirm = await screen.findByRole("alertdialog", { name: UI.contactVerifyTitle });
    // the question's body is tied to the dialog, so it is read with its title (A11Y-B-005)
    const desc = document.getElementById(confirm.getAttribute("aria-describedby") ?? "");
    expect(desc?.textContent).toContain("נועה לדוגמה");
    fireEvent.click(within(confirm).getByRole("button", { name: UI.contactVerifyConfirm }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/sales/contacts/00000000-0000-4000-8000-0000000000c1/verify")).toBe(true));
    // the confirmation says who and what (INTER-B-005)
    expect((await screen.findByTestId("sales-toast")).textContent).toContain(UI.contactDecided("verify", "נועה לדוגמה"));
  });

  it("does not offer contact decisions to a rep", async () => {
    role.value = "sales_rep";
    view(<OrgWorkspace orgId={ORG_ID} />);
    const review = await screen.findByTestId("contacts-review");
    expect(within(review).queryByRole("button", { name: UI.contactVerifyNamed("נועה לדוגמה") })).toBeNull();
    // a rep's tasks are read in their own scope
    await waitFor(() => expect(calls.some((c) => c.url === "/api/sales/tasks?scope=mine")).toBe(true));
  });

  it("tells the business's story in words, with the open draft on top", async () => {
    view(<OrgWorkspace orgId={ORG_ID} />);
    const riverEl = await screen.findByTestId("org-river");
    await within(riverEl).findByText(/#9001/);
    expect(riverEl.textContent).toContain(UI.exVat);
    expect(riverEl.textContent).not.toMatch(/identity_linked|outreach|completed/);
    const pending = within(riverEl).getByTestId("pending-drafts");
    expect(pending.textContent).toContain("#D11");
    fireEvent.click(within(riverEl).getByRole("button", { name: /בוטלו/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/river?") && c.url.includes("chip=cancelled"))).toBe(true));
  });
});

describe("workspace: honest history states", () => {
  it("shows stale history under a banner, not as current", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ history_status: "stale" }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const banner = await screen.findByTestId("history-banner");
    expect(banner.textContent).toContain(UI.historyStaleTitle);
    expect((await screen.findByTestId("org-summary")).textContent).toContain("12,345");
  });

  it("says history is unavailable, and never prints zero, when it is unverified", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ history_status: "unverified", counts: null, active: null, as_of: null }) };
    routes[`/api/sales/orgs/${ORG_ID}/river`] = { body: river({ rows: [], pending_drafts: [], counts: { cancelled: 0, drafts: 0 }, history_status: "unverified" }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const summary = await screen.findByTestId("org-summary");
    expect(summary.textContent).toContain(UI.historyUnavailableTitle);
    expect(summary.textContent).not.toMatch(/(^|\D)0(\D|$)|₪/);
  });

  it("shows nothing from Shopify for a business under identity review", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = {
      body: detail({ link_status: "review", counts: null, active: null, identity: { reasons: ["b1_review_tag"], candidates: [] } }),
    };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const banner = await screen.findByTestId("identity-banner");
    expect(banner.textContent).toContain(UI.identityReviewTitle);
    expect(screen.queryByTestId("org-summary")?.textContent ?? "").not.toMatch(/₪|הזמנות ב/);
    // a manager is pointed to the decision
    expect(within(banner).getByRole("link").getAttribute("href")).toBe("/sales/orgs/review");
  });

  it("a rep on a review business sees the status, not the evidence", async () => {
    role.value = "sales_rep";
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ link_status: "review", counts: null, active: null, identity: null }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const banner = await screen.findByTestId("identity-banner");
    expect(within(banner).queryByRole("link")).toBeNull();
  });

  it("names a business that is not a customer yet without inventing history", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ link_status: null, counts: null, active: null }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    await screen.findByTestId("org-header");
    expect(screen.getByTestId("org-header").textContent).toContain("טרם לקוח");
    expect(screen.queryByTestId("org-summary")?.textContent ?? "").not.toMatch(/₪/);
  });

  it("states a move to a distributor in the header", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ chain: { name: "הדגמה", kind: "רשת", branch_count: 4 }, moved: { to: "מפיץ הדגמה", on: "2026-03-01" } }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const header = await screen.findByTestId("org-header");
    expect(header.textContent).toContain("מפיץ הדגמה");
    expect(header.textContent).toContain("רשת הדגמה · 4 סניפים");
  });

  it("never counts days of silence for a business that moved to a distributor (T5)", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ chain: { name: "הדגמה", kind: "רשת", branch_count: 4 }, moved: { to: "מפיץ הדגמה", on: "2026-03-01" } }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const summary = await screen.findByTestId("org-summary");
    expect(summary.textContent).not.toMatch(/לפני \d+ ימים|לפני יום|היום/);
    expect(summary.textContent).toContain(UI.lastOrder);
  });
});

describe("workspace: access and closed records", () => {
  it("says the business cannot be shown, and shows nothing else, on 403", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { status: 403, body: { error: "Not authorised" } };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const state = await screen.findByTestId("org-forbidden");
    expect(state.textContent).toContain(UI.orgForbiddenTitle);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("org-header")).toBeNull();
    // nothing else about the business is asked for
    expect(calls.filter((c) => c.url.startsWith(`/api/sales/orgs/${ORG_ID}/`))).toHaveLength(0);
  });

  it("uses the same words for a malformed id", async () => {
    routes[`/api/sales/orgs/not-an-id`] = { status: 400, body: { error: "Bad request", code: "SALES_BAD_ID" } };
    view(<OrgWorkspace orgId="not-an-id" />);
    expect((await screen.findByTestId("org-forbidden")).textContent).toContain(UI.orgForbiddenTitle);
  });

  it("tells a manager the business was not found on 404", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { status: 404, body: { error: "Org not found", code: "SALES_ORG_NOT_FOUND" } };
    view(<OrgWorkspace orgId={ORG_ID} />);
    expect((await screen.findByTestId("org-not-found")).textContent).toContain(UI.orgNotFoundTitle);
  });

  it("sends work from a merged business to where it moved, and offers no actions", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = {
      body: detail({ link_status: "retired", counts: null, active: null, merged_into: { id: "00000000-0000-4000-8000-0000000000b2", name: "קפה היעד" } }),
    };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const banner = await screen.findByTestId("retired-banner");
    expect(within(banner).getByRole("link", { name: /קפה היעד/ }).getAttribute("href")).toBe("/sales/orgs/00000000-0000-4000-8000-0000000000b2");
    expect(screen.queryByTestId("next-action")).toBeNull();
    expect(document.querySelectorAll("a[href^='tel:']").length).toBe(0);
  });

  it("says a retired record is closed when its destination is not readable", async () => {
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ link_status: "retired", counts: null, active: null, merged_into: null }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    expect((await screen.findByTestId("retired-banner")).textContent).toContain(UI.retiredClosed);
  });

  it("keeps a 64-character name whole", async () => {
    const long = "בית הקפה והמאפייה המשפחתית של משפחת לדוגמה בשדרות הנשיאים בראשון";
    routes[`/api/sales/orgs/${ORG_ID}`] = { body: detail({ header: { id: ORG_ID, name: long, phone: null, owner_email: null } }) };
    view(<OrgWorkspace orgId={ORG_ID} />);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(long);
  });

  it("shows when there is no open action", async () => {
    routes["/api/sales/tasks"] = { body: { rows: [] } };
    routes["/api/sales/leads"] = { body: { rows: [lead({ next_touch_at: null, status: "won" })] } };
    view(<OrgWorkspace orgId={ORG_ID} />);
    expect((await screen.findByTestId("next-action")).textContent).toContain(UI.nextActionNone);
  });

  it("says when the contact list is empty", async () => {
    routes[`/api/sales/orgs/${ORG_ID}/contacts`] = { body: { verified: [], review: [] } };
    view(<OrgWorkspace orgId={ORG_ID} />);
    expect((await screen.findByTestId("org-contacts")).textContent).toContain(UI.contactsEmpty);
  });

  it("lists ten verified contacts", async () => {
    routes[`/api/sales/orgs/${ORG_ID}/contacts`] = {
      body: { verified: Array.from({ length: 10 }, (_, i) => verifiedContact({ id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, name: `איש קשר ${i + 1}` })), review: [] },
    };
    view(<OrgWorkspace orgId={ORG_ID} />);
    const list = await screen.findByTestId("contacts-verified");
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
  });
});
