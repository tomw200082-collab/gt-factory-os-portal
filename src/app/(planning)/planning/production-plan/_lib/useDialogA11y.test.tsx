import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDialogA11y } from "./useDialogA11y";

// globals:false in vitest.config — testing-library's auto-cleanup is not
// registered, so unmount renders explicitly between cases.
afterEach(() => cleanup());

// §V (Tranche 112 deepen) — locks the dialog a11y contract that the seven
// production-plan modals now share through useDialogA11y, so a future change
// can't silently re-shallow it (drop Escape-to-close, the busy gate, or the
// initial-focus / focus-restore behaviour) without this test going red.

function Dialog({
  onClose,
  closeDisabled,
}: {
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const { dialogRef, titleRef, onKeyDown } = useDialogA11y({
    onClose,
    closeDisabled,
  });
  return (
    <div
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid="dialog"
    >
      <h2 ref={titleRef} tabIndex={-1} data-testid="title">
        Title
      </h2>
      <button type="button">Inside</button>
    </div>
  );
}

describe("useDialogA11y", () => {
  it("closes on Escape when not disabled", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while closeDisabled (a submit is in flight)", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} closeDisabled />);
    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on a non-Escape key", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves initial focus into the dialog on mount", async () => {
    render(<Dialog onClose={() => {}} />);
    await waitFor(() =>
      expect(
        screen.getByTestId("dialog").contains(document.activeElement),
      ).toBe(true),
    );
  });

  it("restores focus to the trigger when the dialog unmounts", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            data-testid="trigger"
            onClick={() => setOpen(true)}
          >
            Open
          </button>
          {open ? <Dialog onClose={() => setOpen(false)} /> : null}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    await user.click(trigger);
    await screen.findByTestId("dialog");
    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
