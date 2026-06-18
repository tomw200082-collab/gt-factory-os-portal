import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { RowFocusControls } from "./RowFocusControls";

function setup(overrides: Partial<Parameters<typeof RowFocusControls>[0]> = {}) {
  const props = {
    focusMode: false,
    onEnterFocus: vi.fn(),
    onCancelFocus: vi.fn(),
    onConfirmFocus: vi.fn(),
    selectedCount: 0,
    hideOtherCount: 0,
    hiddenItems: [] as { item_id: string; item_name: string }[],
    onRestore: vi.fn(),
    onShowAll: vi.fn(),
    ...overrides,
  };
  render(<RowFocusControls {...props} />);
  return props;
}

afterEach(() => cleanup());

describe("RowFocusControls", () => {
  it("Focus button enters focus mode", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole("button", { name: /^focus$/i }));
    expect(props.onEnterFocus).toHaveBeenCalledTimes(1);
  });

  it("confirm is disabled with 0 selected", () => {
    setup({ focusMode: true, selectedCount: 0, hideOtherCount: 5 });
    expect(screen.getByRole("button", { name: /hide the other 5/i })).toBeDisabled();
  });

  it("confirm fires when at least one is selected", async () => {
    const user = userEvent.setup();
    const props = setup({ focusMode: true, selectedCount: 2, hideOtherCount: 3 });
    await user.click(screen.getByRole("button", { name: /hide the other 3/i }));
    expect(props.onConfirmFocus).toHaveBeenCalledTimes(1);
  });

  it("Cancel exits focus mode", async () => {
    const user = userEvent.setup();
    const props = setup({ focusMode: true, selectedCount: 1, hideOtherCount: 2 });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(props.onCancelFocus).toHaveBeenCalledTimes(1);
  });

  it("renders no Hidden tray when nothing is hidden", () => {
    setup({ hiddenItems: [] });
    expect(screen.queryByRole("button", { name: /hidden \(/i })).toBeNull();
  });

  it("Hidden tray lists item names and restores one", async () => {
    const user = userEvent.setup();
    const props = setup({
      hiddenItems: [
        { item_id: "a", item_name: "Babka Red" },
        { item_id: "b", item_name: "Muza 200ml" },
      ],
    });
    await user.click(screen.getByRole("button", { name: /hidden \(2\)/i }));
    expect(screen.getByText("Babka Red")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /restore babka red/i }));
    expect(props.onRestore).toHaveBeenCalledWith("a");
  });

  it("Show all resets everything", async () => {
    const user = userEvent.setup();
    const props = setup({ hiddenItems: [{ item_id: "a", item_name: "Babka Red" }] });
    await user.click(screen.getByRole("button", { name: /hidden \(1\)/i }));
    await user.click(screen.getByTestId("show-all"));
    expect(props.onShowAll).toHaveBeenCalledTimes(1);
  });

  it("trayOpen resets when hidden set empties and does not auto-open on next hide", async () => {
    const user = userEvent.setup();
    const baseProps = {
      focusMode: false,
      onEnterFocus: vi.fn(),
      onCancelFocus: vi.fn(),
      onConfirmFocus: vi.fn(),
      selectedCount: 0,
      hideOtherCount: 0,
      hiddenItems: [{ item_id: "a", item_name: "Babka Red" }] as { item_id: string; item_name: string }[],
      onRestore: vi.fn(),
      onShowAll: vi.fn(),
    };
    const { rerender } = render(<RowFocusControls {...baseProps} />);

    // Open the tray
    await user.click(screen.getByRole("button", { name: /hidden \(1\)/i }));
    expect(screen.getByText("Babka Red")).toBeInTheDocument();

    // Empty the hidden set (tray toggle disappears)
    act(() => {
      rerender(<RowFocusControls {...baseProps} hiddenItems={[]} />);
    });
    expect(screen.queryByRole("button", { name: /hidden \(/i })).toBeNull();

    // Restore an item — tray must NOT auto-open
    act(() => {
      rerender(<RowFocusControls {...baseProps} hiddenItems={[{ item_id: "a", item_name: "Babka Red" }]} />);
    });
    expect(screen.getByRole("button", { name: /hidden \(1\)/i })).toBeInTheDocument();
    expect(screen.queryByText("Babka Red")).toBeNull();
  });
});
