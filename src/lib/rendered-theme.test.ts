import { describe, expect, it } from "vitest";
import { themeOfRoot } from "./rendered-theme";

// The map follows the class <html> is actually rendering, not the stored
// choice (docs/superpowers/specs/2026-09-19-map-dark-mode.md §5).
const root = (classes: string[]) => ({
  classList: { contains: (token: string) => classes.includes(token) },
});

describe("themeOfRoot", () => {
  it("is dark exactly when <html> carries the dark class", () => {
    expect(themeOfRoot(root(["dark"]))).toBe("dark");
    expect(themeOfRoot(root(["font-sans", "dark", "antialiased"]))).toBe("dark");
  });

  it("is light otherwise", () => {
    expect(themeOfRoot(root([]))).toBe("light");
    expect(themeOfRoot(root(["font-sans", "darkish"]))).toBe("light");
  });
});
