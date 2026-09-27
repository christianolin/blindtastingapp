import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The app's `@/` alias (tsconfig paths), so a markup test can render a
    // component that imports through it (src/components/wset/*.test.tsx).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Pure logic, plus static markup through react-dom/server — no jsdom, so
    // this stays fast and dependency-light. Add an environment here if a
    // component ever needs a DOM.
    environment: "node",
    // .tsx too: the old glob matched only .test.ts, so a component test would
    // have been skipped silently rather than failing for want of a DOM.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
