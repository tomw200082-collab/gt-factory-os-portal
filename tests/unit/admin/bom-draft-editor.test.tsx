// BomDraftEditorPage skeleton + Add-line drawer tests.

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
import { BomDraftEditorPage } from "@/components/bom-edit/BomDraftEditorPage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

function wrap() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
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

interface MockEditorApiArgs {
  versionStatus?: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  draftLines: Array<{ bom_line_id: string; component_id: string; qty: string }>;
  activeLines?: Array<{ bom_line_id: string; component_id: string; qty: string }>;
  perComponent?: Record<string, Array<Record<string, unknown>>>;
}

function mockEditorApi({
  versionStatus = "DRAFT",
  draftLines,
  activeLines = [],
  perComponent = {},
}: MockEditorApiArgs) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/boms/heads")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: [
              {
                bom_head_id: "BH-1",
                item_id: "ITEM-1",
                item_name: "Lemon Cocktail",
                bom_kind: "BASE",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/boms/versions?bom_head_id=BH-1")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: [
              { bom_version_id: "BV-ACTIVE", version_label: "v3", status: "ACTIVE" },
              { bom_version_id: "BV-DRAFT", version_label: "v4", status: versionStatus },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-DRAFT")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: draftLines.map((l) => ({
              ...l,
              updated_at: "2026-04-20T00:00:00Z",
            })),
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-ACTIVE")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: activeLines.map((l) => ({
              ...l,
              updated_at: "2026-04-20T00:00:00Z",
            })),
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/supplier-items?component_id=")) {
      const id = decodeURIComponent(url.split("component_id=")[1]);
      return Promise.resolve(
        new Response(JSON.stringify({ rows: perComponent[id] ?? [] }), {
          status: 200,
        }),
      );
    }
    return Promise.resolve(new Response("not mocked", { status: 500 }));
  });
}

describe("BomDraftEditorPage skeleton", () => {
  it("renders sticky header with item name, track label, version label, and DRAFT pill", async () => {
    mockEditorApi({ draftLines: [], activeLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await screen.findByText(/Lemon Cocktail/);
    expect(screen.getByText(/v4/)).toBeTruthy();
    expect(screen.getByText("DRAFT")).toBeTruthy();
    expect(screen.getByText(/base formula/i)).toBeTruthy();
  });

  it("renders Cancel / Save / Publish buttons", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await screen.findByText(/Lemon Cocktail/);
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Publish/i })).toBeTruthy();
  });

  it("renders 'אין שורות' empty state when draft has zero lines", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await screen.findByText(/אין שורות/);
  });

  it("renders one row per draft line", async () => {
    mockEditorApi({
      draftLines: [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0" },
        { bom_line_id: "L2", component_id: "C-2", qty: "0.5" },
      ],
      perComponent: {
        "C-1": [
          {
            supplier_item_id: "SI-1",
            supplier_id: "SUP-1",
            supplier_name: "ACME",
            component_id: "C-1",
            component_name: "Sugar",
            component_status: "ACTIVE",
            is_primary: true,
            std_cost_per_inv_uom: "2.5",
            updated_at: "2026-04-20T00:00:00Z",
          },
        ],
        "C-2": [
          {
            supplier_item_id: "SI-2",
            supplier_id: "SUP-2",
            supplier_name: "PackCo",
            component_id: "C-2",
            component_name: "Bottle",
            component_status: "ACTIVE",
            is_primary: true,
            std_cost_per_inv_uom: "0.50",
            updated_at: "2026-04-20T00:00:00Z",
          },
        ],
      },
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getAllByTestId(/^bom-line-row-/)).toHaveLength(2),
    );
  });

  it("shows a 'this version is not editable' banner when the version status is not DRAFT", async () => {
    mockEditorApi({
      versionStatus: "ACTIVE",
      draftLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1" }],
      perComponent: { "C-1": [] },
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await screen.findByText(/לא ניתן לערוך/);
  });
});

describe("BomDraftEditorPage — Add line drawer", () => {
  it("renders [+ Add component] button when editable", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await screen.findByText(/אין שורות/);
    expect(screen.getByRole("button", { name: /Add component/i })).toBeTruthy();
  });

  it("clicking [+ Add component] opens the drawer", async () => {
    mockEditorApi({ draftLines: [] });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Add component/i }),
    );
    expect(
      await screen.findByRole("dialog", { name: /Add component/i }),
    ).toBeTruthy();
  });

  it("renders the panel with one row per unique component_id in the draft", async () => {
    mockEditorApi({
      draftLines: [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0" },
        { bom_line_id: "L2", component_id: "C-2", qty: "2.0" },
        { bom_line_id: "L3", component_id: "C-1", qty: "0.5" },
      ],
      perComponent: {
        "C-1": [
          {
            supplier_item_id: "SI-1",
            supplier_id: "SUP-1",
            supplier_name: "ACME",
            component_id: "C-1",
            component_name: "Sugar",
            component_status: "ACTIVE",
            is_primary: true,
            std_cost_per_inv_uom: "2.5",
            updated_at: "2026-04-20T00:00:00Z",
          },
        ],
        "C-2": [
          {
            supplier_item_id: "SI-2",
            supplier_id: "SUP-2",
            supplier_name: "PackCo",
            component_id: "C-2",
            component_name: "Bottle",
            component_status: "ACTIVE",
            is_primary: true,
            std_cost_per_inv_uom: "0.50",
            updated_at: "2026-04-20T00:00:00Z",
          },
        ],
      },
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getAllByText("Sugar").length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getAllByText("Bottle").length).toBeGreaterThanOrEqual(2);
  });

  it("clicking [Fix] on a panel row opens the real QuickFixDrawer", async () => {
    mockEditorApi({
      draftLines: [{ bom_line_id: "L1", component_id: "C-1", qty: "1.0" }],
      perComponent: { "C-1": [] },
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    const fixBtns = await screen.findAllByRole("button", { name: /Fix/ });
    fireEvent.click(fixBtns[0]);
    expect(
      await screen.findByRole("dialog", { name: /Quick fix/ }),
    ).toBeTruthy();
  });

  it("clicking Publish fetches preview and opens variant A when clean", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/boms/versions/BV-DRAFT/publish-preview") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocking_issues: [],
              warnings: [],
              can_publish_clean: true,
              can_publish_with_override: true,
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/heads")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_head_id: "BH-1",
                  item_id: "ITEM-1",
                  item_name: "Lemon Cocktail",
                  bom_kind: "BASE",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-DRAFT", version_label: "v4", status: "DRAFT" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-DRAFT")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_line_id: "L1",
                  component_id: "C-1",
                  qty: "1.0",
                  updated_at: "2026-04-20T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  supplier_item_id: "SI-1",
                  supplier_id: "SUP-1",
                  supplier_name: "ACME",
                  component_id: "C-1",
                  component_name: "Sugar",
                  component_status: "ACTIVE",
                  is_primary: true,
                  std_cost_per_inv_uom: "2.5",
                  updated_at: "2026-04-20T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    await screen.findByText(/Lemon Cocktail/);
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    await screen.findByRole("dialog", { name: /Confirm publish/ });
  });

  it("on confirm, POSTs publish and navigates to product page", async () => {
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/boms/versions/BV-DRAFT/publish-preview") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocking_issues: [],
              warnings: [],
              can_publish_clean: true,
              can_publish_with_override: true,
            }),
            { status: 200 },
          ),
        );
      }
      if (
        url === "/api/boms/versions/BV-DRAFT/publish" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      }
      if (url.includes("/api/boms/heads")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_head_id: "BH-1",
                  item_id: "ITEM-1",
                  item_name: "Lemon Cocktail",
                  bom_kind: "BASE",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-DRAFT", version_label: "v4", status: "DRAFT" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-DRAFT")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_line_id: "L1",
                  component_id: "C-1",
                  qty: "1.0",
                  updated_at: "2026-04-20T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  supplier_item_id: "SI-1",
                  supplier_id: "SUP-1",
                  supplier_name: "ACME",
                  component_id: "C-1",
                  component_name: "Sugar",
                  component_status: "ACTIVE",
                  is_primary: true,
                  std_cost_per_inv_uom: "2.5",
                  updated_at: "2026-04-20T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(
      <BomDraftEditorPage
        bomHeadId="BH-1"
        versionId="BV-DRAFT"
        onNavigate={navigate}
      />,
      { wrapper: wrap() },
    );
    await screen.findByText(/Lemon Cocktail/);
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    await screen.findByRole("dialog", { name: /Confirm publish/ });
    fireEvent.click(screen.getByRole("button", { name: /^Publish$/ }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/admin/masters/items/ITEM-1"),
    );
  });

  it("submitting the drawer POSTs to /api/boms/versions/:id/lines", async () => {
    mockEditorApi({ draftLines: [] });
    // Override POST handler — keep the GET mocks above intact.
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (
        url === "/api/boms/versions/BV-DRAFT/lines" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              bom_line_id: "L-NEW",
              component_id: "C-99",
              qty: "3.5",
              updated_at: "2026-04-25T00:00:00Z",
            }),
            { status: 200 },
          ),
        );
      }
      return original ? original(url, init) : Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(<BomDraftEditorPage bomHeadId="BH-1" versionId="BV-DRAFT" />, {
      wrapper: wrap(),
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Add component/i }),
    );
    const dialog = await screen.findByRole("dialog", { name: /Add component/i });
    fireEvent.change(
      dialog.querySelector("input[name=component_id]") as HTMLInputElement,
      { target: { value: "C-99" } },
    );
    fireEvent.change(
      dialog.querySelector("input[name=qty]") as HTMLInputElement,
      { target: { value: "3.5" } },
    );
    fireEvent.click(
      dialog.querySelector("button[type=submit]") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            u === "/api/boms/versions/BV-DRAFT/lines" &&
            (i as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });
});
