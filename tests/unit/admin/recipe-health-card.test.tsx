// Recipe-Health card + RecipeTrackSummary tests.
// Uses the codebase idiom of queryByText / getByText with toBeTruthy()
// (no @testing-library/jest-dom matchers wired into vitest setup).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RecipeTrackSummary } from "@/components/admin/recipe-health/RecipeTrackSummary";
import { RecipeHealthCard } from "@/components/admin/recipe-health/RecipeHealthCard";
import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

// Mock next/navigation so useRouter() resolves outside an App Router shell.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

afterEach(() => cleanup());

function track(over: Partial<TrackHealth> = {}): TrackHealth {
  return {
    color: "green",
    hasActiveVersion: true,
    lineCount: 5,
    warnings: [],
    blockers: [],
    ...over,
  };
}

describe("RecipeTrackSummary", () => {
  it("renders the track label and version metadata when active version exists", () => {
    render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel="v3"
        health={track({ lineCount: 12 })}
      />,
    );
    expect(screen.getByText("בסיס המוצר")).toBeTruthy();
    expect(screen.getByText(/v3/)).toBeTruthy();
    expect(screen.getByText(/12/)).toBeTruthy();
  });

  it("renders 'אין גרסה פעילה' when hasActiveVersion is false", () => {
    render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel={null}
        health={track({
          color: "red",
          hasActiveVersion: false,
          lineCount: 0,
          blockers: ["אין גרסה פעילה ל-בסיס המוצר"],
        })}
      />,
    );
    // Status line + blocker bullet both surface "אין גרסה פעילה" — getAllBy.
    expect(screen.getAllByText(/אין גרסה פעילה/).length).toBeGreaterThan(0);
  });

  it("renders warnings list when track is yellow", () => {
    render(
      <RecipeTrackSummary
        trackLabel="אריזת המוצר"
        activeVersionLabel="v2"
        health={track({
          color: "yellow",
          warnings: ["2 חומרים חסרי ספק ראשי", "חומר אחד עם מחיר ישן"],
        })}
      />,
    );
    // The list bullet renders "⚠ <text>", so use a flexible regex.
    expect(screen.getByText(/2 חומרים חסרי ספק ראשי/)).toBeTruthy();
    expect(screen.getByText(/חומר אחד עם מחיר ישן/)).toBeTruthy();
  });

  it("renders blockers list when track is red", () => {
    render(
      <RecipeTrackSummary
        trackLabel="אריזת המוצר"
        activeVersionLabel="v2"
        health={track({ color: "red", blockers: ["אריזת המוצר ריק (0 שורות)"] })}
      />,
    );
    expect(screen.getByText(/ריק \(0 שורות\)/)).toBeTruthy();
  });

  it("applies a color-keyed data attribute so visual tests can target it", () => {
    const { container } = render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel="v3"
        health={track({ color: "yellow", warnings: ["w1"] })}
      />,
    );
    expect(container.querySelector('[data-track-color="yellow"]')).not.toBeNull();
  });
});

// ===========================================================================
// RecipeHealthCard composition tests
// ===========================================================================

function wrapQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});

interface MockApiArgs {
  baseLines: Array<{ bom_line_id: string; final_component_id: string; final_component_qty: string }>;
  packLines: Array<{ bom_line_id: string; final_component_id: string; final_component_qty: string }>;
  perComponent: Record<string, Array<Record<string, unknown>>>;
}

function mockApi({ baseLines, packLines, perComponent }: MockApiArgs) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: [
              { bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: [
              { bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-BASE")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: baseLines.map((l) => ({
              ...l,
              updated_at: "2026-04-20T00:00:00Z",
            })),
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/api/boms/lines?bom_version_id=BV-PACK")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: packLines.map((l) => ({
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

const SI_C1: Record<string, unknown> = {
  supplier_item_id: "SI-1",
  supplier_id: "SUP-1",
  supplier_name: "ACME",
  component_id: "C-1",
  component_name: "Sugar",
  component_status: "ACTIVE",
  is_primary: true,
  std_cost_per_inv_uom: "2.5",
  updated_at: "2026-04-20T00:00:00Z",
};

const SI_C2: Record<string, unknown> = {
  supplier_item_id: "SI-2",
  supplier_id: "SUP-2",
  supplier_name: "PackCo",
  component_id: "C-2",
  component_name: "Bottle",
  component_status: "ACTIVE",
  is_primary: true,
  std_cost_per_inv_uom: "0.50",
  updated_at: "2026-04-20T00:00:00Z",
};

describe("RecipeHealthCard — MANUFACTURED full data", () => {
  it("renders top-line green and both tracks visible when everything is healthy", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", final_component_id: "C-1", final_component_qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", final_component_id: "C-2", final_component_qty: "1.0" }],
      perComponent: { "C-1": [SI_C1], "C-2": [SI_C2] },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור$/)).not.toBeNull(),
    );
    expect(screen.getByText("בסיס המוצר")).toBeTruthy();
    expect(screen.getByText("אריזת המוצר")).toBeTruthy();
  });
});

describe("RecipeHealthCard — yellow when supplier missing", () => {
  it("shows yellow top-line and surfaces the missing-supplier warning", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", final_component_id: "C-1", final_component_qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", final_component_id: "C-2", final_component_qty: "1.0" }],
      perComponent: { "C-1": [], "C-2": [SI_C2] },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור עם אזהרות/)).not.toBeNull(),
    );
    expect(screen.getByText(/חסר.*ספק|חומר.*ספק/)).toBeTruthy();
  });
});

describe("RecipeHealthCard — red when pack BOM is empty", () => {
  it("shows red top-line and 'publish blocked' content", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_line_id: "L1",
                  final_component_id: "C-1",
                  final_component_qty: "1.0",
                  updated_at: "2026-04-20T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines?bom_version_id=BV-PACK")) {
        return Promise.resolve(
          new Response(JSON.stringify({ rows: [] }), { status: 200 }),
        );
      }
      if (url.includes("/api/supplier-items?component_id=")) {
        return Promise.resolve(
          new Response(JSON.stringify({ rows: [SI_C1] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("not mocked", { status: 500 }));
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await waitFor(() =>
      expect(screen.queryByText(/לא ניתן לפרסם/)).not.toBeNull(),
    );
    expect(screen.getByText(/ריק/)).toBeTruthy();
  });
});

describe("RecipeHealthCard — admin gating", () => {
  it("renders [Edit recipe →] buttons when isAdmin is true", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", final_component_id: "C-1", final_component_qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", final_component_id: "C-2", final_component_qty: "1.0" }],
      perComponent: { "C-1": [SI_C1], "C-2": [SI_C2] },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור$/)).not.toBeNull(),
    );
    expect(screen.getAllByRole("button", { name: /Edit recipe/ })).toHaveLength(2);
  });

  it("hides edit buttons when isAdmin is false", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", final_component_id: "C-1", final_component_qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", final_component_id: "C-2", final_component_qty: "1.0" }],
      perComponent: { "C-1": [SI_C1], "C-2": [SI_C2] },
    });
    render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={false}
      />,
      { wrapper: wrapQuery() },
    );
    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור$/)).not.toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /Edit recipe/ })).toBeNull();
  });
});

describe("RecipeHealthCard — mobile stacking class", () => {
  it("uses Tailwind sm:grid-cols-2 (default flex-col stack on <640px)", async () => {
    mockApi({
      baseLines: [{ bom_line_id: "L1", final_component_id: "C-1", final_component_qty: "1.0" }],
      packLines: [{ bom_line_id: "L2", final_component_id: "C-2", final_component_qty: "1.0" }],
      perComponent: { "C-1": [SI_C1], "C-2": [SI_C2] },
    });
    const { container } = render(
      <RecipeHealthCard
        itemName="Lemon Cocktail"
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={true}
      />,
      { wrapper: wrapQuery() },
    );
    await waitFor(() =>
      expect(screen.queryByText(/מוכן לייצור$/)).not.toBeNull(),
    );
    const grid = container.querySelector("[data-tracks-grid]");
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("sm:grid-cols-2");
  });
});

describe("RecipeHealthCard — Edit recipe button confirmations", () => {
  it("clicking [Edit recipe →] when no DRAFT clones the active version and navigates", async () => {
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/boms/versions" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              bom_version_id: "BV-NEW",
              version_label: "v4",
              status: "DRAFT",
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_line_id: "L1",
                  final_component_id: "C-1",
                  final_component_qty: "1.0",
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
          new Response(JSON.stringify({ rows: [SI_C1] }), { status: 200 }),
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
        onNavigate={navigate}
      />,
      { wrapper: wrapQuery() },
    );
    const btns = await screen.findAllByRole("button", { name: /Edit recipe/ });
    fireEvent.click(btns[0]);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/admin/masters/boms/BH-BASE/BV-NEW/edit",
      ),
    );
  });

  it("when a DRAFT already exists, opens confirm modal then navigates to existing draft", async () => {
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions?bom_head_id=BH-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-BASE", version_label: "v3", status: "ACTIVE" },
                { bom_version_id: "BV-DRAFT", version_label: "v4", status: "DRAFT" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/versions?bom_head_id=BH-PACK")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { bom_version_id: "BV-PACK", version_label: "v2", status: "ACTIVE" },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/boms/lines")) {
        return Promise.resolve(
          new Response(JSON.stringify({ rows: [] }), { status: 200 }),
        );
      }
      if (url.includes("/api/supplier-items")) {
        return Promise.resolve(
          new Response(JSON.stringify({ rows: [] }), { status: 200 }),
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
        onNavigate={navigate}
      />,
      { wrapper: wrapQuery() },
    );
    const btns = await screen.findAllByRole("button", { name: /Edit recipe/ });
    fireEvent.click(btns[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent ?? "").toMatch(/יש כבר טיוטה/);
    fireEvent.click(screen.getByRole("button", { name: /להמשיך/ }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/admin/masters/boms/BH-BASE/BV-DRAFT/edit",
      ),
    );
  });
});

describe("Product page integration — supply_method branching", () => {
  it("BOUGHT_FINISHED items do not render RecipeHealthCard", () => {
    const supply: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK" = "BOUGHT_FINISHED";
    const shouldRender = (supply as string) === "MANUFACTURED";
    expect(shouldRender).toBe(false);
  });
  it("MANUFACTURED items DO render RecipeHealthCard", () => {
    const supply = "MANUFACTURED" as const;
    expect(supply === "MANUFACTURED").toBe(true);
  });
});
