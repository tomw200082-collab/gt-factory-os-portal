// ---------------------------------------------------------------------------
// family.ts — product-family → CSS-variable mapping for the family-color
// accent strip on each Inventory Flow row (Operational Clarity redesign,
// 2026-05-04).
//
// Tom-locked hues live in src/app/globals.css under :root and :root.dark
// as `--family-<slug>`. This module is the single place that maps a free-
// form `family` string from the API to one of those tokens.
//
// Pure module; no React. Returns a CSS color value (hsl(...)) so callers
// can drop it on `style.borderLeftColor`.
// ---------------------------------------------------------------------------

const FAMILY_VAR: Record<string, string> = {
  CALM: "--family-calm",
  CONSCIOUSNESS: "--family-consciousness",
  COSMO: "--family-cosmo",
  DESERTEA: "--family-desertea",
  DETOX: "--family-detox",
  ENERGY: "--family-energy",
  FRESH: "--family-fresh",
  MATCHA: "--family-matcha",
  "MUZA COCKTAIL": "--family-muza",
  "MUZA MIXER": "--family-muza",
  NAMASTEA: "--family-namastea",
  NONOMIMI: "--family-nonomimi",
  ODK: "--family-odk",
  "PINK SANGRIA": "--family-pink-sangria",
  "RED SANGRIA": "--family-red-sangria",
  REVIVE: "--family-revive",
  "WHITE SANGRIA": "--family-white-sangria",
};

/**
 * Resolve a family name to an `hsl(var(--family-...))` color string for the
 * 3px row accent strip. Returns the neutral border var when the family is
 * unmapped or null — this matches the design fallback.
 */
export function familyAccent(family: string | null | undefined): string {
  if (!family) return "hsl(var(--border))";
  const key = family.trim().toUpperCase();
  const variable = FAMILY_VAR[key];
  if (!variable) return "hsl(var(--border))";
  return `hsl(var(${variable}))`;
}
