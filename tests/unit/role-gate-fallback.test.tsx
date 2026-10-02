import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
