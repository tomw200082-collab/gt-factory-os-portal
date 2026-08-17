import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OutcomeSheet } from "@/app/(sales)/_components/OutcomeSheet";
import { OUTCOME_LABELS, UI } from "@/app/(sales)/_lib/labels";

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
    expect(dialog.getAttribute("aria-label")).toBe(UI.outcomeTitle);
    expect(dialog.getAttribute("dir")).toBe("rtl");
  });
});
