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

const PAGE = `${MAP}/page.tsx`;
const EXPLORER = `${MAP}/tile-wine-map-explorer.tsx`;

describe("desktop wine-map layout", () => {
  it("`page.tsx` and the explorer contain no `h-[70vh]`, `min-h-[420px]`, `calc(100dvh`, `xl:sticky` or `md:p-8`", () => {
    // The map's height comes from the flex chain at every width now (M1): no
    // fixed viewport share, no calc, nothing sticky, and the old padding.
    for (const file of [PAGE, EXPLORER]) {
      const source = code(file);
      for (const banned of ["h-[70vh]", "min-h-[420px]", "calc(100dvh", "xl:sticky", "md:p-8"]) {
        expect(source.includes(banned), `${file} contains ${banned}`).toBe(false);
      }
    }
  });

  it("`page.tsx` renders `<main data-map-page`", () => {
    const page = code(PAGE);
    expect(page).toMatch(/<main\s+data-map-page/);
    expect(page.match(/<main\b/g)).toHaveLength(1);
    // The data-map-page element is <main> itself, not a div inside it.
    expect(page).not.toMatch(/<div\s+data-map-page/);
  });

  it("locks <main> and the page root to the screen with the same flex chain as phones (M1)", () => {
    const page = code(PAGE);
    expect(page).toContain(
      'className="flex flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:overflow-hidden"',
    );
    expect(page).toContain(
      'className="flex w-full flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden md:p-4 map-lock:min-h-0 map-lock:overflow-hidden"',
    );
  });

  it("moves the heading into the top bar and keeps the subtitle for screen readers (M3)", () => {
    const page = code(PAGE);
    expect(page).toContain('<AppHeader title="Wine map" heading="Knowledge Explorer" />');
    expect(page).not.toMatch(/<h1\b/);
    expect(page).toContain('<p className="sr-only max-md:hidden">');
    expect(page.replace(/\s+/g, " ")).toContain(
      "Explore the world of wine through places, grapes, styles and the rules that shape them.",
    );
    const header = code("src/components/app-header.tsx");
    expect(header).toMatch(/heading\?: string/);
    expect(header).toContain(
      '<h1 className="hidden font-heading text-xl font-semibold leading-none whitespace-nowrap md:block">',
    );
  });

  it("retires the md-xl Details bar and the tablet spacer (M9)", () => {
    const explorer = code(EXPLORER);
    for (const gone of ["sheetOpen", "max-xl:fixed", "ChevronUp", "h-20"]) {
      expect(explorer.includes(gone), `explorer still contains ${gone}`).toBe(false);
    }
  });

  it("lets an Escape handled elsewhere leave Full view alone (M13)", () => {
    expect(code(EXPLORER)).toContain(
      'if (event.key !== "Escape" || event.defaultPrevented) return;',
    );
    const tree = code(`${MAP}/wine-map-tree.tsx`);
    expect(tree).toMatch(/event\.preventDefault\(\);\s*setQuery\(""\);/);
  });

  it("phone pin: the `max-md:` tokens of the map's phone files equal the list frozen at a23cd16", () => {
    expect(PHONE_TOKENS_AT_A23CD16).toEqual([...PHONE_TOKENS_AT_A23CD16].sort());
    expect(phoneTokens(PHONE_FILES)).toEqual(PHONE_TOKENS_AT_A23CD16);
  });
});
