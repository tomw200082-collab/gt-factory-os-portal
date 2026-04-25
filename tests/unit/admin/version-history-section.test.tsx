// VersionHistorySection tests — collapse/expand + per-head listing + admin
// gating of [Resume editing →] link.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { VersionHistorySection } from "@/components/admin/recipe-health/VersionHistorySection";

function wrap() {
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
  cleanup();
});

describe("VersionHistorySection", () => {
  it("is collapsed by default and shows summary line", () => {
    render(
      <VersionHistorySection
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin
      />,
      { wrapper: wrap() },
    );
    expect(screen.getByText(/היסטוריית גרסאות/)).toBeTruthy();
    expect(screen.queryByText(/v3/)).toBeNull();
  });

  it("expands on click and lists versions per head", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("BH-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_version_id: "V1",
                  version_label: "v1",
                  status: "SUPERSEDED",
                  published_at: "2025-01-01",
                  published_by_display_name: "Tom",
                  lines_count: 5,
                },
                {
                  bom_version_id: "V3",
                  version_label: "v3",
                  status: "ACTIVE",
                  published_at: "2026-04-01",
                  published_by_display_name: "Tom",
                  lines_count: 8,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      );
    });
    render(
      <VersionHistorySection
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByText(/היסטוריית גרסאות/));
    await screen.findByText("v3");
    expect(screen.getByText("v1")).toBeTruthy();
  });

  it("renders [Resume editing →] for DRAFT entries when isAdmin=true", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("BH-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_version_id: "VD",
                  version_label: "v4",
                  status: "DRAFT",
                  published_at: null,
                  published_by_display_name: null,
                  lines_count: 3,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      );
    });
    render(
      <VersionHistorySection
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByText(/היסטוריית גרסאות/));
    await screen.findByRole("link", { name: /Resume editing/ });
  });

  it("hides Resume button when isAdmin=false", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("BH-BASE")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  bom_version_id: "VD",
                  version_label: "v4",
                  status: "DRAFT",
                  published_at: null,
                  published_by_display_name: null,
                  lines_count: 3,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      );
    });
    render(
      <VersionHistorySection
        baseBomHeadId="BH-BASE"
        packBomHeadId="BH-PACK"
        isAdmin={false}
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(screen.getByText(/היסטוריית גרסאות/));
    await screen.findByText("v4");
    expect(screen.queryByRole("link", { name: /Resume editing/ })).toBeNull();
  });
});
