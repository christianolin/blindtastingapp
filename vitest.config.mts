import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic only for now — no jsdom, so this stays fast and dependency-light.
    // Add an environment here if a component ever needs rendering.
    environment: "node",
    // .tsx too: the old glob matched only .test.ts, so a component test would
    // have been skipped silently rather than failing for want of a DOM.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
