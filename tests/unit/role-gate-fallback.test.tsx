import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const session = vi.hoisted(() => ({
  value: { session: { role: "sales_rep" }, isLoading: false } as {
    session: { role: string };
    isLoading: boolean;
  },
}));
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => session.value,
}));

import { RoleGate } from "@/lib/auth/role-gate";
import { GTLoader } from "@/components/ui/GTLoader";

afterEach(() => {
  cleanup();
  session.value = { session: { role: "sales_rep" }, isLoading: false };
});

describe("RoleGate fallback", () => {
  it("renders the fallback, and not the children, while the session loads", () => {
    session.value = { session: { role: "viewer" }, isLoading: true };
    render(
      <RoleGate minimum="sales:execute" fallback={<div data-testid="fb">loading</div>}>
        <p>secret</p>
      </RoleGate>,
    );
    expect(screen.getByTestId("fb")).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("still renders nothing while loading when no fallback is given", () => {
    session.value = { session: { role: "viewer" }, isLoading: true };
    const { container } = render(
      <RoleGate minimum="sales:execute">
        <p>secret</p>
      </RoleGate>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("drops the fallback once loaded and renders the children when granted", () => {
    render(
      <RoleGate minimum="sales:execute" fallback={<div data-testid="fb">loading</div>}>
        <p>secret</p>
      </RoleGate>,
    );
    expect(screen.queryByTestId("fb")).toBeNull();
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("shows the restricted card, not the fallback, when loaded and denied", () => {
    session.value = { session: { role: "viewer" }, isLoading: false };
    render(
      <RoleGate minimum="sales:execute" fallback={<div data-testid="fb">loading</div>}>
        <p>secret</p>
      </RoleGate>,
    );
    expect(screen.queryByTestId("fb")).toBeNull();
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.getByText("Access restricted")).toBeTruthy();
  });

  it("keeps the legacy allow prop working with a fallback", () => {
    session.value = { session: { role: "admin" }, isLoading: true };
    const { rerender } = render(
      <RoleGate allow={["admin"]} fallback={<div data-testid="fb">loading</div>}>
        <p>secret</p>
      </RoleGate>,
    );
    expect(screen.getByTestId("fb")).toBeTruthy();
    session.value = { session: { role: "admin" }, isLoading: false };
    rerender(
      <RoleGate allow={["admin"]} fallback={<div data-testid="fb">loading</div>}>
        <p>secret</p>
      </RoleGate>,
    );
    expect(screen.queryByTestId("fb")).toBeNull();
    expect(screen.getByText("secret")).toBeTruthy();
  });
});

// ── L1(c): a direct load leaves with the same 180 ms fade, not a hard cut ────
describe("RoleGate fallback exit", () => {
  const fb = () => <GTLoader variant="sales" boundary />;
  const gate = () => (
    <RoleGate minimum="sales:execute" fallback={fb()}>
      <p>secret</p>
    </RoleGate>
  );
  let computed: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    // Without the stylesheet nothing is hidden: report what the CSS would say.
    computed = vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ visibility: "visible", opacity: "1" }) as unknown as CSSStyleDeclaration,
    );
  });
  afterEach(() => {
    computed.mockRestore();
    vi.useRealTimers();
  });

  it("keeps the visible loader above the new content for 180 ms, fading", () => {
    session.value = { session: { role: "sales_rep" }, isLoading: true };
    const { rerender, container } = render(gate());
    const before = container.querySelector(".gt-loader");
    expect(before).not.toBeNull();
    expect(before!.hasAttribute("data-gt-loader-boundary")).toBe(true);

    session.value = { session: { role: "sales_rep" }, isLoading: false };
    rerender(gate());
    expect(screen.getByText("secret")).toBeTruthy();
    const during = container.querySelector(".gt-loader")!;
    expect(during).toBe(before); // same node: its animations do not restart
    expect(during.getAttribute("data-leaving")).toBe("true");

    act(() => void vi.advanceTimersByTime(279));
    expect(container.querySelector(".gt-loader")).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(container.querySelector(".gt-loader")).toBeNull();
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("removes it at once when it never became visible", () => {
    computed.mockImplementation(
      () => ({ visibility: "hidden", opacity: "0" }) as unknown as CSSStyleDeclaration,
    );
    session.value = { session: { role: "sales_rep" }, isLoading: true };
    const { rerender, container } = render(gate());
    session.value = { session: { role: "sales_rep" }, isLoading: false };
    rerender(gate());
    act(() => void vi.advanceTimersByTime(0));
    expect(container.querySelector(".gt-loader")).toBeNull();
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("fades out above the restricted card too", () => {
    session.value = { session: { role: "viewer" }, isLoading: true };
    const { rerender, container } = render(gate());
    session.value = { session: { role: "viewer" }, isLoading: false };
    rerender(gate());
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(container.querySelector(".gt-loader")!.getAttribute("data-leaving")).toBe("true");
  });

  it("does not fade a fallback that is not a GTLoader", () => {
    session.value = { session: { role: "sales_rep" }, isLoading: true };
    const el = () => (
      <RoleGate minimum="sales:execute" fallback={<div data-testid="fb">x</div>}>
        <p>secret</p>
      </RoleGate>
    );
    const { rerender } = render(el());
    expect(screen.getByTestId("fb")).toBeTruthy();
    session.value = { session: { role: "sales_rep" }, isLoading: false };
    rerender(el());
    expect(screen.queryByTestId("fb")).toBeNull();
  });

  it("clears its timer on unmount", () => {
    session.value = { session: { role: "sales_rep" }, isLoading: true };
    const { rerender, unmount } = render(gate());
    session.value = { session: { role: "sales_rep" }, isLoading: false };
    rerender(gate());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("RoleGate labels", () => {
  it("calls the sales capability CRM access", () => {
    session.value = { session: { role: "viewer" }, isLoading: false };
    render(
      <RoleGate minimum="sales:execute">
        <p>secret</p>
      </RoleGate>,
    );
    expect(screen.getByText(/CRM access is required/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Sales workspace/);
  });
});
