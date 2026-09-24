import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Tranche 176 — the inventory-movement proposal arrives filled.
//
// The stock-exceptions sweep submits proposed_lines + rationale + evidence +
// open questions (backend 0350). The approval page must show them and pre-fill
// the editable rows from proposed_lines — never from the posted-lines table,
// which is what pre-filling used to read (GI-20269: lines stuffed there at
// submit were posted a second time on approval).
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useParams: () => ({ submission_id: "sub-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    session: { user_id: "tom", display_name: "Tom", email: "t@x.com", role: "admin", theme_preference: "light" },
    setRole: vi.fn(),
    availableRoles: ["admin"],
    isLoading: false,
    loadError: null,
  }),
}));

import InventoryMovementReviewPage from "@/app/(inbox)/inbox/approvals/inventory-movement/[submission_id]/page";

const proposedDetail = {
  submission_id: "sub-1",
  status: "pending",
  kind: "supplement",
  source_ref: "27193386",
  recipient: "אליטה אופק - השלמת סחורה - תעודת משלוח מספר 20286",
  note: null,
  summary: "השלמת סחורה — אליטה אופק",
  submitted_by_user_id: "bot",
  submitted_by_display_name: "Claude Bot",
  event_at: "2026-08-20T12:14:00.000Z",
  submitted_at: "2026-09-24T03:31:00.000Z",
  proposed_lines: [
    {
      direction: "out", item_type: "FG", item_id: "FG-MAR-CLA-300ML", quantity: 36, unit: "BOTTLE",
      reason_code: "goods_out", source: "gi_document", evidence_ref: "GI:200:20286", confidence: "high",
    },
    {
      direction: "out", item_type: "FG", item_id: "FG-MAR-PEA-300ML", quantity: 36, unit: "BOTTLE",
      reason_code: "goods_out", source: "note_parse", evidence_ref: "36 מרגריטה אגס", confidence: "medium",
    },
  ],
  rationale: "משימת LionWheel 27193386 הושלמה ללא שורות הזמנה. יוצא מהמלאי: 36 FG-MAR-CLA-300ML.",
  open_questions: ["האם נשלח גם ארגז נוסף?"],
  evidence: [
    { type: "gi_document", ref: "תעודת משלוח 20286", url: "https://www.greeninvoice.co.il/api/v1/documents/download?d=x" },
    { type: "lionwheel_task", ref: "27193386" },
  ],
  credit_task_ids: ["ct-1"],
  lines: [],
};

let detail: Record<string, unknown> = proposedDetail;
let approveBody: { lines: Array<Record<string, unknown>> } | null = null;

beforeEach(() => {
  detail = proposedDetail;
  approveBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/approve")) {
        approveBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ status: "posted", posted_lines: [], credit_tasks: { supplied: ["ct-1"], not_supplied: [] } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(detail), { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Rows once the proposal has loaded (the first paint shows one empty row). */
async function loadedRows() {
  await screen.findByTestId("im-review-open-questions");
  return screen.getAllByTestId("im-review-line");
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InventoryMovementReviewPage />
    </QueryClientProvider>,
  );
}

describe("inventory-movement review — proposal pre-fill (tranche 176)", () => {
  it("pre-fills one editable row per proposed line", async () => {
    renderPage();
    const rows = await loadedRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByLabelText("Item code")).toHaveValue("FG-MAR-CLA-300ML");
    expect(within(rows[0]).getByLabelText("Qty")).toHaveValue(36);
    expect(within(rows[0]).getByLabelText("Unit")).toHaveValue("BOTTLE");
    expect(within(rows[1]).getByLabelText("Item code")).toHaveValue("FG-MAR-PEA-300ML");
    expect(screen.getByTestId("im-review-approve")).toHaveTextContent("Approve & post 2");
  });

  it("shows where each line came from and how sure it is", async () => {
    renderPage();
    const rows = await loadedRows();
    expect(within(rows[0]).getByTestId("im-review-line-origin")).toHaveTextContent("Green Invoice document");
    expect(within(rows[0]).getByTestId("im-review-line-origin")).toHaveTextContent("High confidence");
    expect(within(rows[1]).getByTestId("im-review-line-origin")).toHaveTextContent("Medium confidence");
  });

  it("shows the rationale, the open questions and the evidence above the lines", async () => {
    renderPage();
    expect(await screen.findByTestId("im-review-rationale")).toHaveTextContent("הושלמה ללא שורות הזמנה");
    expect(screen.getByTestId("im-review-open-questions")).toHaveTextContent("האם נשלח גם ארגז נוסף?");
    const evidence = screen.getByTestId("im-review-evidence");
    expect(within(evidence).getByRole("link", { name: /תעודת משלוח 20286/ })).toHaveAttribute(
      "href",
      "https://www.greeninvoice.co.il/api/v1/documents/download?d=x",
    );
    expect(evidence).toHaveTextContent("27193386");
    expect(screen.getByTestId("im-review-credit-tasks")).toHaveTextContent("1 linked picking shortage");
  });

  it("approve posts the rows as edited, not as proposed", async () => {
    renderPage();
    const rows = await loadedRows();
    fireEvent.change(within(rows[0]).getByLabelText("Qty"), { target: { value: "30" } });
    fireEvent.click(screen.getByTestId("im-review-approve"));
    fireEvent.click(screen.getByTestId("im-review-approve-confirm"));
    await screen.findByText("Approved — stock posted");
    expect(approveBody?.lines).toHaveLength(2);
    expect(approveBody?.lines[0]).toMatchObject({ item_id: "FG-MAR-CLA-300ML", quantity: 30, unit: "BOTTLE" });
    expect(approveBody?.lines[1]).toMatchObject({ item_id: "FG-MAR-PEA-300ML", quantity: 36 });
    expect(screen.getByText(/1 picking shortage marked supplied/)).toBeInTheDocument();
  });

  it("never pre-fills from posted audit lines", async () => {
    detail = {
      ...proposedDetail,
      proposed_lines: [],
      rationale: null,
      open_questions: ["כמה ארגזים נאספו?"],
      evidence: [],
      credit_task_ids: [],
      lines: [{ direction: "out", item_type: "FG", item_id: "FG-X", quantity: "3", unit: "BOTTLE", reason_code: "goods_out" }],
    };
    renderPage();
    const rows = await loadedRows();
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByLabelText("Item code")).toHaveValue("");
    expect(within(rows[0]).queryByTestId("im-review-line-origin")).toBeNull();
  });
});
