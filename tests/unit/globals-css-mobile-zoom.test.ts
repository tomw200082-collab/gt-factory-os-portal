import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Locks in the iOS focus-zoom fix from globals.css. If this test fails,
// the touch-device font-size floor was removed or weakened — restore it
// before merging. See docs/superpowers/plans/2026-05-12-mobile-input-zoom-fix.md
// for the rationale.

const GLOBALS_CSS_PATH = resolve(__dirname, "..", "..", "src", "app", "globals.css");

describe("globals.css — touch-device input font-size floor", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");

  it("declares a (hover: none) and (pointer: coarse) media query", () => {
    expect(css).toMatch(/@media\s*\(\s*hover\s*:\s*none\s*\)\s*and\s*\(\s*pointer\s*:\s*coarse\s*\)/);
  });

  it("applies font-size: 16px !important inside that media query", () => {
    const match = css.match(
      /@media\s*\(\s*hover\s*:\s*none\s*\)\s*and\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{[\s\S]*?font-size\s*:\s*16px\s*!important[\s\S]*?\}\s*\}/
    );
    expect(match, "expected font-size: 16px !important inside the touch media block").not.toBeNull();
  });

  it("targets input, textarea, and select selectors inside the media query", () => {
    const block = css.match(
      /@media\s*\(\s*hover\s*:\s*none\s*\)\s*and\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}/
    );
    expect(block, "expected to find the touch-device media block").not.toBeNull();
    const inner = block![1];
    expect(inner).toMatch(/\binput\b/);
    expect(inner).toMatch(/\btextarea\b/);
    expect(inner).toMatch(/\bselect\b/);
  });

  it("excludes checkbox and radio inputs from the floor (visual buttons, not text)", () => {
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  });
});
