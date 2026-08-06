import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored scratch: one-off probes and migration generators written
    // during a task and thrown away. Linting them fails the repo-wide run on
    // throwaway code that is not in version control.
    ".superpowers/**",
    ".tiles-build/**",
  ]),
]);

export default eslintConfig;
