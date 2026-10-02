// The manager's identity review (GT Pulse Unit B, tranche 191). Synthetic only:
// no real identity decision is made by these tests or by this session.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const role = vi.hoisted(() => ({ value: "admin" as string }));
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({ session: { role: role.value, email: "manager@synthetic.invalid" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/sales/orgs/review",
  useSearchParams: () => new URLSearchParams(),
}));

import { IdentityReview } from "@/app/(sales)/_components/org/IdentityReview";
import { UI } from "@/app/(sales)/_lib/labels";
import type { IdentityReview as Payload } from "@/app/(sales)/_lib/types";

const cand = (over = {}) => ({ customer_gid: "gid://shopify/Customer/9001", name: "לקוח מועמד א", order_count: 7, last_order_at: "2026-09-01T08:00:00Z", basis: "phone" as const, evidence: "candidate" as const, ...over });
const org = (id: string, reasons: string[], candidates: ReturnType<typeof cand>[], over = {}) => ({
  org_id: id, name: `עסק ${id.slice(-2)}`, link_status: "review" as const, reason: reasons[0], reasons,
  task_id: `t-${id}`, task_ids: [`t-${id}`], created_at: "2026-10-02T07:44:00Z", candidates, ...over,
});

const ID = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
let payload: Payload;
let postStatus = 200;
let postBody: unknown = { org_id: "x", action: "pick", link_status: "verified", customer_gid: "gid://shopify/Customer/9002", merged_into: null };
const posts: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  role.value = "admin";
  posts.length = 0;
  postStatus = 200;
  payload = {
    orgs: [
      org(ID(1), ["phone_shared"], [cand({ basis: "held" }), cand({ customer_gid: "gid://shopify/Customer/9002", name: "לקוח מועמד ב", order_count: 2 })], { link_status: "disputed" }),
      org(ID(2), ["b1_review_tag"], [cand({ basis: "held", name: "לקוח מתויג" })]),
      org(ID(3), ["customer_not_verified"], []),
      org(ID(4), ["chain_rule_hit"], [cand({ basis: "held" })]),
    ],
    exceptions: [{ id: "x1", kind: "stale_refresh", detail: {}, created_at: "2026-10-02T06:00:00Z", run_id: null }],
    coverage: { verified_active: 570, census_active: 588, source: "shopifyql", as_of: "2026-10-02T07:47:20Z" },
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(postBody), { status: postStatus });
    }
    return new Response(JSON.stringify(payload), { status: 200 });
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

describe("identity review", () => {
  it("states coverage with its source and time", async () => {
    view(<IdentityReview />);
    const cov = await screen.findByTestId("review-coverage");
    expect(cov.textContent).toContain("570");
    expect(cov.textContent).toContain("588");
  });

  it("explains each reason in Hebrew and labels candidate numbers as evidence", async () => {
    view(<IdentityReview />);
    const card = await screen.findByTestId(`review-${ID(1)}`);
    expect(card.textContent).toContain("הטלפון של העסק מופיע אצל כמה לקוחות");
    expect(card.textContent).toContain(UI.candidateEvidence);
    expect(within(card).getAllByTestId("candidate")).toHaveLength(2);
    expect(card.textContent).not.toMatch(/phone_shared|gid:\/\//);
  });

  it("asks before linking, says what will change, and posts the chosen customer", async () => {
    view(<IdentityReview />);
    const card = await screen.findByTestId(`review-${ID(1)}`);
    const second = within(card).getAllByTestId("candidate")[1];
    fireEvent.click(within(second).getByRole("button", { name: UI.chooseCandidate }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("לקוח מועמד ב");
    expect(dialog.textContent).toContain(UI.linkConsequence);
    expect(posts).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: UI.linkConfirm }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ url: `/api/sales/orgs/${ID(1)}/identity`, body: { action: "pick", customer_gid: "gid://shopify/Customer/9002" } });
  });

  it("confirms the held customer with confirm, not pick", async () => {
    view(<IdentityReview />);
    const card = await screen.findByTestId(`review-${ID(2)}`);
    fireEvent.click(within(card).getByRole("button", { name: UI.confirmCustomer }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: UI.linkConfirm }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ action: "confirm", customer_gid: "gid://shopify/Customer/9001" });
  });

  it("offers rejection only where a link was proposed", async () => {
    view(<IdentityReview />);
    expect(within(await screen.findByTestId(`review-${ID(1)}`)).getByRole("button", { name: UI.rejectAll })).toBeTruthy();
    expect(within(screen.getByTestId(`review-${ID(2)}`)).queryByRole("button", { name: UI.rejectAll })).toBeNull();
  });

  it("offers no dead button when the held customer is not in the mirror (F2)", async () => {
    view(<IdentityReview />);
    const card = await screen.findByTestId(`review-${ID(3)}`);
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(card.textContent).toContain(UI.reviewBlocked);
  });

  it("confirms a chain proposal on its own", async () => {
    view(<IdentityReview />);
    const card = await screen.findByTestId(`review-${ID(4)}`);
    fireEvent.click(within(card).getByRole("button", { name: UI.confirmChain }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: UI.chainConfirm }));
    await waitFor(() => expect(posts[0]?.body).toEqual({ action: "confirm" }));
  });

  it("shows a refusal in Hebrew next to the business, and keeps the card", async () => {
    postStatus = 422;
    postBody = { error: "x", code: "SALES_IDENTITY_NOT_A_CANDIDATE" };
    view(<IdentityReview />);
    const card = await screen.findByTestId(`review-${ID(2)}`);
    fireEvent.click(within(card).getByRole("button", { name: UI.confirmCustomer }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: UI.linkConfirm }));
    const alert = await within(card).findByRole("alert");
    expect(alert.textContent).toMatch(/[֐-׿]/);
    expect(alert.textContent).not.toContain("SALES_");
  });

  it("lists open mirror exceptions in words", async () => {
    view(<IdentityReview />);
    expect((await screen.findByTestId("review-exceptions")).textContent).toContain("הנתונים לא רועננו בזמן");
  });

  it("is a manager's screen", async () => {
    role.value = "sales_rep";
    view(<IdentityReview />);
    expect(await screen.findByTestId("review-forbidden")).toBeTruthy();
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it("says when nothing waits for a decision", async () => {
    payload = { orgs: [], exceptions: [], coverage: null };
    view(<IdentityReview />);
    expect((await screen.findByTestId("review-empty")).textContent).toContain(UI.reviewEmpty);
  });
});
