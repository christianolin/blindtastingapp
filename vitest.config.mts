import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic only for now — no jsdom, so this stays fast and dependency-light.
    // Add an environment here if a component ever needs rendering.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
