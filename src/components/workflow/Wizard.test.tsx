// ---------------------------------------------------------------------------
// Wizard primitive unit tests — AMMC v1 Slice 7.
//
// Coverage (≥5 cases per dispatch §7.1):
//   T1 — renders step 1 body on initial mount and shows the stepper
//   T2 — clicking "Next" advances to step 2 when no validate is defined
//   T3 — clicking "Back" returns to the prior step
//   T4 — validate returning ok=false blocks advance + renders issues
//   T5 — onComplete fires with accumulated state on final step "Publish"
//   T6 — Save-as-draft fires onSaveDraft with current state (bonus)
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation — Wizard uses useRouter / useSearchParams for URL
// ?step sync. We provide minimal controllable stubs.
const routerReplace = vi.fn();
vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      replace: routerReplace,
      push: vi.fn(),
      back: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(""),
  };
});

// Import AFTER the mock so Wizard sees the stubbed next/navigation.
// eslint-disable-next-line import/first
import { Wizard, type WizardStepDef, type WizardStepProps } from "./Wizard";

type TestState = {
  name?: string;
  color?: string;
  final?: string;
};

function StepBody({
  marker,
  children,
}: {
  marker: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div data-testid={`body-marker-${marker}`}>body:{marker}</div>
      {children}
    </div>
  );
}

function StepOne(_props: WizardStepProps<TestState>): JSX.Element {
  return <StepBody marker="one" />;
}
function StepTwo(props: WizardStepProps<TestState>): JSX.Element {
  return (
    <StepBody marker="two">
      <button
        type="button"
        onClick={() => props.patch({ color: "blue" })}
        data-testid="step2-patch"
      >
        set blue
      </button>
    </StepBody>
  );
}
function StepThree(_props: WizardStepProps<TestState>): JSX.Element {
  return <StepBody marker="three" />;
}

afterEach(() => {
  cleanup();
  routerReplace.mockReset();
  // Clear localStorage between tests so draft state doesn't bleed across.
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// T1 — initial render
// ---------------------------------------------------------------------------

describe("Wizard — initial render", () => {
  it("T1 renders step 1 body + full stepper with step 1 active", () => {
    const steps: WizardStepDef<TestState>[] = [
      { id: "one", title: "One", Component: StepOne },
      { id: "two", title: "Two", Component: StepTwo },
    ];
    render(
      <Wizard<TestState>
        id="t1"
        steps={steps}
        onComplete={async () => {}}
      />,
    );

    expect(screen.getByTestId("body-marker-one")).toBeDefined();
    expect(screen.queryByTestId("body-marker-two")).toBeNull();

    const stepOneBtn = screen.getByTestId("wizard-step-one");
    expect(stepOneBtn.getAttribute("data-step-state")).toBe("active");
    const stepTwoBtn = screen.getByTestId("wizard-step-two");
    expect(stepTwoBtn.getAttribute("data-step-state")).toBe("pending");

    // Footer primary is "Next" on non-final step.
    expect(screen.getByTestId("wizard-next")).toBeDefined();
    expect(screen.queryByTestId("wizard-publish")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T2 — Next advances
// ---------------------------------------------------------------------------

describe("Wizard — Next advances", () => {
  it("T2 clicking Next on step 1 renders step 2 body", async () => {
    const user = userEvent.setup();
    const steps: WizardStepDef<TestState>[] = [
      { id: "one", title: "One", Component: StepOne },
      { id: "two", title: "Two", Component: StepTwo },
    ];
    render(
      <Wizard<TestState>
        id="t2"
        steps={steps}
        onComplete={async () => {}}
      />,
    );

    await user.click(screen.getByTestId("wizard-next"));

    expect(screen.queryByTestId("body-marker-one")).toBeNull();
    expect(screen.getByTestId("body-marker-two")).toBeDefined();

    // Step 1 is now done, step 2 active.
    expect(
      screen.getByTestId("wizard-step-one").getAttribute("data-step-state"),
    ).toBe("done");
    expect(
      screen.getByTestId("wizard-step-two").getAttribute("data-step-state"),
    ).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// T3 — Back returns
// ---------------------------------------------------------------------------

describe("Wizard — Back returns", () => {
  it("T3 clicking Back on step 2 returns to step 1", async () => {
    const user = userEvent.setup();
    const steps: WizardStepDef<TestState>[] = [
      { id: "one", title: "One", Component: StepOne },
      { id: "two", title: "Two", Component: StepTwo },
    ];
    render(
      <Wizard<TestState>
        id="t3"
        steps={steps}
        onComplete={async () => {}}
      />,
    );

    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("body-marker-two")).toBeDefined();

    await user.click(screen.getByTestId("wizard-back"));
    expect(screen.getByTestId("body-marker-one")).toBeDefined();
    expect(screen.queryByTestId("body-marker-two")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T4 — validate blocks advance
// ---------------------------------------------------------------------------

describe("Wizard — validate blocks advance", () => {
  it("T4 validate ok=false blocks advance and renders issues", async () => {
    const user = userEvent.setup();
    const steps: WizardStepDef<TestState>[] = [
      {
        id: "one",
        title: "One",
        Component: StepOne,
        validate: async () => ({
          ok: false,
          issues: [
            {
              level: "blocker" as const,
              field: "name",
              message: "Name is required before continuing.",
            },
          ],
        }),
      },
      { id: "two", title: "Two", Component: StepTwo },
    ];
    render(
      <Wizard<TestState>
        id="t4"
        steps={steps}
        onComplete={async () => {}}
      />,
    );

    await user.click(screen.getByTestId("wizard-next"));

    // Advance blocked — still on step 1.
    expect(screen.getByTestId("body-marker-one")).toBeDefined();
    expect(screen.queryByTestId("body-marker-two")).toBeNull();

    // Validation issue rendered.
    expect(
      screen.getByText("Name is required before continuing."),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T5 — onComplete fires with accumulated state
// ---------------------------------------------------------------------------

describe("Wizard — onComplete on final step", () => {
  it("T5 Publish on last step fires onComplete with accumulated state", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn(async (_s: TestState) => {});
    const steps: WizardStepDef<TestState>[] = [
      { id: "one", title: "One", Component: StepOne },
      { id: "two", title: "Two", Component: StepTwo },
      { id: "three", title: "Three", Component: StepThree },
    ];
    render(
      <Wizard<TestState>
        id="t5"
        steps={steps}
        onComplete={onComplete}
        initialState={{ name: "seed" }}
      />,
    );

    // advance 1 → 2
    await user.click(screen.getByTestId("wizard-next"));
    // patch state via step 2's button
    await user.click(screen.getByTestId("step2-patch"));
    // advance 2 → 3
    await user.click(screen.getByTestId("wizard-next"));

    // now on final step — primary button is Publish
    const publishBtn = screen.getByTestId("wizard-publish");
    expect(publishBtn).toBeDefined();

    await act(async () => {
      await user.click(publishBtn);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      name: "seed",
      color: "blue",
    });
  });
});

// ---------------------------------------------------------------------------
// T6 — Save-as-draft
// ---------------------------------------------------------------------------

describe("Wizard — save as draft", () => {
  it("T6 Save-as-draft button fires onSaveDraft with current state", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn(async (_s: TestState) => {});
    const steps: WizardStepDef<TestState>[] = [
      { id: "one", title: "One", Component: StepOne },
      { id: "two", title: "Two", Component: StepTwo },
    ];
    render(
      <Wizard<TestState>
        id="t6"
        steps={steps}
        onComplete={async () => {}}
        onSaveDraft={onSaveDraft}
        initialState={{ name: "draft-seed" }}
      />,
    );

    const draftBtn = screen.getByTestId("wizard-save-draft");
    await act(async () => {
      await user.click(draftBtn);
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledWith({ name: "draft-seed" });
  });
});
