import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Use esbuild's automatic JSX runtime so React does not need to be
  // explicitly imported in every *.test.tsx file (Next.js's build handles
  // this at runtime via tsconfig `jsx: preserve`, but Vitest drives esbuild
  // directly and needs the explicit jsx setting).
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/unit/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "tests/e2e/**", "**/.next/**"],
    setupFiles: ["./tests/setup-vitest.ts"],
    globals: false,
    reporters: ["default"],
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
