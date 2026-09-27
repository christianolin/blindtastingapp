import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sharing defaults spec 2026-09-27 §7.6: when /cellar's profile read fails,
// the page renders no "Visible to" control rather than one that claims a
// setting the row may not hold. Source inspection (no DOM renderer; the page
// is an async server component). Pinned because master's cellar sort memory
// rewrote the same lines with the old `?? "PRIVATE"` fallback, and merging
// the two must keep this side (and master's Promise.all with readCellarSort).
describe("/cellar's Visible to control", () => {
  const src = readFileSync("src/app/cellar/page.tsx", "utf8");

  it("never falls back to a cellar setting the read did not return", () => {
    expect(src).not.toMatch(/cellar_visibility\s*\?\?/);
    expect(src).not.toMatch(/\?\?\s*["']PRIVATE["']/);
  });

  it("renders the control only from a profile that came back", () => {
    expect(src).toMatch(
      /\{profile \? \(\s*<CellarVisibilityControl userId=\{user\.id\} current=\{profile\.cellar_visibility\} \/>\s*\) : null\}/,
    );
  });
});
