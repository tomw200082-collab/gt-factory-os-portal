// Regression: every consumer of /api/boms/lines must read the upstream
// Fastify field names verbatim. A previous draft of useTrackData.ts +
// the Recipe-Health card declared `qty` and `component_id` and read those
// fields off the response — both were undefined against real data, so
// every line rendered red "quantity invalid" and every component lookup
// missed in the readiness map.
//
// This file pins the contract: the literal upstream response shape (with
// final_component_id / final_component_qty / final_component_name /
// component_uom) flows through the readiness pipeline without producing
// false-red pips.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RecipeHealthCard } from "@/components/admin/recipe-health/RecipeHealthCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

// Literal Fastify response shapes — copy/paste-shaped to match the actual
// /api/v1/queries/* contract.
const REAL_VERSION_ROW = {
  bom_version_id: "BV-ACTIVE",
  version_label: "v3",
  status: "ACTIVE",
  updated_at: "2026-04-10T12:00:00Z",
};

function realLine(id: string, componentId: string, qty: string) {
  return {
    bom_line_id: id,
    bom_version_id: "BV-ACTIVE",
    line_no: 1,
    final_component_id: componentId,
    final_component_name: `Component ${componentId}`,
    final_component_qty: qty,
    component_uom: "KG",
    bom_kind: "BASE",
    component_ref_type: "COMPONENT",
    updated_at: "2026-04-10T12:00:00Z",
  };
}

function realPrimarySupplierItem(componentId: string) {
  return {
    supplier_item_id: `SI-${componentId}`,
    supplier_id: `SUP-${componentId}`,
    supplier_name: "ACME",
    component_id: componentId,
    component_name: `Component ${componentId}`,
    component_status: "ACTIVE",
    is_primary: true,
    std_cost_per_inv_uom: "2.50",
    lead_time_days: 5,
    moq: "1",
    updated_at: "2026-04-20T12:00:00Z",
  };
}

describe("Recipe-Health card vs literal upstream response shape", () => {
  it("renders GREEN, NOT red, when fed lines using final_component_qty / final_component_id", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(
          new Response(JSON.stringify({ rows: [REAL_VERSION_ROW] }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [{ ...REAL_VERSION_ROW, bom_version_id: "BV-PACK" }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-ACTIVE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                realLine("L1", "C-1", "1.000"),
                realLine("L2", "C-2", "0.500"),
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ rows: [realLine("L3", "C-3", "1.000")] }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        const id = decodeURIComponent(url.split("component_id=")[1]);
        return Promise.resolve(
          new Response(
            JSON.stringify({ rows: [realPrimarySupplierItem(id)] }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });

    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin
      />,
      { wrapper: wrap() },
    );

    // The single most important assertion: the top-line is green, not red.
    // If the data hook reads the wrong field name, every line falls to
    // qty=undefined → Number.isFinite(NaN) = false → red pip → red top.
    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור$/)).not.toBeNull(),
    );
    expect(screen.queryByText(/לא ניתן לפרסם/)).toBeNull();
  });

  it("does NOT show false-red 'quantity invalid' when qty is a positive decimal string", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(
          new Response(JSON.stringify({ rows: [REAL_VERSION_ROW] }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [{ ...REAL_VERSION_ROW, bom_version_id: "BV-PACK" }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-ACTIVE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [realLine("L1", "C-1", "0.250")],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ rows: [realLine("L2", "C-2", "1.000")] }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        const id = decodeURIComponent(url.split("component_id=")[1]);
        return Promise.resolve(
          new Response(
            JSON.stringify({ rows: [realPrimarySupplierItem(id)] }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });

    render(
      <RecipeHealthCard
        itemName="X"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin
      />,
      { wrapper: wrap() },
    );

    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור$/)).not.toBeNull(),
    );
    // The specific reason string from the qty-invalid path must be absent.
    expect(screen.queryByText(/כמות חייבת להיות חיובית/)).toBeNull();
    expect(screen.queryByText(/שורות עם כמות לא תקינה/)).toBeNull();
  });
});
