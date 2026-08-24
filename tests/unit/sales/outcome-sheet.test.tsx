import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OutcomeSheet } from "@/app/(sales)/_components/OutcomeSheet";
import { OUTCOME_LABELS, OUTCOME_TITLES, STATUS_LABELS, UI } from "@/app/(sales)/_lib/labels";

afterEach(cleanup);

describe("outcome sheet", () => {
  it("offers the five outcomes, and lets none of them declare a win unproven", () => {
    // Was: "no way to declare a win" — the sheet had four outcomes and a close
    // was simply unreachable, so a deal Tom closed on the phone and invoiced in
    // Green Invoice was either not recorded or recorded as something else.
    // A close is now offered, and is still not clickable in the sense that
    // mattered: it commits nothing until it has evidence (D8, Tom 2026-08-24).
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(OUTCOME_LABELS.answered_progressing)).toBeTruthy();
    expect(screen.getByText(OUTCOME_LABELS.no_answer)).toBeTruthy();
    expect(screen.getByText(OUTCOME_LABELS.whatsapp_sent)).toBeTruthy();
    expect(screen.getByText(OUTCOME_LABELS.lost)).toBeTruthy();
    expect(screen.getByText(STATUS_LABELS.won)).toBeTruthy();
  });

  it("will not close a deal without a Green Invoice document number", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-won"));

    const confirm = screen.getByTestId("won-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onSubmit).not.toHaveBeenCalled();

    // Whitespace is not a document number either.
    fireEvent.change(screen.getByTestId("won-document-number"), {
      target: { value: "   " },
    });
    expect((screen.getByTestId("won-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes a deal on the document number, and says so is what it sent", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-won"));
    fireEvent.change(screen.getByTestId("won-document-number"), {
      target: { value: "  GI-2026-0042  " },
    });
    fireEvent.click(screen.getByTestId("won-confirm"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      result: "won",
      document_number: "GI-2026-0042",
    });
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

  it("records the outcome the user chose, not the one the date step assumed", () => {
    // D4. The exact path: a call that went unanswered, and a callback agreed for
    // a date that is not one of the presets. This used to submit
    // `answered_progressing` — the date step took `{ result:
    // 'answered_progressing' }` from a constant and every button on it spread
    // that in, whichever outcome had (or had not) been declared to get there.
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByTestId("outcome-pick-date-no_answer"));
    // Nothing on screen may be false, and that includes what a tap is about to
    // record: the step names the outcome before it commits it.
    expect(screen.getByTestId("outcome-declared").textContent).toContain(
      OUTCOME_LABELS.no_answer,
    );

    fireEvent.change(screen.getByLabelText(UI.pickDate), {
      target: { value: "2026-09-03" },
    });
    fireEvent.click(screen.getByTestId("next-touch-custom"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const vars = onSubmit.mock.calls[0][0];
    expect(vars.result).toBe("no_answer");
    expect(typeof vars.next_touch_at).toBe("string");
  });

  it("carries a whatsapp hand-off into the date step as itself", () => {
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-pick-date-whatsapp_sent"));
    fireEvent.click(screen.getByTestId("next-touch-tomorrow"));
    expect(onSubmit.mock.calls[0][0].result).toBe("whatsapp_sent");
  });

  it("offers no way into the date step without declaring an outcome first", () => {
    // The root-level "שנה תאריך" was the door that made the invention possible:
    // it reached the date step with nothing chosen. The date step is a
    // disclosure under an outcome now, so there is no orphan route to it.
    render(<OutcomeSheet leadName="דנה" onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId("outcome-pick-date")).toBeNull();
  });

  it("forgets the declared outcome when the user goes back", () => {
    // Otherwise "לא ענה → שנה תאריך → back → ענה, מתקדם" would still be
    // carrying no_answer, which is the same class of lie in the other
    // direction.
    const onSubmit = vi.fn();
    render(<OutcomeSheet leadName="דנה" onSubmit={onSubmit} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("outcome-pick-date-no_answer"));
    fireEvent.click(screen.getByTestId("outcome-back"));
    fireEvent.click(screen.getByTestId("outcome-answered_progressing"));
    fireEvent.click(screen.getByTestId("next-touch-tomorrow"));
    expect(onSubmit.mock.calls[0][0].result).toBe("answered_progressing");
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
