// PublishConfirmModal tests for variants A (clean), B (warnings + override),
// C (hard-block).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PublishConfirmModal } from "@/components/bom-edit/PublishConfirmModal";

afterEach(() => cleanup());

const cleanPreview = {
  blocking_issues: [],
  warnings: [],
  can_publish_clean: true,
  can_publish_with_override: true,
};

describe("PublishConfirmModal — variant A (clean)", () => {
  it("renders single confirmation copy with no override checkbox", () => {
    render(
      <PublishConfirmModal
        preview={cleanPreview}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/פרסם v4/)).toBeTruthy();
    expect(screen.getByText(/SUPERSEDED/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("Publish button calls onConfirm immediately with confirmOverride=false", () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmModal
        preview={cleanPreview}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Publish$/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});

describe("PublishConfirmModal — variant B (override)", () => {
  it("lists backend warnings and UI warnings together", () => {
    render(
      <PublishConfirmModal
        preview={{
          blocking_issues: [],
          warnings: ["UNPOSTED_PRODUCTION_ACTUALS"],
          can_publish_clean: false,
          can_publish_with_override: true,
        }}
        uiWarnings={["2 חומרים חסרי ספק ראשי"]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/UNPOSTED_PRODUCTION_ACTUALS/)).toBeTruthy();
    expect(screen.getByText(/2 חומרים חסרי ספק ראשי/)).toBeTruthy();
  });

  it("Publish anyway is disabled until checkbox is checked, then triggers onConfirm with confirmOverride=true", () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmModal
        preview={{
          blocking_issues: [],
          warnings: ["W1"],
          can_publish_clean: false,
          can_publish_with_override: true,
        }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /Publish anyway/,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("renders variant B when uiWarnings is non-empty even if backend warnings are empty", () => {
    render(
      <PublishConfirmModal
        preview={{
          blocking_issues: [],
          warnings: [],
          can_publish_clean: true,
          can_publish_with_override: true,
        }}
        uiWarnings={["חומר אחד עם מחיר ישן"]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/אני מאשר את האזהרות הללו/)).toBeTruthy();
  });
});

describe("PublishConfirmModal — variant C (hard block)", () => {
  it("renders blockers translated to plain Hebrew, no Publish button", () => {
    render(
      <PublishConfirmModal
        preview={{
          blocking_issues: ["EMPTY_VERSION"],
          warnings: [],
          can_publish_clean: false,
          can_publish_with_override: false,
        }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/מתכון ריק/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
  });

  it("translates PLANNING_RUN_IN_FLIGHT", () => {
    render(
      <PublishConfirmModal
        preview={{
          blocking_issues: ["PLANNING_RUN_IN_FLIGHT"],
          warnings: [],
          can_publish_clean: false,
          can_publish_with_override: false,
        }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/ריצת תכנון פעילה/)).toBeTruthy();
  });

  it("falls back to raw code when blocker is not in the translation map", () => {
    render(
      <PublishConfirmModal
        preview={{
          blocking_issues: ["UNKNOWN_BLOCKER"],
          warnings: [],
          can_publish_clean: false,
          can_publish_with_override: false,
        }}
        uiWarnings={[]}
        nextVersionLabel="v4"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/UNKNOWN_BLOCKER/)).toBeTruthy();
  });
});
