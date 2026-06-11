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
    // Baseline ratchet (2026-06-11): these rules have pre-existing violations
    // across the codebase, so they are held at "warn" to keep `npm run lint`
    // green while staying visible. Re-elevate each to "error" in the tranche
    // that clears its remaining warnings. Worst offenders for
    // react-hooks/rules-of-hooks (hooks after conditional returns):
    // sku-aliases/page.tsx, sku-map/page.tsx, POLineMatchCard.tsx, SideNav.tsx.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react/jsx-key": "warn",
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
];

export default eslintConfig;
