// useConfirm() / <ConfirmDialog> — Tranche 067 (THEME A) tests.
//
// Coverage:
//   P1 — closed by default (nothing in the DOM until confirm() is called)
//   P2 — opening shows title + description with role="alertdialog"
//   P3 — Confirm resolves the promise true and closes
//   P4 — Cancel resolves the promise false and closes
//   P5 — default focus lands on Cancel (destructive-safe)

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useConfirm } from "./ConfirmDialog";

afterEach(() => {
  cleanup();
});

function Harness({ onResult }: { onResult: (v: boolean) => void }): JSX.Element {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: "Deactivate Peach Tea?",
            description: "It will stop appearing in active lists.",
            confirmLabel: "Deactivate",
            tone: "danger",
          });
          onResult(ok);
        }}
      >
        open
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm / ConfirmDialog", () => {
  it("renders nothing until confirm() is invoked", () => {
    render(<Harness onResult={() => {}} />);
    expect(screen.queryByText("Deactivate Peach Tea?")).toBeNull();
  });

  it("opens with title, description and alertdialog role", async () => {
    const user = userEvent.setup();
    render(<Harness onResult={() => {}} />);
    await user.click(screen.getByRole("button", { name: "open" }));

    expect(await screen.findByText("Deactivate Peach Tea?")).toBeTruthy();
    expect(
      screen.getByText("It will stop appearing in active lists."),
    ).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("resolves true and closes when Confirm is clicked", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    await waitFor(() =>
      expect(screen.queryByText("Deactivate Peach Tea?")).toBeNull(),
    );
  });

  it("resolves false and closes when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    await waitFor(() =>
      expect(screen.queryByText("Deactivate Peach Tea?")).toBeNull(),
    );
  });

  it("moves initial focus to Cancel so an accidental Enter does not confirm", async () => {
    const user = userEvent.setup();
    render(<Harness onResult={() => {}} />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });
});
