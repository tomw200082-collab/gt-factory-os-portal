// ProductionDayLane — in-flight create guard (Tranche 092, INTER-N01).
//
// The lane's add buttons must disable while a create is in flight, matching
// the header CTAs (tranche 090), so a planner can't fire duplicate creates.

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProductionDayLane } from "./ProductionDayLane";

const noop = () => {};

function renderLane(creating: boolean) {
  return render(
    <ProductionDayLane
      date={new Date("2026-06-17T00:00:00")}
      isoDate="2026-06-17"
      dayName="Wed"
      dateLabel="Jun 17"
      plans={[]}
      canAct
      isToday
      isPast={false}
      isOverdue={false}
      dayTotal={0}
      dominantUom=""
      onAdd={noop}
      onAddNote={noop}
      onEdit={noop}
      onCancel={noop}
      onDelete={noop}
      onAdjustRecipe={noop}
      creating={creating}
    />,
  );
}

afterEach(() => cleanup());

describe("ProductionDayLane add-button create guard (INTER-N01)", () => {
  it("disables the empty-lane add buttons while a create is in flight", () => {
    renderLane(true);
    expect((screen.getByTestId("day-lane-add-empty") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("day-lane-add-note-empty") as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves the add buttons enabled when no create is in flight", () => {
    renderLane(false);
    expect((screen.getByTestId("day-lane-add-empty") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("day-lane-add-note-empty") as HTMLButtonElement).disabled).toBe(false);
  });
});
