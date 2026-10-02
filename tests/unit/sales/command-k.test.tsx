// GT Pulse Unit B, tranche 189: the palette finds businesses on the server.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/sales/today",
}));

import { CommandK } from "@/app/(sales)/_components/CommandK";

const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  push.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-0000000000aa", name: "בית קפה לדוגמה", phone: "+972500000001" }]), { status: 200 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function withQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("command palette", () => {
  it("does not search businesses for a single character", async () => {
    render(withQuery(<CommandK leads={[]} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId("command-input"), { target: { value: "ב" } });
    await new Promise((r) => setTimeout(r, 350));
    expect(calls).toHaveLength(0);
  });

  it("searches businesses through the lean endpoint and opens the workspace", async () => {
    render(withQuery(<CommandK leads={[]} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId("command-input"), { target: { value: "בית קפה" } });
    const hit = await screen.findByTestId("command-hit-00000000-0000-4000-8000-0000000000aa");
    expect(calls).toEqual([`/api/sales/orgs/search?q=${encodeURIComponent("בית קפה")}`]);
    fireEvent.click(hit);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sales/orgs/00000000-0000-4000-8000-0000000000aa"));
  });
});
