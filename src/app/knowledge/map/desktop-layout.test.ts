// The desktop wine-map layout (spec 2026-09-27-desktop-map-layout-design) lives
// in class strings and in two custom variants in globals.css. vitest runs in
// node with no DOM, so this source scan is what pins them, in the style of
// map-chrome.test.ts and tile-wine-map-engine.test.ts; a layout regression
// otherwise shows up only in the browser pass (spec §11).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHONE_QUERY } from "@/lib/use-is-phone";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

/** The file without its comments, so prose that names a class never counts. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MAP = "src/app/knowledge/map";

/** The media condition of a block-form custom variant,
    `@custom-variant <name> { @media <condition> { @slot; } }`, with its
    whitespace collapsed; null when the variant is missing or has another
    shape. */
function variantMedia(css: string, name: string): string | null {
  const match = new RegExp(
    String.raw`@custom-variant\s+${name}\s*\{\s*@media\s+([^{]+?)\s*\{\s*@slot;\s*\}\s*\}`,
  ).exec(css);
  return match ? match[1].replace(/\s+/g, " ") : null;
}

describe("globals.css map variants", () => {
  const css = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("`globals.css` defines `map-lock` and `map-scroll` with the exact media strings", () => {
    expect(css.match(/@custom-variant\s+map-lock\b/g)).toHaveLength(1);
    expect(css.match(/@custom-variant\s+map-scroll\b/g)).toHaveLength(1);
    expect(variantMedia(css, "map-lock")).toBe("(width >= 48rem) and (height >= 30rem)");
    expect(variantMedia(css, "map-scroll")).toBe("(width >= 48rem) and (height < 30rem)");
  });

  it("starts both exactly where the phone query ends, so a phone never sees them", () => {
    // Tailwind's md: and max-md: split at 48rem; useIsPhone asks for the
    // max-md: side. The lock must begin at its exact complement.
    expect(PHONE_QUERY).toBe("(width < 48rem)");
    const md = PHONE_QUERY.replace("<", ">=");
    expect(variantMedia(css, "map-lock")?.startsWith(`${md} and `)).toBe(true);
    expect(variantMedia(css, "map-scroll")?.startsWith(`${md} and `)).toBe(true);
  });
});

// The six files that draw the map page on a phone. Every `max-md:` utility in
// them is part of the phone layout the owner likes (spec 2026-09-25), and the
// desktop work keeps each one verbatim (spec 2026-09-27 M15).
const PHONE_FILES = [
  `${MAP}/page.tsx`,
  `${MAP}/tile-wine-map-explorer.tsx`,
  `${MAP}/tile-wine-map.tsx`,
  `${MAP}/map-bottom-sheet.tsx`,
  `${MAP}/map-options-sheet.tsx`,
  `${MAP}/wine-map-tree.tsx`,
];

// Taken at a23cd16 (production master, before any desktop-layout edit), from
// the files above with their comments removed. A phone change has to update
// this list on purpose.
const PHONE_TOKENS_AT_A23CD16 = [
  "max-md:[&_.maplibregl-ctrl-bottom-right]:bottom-[54px]!",
  "max-md:bg-transparent",
  "max-md:bottom-16",
  "max-md:flex",
  "max-md:flex-1",
  "max-md:flex-col",
  "max-md:flex-nowrap",
  "max-md:gap-0",
  "max-md:h-11",
  "max-md:h-auto",
  "max-md:h-full",
  "max-md:hidden",
  "max-md:items-center",
  "max-md:justify-center",
  "max-md:mb-0",
  "max-md:min-h-0",
  "max-md:min-h-11",
  "max-md:min-w-0",
  "max-md:overflow-hidden",
  "max-md:pt-0",
  "max-md:px-0",
  "max-md:px-3",
  "max-md:py-0",
  "max-md:py-1.5",
  "max-md:relative",
  "max-md:ring-0",
  "max-md:rounded-none",
  "max-md:shrink-0",
  "max-md:size-11",
  "max-md:sr-only",
  "max-md:text-base",
  "max-md:w-7",
  "max-md:w-auto",
];

/** Every distinct `max-md:` class in the given files, sorted. A class ends at
    whitespace, a quote, a backtick or a template-literal brace. */
function phoneTokens(files: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const file of files) {
    for (const token of code(file).match(/max-md:[^\s"'`${}]+/g) ?? []) tokens.add(token);
  }
  return [...tokens].sort();
}

describe("desktop wine-map layout", () => {
  it.todo(
    "`page.tsx` and the explorer contain no `h-[70vh]`, `min-h-[420px]`, `calc(100dvh`, `xl:sticky` or `md:p-8`",
  );

  it.todo("`page.tsx` renders `<main data-map-page`");

  it("phone pin: the `max-md:` tokens of the map's phone files equal the list frozen at a23cd16", () => {
    expect(PHONE_TOKENS_AT_A23CD16).toEqual([...PHONE_TOKENS_AT_A23CD16].sort());
    expect(phoneTokens(PHONE_FILES)).toEqual(PHONE_TOKENS_AT_A23CD16);
  });
});
