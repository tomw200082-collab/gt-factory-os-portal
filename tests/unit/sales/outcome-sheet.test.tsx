import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OutcomeSheet } from "@/app/(sales)/_components/OutcomeSheet";
import { OUTCOME_LABELS, OUTCOME_TITLES, UI } from "@/app/(sales)/_lib/labels";

afterEach(cleanup);

describe("outcome sheet", () => {
  it("offers exactly the four outcomes, and no way to declare a win", () => {
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(OUTCOME_LABELS.answered_progressing)).toBeTruthy();
    expect(screen.getByText(OUTCOME_LABELS.no_answer)).toBeTruthy();
    expect(screen.getByText(OUTCOME_LABELS.whatsapp_sent)).toBeTruthy();
    expect(screen.getByText(OUTCOME_LABELS.lost)).toBeTruthy();
    expect(screen.queryByText("הומר ✓")).toBeNull();
  });

  it("records a no-answer without asking anything else", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-no_answer"));
    expect(onSubmit).toHaveBeenCalledWith({ result: "no_answer" });
  });

  it("makes progress mean picking the next touch", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-answered_progressing"));
    // No submission yet — the date is the second half of the answer.
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("next-touch-tomorrow"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const vars = onSubmit.mock.calls[0][0];
    expect(vars.result).toBe("answered_progressing");
    expect(typeof vars.next_touch_at).toBe("string");
  });

  it("will not close a lead as lost without a reason", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-lost"));

    const confirm = screen.getByTestId("lost-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText(UI.lostReasonRequired)).toBeTruthy();

    fireEvent.click(screen.getByTestId("lost-reason-לא רלוונטי"));
    expect((screen.getByTestId("lost-confirm") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("lost-confirm"));
    expect(onSubmit).toHaveBeenCalledWith({ result: "lost", reason: "לא רלוונטי" });
  });

  it("requires free text when the reason is 'other'", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-lost"));
    fireEvent.click(screen.getByTestId("lost-reason-אחר"));
    expect((screen.getByTestId("lost-confirm") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(UI.lostReasonOther), {
      target: { value: "עבר לספק אחר" },
    });
    fireEvent.click(screen.getByTestId("lost-confirm"));
    expect(onSubmit).toHaveBeenCalledWith({ result: "lost", reason: "עבר לספק אחר" });
  });

  it("dismisses on Escape — the caller decides what that means", () => {
    const onDismiss = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows a rule the server refused, in Hebrew", () => {
    render(
      <OutcomeSheet
        leadName="דנה"
        error="צריך לציין סיבה לאובדן."
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("outcome-error").textContent).toContain("צריך לציין סיבה");
  });

  it("opens straight into the date picker when a card asks to postpone", () => {
    const onSubmit = vi.fn();
    render(
      <OutcomeSheet mode="next-touch" leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />,
    );
    expect(screen.queryByTestId("outcome-no_answer")).toBeNull();
    fireEvent.click(screen.getByTestId("next-touch-tomorrow"));
    // Postponing moves the date only; it is not an outcome.
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].result).toBeUndefined();
    expect(typeof onSubmit.mock.calls[0][0].next_touch_at).toBe("string");
  });

  it("opens straight into reasons when a card marks a lead lost", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet mode="lost" leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("lost-reason-אין תקציב"));
    fireEvent.click(screen.getByTestId("lost-confirm"));
    expect(onSubmit).toHaveBeenCalledWith({ reason: "אין תקציב" });
  });

  it("is a labelled modal dialog", () => {
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("outcome-sheet-title");
    expect(dialog.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(OUTCOME_TITLES.call);
  });

  it("lets a mis-tap go back instead of stranding the user", () => {
    // Two large adjacent buttons; tapping the wrong one must not cost a trip
    // to another app to re-raise the sheet.
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-answered_progressing"));
    expect(screen.queryByTestId("outcome-no_answer")).toBeNull();

    fireEvent.click(screen.getByTestId("outcome-back"));
    expect(screen.getByTestId("outcome-no_answer")).toBeTruthy();
  });

  it("offers no back button when a card opened the sheet directly", () => {
    render(<OutcomeSheet mode="lost" leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId("outcome-back")).toBeNull();
  });

  it("will not let the next touch be scheduled in the past", () => {
    render(<OutcomeSheet mode="next-touch" leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    const input = screen.getByLabelText(UI.pickDate) as HTMLInputElement;
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(input.getAttribute("min")).toBe(
      `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    );
  });

  it("presents the lost reasons as one choice, not five toggles", () => {
    render(<OutcomeSheet mode="lost" leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(5);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("names the free-text reason field for assistive technology", () => {
    render(<OutcomeSheet mode="lost" leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("lost-reason-אחר"));
    expect(screen.getByLabelText(UI.lostReasonOtherLabel)).toBeTruthy();
  });

  it("gives the dismiss control a real touch target", () => {
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    // .s-btn carries min-height 44px; without it the control is ~18px tall.
    expect(screen.getByTestId("outcome-dismiss").className).toContain("s-btn");
  });
});
