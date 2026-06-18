import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { RowVisibilityToggle } from "./RowVisibilityToggle";

afterEach(() => cleanup());

describe("RowVisibilityToggle", () => {
  it("renders a hide button with an item-named aria-label and fires onHide", async () => {
    const onHide = vi.fn();
    const user = userEvent.setup();
    render(<RowVisibilityToggle itemId="a" itemName="Babka Red" onHide={onHide} />);
    await user.click(screen.getByRole("button", { name: /hide babka red/i }));
    expect(onHide).toHaveBeenCalledWith("a");
  });

  it("renders nothing interactive when onHide is absent and not in select mode", () => {
    render(<RowVisibilityToggle itemId="a" itemName="Babka Red" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("in select mode renders a checkbox reflecting `selected` and firing onToggleSelect", async () => {
    const onToggleSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <RowVisibilityToggle
        itemId="a"
        itemName="Babka Red"
        selectMode
        selected={false}
        onToggleSelect={onToggleSelect}
        onHide={() => {}}
      />,
    );
    const cb = screen.getByRole("checkbox", { name: /select babka red/i });
    expect(cb).not.toBeChecked();
    await user.click(cb);
    expect(onToggleSelect).toHaveBeenCalledWith("a");
    // hide button must NOT show while selecting
    expect(screen.queryByRole("button", { name: /hide/i })).toBeNull();
  });
});
