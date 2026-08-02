// AddBatchModal — Tranche 158 (FLOW-002) tests.
//
// Coverage:
//   A1 — only BASE heads with ≥1 ACTIVE member item are offered
//   A2 — picking a base prefills tank size from the recipe output and lists
//        its member items as split lines
//   A3 — submit is disabled until every active line has a positive qty and
//        the tank size is positive; a valid form POSTs the right body
//   A4 — the liters meter reflects qty × fill against the tank size

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddBatchModal, baseHeadLabel } from "./AddBatchModal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const HEADS = {
  rows: [
    {
      bom_head_id: "BOM-BASE-CAL-REG",
      display_family: "CALM",
      final_bom_output_qty: "417.00000000",
      final_bom_output_uom: "L",
      status: "ACTIVE",
    },
    {
      bom_head_id: "BOM-BASE-EMPTY",
      display_family: "EMPTY BASE",
      final_bom_output_qty: "500",
      final_bom_output_uom: "L",
      status: "ACTIVE",
    },
  ],
  count: 2,
};

const ITEMS = {
  rows: [
    {
      item_id: "FG-CAL-1L",
      item_name: "CALM 1L",
      status: "ACTIVE",
      base_bom_head_id: "BOM-BASE-CAL-REG",
      base_fill_qty_per_unit: "1",
    },
    {
      item_id: "FG-CAL-500ML",
      item_name: "CALM 0.5L",
      status: "ACTIVE",
      base_bom_head_id: "BOM-BASE-CAL-REG",
      base_fill_qty_per_unit: "0.5",
    },
    {
      item_id: "FG-OTHER",
      item_name: "OTHER 1L",
      status: "ACTIVE",
      base_bom_head_id: "BOM-BASE-OTHER",
      base_fill_qty_per_unit: "1",
    },
  ],
  count: 3,
};

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/api/boms/heads") ? HEADS : ITEMS;
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

function renderModal(overrides: Partial<Parameters<typeof AddBatchModal>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSubmit = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <AddBatchModal
        defaultDate="2026-08-04"
        onClose={() => {}}
        onSubmit={onSubmit}
        isSubmitting={false}
        serverError={null}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSubmit };
}

describe("baseHeadLabel", () => {
  it("prefers display_family and falls back to un-slugged head id", () => {
    expect(baseHeadLabel({ bom_head_id: "BOM-BASE-CAL-REG", display_family: "CALM" })).toBe(
      "CALM",
    );
    expect(baseHeadLabel({ bom_head_id: "BOM-BASE-CAL-REG", display_family: null })).toBe(
      "CAL REG",
    );
  });
});

describe("AddBatchModal", () => {
  it("A1 — offers only BASE heads that have member items", async () => {
    mockFetch();
    renderModal();
    const select = await screen.findByTestId("add-batch-base");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "CALM" })).toBeDefined(),
    );
    // BOM-BASE-EMPTY has no ACTIVE member items — must not be offered.
    expect(screen.queryByRole("option", { name: "EMPTY BASE" })).toBeNull();
    expect(select).toBeDefined();
  });

  it("A2 — picking a base prefills tank size and lists member split lines", async () => {
    mockFetch();
    const user = userEvent.setup();
    renderModal();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "CALM" })).toBeDefined(),
    );
    await user.selectOptions(screen.getByTestId("add-batch-base"), "BOM-BASE-CAL-REG");

    const size = screen.getByTestId("add-batch-size") as HTMLInputElement;
    expect(size.value).toBe("417");
    expect(screen.getByTestId("add-batch-qty-FG-CAL-1L")).toBeDefined();
    expect(screen.getByTestId("add-batch-qty-FG-CAL-500ML")).toBeDefined();
    // Item of another base never appears.
    expect(screen.queryByText("OTHER 1L")).toBeNull();
  });

  it("A3 — submit gates on positive quantities and posts the composed body", async () => {
    mockFetch();
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "CALM" })).toBeDefined(),
    );
    await user.selectOptions(screen.getByTestId("add-batch-base"), "BOM-BASE-CAL-REG");

    const submit = screen.getByTestId("add-batch-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // no quantities yet

    await user.clear(screen.getByTestId("add-batch-size"));
    await user.type(screen.getByTestId("add-batch-size"), "500");
    await user.type(screen.getByTestId("add-batch-qty-FG-CAL-1L"), "400");
    await user.type(screen.getByTestId("add-batch-qty-FG-CAL-500ML"), "200");

    await waitFor(() => expect(submit.disabled).toBe(false));
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledWith({
      plan_date: "2026-08-04",
      base_bom_head_id: "BOM-BASE-CAL-REG",
      batch_size_l: 500,
      pack_manifest: [
        { item_id: "FG-CAL-500ML", qty: 200 },
        { item_id: "FG-CAL-1L", qty: 400 },
      ],
      notes: undefined,
    });
  });

  it("A4 — the liters meter tracks qty × fill vs tank size", async () => {
    mockFetch();
    const user = userEvent.setup();
    renderModal();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "CALM" })).toBeDefined(),
    );
    await user.selectOptions(screen.getByTestId("add-batch-base"), "BOM-BASE-CAL-REG");
    await user.clear(screen.getByTestId("add-batch-size"));
    await user.type(screen.getByTestId("add-batch-size"), "500");
    await user.type(screen.getByTestId("add-batch-qty-FG-CAL-1L"), "400");
    await user.type(screen.getByTestId("add-batch-qty-FG-CAL-500ML"), "200");

    // 400×1 + 200×0.5 = 500 L → exactly on the tank.
    await waitFor(() =>
      expect(screen.getByTestId("add-batch-meter").textContent).toContain("500 / 500 L"),
    );
  });
});
