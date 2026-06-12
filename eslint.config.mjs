import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Baseline ratchet (2026-06-12): 200+ pre-existing `any` usages.
      // Held at warn so lint stays green; re-elevate to error in the
      // tranche that finishes typing them. All other preset rules run
      // at their default severity — the codebase is clean against them.
      "@typescript-eslint/no-explicit-any": "warn",
      // The portal's intentionally-unused convention is a `_` prefix
      // (e.g. `_props`, `_report`); make the rule honor it.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Stray console.log must not ship in operator surfaces;
      // console.warn/error are the sanctioned reporting channels
      // (see src/lib/obs/report.ts).
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // CLI scripts print to stdout by design.
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
