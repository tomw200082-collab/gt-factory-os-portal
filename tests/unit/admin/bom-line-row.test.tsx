// BomLineRow tests — qty edit, pip computation, delete flow.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BomLineRow } from "@/components/bom-edit/BomLineRow";

function wrap() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <table>
        <tbody>{children}</tbody>
      </table>
    </QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const baseLine = {
  bom_line_id: "L1",
  component_id: "C-1",
  qty: "1.0",
  updated_at: "2026-04-20T12:00:00Z",
};
const baseReadiness = {
  component_id: "C-1",
  component_name: "Sugar",
  component_status: "ACTIVE" as const,
  primary_supplier_id: "SUP-1",
  primary_supplier_name: "ACME",
  active_price_value: "2.50",
  active_price_updated_at: "2026-04-20T12:00:00Z",
};

describe("BomLineRow", () => {
  it("renders component_name, qty, and a green pip when fully ready", () => {
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={baseReadiness}
        editable
      />,
      { wrapper: wrap() },
    );
    expect(screen.getByText("Sugar")).toBeTruthy();
    expect(screen.getByText("1.0")).toBeTruthy();
    expect(screen.getByLabelText("readiness-pip-green")).toBeTruthy();
  });

  it("shows yellow pip when supplier missing", () => {
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={{
          ...baseReadiness,
          primary_supplier_id: null,
          primary_supplier_name: null,
        }}
        editable
      />,
      { wrapper: wrap() },
    );
    expect(screen.getByLabelText("readiness-pip-yellow")).toBeTruthy();
  });

  it("shows red pip when qty is 0", () => {
    render(
      <BomLineRow
        line={{ ...baseLine, qty: "0" }}
        versionId="BV-1"
        readiness={baseReadiness}
        editable
      />,
      { wrapper: wrap() },
    );
    expect(screen.getByLabelText("readiness-pip-red")).toBeTruthy();
  });

  it("PATCHes the qty when user submits an edit (with if_match_updated_at)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          bom_line_id: "L1",
          qty: "2.0",
          updated_at: "2026-04-25T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={baseReadiness}
        editable
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByLabelText("qty-edit-L1"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "2.0" } });
    fireEvent.blur(input);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/boms/versions/BV-1/lines/L1");
    expect((init as RequestInit).method).toBe("PATCH");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.final_component_qty).toBe("2.0");
    expect(body.if_match_updated_at).toBe("2026-04-20T12:00:00Z");
    expect(typeof body.idempotency_key).toBe("string");
  });

  it("surfaces 409 STALE_ROW with refresh hint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "STALE_ROW",
          message: "Stale row",
        }),
        { status: 409 },
      ),
    );
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={baseReadiness}
        editable
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByLabelText("qty-edit-L1"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "2.0" } });
    fireEvent.blur(input);
    await screen.findByText(/STALE_ROW|רענן/);
  });

  it("DELETEs the line when delete button clicked and confirmed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 204 }));
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={baseReadiness}
        editable
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete|🗑/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Confirm/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boms/versions/BV-1/lines/L1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("hides edit and delete affordances when editable=false", () => {
    render(
      <BomLineRow
        line={baseLine}
        versionId="BV-1"
        readiness={baseReadiness}
        editable={false}
      />,
      { wrapper: wrap() },
    );
    expect(screen.queryByLabelText("qty-edit-L1")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete|🗑/ })).toBeNull();
  });
});
