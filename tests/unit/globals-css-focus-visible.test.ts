import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Locks in the app-wide keyboard focus indicators (Tranche 072). Every button
// and text field must show a visible focus ring so keyboard users can always
// see where they are (WCAG 2.4.7 Focus Visible). If this fails, the base .btn
// / .input / .textarea focus styles were removed or weakened — restore them.

const GLOBALS_CSS_PATH = resolve(
  __dirname,
  "..",
  "..",
  "src",
  "app",
  "globals.css",
);

describe("globals.css — app-wide focus visibility", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");

  function block(selector: string): string {
    const re = new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\}`);
    const m = css.match(re);
    expect(m, `expected a ${selector} block in globals.css`).not.toBeNull();
    return m![1];
  }

  it(".btn declares a focus-visible ring", () => {
    const btn = block(".btn ");
    expect(btn).toMatch(/focus-visible:ring-2/);
    expect(btn).toMatch(/focus-visible:ring-accent/);
  });

  it(".input declares a focus ring (not border-only)", () => {
    const input = block(".input ");
    expect(input).toMatch(/focus:ring-2/);
    expect(input).toMatch(/focus:ring-accent/);
  });

  it(".textarea declares a focus ring", () => {
    const textarea = block(".textarea ");
    expect(textarea).toMatch(/focus:ring-2/);
    expect(textarea).toMatch(/focus:ring-accent/);
  });
});
