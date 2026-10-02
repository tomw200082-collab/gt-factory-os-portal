// The order sheet names an order by what the order is, not by what the caller assumed (code review I-3).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderSheet } from "@/app/(sales)/_components/org/OrderSheet";
import { ORDER_CLASS_LABELS } from "@/app/(sales)/_lib/labels";

const ORG = "00000000-0000-4000-8000-000000000001";
const GID = "gid://shopify/Order/9000000001";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    gid: GID, name: "#1001", created_at: "2026-09-20T08:00:00Z", class: "refunded", draft_status: null,
    ex_vat_agorot: 100000, lines: [], provenance: { source: "Shopify", observed_at: "2026-10-02T07:47:20Z" },
  }), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("order sheet", () => {
  it("labels a refunded last order as refunded, though the summary did not know its class", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <OrderSheet orgId={ORG} order={{ gid: GID, name: "#1001", created_at: "2026-09-20T08:00:00Z", class: null, draft_status: null }} onClose={() => {}} />
      </QueryClientProvider>,
    );
    const sheet = screen.getByTestId("order-sheet");
    expect(sheet.textContent).not.toContain(ORDER_CLASS_LABELS.completed);
    await waitFor(() => expect(sheet.textContent).toContain(ORDER_CLASS_LABELS.refunded));
  });
});
