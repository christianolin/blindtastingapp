// The desktop wine-map layout (spec 2026-09-27-desktop-map-layout-design) lives
// in class strings and in two custom variants in globals.css. vitest runs in
// node with no DOM, so this source scan is what pins them, in the style of
// map-chrome.test.ts and tile-wine-map-engine.test.ts; a layout regression
// otherwise shows up only in the browser pass (spec §11).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHONE_QUERY } from "@/lib/use-is-phone";
import { MAP_FOCUS_RING } from "./focus-ring";

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

// The seven files that draw the map page on a phone. Every `max-md:` utility in
// them is part of the phone layout the owner likes (spec 2026-09-25), and the
// desktop work keeps each one verbatim (spec 2026-09-27 M15).
// map-detail-controls.tsx is drawn on phones too, inside the Map options sheet.
const PHONE_FILES = [
  `${MAP}/page.tsx`,
  `${MAP}/tile-wine-map-explorer.tsx`,
  `${MAP}/tile-wine-map.tsx`,
  `${MAP}/map-bottom-sheet.tsx`,
  `${MAP}/map-options-sheet.tsx`,
  `${MAP}/wine-map-tree.tsx`,
  `${MAP}/map-detail-controls.tsx`,
] as const;

/** Every string literal in the file (double-quoted, or a whole template
    literal) that carries a `max-md:` utility, in source order, reduced to its
    `max-md:` utilities in their order. One entry is one element's class
    string, or one branch of a `cn(...)`, so dropping a utility, moving it to
    another element or losing an element's `max-md:hidden` all change it,
    while `md:`/`xl:`/`map-lock:` utilities appended beside them do not. A
    utility ends at whitespace, a quote, a backtick or a template brace. */
function phoneClassStrings(file: string): string[] {
  const strings: string[] = [];
  for (const literal of code(file).match(/"[^"\r\n]*"|`[^`]*`/g) ?? []) {
    const utilities = literal.match(/max-md:[^\s"'`${}]+/g);
    if (utilities) strings.push(utilities.join(" "));
  }
  return strings;
}

// Frozen in the review round of the desktop work. Against a23cd16 (production
// master, before any desktop-layout edit) every class string then present
// keeps its `max-md:` utilities verbatim and in order. The only difference is
// in `max-md:hidden` strings: page.tsx gained the sr-only subtitle's, and the
// explorer swapped the retired h-20 spacer's for the md-xl tab strip's (slot
// 1), while its tree card, Details card and controls block kept theirs (the
// Details card's string now sits before the return, hence its place in the
// list). map-bottom-sheet.tsx and map-options-sheet.tsx have no `max-md:`
// utility at all (they are phone-only components), so the exact strings below
// pin them instead. A phone change has to update this on purpose.
const PHONE_CLASS_STRINGS: Record<(typeof PHONE_FILES)[number], string[]> = {
  [`${MAP}/page.tsx`]: [
    "max-md:min-h-0 max-md:overflow-hidden", // page root
    "max-md:min-h-0 max-md:overflow-hidden", // <main data-map-page>
    "max-md:hidden", // the sr-only subtitle
  ],
  [`${MAP}/tile-wine-map-explorer.tsx`]: [
    "max-md:h-full max-md:min-h-0", // the map's loading placeholder
    "max-md:min-h-11", // the tree's Retry
    "max-md:hidden", // the Details card
    "max-md:relative max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-hidden", // root
    "max-md:min-h-0 max-md:flex-1 max-md:gap-0", // row
    "max-md:hidden", // slot 1, the md-xl tab strip
    "max-md:hidden", // slot 2, the tree card
    "max-md:min-h-0 max-md:gap-0 max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:ring-0", // map Card
    "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:px-0 max-md:pt-0", // CardContent
    "max-md:mb-0 max-md:shrink-0 max-md:flex-nowrap max-md:px-3 max-md:py-1.5", // filter row
    "max-md:sr-only", // "Filter"
    "max-md:w-auto max-md:min-w-0 max-md:flex-1", // grape combobox box
    "max-md:shrink-0", // Local | English
    "max-md:min-h-11", // Local
    "max-md:min-h-11", // English
    "max-md:hidden", // One|All and the chips
    "max-md:h-auto max-md:min-h-0 max-md:flex-1", // map wrapper
  ],
  [`${MAP}/tile-wine-map.tsx`]: [
    "max-md:[&_.maplibregl-ctrl-bottom-right]:bottom-[54px]!",
    "max-md:bottom-16",
  ],
  [`${MAP}/map-bottom-sheet.tsx`]: [],
  [`${MAP}/map-options-sheet.tsx`]: [],
  [`${MAP}/wine-map-tree.tsx`]: [
    "max-md:min-h-11 max-md:py-0", // row
    "max-md:flex max-md:h-11 max-md:w-7 max-md:items-center max-md:justify-center", // chevron
    "max-md:w-7", // leaf spacer
    "max-md:min-h-11 max-md:min-w-0 max-md:flex-1", // place button
    "max-md:min-h-11", // search box
    "max-md:text-base", // search field
    "max-md:flex max-md:size-11 max-md:items-center max-md:justify-center", // expand a level
    "max-md:flex max-md:size-11 max-md:items-center max-md:justify-center", // collapse a level
  ],
  [`${MAP}/map-detail-controls.tsx`]: [
    "max-md:min-h-11", // Retry
  ],
};

// The phone's height chain, and the phone-drawn elements whose phone styles
// are written mobile-first (a base utility with an `md:` override), which a
// `max-md:` scan cannot see. Each is the whole class string, quoted, so a
// base utility dropped from one of them (a phone change) fails here too.
const PHONE_EXACT_STRINGS: readonly [string, string][] = [
  [`${MAP}/page.tsx`, "flex flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:overflow-hidden"],
  [`${MAP}/page.tsx`, "flex w-full flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden md:p-4 map-lock:min-h-0 map-lock:overflow-hidden"],
  [`${MAP}/page.tsx`, "sr-only max-md:hidden"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "animate-pulse rounded-lg border bg-muted max-md:h-full max-md:min-h-0 md:h-full md:min-h-0"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "flex flex-col gap-4 max-md:relative max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:flex-1"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "flex flex-col gap-4 max-md:min-h-0 max-md:flex-1 max-md:gap-0 md:grid md:gap-x-4 md:gap-y-2 md:grid-rows-[auto_minmax(0,1fr)] xl:flex xl:flex-row xl:items-stretch map-lock:min-h-0 map-lock:flex-1 map-scroll:h-[26.25rem]"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "order-1 min-w-0 flex-1 overflow-hidden max-md:min-h-0 max-md:gap-0 max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:ring-0 md:col-start-2 md:row-start-1 md:row-span-2 md:min-h-0 md:gap-0 md:overflow-visible md:rounded-none md:bg-transparent md:py-0 md:ring-0 xl:order-2"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "pt-4 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:px-0 max-md:pt-0 md:flex md:min-h-0 md:flex-1 md:flex-col md:px-0 md:pt-0"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "mb-2 flex flex-wrap items-center gap-2 max-md:mb-0 max-md:shrink-0 max-md:flex-nowrap max-md:px-3 max-md:py-1.5 md:h-8 md:shrink-0 md:flex-nowrap"],
  [`${MAP}/tile-wine-map-explorer.tsx`, "max-md:h-auto max-md:min-h-0 max-md:flex-1 md:min-h-0 md:flex-1"],
  [`${MAP}/map-bottom-sheet.tsx`, "absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card text-card-foreground shadow-[0_-8px_24px_rgba(0,0,0,0.10)] transition-[height] duration-200 ease-out motion-reduce:transition-none md:hidden"],
  [`${MAP}/map-options-sheet.tsx`, "inset-x-0 top-auto bottom-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-t-2xl rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-none"],
  [`${MAP}/map-detail-controls.tsx`, "min-h-11 rounded px-2 py-1 outline-none focus-visible:outline-solid transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-0"],
];

const PAGE = `${MAP}/page.tsx`;
const EXPLORER = `${MAP}/tile-wine-map-explorer.tsx`;
const TREE = `${MAP}/wine-map-tree.tsx`;

/** The `<button …>…</button>` whose code holds `needle` (e.g. its quoted
    label), which must occur exactly once in the source. */
function buttonAround(source: string, needle: string): string {
  const at = source.indexOf(needle);
  expect(at, `${needle} not found`).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(needle, at + 1), `${needle} occurs twice`).toBe(-1);
  const start = source.lastIndexOf("<button", at);
  const end = source.indexOf("</button>", at);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(at);
  return source.slice(start, end);
}

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
    const tree = code(TREE);
    expect(tree).toMatch(/event\.preventDefault\(\);\s*setQuery\(""\);/);
  });

  it("clears the tree search on Escape only in the md+ card; the phone's search box keeps no handler", () => {
    // Phones: the bottom sheet's Escape cancels the keydown, which also stops
    // the browser's native clear, so the query used to survive a close. The
    // handler exists only when the explorer asks for it, and only the md+
    // card's renderTree call does.
    const tree = code(TREE);
    expect(tree).toContain("clearSearchOnEscape = false,");
    expect(tree).toMatch(/onKeyDown=\{\s*clearSearchOnEscape\s*\?/);
    expect(tree).toMatch(/:\s*undefined\s*\}/);
    const explorer = code(EXPLORER);
    expect(explorer.match(/clearSearchOnEscape: true/g)).toHaveLength(1);
    expect(explorer).toMatch(
      /renderTree\(selectFromDesktopTree, \{\s*active: isWide \? treeOpen : side\.open,\s*clearSearchOnEscape: true,\s*\}\)/,
    );
    expect(explorer).toMatch(
      /renderTree\(pickFromTree, \{\s*active: sheet\.snap !== "closed" && sheet\.tab === "explore",\s*rootsCollapsed: true,\s*\}\)/,
    );
  });

  it("resets the Details body when it is shown again, once per place (M7)", () => {
    const explorer = code(EXPLORER);
    expect(explorer).toContain("const detailsShown = isWide ? detailsOpen : side.open;");
    expect(explorer).toMatch(
      /if \(!detailsTopDue\(detailsShown, selectedKey, detailsTopForRef\.current\)\) return;\s*detailsTopForRef\.current = selectedKey;\s*detailsScrollRef\.current\?\.scrollTo\(\{ top: 0 \}\);\s*\}, \[selectedKey, detailsShown\]\);/,
    );
    // The old reset ran on selectedKey alone, which a collapsed card ignored.
    expect(explorer).not.toMatch(/scrollTo\(\{ top: 0 \}\);\s*\}, \[selectedKey\]\);/);
  });

  it("keeps the open grape in the explorer, so the Details slot move at xl never closes its dialog", () => {
    const sections = code(`${MAP}/knowledge-sections.tsx`);
    expect(sections).not.toMatch(/useState<WinePlaceGrape/);
    expect(sections).not.toContain("<GrapeModal");
    expect(sections).toContain("onClick={() => onOpenGrape(g)}");
    const explorer = code(EXPLORER);
    expect(explorer).toContain("useState<WinePlaceGrape | null>(null)");
    expect(explorer).toContain("onOpenGrape={setOpenGrape}");
    expect(explorer).toContain(
      "<GrapeModal grape={openGrape} onClose={() => setOpenGrape(null)} />",
    );
    // Rendered after the row, beside ArchetypeModal, never inside a slot.
    expect(explorer.indexOf("<GrapeModal")).toBeGreaterThan(explorer.indexOf("<ArchetypeModal"));
  });

  it("gives every md+ panel control the map's focus ring", () => {
    expect(MAP_FOCUS_RING).toBe(
      "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    );
    const explorer = code(EXPLORER);
    for (const label of [
      '"Hide panel"',
      '"Show panel"',
      '"Collapse hierarchy"',
      '"Collapse details"',
      '"Show hierarchy"',
      '"Show details"',
    ]) {
      expect(buttonAround(explorer, label), label).toContain("MAP_FOCUS_RING");
    }
    // The Explore | Details switch, and the phone sheet, share the one string.
    expect(explorer).toMatch(/"min-h-11 rounded px-2 py-1 transition-colors md:pointer-fine:min-h-0",\s*MAP_FOCUS_RING,/);
    expect(code(`${MAP}/map-bottom-sheet.tsx`)).toContain(
      'import { MAP_FOCUS_RING as FOCUS_RING } from "./focus-ring";',
    );
  });

  it("makes the collapsed strips 44 px wide on a coarse pointer", () => {
    const explorer = code(EXPLORER);
    expect(explorer).toContain(
      '"md:grid-cols-[2.25rem_minmax(0,1fr)] md:pointer-coarse:grid-cols-[2.75rem_minmax(0,1fr)]"',
    );
    expect(buttonAround(explorer, '"Show panel"')).toMatch(/\bw-9\b.* pointer-coarse:w-11\b/);
    expect(buttonAround(explorer, '"Show hierarchy"')).toMatch(/xl:w-9\b.* xl:pointer-coarse:w-11\b/);
    expect(buttonAround(explorer, '"Show details"')).toMatch(/xl:w-9\b.* xl:pointer-coarse:w-11\b/);
  });

  it("puts the place a collapsed strip shows into its accessible name (WCAG 2.5.3)", () => {
    const explorer = code(EXPLORER);
    expect(explorer).toContain(
      'aria-label={selectedKey ? `Show panel, ${sheetTitle}` : "Show panel"}',
    );
    expect(explorer).toContain(
      'aria-label={selectedKey ? `Show details, ${sheetTitle}` : "Show details"}',
    );
  });

  it("marks the pressed Explore | Details button in forced colours, where fill and ring are dropped", () => {
    expect(code(EXPLORER)).toContain(
      '"bg-primary font-semibold text-primary-foreground ring-2 ring-inset ring-foreground forced-colors:underline forced-colors:decoration-2 forced-colors:underline-offset-4"',
    );
  });

  it("phone pin: every `max-md:` class string of the map's phone files equals the frozen list", () => {
    for (const file of PHONE_FILES) {
      expect(phoneClassStrings(file), file).toEqual(PHONE_CLASS_STRINGS[file]);
    }
  });

  it("phone pin: the phone's height chain and mobile-first phone classes are exactly as frozen", () => {
    for (const [file, classes] of PHONE_EXACT_STRINGS) {
      expect(code(file).includes(`"${classes}"`), `${file}: "${classes}"`).toBe(true);
    }
  });
});
