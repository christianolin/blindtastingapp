import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ThemeSync is four lines and every one of them is load-bearing, which is
// exactly why it had no test and why an audit flagged that. It cannot be
// rendered here -- vitest runs in the node environment by design (see
// vitest.config.mts), so there is no DOM to hydrate -- so this reads the source
// and asserts the three properties that, if any one is "tidied" away, silently
// reintroduce a bug that was already shipped once.
//
// A source-shape test is a weak test in general. It is the right one here
// because each property is a specific past regression with a specific cause,
// and the alternative is jsdom plus a React renderer to observe two DOM writes.
// Comments stripped first. The file explains WHY it uses useLayoutEffect and
// not useEffect, so an assertion that the source does not mention useEffect
// matched that prose and failed against correct code. Same trap the contrast
// guard hit when a comment said "--card:".
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SRC = strip(readFileSync("src/components/theme-sync.tsx", "utf8"));
const LAYOUT = strip(readFileSync("src/app/layout.tsx", "utf8"));

describe("ThemeSync", () => {
  it("subscribes to the store rather than reading it once", () => {
    // Without this the store noticed a theme change and nothing applied it.
    // Measured when it shipped: OS flipped to dark and the page stayed
    // parchment; a second tab pinned dark and this one kept the class absent.
    expect(SRC).toMatch(/useTheme\(\)/);
  });

  it("applies in a LAYOUT effect, so the correction lands before paint", () => {
    // useEffect would paint the wrong theme first and flash.
    expect(SRC).toMatch(/useLayoutEffect/);
    expect(SRC).not.toMatch(/\buseEffect\b/);
  });

  it("re-applies on every render, with no dependency array", () => {
    // The other bug: React owns the class attribute on <html> (the root layout
    // passes className) and rewrites it when it renders the root, dropping
    // "dark". That is route-dependent -- /overview kept it, /cellar lost it --
    // so the effect has to run on any render, not only when `theme` changes.
    const effect = /useLayoutEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\)/.exec(SRC);
    expect(effect, "useLayoutEffect call not found").not.toBeNull();
    expect(effect![0]).not.toMatch(/\},\s*\[/);
  });

  it("is actually mounted in the root layout", () => {
    // All of the above is inert if nobody renders it.
    expect(LAYOUT).toMatch(/<ThemeSync\s*\/>/);
    expect(LAYOUT).toMatch(/from "@\/components\/theme-sync"/);
  });
});
