import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import fs from "node:fs";
import path from "node:path";
import { useReturnFocus } from "@/app/(sales)/_lib/useReturnFocus";

afterEach(cleanup);

/**
 * Shaped like the five real dialogs: the hook first, then an effect that moves
 * focus inside. React runs effects in declaration order, which is the only
 * thing making the hook record the opener rather than the dialog itself.
 */
function Dialog() {
  useReturnFocus();
  const inside = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    inside.current?.focus();
  }, []);
  return (
    <button ref={inside} data-testid="inside">
      inside
    </button>
  );
}

function Harness({ open }: { open: boolean }) {
  return (
    <div>
      <button data-testid="trigger">open</button>
      {open ? <Dialog /> : null}
    </div>
  );
}

describe("useReturnFocus", () => {
  it("puts focus back on whatever opened the dialog", () => {
    const { getByTestId, rerender } = render(<Harness open={false} />);
    const trigger = getByTestId("trigger") as HTMLButtonElement;
    trigger.focus();

    rerender(<Harness open />);
    expect(document.activeElement).toBe(getByTestId("inside"));

    rerender(<Harness open={false} />);
    // Closing gives focus back instead of dropping it on <body>, which is
    // where a keyboard user 100 rows into the leads table would land.
    expect(document.activeElement).toBe(trigger);
  });

  it("no sales dialog takes focus with autoFocus", () => {
    // autoFocus is applied during commit, before any effect — so a dialog
    // using it would move focus before useReturnFocus records the opener, and
    // the hook would quietly return focus to the dialog's own element. Every
    // dialog here focuses from an effect instead; this keeps it that way.
    const dir = path.join(process.cwd(), "src/app/(sales)");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tsx") && fs.readFileSync(full, "utf8").includes("autoFocus")) {
          offenders.push(full);
        }
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });
});
