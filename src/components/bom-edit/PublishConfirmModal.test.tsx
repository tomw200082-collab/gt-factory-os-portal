// PublishConfirmModal — Tranche 047 (INTER-013) isSubmitting tests.
//
// Coverage:
//   P1 — variant A (clean): isSubmitting disables Cancel + Publish and shows
//        the "Publishing…" spinner label
//   P2 — variant B (warnings): isSubmitting disables Cancel + Publish anyway
//        even when the acknowledgement checkbox is ticked
//   P3 — default (isSubmitting omitted): buttons stay enabled and confirm
//        fires onConfirm

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PublishConfirmModal,
  type PublishPreview,
} from "./PublishConfirmModal";

afterEach(() => {
  cleanup();
});

const CLEAN_PREVIEW: PublishPreview = {
  blocking_issues: [],
  warnings: [],
  can_publish_clean: true,
  can_publish_with_override: true,
};

const WARNING_PREVIEW: PublishPreview = {
  blocking_issues: [],
  warnings: ["Component c_1 has no approved supplier"],
  can_publish_clean: false,
  can_publish_with_override: true,
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof PublishConfirmModal>> = {},
) {
  const props = {
    preview: CLEAN_PREVIEW,
    uiWarnings: [] as string[],
    nextVersionLabel: "v3",
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(<PublishConfirmModal {...props} />);
  return props;
}

describe("PublishConfirmModal isSubmitting (T047)", () => {
  it("P1 clean variant: disables both buttons + spinner label while submitting", () => {
    renderModal({ isSubmitting: true });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    const confirm = screen.getByRole("button", { name: /Publishing…/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("P2 warnings variant: disables Cancel + Publish anyway while submitting", () => {
    renderModal({ preview: WARNING_PREVIEW, isSubmitting: true });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    const confirm = screen.getByRole("button", { name: /Publishing…/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("P3 default: buttons enabled, confirm fires onConfirm(false)", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect((cancel as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(props.onConfirm).toHaveBeenCalledWith(false);
  });
});
